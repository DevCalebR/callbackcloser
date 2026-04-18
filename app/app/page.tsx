import Link from 'next/link';
import { LeadReadiness, LeadStatus } from '@prisma/client';

import { CustomerLeadRow } from '@/components/customer-lead-row';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { listAllDashboardLeadsForBusiness } from '@/lib/business-access';
import { db } from '@/lib/db';
import { getLeadLastActivityAt, isLeadOpenStatus } from '@/lib/lead-presenters';
import { getPortfolioDemoBusiness, getPortfolioDemoLeads, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getCustomerSystemStatus } from '@/lib/system-status';

function buildLeadDetailHref(leadId: string) {
  return `/app/leads/${leadId}?from=%2Fapp`;
}

function parseTimeZoneOffsetMinutes(value: string) {
  const match = value.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || '0');
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const label = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  return parseTimeZoneOffsetMinutes(label);
}

function getTodayRangeForTimeZone(timeZone: string) {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const year = Number(parts.find((part) => part.type === 'year')?.value || now.getUTCFullYear());
    const month = Number(parts.find((part) => part.type === 'month')?.value || now.getUTCMonth() + 1);
    const day = Number(parts.find((part) => part.type === 'day')?.value || now.getUTCDate());

    const startGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const endGuess = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));

    return {
      start: new Date(startGuess.getTime() - getTimeZoneOffsetMinutes(startGuess, timeZone) * 60_000),
      end: new Date(endGuess.getTime() - getTimeZoneOffsetMinutes(endGuess, timeZone) * 60_000),
    };
  } catch {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return { start, end };
  }
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
  const { start, end } = getTodayRangeForTimeZone(business.timezone || 'America/New_York');

  const [allLeads, notificationSettings, missedCallsToday] = demoMode
    ? [
        getPortfolioDemoLeads(null),
        null,
        getPortfolioDemoLeads(null).filter((lead) => lead.createdAt >= start && lead.createdAt < end).length,
      ]
    : await Promise.all([
        listAllDashboardLeadsForBusiness(business.id),
        db.businessNotificationSettings.findUnique({ where: { businessId: business.id } }),
        db.call.count({
          where: {
            businessId: business.id,
            missed: true,
            createdAt: {
              gte: start,
              lt: end,
            },
          },
        }),
      ]);

  const successfulLeadCount = allLeads.filter((lead) => lead.ownerNotifiedAt || lead.notifiedAt).length;
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

  const summaryCards = [
    {
      label: 'New leads',
      value: allLeads.filter((lead) => lead.status === LeadStatus.NEW).length,
      href: '/app/leads?status=new',
    },
    {
      label: 'Needs follow-up',
      value: allLeads.filter((lead) => isLeadOpenStatus(lead.status)).length,
      href: '/app/leads?view=attention',
    },
    {
      label: 'Booked',
      value: allLeads.filter((lead) => lead.status === LeadStatus.BOOKED).length,
      href: '/app/leads?status=booked',
    },
    {
      label: 'Missed calls today',
      value: missedCallsToday,
      href: '/app/leads?view=attention',
    },
  ];

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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-2xl border bg-card p-5 transition-colors hover:bg-muted/20">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{card.value}</p>
          </Link>
        ))}
      </section>

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
