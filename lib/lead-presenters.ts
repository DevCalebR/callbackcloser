import { LeadReadiness, LeadStatus, SmsConversationState, type Lead } from '@prisma/client';

import { isLeadClosedWonStatus, isLeadLostStatus } from '@/lib/lead-outcomes';

export const leadStatusOrder: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.QUALIFIED,
  LeadStatus.NOTIFIED,
  LeadStatus.CONTACTED,
  LeadStatus.BOOKED,
  LeadStatus.LOST,
];

export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: 'New',
  QUALIFIED: 'Qualified',
  NOTIFIED: 'Notified',
  CONTACTED: 'Contacted',
  BOOKED: 'Closed (Won)',
  LOST: 'Lost',
};

export const leadReadinessLabels: Record<LeadReadiness, string> = {
  PENDING: 'Pending',
  QUALIFIED: 'Qualified',
  URGENT: 'Urgent',
};

export const smsStateLabels: Record<SmsConversationState, string> = {
  NOT_STARTED: 'Not started',
  AWAITING_SERVICE: 'Awaiting service',
  AWAITING_URGENCY: 'Awaiting urgency',
  AWAITING_ZIP: 'Awaiting ZIP',
  AWAITING_BEST_TIME: 'Awaiting best time',
  AWAITING_NAME: 'Awaiting name',
  COMPLETED: 'Completed',
};

export function isMessageDeliveryIssueStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  return normalized === 'failed' || normalized === 'undelivered' || normalized === 'fallback_webhook_response';
}

export function formatMessageStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === 'delivered') return 'Delivered';
  if (normalized === 'sent') return 'Sent';
  if (normalized === 'queued') return 'Queued';
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'undelivered') return 'Undelivered';
  if (normalized === 'fallback_webhook_response') return 'Sent via webhook fallback';

  return normalized.replace(/_/g, ' ');
}

export function formatDateTime(value: Date | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function formatRelativeTime(value: Date | null | undefined, now: Date = new Date()) {
  if (!value) return '-';

  const diffMs = value.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  const diffHours = Math.round(diffMs / 3_600_000);
  const diffDays = Math.round(diffMs / 86_400_000);
  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  return formatter.format(diffDays, 'day');
}

export function getLeadStatusBadgeVariant(status: LeadStatus) {
  if (isLeadClosedWonStatus(status)) return 'success';
  if (isLeadLostStatus(status)) return 'destructive';
  if (status === LeadStatus.NEW) return 'outline';
  if (status === LeadStatus.NOTIFIED) return 'success';
  return 'secondary';
}

export function isLeadOpenStatus(status: LeadStatus) {
  return !isLeadClosedWonStatus(status) && !isLeadLostStatus(status);
}

export function getLeadNextStepLabel(status: LeadStatus) {
  if (isLeadClosedWonStatus(status)) return 'Closed won';
  if (isLeadLostStatus(status)) return 'Closed lost';
  if (status === LeadStatus.CONTACTED) return 'Follow up again';
  return 'Needs follow-up';
}

type LeadActivityInput = Pick<Lead, 'createdAt' | 'lastInteractionAt' | 'lastInboundAt' | 'lastOutboundAt'>;

export function getLeadLastActivityAt(lead: LeadActivityInput) {
  return lead.lastInteractionAt ?? lead.lastInboundAt ?? lead.lastOutboundAt ?? lead.createdAt;
}

type LeadCallbackStateInput = Pick<Lead, 'status' | 'billingRequired' | 'smsState' | 'ownerNotifiedAt' | 'notifiedAt'>;

export function getLeadCallbackState(lead: LeadCallbackStateInput) {
  if (isLeadClosedWonStatus(lead.status)) return 'Closed won';
  if (isLeadLostStatus(lead.status)) return 'Lost';
  if (lead.status === LeadStatus.CONTACTED) return 'Contacted';
  if (lead.billingRequired) return 'Billing paused';
  if (lead.status === LeadStatus.NOTIFIED || lead.notifiedAt || lead.ownerNotifiedAt || lead.smsState === SmsConversationState.COMPLETED) {
    return 'Owner notified';
  }
  if (lead.status === LeadStatus.QUALIFIED) return 'Qualified';
  if (lead.smsState === SmsConversationState.NOT_STARTED) return 'Awaiting first SMS';
  return 'Qualifying by text';
}
