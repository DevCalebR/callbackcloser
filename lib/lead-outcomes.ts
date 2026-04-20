import { LeadStatus } from '@prisma/client';

export type LeadOutcomeSummary = {
  totalLeads: number;
  closedLeads: number;
  lostLeads: number;
  openLeads: number;
  conversionRate: number;
};

type LeadOutcomeInput = {
  status: LeadStatus;
};

export function isLeadClosedWonStatus(status: LeadStatus) {
  return status === LeadStatus.BOOKED;
}

export function isLeadLostStatus(status: LeadStatus) {
  return status === LeadStatus.LOST;
}

export function getLeadOutcomeSummary(leads: LeadOutcomeInput[]): LeadOutcomeSummary {
  const summary = leads.reduce(
    (result, lead) => {
      if (isLeadClosedWonStatus(lead.status)) {
        result.closedLeads += 1;
      } else if (isLeadLostStatus(lead.status)) {
        result.lostLeads += 1;
      } else {
        result.openLeads += 1;
      }

      return result;
    },
    {
      totalLeads: leads.length,
      closedLeads: 0,
      lostLeads: 0,
      openLeads: 0,
      conversionRate: 0,
    },
  );

  summary.conversionRate = summary.totalLeads === 0 ? 0 : Math.round((summary.closedLeads / summary.totalLeads) * 100);

  return summary;
}

export function formatConversionRate(value: number) {
  return `${value}%`;
}
