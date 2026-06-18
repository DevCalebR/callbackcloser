import { LeadReadiness, LeadStatus } from '@prisma/client';

import { HomeDashboard, type DashboardLeadCard, type DashboardStatusItem, type DashboardSummaryCard } from '@/components/home-dashboard';
import { requireBusiness } from '@/lib/auth';
import { listAllDashboardLeadsForBusiness } from '@/lib/business-access';
import { db } from '@/lib/db';
import { formatRelativeTime, getLeadLastActivityAt, isLeadOpenStatus } from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoBusiness, getPortfolioDemoLeads, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getCustomerSystemStatus } from '@/lib/system-status';

function buildLeadDetailHref(leadId: string) {
  return `/app/leads/${leadId}?from=%2Fapp`;
}

function getAttentionPriority(lead: {
  status: LeadStatus;
  readiness: LeadReadiness;
  createdAt: Date;
  lastInteractionAt: Date | null;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
}) {
  const statusPriority: Record<LeadStatus, number> = {
    NEW: 0,
    QUALIFIED: 1,
    NOTIFIED: 2,
    CONTACTED: 3,
    BOOKED: 4,
    LOST: 5,
  };
  const readinessPriority: Record<LeadReadiness, number> = {
    URGENT: 0,
    QUALIFIED: 1,
    PENDING: 2,
  };

  return {
    status: statusPriority[lead.status],
    readiness: readinessPriority[lead.readiness],
    activityAt: getLeadLastActivityAt(lead).getTime(),
  };
}

function getCustomerName(lead: {
  callerName: string | null;
  contactName: string | null;
  callerPhoneNormalized: string | null;
  callerPhone: string;
}) {
  return lead.callerName || lead.contactName || formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone);
}

function getRecommendedNextAction(lead: {
  status: LeadStatus;
  readiness: LeadReadiness;
  lastInboundAt: Date | null;
}) {
  if (lead.status === LeadStatus.BOOKED) return 'Booked.';
  if (lead.status === LeadStatus.LOST) return 'No further action needed unless the customer comes back.';
  if (lead.status === LeadStatus.CONTACTED) return 'Follow up and mark booked or lost.';
  if (lead.readiness === LeadReadiness.URGENT) return 'Call now.';
  if (lead.status === LeadStatus.NOTIFIED || lead.status === LeadStatus.QUALIFIED) return 'Call now.';
  if (lead.lastInboundAt) return 'Reply by text, then call if the customer is ready.';
  return 'Call now.';
}

function toLeadCard(
  lead: {
    id: string;
    callerName: string | null;
    contactName: string | null;
    callerPhoneNormalized: string | null;
    callerPhone: string;
    serviceType: string | null;
    serviceRequested: string | null;
    urgency: string | null;
    location: string | null;
    zipCode: string | null;
    summary: string | null;
    status: LeadStatus;
    readiness: LeadReadiness;
    createdAt: Date;
    lastInteractionAt: Date | null;
    lastInboundAt: Date | null;
    lastOutboundAt: Date | null;
  },
): DashboardLeadCard {
  const phone = lead.callerPhoneNormalized || lead.callerPhone;

  return {
    id: lead.id,
    customerName: getCustomerName(lead),
    customerPhone: formatPhoneForDisplay(phone),
    serviceNeeded: lead.serviceType || lead.serviceRequested || 'Service needed not captured yet',
    urgencyLabel: lead.urgency || (lead.readiness === LeadReadiness.URGENT ? 'Urgent' : lead.readiness === LeadReadiness.QUALIFIED ? 'Qualified' : 'Needs reply'),
    createdLabel: formatRelativeTime(lead.createdAt),
    lastActivityLabel: formatRelativeTime(getLeadLastActivityAt(lead)),
    summary:
      lead.summary ||
      'CallbackCloser is still collecting the summary for this lead. Open the lead or call back to keep it moving.',
    recommendedNextAction: getRecommendedNextAction(lead),
    status: lead.status,
    callHref: `tel:${phone}`,
    leadHref: buildLeadDetailHref(lead.id),
  };
}

