import Link from 'next/link';
import { LeadReadiness, LeadStatus } from '@prisma/client';

import { CustomerLeadRow } from '@/components/customer-lead-row';
import { LeadConversionSummaryCard } from '@/components/lead-conversion-summary-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { listAllDashboardLeadsForBusiness } from '@/lib/business-access';
import { db } from '@/lib/db';
import { getLeadOutcomeSummary } from '@/lib/lead-outcomes';
import { getLeadLastActivityAt, isLeadOpenStatus } from '@/lib/lead-presenters';
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

export default async function AppHomePage() {
  const demoMode = isPortfolioDemoMode();
  const business = demoMode ? getPortfolioDemoBusiness() : await requireBusiness();

  const [allLeads, notificationSettings] = demoMode
    ? [
        getPortfolioDemoLeads(null),
        null,
      ]
    : await Promise.all([
        listAllDashboardLeadsForBusiness(business.id),
        db.businessNotificationSettings.findUnique({ where: { businessId: business.id } }),
      ]);

  const successfulLeadCount = allLeads.filter((lead) => lead.ownerNotifiedAt || lead.notifiedAt).length;
  const outcomeSummary = getLeadOutcomeSummary(allLeads);
  const systemStatus = getCustomerSystemStatus(business, successfulLeadCount);
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
    .slice(0, 5);
  const recentLeads = [...allLeads]
    .sort((left, right) => getLeadLastActivityAt(right).getTime() - getLeadLastActivityAt(left).getTime())
    .slice(0, 6);

  const ownerAlertsReady = Boolean(
    business.notifyPhone ||
      notificationSettings?.ownerPhone ||
      (notificationSettings?.notifySms && notificationSettings.ownerPhone) ||
      (notificationSettings?.notifyEmail && notificationSettings.ownerEmail),
  );

  const healthItems = [
    {
      label: 'Texting',
      value: systemStatus.key === 'live' ? 'Active' : 'Finishing setup',
      detail: systemStatus.description,
    },
    {
      label: 'Phone line',
      value: business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber ? 'Connected' : 'Needs setup',
      detail: business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber ? 'Your business line is attached to CallbackCloser.' : 'Finish phone setup in Settings before going live.',
    },
    {
      label: 'Owner alerts',
      value: ownerAlertsReady ? 'Ready' : 'Needs setup',
      detail: ownerAlertsReady ? 'Lead alerts can reach you quickly when a missed call turns into a lead.' : 'Add an owner alert number or email in Settings.',
    },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Badge variant="outline">Customer dashboard</Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Who needs follow-up right now?</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Open the lead that needs attention, take action, and move on. This page keeps the next calls obvious.
            </p>
          </div>
        </div>
        <Link className={buttonVariants()} href="/app/leads?view=attention">
          Open lead inbox
        </Link>
      </section>

      <LeadConversionSummaryCard
        description="Keep the win/loss numbers obvious without opening a separate analytics dashboard."
        summary={outcomeSummary}
      />

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.85fr]">
        <Card className="bg-card/95">
          <CardHeader>
            <CardTitle>Leads needing attention first</CardTitle>
            <CardDescription>These are the leads most likely to need a callback or outcome update next.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {attentionLeads.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                No open leads need action right now.
              </div>
            ) : (
              attentionLeads.map((lead) => <CustomerLeadRow key={lead.id} lead={lead} href={buildLeadDetailHref(lead.id)} compact />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System health</CardTitle>
            <CardDescription>Only the simple status checks that matter for day-to-day use.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthItems.map((item) => (
              <div key={item.label} className="rounded-2xl border bg-background/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{item.label}</p>
                  <Badge variant={item.value === 'Needs setup' ? 'outline' : 'secondary'}>{item.value}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-card/95">
          <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Recent leads</CardTitle>
              <CardDescription>Everything that came through recently, whether it still needs action or not.</CardDescription>
            </div>
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/leads">
              View all leads
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentLeads.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                Leads will show up here as soon as CallbackCloser captures a missed call.
              </div>
            ) : (
              recentLeads.map((lead) => <CustomerLeadRow key={lead.id} lead={lead} href={buildLeadDetailHref(lead.id)} />)
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
