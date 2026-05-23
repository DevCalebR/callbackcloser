import { LeadReadiness, LeadStatus } from '@prisma/client';

export const DEFAULT_AVERAGE_JOB_VALUE = 500;

export type RecoveryMetricLead = {
  status: LeadStatus;
  readiness: LeadReadiness;
  qualifiedAt?: Date | null;
  notifiedAt?: Date | null;
  ownerNotifiedAt?: Date | null;
};

export type RecoveryMetrics = {
  missedCallsCaptured: number;
  recoveredLeads: number;
  bookedJobs: number;
  estimatedRevenueSaved: number;
  averageJobValue: number;
  usesDefaultAverageJobValue: boolean;
};

export function isRecoveredLead(lead: RecoveryMetricLead) {
  if (lead.status === LeadStatus.BOOKED) return true;
  if (lead.status === LeadStatus.CONTACTED) return true;
  if (lead.status === LeadStatus.NOTIFIED) return true;
  if (lead.status === LeadStatus.QUALIFIED) return true;
  if (lead.readiness !== LeadReadiness.PENDING) return true;
  return Boolean(lead.qualifiedAt || lead.notifiedAt || lead.ownerNotifiedAt);
}

export function estimateRevenueSaved(input: {
  bookedJobs: number;
  recoveredLeads: number;
  averageJobValue?: number;
}) {
  const averageJobValue = input.averageJobValue ?? DEFAULT_AVERAGE_JOB_VALUE;
  const bookedRevenue = input.bookedJobs * averageJobValue;
  const pipelineRevenue = Math.max(input.recoveredLeads - input.bookedJobs, 0) * Math.round(averageJobValue * 0.35);

  return bookedRevenue + pipelineRevenue;
}

export function buildRecoveryMetrics(leads: RecoveryMetricLead[], averageJobValue = DEFAULT_AVERAGE_JOB_VALUE): RecoveryMetrics {
  const missedCallsCaptured = leads.length;
  const recoveredLeads = leads.filter(isRecoveredLead).length;
  const bookedJobs = leads.filter((lead) => lead.status === LeadStatus.BOOKED).length;

  return {
    missedCallsCaptured,
    recoveredLeads,
    bookedJobs,
    estimatedRevenueSaved: estimateRevenueSaved({
      bookedJobs,
      recoveredLeads,
      averageJobValue,
    }),
    averageJobValue,
    usesDefaultAverageJobValue: averageJobValue === DEFAULT_AVERAGE_JOB_VALUE,
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
