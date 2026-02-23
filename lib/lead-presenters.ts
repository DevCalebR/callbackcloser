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

export function formatDateTime(value: Date | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