function getDateKey(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function getStatusItems(input: {
  ownerAlertsReady: boolean;
  systemStatus: ReturnType<typeof getCustomerSystemStatus>;
}): DashboardStatusItem[] {
  return [
    {
      label: 'Texting',
      value: input.systemStatus.key === 'live' ? 'Active' : input.systemStatus.key === 'activating' ? 'Pending' : 'Not live',
      detail:
        input.systemStatus.key === 'live'
          ? 'Missed callers can receive automatic text replies.'
          : input.systemStatus.description,
      tone: input.systemStatus.key === 'live' ? 'success' : input.systemStatus.key === 'activating' ? 'secondary' : 'outline',
    },
    {
      label: 'Owner alerts',
      value: input.ownerAlertsReady ? 'Active' : 'Needs setup',
      detail: input.ownerAlertsReady ? 'Lead summaries can reach the owner.' : 'Add an owner phone or email in settings.',
      tone: input.ownerAlertsReady ? 'success' : 'outline',
    },
  ];
}

function isMissedCallToday(
  lead: unknown,
  input: { timeZone: string; todayKey: string },
) {
  if (!lead || typeof lead !== 'object' || !('call' in lead)) return false;
  const call = (lead as { call?: { missed: boolean; createdAt: Date } | null }).call;
  return Boolean(call?.missed && getDateKey(call.createdAt, input.timeZone) === input.todayKey);
}

export default async function AppHomePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const demoMode = isPortfolioDemoMode();
  const business = demoMode ? getPortfolioDemoBusiness() : await requireBusiness();

  const [allLeads, notificationSettings] = demoMode
    ? [getPortfolioDemoLeads(null), null]
    : await Promise.all([
        listAllDashboardLeadsForBusiness(business.id),
        db.businessNotificationSettings.findUnique({ where: { businessId: business.id } }),
      ]);

  const successfulLeadCount = allLeads.filter((lead) => lead.ownerNotifiedAt || lead.notifiedAt).length;
  const systemStatus = getCustomerSystemStatus(business, successfulLeadCount);
  const todayKey = getDateKey(new Date(), business.timezone);
  const missedCallsToday = allLeads.filter((lead) => isMissedCallToday(lead, { timeZone: business.timezone, todayKey })).length;
  const needsFollowUpCount = allLeads.filter((lead) => isLeadOpenStatus(lead.status)).length;
  const newLeadCount = allLeads.filter((lead) => lead.status === LeadStatus.NEW).length;
  const bookedLeadCount = allLeads.filter((lead) => lead.status === LeadStatus.BOOKED).length;

  const attentionLeads = allLeads
    .filter((lead) => isLeadOpenStatus(lead.status))
    .sort((left, right) => {
      const leftPriority = getAttentionPriority(left);
      const rightPriority = getAttentionPriority(right);

      if (leftPriority.status !== rightPriority.status) {
        return leftPriority.status - rightPriority.status;
      }

      if (leftPriority.readiness !== rightPriority.readiness) {
        return leftPriority.readiness - rightPriority.readiness;
      }

      return rightPriority.activityAt - leftPriority.activityAt;
    })
    .slice(0, 6)
    .map((lead) => toLeadCard(lead));

  const recentLeads = [...allLeads]
    .sort((left, right) => getLeadLastActivityAt(right).getTime() - getLeadLastActivityAt(left).getTime())
    .slice(0, 6)
    .map((lead) => toLeadCard(lead));

  const ownerAlertsReady = Boolean(
    business.notifyPhone ||
      notificationSettings?.ownerPhone ||
      (notificationSettings?.notifySms && notificationSettings.ownerPhone) ||
      (notificationSettings?.notifyEmail && notificationSettings.ownerEmail),
  );

  const summaryCards: DashboardSummaryCard[] = [
    {
      label: 'New leads',
      value: newLeadCount,
      detail: 'Missed callers not worked yet.',
      href: '/app/leads?status=new',
    },
    {
      label: 'Needs follow-up',
      value: needsFollowUpCount,
      detail: 'Open leads that still need action.',
      href: '/app/leads?view=attention',
    },
    {
      label: 'Booked leads',
      value: bookedLeadCount,
      detail: 'Leads marked booked.',
      href: '/app/leads?view=booked',
    },
    {
      label: 'Missed calls today',
      value: missedCallsToday,
      detail: 'Missed calls captured today.',
      href: '/app/leads',
    },
  ];

  const feedback = {
    error: typeof searchParams?.error === 'string' ? searchParams.error : null,
    saved: searchParams?.saved === '1',
  };

  return (
    <HomeDashboard
      attentionLeads={attentionLeads}
      feedback={feedback}
      isDemoMode={demoMode}
      recentLeads={recentLeads}
      simulatorHref="/simulator"
      statusItems={getStatusItems({ ownerAlertsReady, systemStatus })}
      summaryCards={summaryCards}
    />
  );
}
