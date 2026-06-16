import { LeadReadiness, LeadStatus } from '@prisma/client';

import { HomeDashboard, type DashboardLeadCard } from '@/components/home-dashboard';
import { requireBusiness } from '@/lib/auth';
import { listAllDashboardLeadsForBusiness } from '@/lib/business-access';
import { buildRecoveryMetrics } from '@/lib/dashboard-home';
import { db } from '@/lib/db';
import { formatRelativeTime, getLeadLastActivityAt, isLeadOpenStatus } from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoBusiness, getPortfolioDemoLeads, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getCustomerSystemStatus } from '@/lib/system-status';

function buildLeadDetailHref(leadId: string) {
  return `/app/leads/${leadId}?from=%2Fapp`;
}

function buildConversationHref(leadId: string) {
  return `/app/conversations?leadId=${leadId}`;
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
  if (lead.status === LeadStatus.BOOKED) return 'Booked. Keep this lead as proof of recovered revenue.';
  if (lead.status === LeadStatus.LOST) return 'No further action needed unless the customer comes back.';
  if (lead.status === LeadStatus.CONTACTED) return 'Follow up again and confirm whether the job is booked.';
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
    qualifiedAt: Date | null;
    notifiedAt: Date | null;
    ownerNotifiedAt: Date | null;
    createdAt: Date;
    lastInteractionAt: Date | null;
    lastInboundAt: Date | null;
  },
  demoMode: boolean,
): DashboardLeadCard {
  return {
    id: lead.id,
    customerName: getCustomerName(lead),
    serviceNeeded: lead.serviceType || lead.serviceRequested || 'Service needed not captured yet',
    urgencyLabel: lead.urgency || (lead.readiness === LeadReadiness.URGENT ? 'Urgent' : lead.readiness === LeadReadiness.QUALIFIED ? 'Qualified' : 'Needs reply'),
    locationLabel: lead.location || lead.zipCode || 'Location pending',
    timeSinceMissedCall: formatRelativeTime(lead.createdAt),
    summary:
      lead.summary ||
      'CallbackCloser is still collecting the AI summary for this lead. Open the conversation or call back to keep the lead moving.',
    recommendedNextAction: getRecommendedNextAction(lead),
    status: lead.status,
    countsAsRecovered:
      lead.status === LeadStatus.BOOKED ||
      lead.status === LeadStatus.CONTACTED ||
      lead.status === LeadStatus.NOTIFIED ||
      lead.status === LeadStatus.QUALIFIED ||
      lead.readiness !== LeadReadiness.PENDING ||
      Boolean(lead.qualifiedAt || lead.notifiedAt || lead.ownerNotifiedAt),
    callHref: `tel:${lead.callerPhoneNormalized || lead.callerPhone}`,
    sendTextHref: buildConversationHref(lead.id),
    leadHref: buildLeadDetailHref(lead.id),
    sourceLabel: demoMode ? 'Demo lead' : null,
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
  const metrics = buildRecoveryMetrics(allLeads, business.averageJobValueCents);

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
    .slice(0, 4)
    .map((lead) => toLeadCard(lead, demoMode));

  const queueAnchor =
    demoMode && allLeads.length > 0
      ? new Date(Math.max(...allLeads.map((lead) => lead.createdAt.getTime())))
      : new Date();
  const queueDateKey = getDateKey(queueAnchor, business.timezone);
  const queueLeads = [...allLeads]
    .filter((lead) => getDateKey(lead.createdAt, business.timezone) === queueDateKey)
    .sort((left, right) => getLeadLastActivityAt(right).getTime() - getLeadLastActivityAt(left).getTime())
    .slice(0, 6)
    .map((lead) => toLeadCard(lead, demoMode));

  const phoneLineConnected = Boolean(business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber);
  const ownerAlertsReady = Boolean(
    business.notifyPhone ||
      notificationSettings?.ownerPhone ||
      (notificationSettings?.notifySms && notificationSettings.ownerPhone) ||
      (notificationSettings?.notifyEmail && notificationSettings.ownerEmail),
  );

  const setupChecklistItems = [
    {
      key: 'phone-line',
      label: 'Phone line connected',
      detail: phoneLineConnected
        ? 'Business line ready.'
        : 'Connect the line that should trigger missed-call recovery.',
      state: phoneLineConnected ? ('complete' as const) : ('pending' as const),
    },
    {
      key: 'owner-alerts',
      label: 'Owner alerts ready',
      detail: ownerAlertsReady
        ? 'Owner handoff route ready.'
        : 'Add an owner phone or email for lead handoffs.',
      state: ownerAlertsReady ? ('complete' as const) : ('pending' as const),
    },
    {
      key: 'text-replies',
      label: 'Text replies being prepared',
      detail:
        systemStatus.key === 'live'
          ? 'Text replies are live.'
          : systemStatus.description,
      state:
        systemStatus.key === 'live'
          ? ('complete' as const)
          : systemStatus.key === 'activating'
            ? ('in_progress' as const)
            : ('pending' as const),
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
      setupHref="/app/settings"
      hasRealLeadData={allLeads.length > 0}
      isDemoMode={demoMode}
      metrics={metrics}
      queueLeads={queueLeads}
      setupChecklistItems={setupChecklistItems}
      showSetupChecklist={systemStatus.key !== 'live'}
      simulatorHref="/simulator"
    />
  );
}
