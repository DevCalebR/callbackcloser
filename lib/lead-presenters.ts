import { LeadStatus, SmsConversationState, type Lead } from '@prisma/client';

export const leadStatusOrder: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.QUALIFIED,
  LeadStatus.CONTACTED,
  LeadStatus.BOOKED,
  LeadStatus.LOST,
];

export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: 'New',
  QUALIFIED: 'Qualified',
  CONTACTED: 'Contacted',
  BOOKED: 'Booked',
  LOST: 'Lost',
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
  return normalized === 'failed' || normalized === 'fallback_webhook_response';
}

export function formatMessageStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === 'delivered') return 'Delivered';
  if (normalized === 'sent') return 'Sent';
  if (normalized === 'queued') return 'Queued';
  if (normalized === 'failed') return 'Failed';
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

export function getLeadStatusBadgeVariant(status: LeadStatus) {
  if (status === LeadStatus.BOOKED) return 'success';
  if (status === LeadStatus.LOST) return 'destructive';
  if (status === LeadStatus.NEW) return 'outline';
  return 'secondary';
}

type LeadActivityInput = Pick<Lead, 'createdAt' | 'lastInteractionAt' | 'lastInboundAt' | 'lastOutboundAt'>;

export function getLeadLastActivityAt(lead: LeadActivityInput) {
  return lead.lastInteractionAt ?? lead.lastInboundAt ?? lead.lastOutboundAt ?? lead.createdAt;
}

type LeadCallbackStateInput = Pick<Lead, 'status' | 'billingRequired' | 'smsState' | 'ownerNotifiedAt'>;

export function getLeadCallbackState(lead: LeadCallbackStateInput) {
  if (lead.status === LeadStatus.BOOKED) return 'Booked';
  if (lead.status === LeadStatus.LOST) return 'Lost';
  if (lead.status === LeadStatus.CONTACTED) return 'Contacted';
  if (lead.billingRequired) return 'Billing paused';
  if (lead.ownerNotifiedAt || lead.smsState === SmsConversationState.COMPLETED) return 'Ready to call';
  if (lead.smsState === SmsConversationState.NOT_STARTED) return 'Awaiting first SMS';
  return 'Qualifying by text';
}
