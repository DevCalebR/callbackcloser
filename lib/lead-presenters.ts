import { LeadStatus, SmsConversationState } from '@prisma/client';

export const leadStatusOrder: LeadStatus[] = [LeadStatus.NEW, LeadStatus.QUALIFIED, LeadStatus.CONTACTED, LeadStatus.BOOKED];

export const leadStatusLabels: Record<LeadStatus, string> = {
  NEW: 'New',
  QUALIFIED: 'Qualified',
  CONTACTED: 'Contacted',
  BOOKED: 'Booked',
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
