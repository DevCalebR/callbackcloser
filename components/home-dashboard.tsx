'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LeadStatus } from '@prisma/client';

import { updateLeadStatusAction } from '@/app/app/leads/actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DEFAULT_AVERAGE_JOB_VALUE, estimateRevenueSaved, formatCurrency, type RecoveryMetrics } from '@/lib/dashboard-home';
import { getLeadStatusBadgeVariant, leadStatusLabels } from '@/lib/lead-presenters';
import { cn } from '@/lib/utils';

type SetupChecklistItem = {
  key: string;
  label: string;
  detail: string;
  state: 'complete' | 'in_progress' | 'pending';
};

export type DashboardLeadCard = {
  id: string;
  customerName: string;
  serviceNeeded: string;
  urgencyLabel: string;
  locationLabel: string;
  timeSinceMissedCall: string;
  summary: string;
  recommendedNextAction: string;
  status: LeadStatus;
  countsAsRecovered: boolean;
  callHref: string | null;
  sendTextHref: string | null;
  leadHref: string | null;
  sourceLabel: 'Sample lead' | 'Demo lead' | null;
};

type DashboardFeedback = {
  error?: string | null;
  saved?: boolean;
};

const sampleLeadSeed: DashboardLeadCard[] = [
  {
    id: 'sample-sarah',
    customerName: 'Sarah M.',
    serviceNeeded: 'Kitchen sink leak',
    urgencyLabel: 'Urgent',
    locationLabel: 'Knoxville',
    timeSinceMissedCall: '4 min ago',
    summary: 'Customer missed the call and replied by text. They need help today with a leaking sink and are ready for a callback.',
    recommendedNextAction: 'Call now.',
    status: LeadStatus.QUALIFIED,
    countsAsRecovered: true,
    callHref: null,
    sendTextHref: null,
    leadHref: null,
    sourceLabel: 'Sample lead',
  },
  {
    id: 'sample-james',
    customerName: 'James R.',
    serviceNeeded: 'Roof estimate',
    urgencyLabel: 'This week',
    locationLabel: 'Oak Ridge',
    timeSinceMissedCall: '18 min ago',
    summary: 'Customer wants a roof repair estimate and asked about availability this week.',
    recommendedNextAction: 'Call now.',
    status: LeadStatus.QUALIFIED,
    countsAsRecovered: true,
    callHref: null,
    sendTextHref: null,
    leadHref: null,
    sourceLabel: 'Sample lead',
  },
];

function buildSampleMetrics(leads: DashboardLeadCard[]): RecoveryMetrics {
  const missedCallsCaptured = leads.length;
  const recoveredLeads = leads.filter((lead) => lead.countsAsRecovered).length;
  const bookedJobs = leads.filter((lead) => lead.status === LeadStatus.BOOKED).length;

  return {
    missedCallsCaptured,
    recoveredLeads,
    bookedJobs,
    estimatedRevenueSaved: estimateRevenueSaved({
      bookedJobs,
      recoveredLeads,
      averageJobValue: DEFAULT_AVERAGE_JOB_VALUE,
    }),
    averageJobValue: DEFAULT_AVERAGE_JOB_VALUE,
    usesDefaultAverageJobValue: true,
  };
}

function getUrgencyVariant(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('urgent') || normalized.includes('today') || normalized.includes('emergency')) return 'destructive';
  if (normalized.includes('week') || normalized.includes('estimate')) return 'secondary';
  return 'outline';
}

function getSetupItemBadge(item: SetupChecklistItem) {
  if (item.state === 'complete') return { label: 'Complete', variant: 'success' as const };
  if (item.state === 'in_progress') return { label: 'In progress', variant: 'secondary' as const };
  return { label: 'Pending', variant: 'outline' as const };
}

function getProgressText(items: SetupChecklistItem[]) {
  const completeCount = items.filter((item) => item.state === 'complete').length;
  return `${completeCount} of ${items.length} steps complete`;
}

function getMetricBadgeLabel(input: { isDemoMode: boolean; showingSampleLeads: boolean; hasRealLeadData: boolean }) {
  if (input.isDemoMode) return 'Demo data';
  if (input.showingSampleLeads) return 'Sample data';
  if (!input.hasRealLeadData) return 'No real lead data yet';
  return 'Live data';
}

function LeadAttentionCard({
  lead,
  redirectTo,
  onDemoAction,
}: {
  lead: DashboardLeadCard;
  redirectTo: string;
  onDemoAction: (leadId: string, action: 'call' | 'text' | 'booked') => void;
}) {
  return (
    <div className="rounded-3xl border bg-background/90 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {lead.sourceLabel ? <Badge variant="outline">{lead.sourceLabel}</Badge> : null}
            <Badge variant={getUrgencyVariant(lead.urgencyLabel)}>{lead.urgencyLabel}</Badge>
            <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">{lead.customerName}</p>
            <p className="text-sm text-muted-foreground">
              {lead.serviceNeeded} · {lead.locationLabel} · {lead.timeSinceMissedCall}
            </p>
          </div>
        </div>
        {lead.leadHref ? (
          <Link className="text-sm font-medium text-muted-foreground underline underline-offset-4" href={lead.leadHref}>
            Open lead
          </Link>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
        <div className="rounded-2xl bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI Summary</p>
          <p className="mt-2 text-sm text-foreground">{lead.summary}</p>
        </div>
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recommended next action</p>
          <p className="mt-2 text-sm font-medium text-foreground">{lead.recommendedNextAction}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {lead.callHref ? (
          <Link className={buttonVariants()} href={lead.callHref}>
            Call Now
          </Link>
        ) : (
          <Button onClick={() => onDemoAction(lead.id, 'call')}>Call Now</Button>
        )}

        {lead.sendTextHref ? (
          <Link className={buttonVariants({ variant: 'outline' })} href={lead.sendTextHref}>
            Send Text
          </Link>
        ) : (
          <Button onClick={() => onDemoAction(lead.id, 'text')} variant="outline">
            Send Text
          </Button>
        )}

        {lead.sourceLabel ? (
          <Button onClick={() => onDemoAction(lead.id, 'booked')} variant="secondary">
            Mark Booked
          </Button>
        ) : (
          <form action={updateLeadStatusAction}>
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="status" value="BOOKED" />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <Button type="submit" variant="secondary">
              Mark Booked
            </Button>
          </form>
        )}
      </div>

      {lead.sourceLabel ? <p className="mt-3 text-xs text-muted-foreground">Demo actions stay on this page and do not touch production data.</p> : null}
    </div>
  );
}

function RecoveryQueueRow({
  lead,
  onRunDemoLead,
}: {
  lead?: DashboardLeadCard;
  onRunDemoLead: () => void;
}) {
  if (!lead) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/20 p-6">
        <p className="text-sm font-medium text-foreground">Your recovered leads will appear here after the first missed call.</p>
        <Button className="mt-4" onClick={onRunDemoLead} variant="outline">
          Run demo lead
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-background/90 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {lead.sourceLabel ? <Badge variant="outline">{lead.sourceLabel}</Badge> : null}
        <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{lead.customerName}</p>
          <p className="text-sm text-muted-foreground">
            {lead.serviceNeeded} · {lead.locationLabel} · {lead.timeSinceMissedCall}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{lead.summary}</p>
        </div>
        {lead.leadHref ? (
          <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={lead.leadHref}>
            Open
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function HomeDashboard({
  attentionLeads,
  queueLeads,
  metrics,
  feedback,
  isDemoMode,
  hasRealLeadData,
  showSetupChecklist,
  setupChecklistItems,
  finishActivationHref,
  simulatorHref,
}: {
  attentionLeads: DashboardLeadCard[];
  queueLeads: DashboardLeadCard[];
  metrics: RecoveryMetrics;
  feedback: DashboardFeedback;
  isDemoMode: boolean;
  hasRealLeadData: boolean;
  showSetupChecklist: boolean;
  setupChecklistItems: SetupChecklistItem[];
  finishActivationHref: string;
  simulatorHref: string;
}) {
  const [showSampleLeads, setShowSampleLeads] = useState(!hasRealLeadData && isDemoMode);
  const [sampleLeads, setSampleLeads] = useState(sampleLeadSeed);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  const showingSampleLeads = showSampleLeads && !hasRealLeadData;
  const displayedAttentionLeads = showingSampleLeads ? sampleLeads : attentionLeads;
  const displayedQueueLeads = showingSampleLeads ? sampleLeads : queueLeads;
  const displayedMetrics = useMemo(
    () => (showingSampleLeads ? buildSampleMetrics(sampleLeads) : metrics),
    [metrics, sampleLeads, showingSampleLeads],
  );

  function runDemoLead() {
    setShowSampleLeads(true);
    setDemoNotice('Sample leads are now visible on this dashboard. These cards stay in the browser only and do not affect production data.');
  }

  function handleDemoAction(leadId: string, action: 'call' | 'text' | 'booked') {
    setSampleLeads((currentLeads) =>
      currentLeads.map((lead) => {
        if (lead.id !== leadId) return lead;
        if (action === 'booked') {
          return {
            ...lead,
            status: LeadStatus.BOOKED,
            recommendedNextAction: 'Booked. Keep this one for proof of recovered revenue.',
          };
        }
        return {
          ...lead,
          status: LeadStatus.CONTACTED,
          recommendedNextAction: action === 'call' ? 'Follow up by text if they do not answer.' : 'Wait for the reply, then mark the job outcome.',
        };
      }),
    );

    setDemoNotice(
      action === 'booked'
        ? 'Sample lead marked booked. The revenue estimate updated on this page only.'
        : 'Sample lead updated. This is a frontend-only demo action and does not send live outreach.',
    );
  }

  return (
    <div className="space-y-8">
      {feedback.error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{feedback.error}</div> : null}
      {feedback.saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Lead updated.</div> : null}
      {demoNotice ? <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">{demoNotice}</div> : null}

      <section className="space-y-4">
        <Badge variant="outline">Lead recovery command center</Badge>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Missed-call leads that need action</h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              CallbackCloser follows up instantly, qualifies the customer, and shows you who to call back first.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants()} href="/app/leads?view=attention">
              Open lead inbox
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href={simulatorHref}>
              Run test missed call
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <div className="space-y-6">
          <Card className="bg-card/95">
            <CardHeader>
              <CardTitle>Leads needing attention first</CardTitle>
              <CardDescription>These missed callers are the clearest path to recovered jobs right now.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {displayedAttentionLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-6">
                  <p className="text-sm font-medium text-foreground">No real leads need action yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Once CallbackCloser captures a missed call, the lead will appear here with a summary, urgency level, and one-click follow-up actions.
                  </p>
                  <Button className="mt-4" onClick={runDemoLead} variant="outline">
                    Run demo lead
                  </Button>
                </div>
              ) : (
                displayedAttentionLeads.map((lead) => (
                  <LeadAttentionCard key={lead.id} lead={lead} onDemoAction={handleDemoAction} redirectTo="/app" />
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/95">
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Today&apos;s recovery queue</CardTitle>
                <CardDescription>Every missed-call lead captured today.</CardDescription>
              </div>
              <Link className={buttonVariants({ variant: 'ghost' })} href="/app/leads">
                View all leads
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {displayedQueueLeads.length === 0 ? (
                <RecoveryQueueRow onRunDemoLead={runDemoLead} />
              ) : (
                displayedQueueLeads.map((lead) => <RecoveryQueueRow key={lead.id} lead={lead} onRunDemoLead={runDemoLead} />)
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {showSetupChecklist ? (
            <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle>Finish setup to start recovering missed calls</CardTitle>
                    <CardDescription>{getProgressText(setupChecklistItems)}</CardDescription>
                  </div>
                  <Badge variant="outline">{getProgressText(setupChecklistItems)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {setupChecklistItems.map((item) => {
                  const badge = getSetupItemBadge(item);
                  return (
                    <div key={item.key} className="rounded-2xl border bg-background/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-medium">{item.label}</p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                    </div>
                  );
                })}
                <Link className={cn(buttonVariants(), 'w-full')} href={finishActivationHref}>
                  Finish activation
                </Link>
              </CardContent>
            </Card>
          ) : null}

          <Card className="bg-card/95">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Recovery numbers</CardTitle>
                  <CardDescription>Keep the value of missed-call follow-up obvious without opening another report.</CardDescription>
                </div>
                <Badge variant={showingSampleLeads || isDemoMode ? 'secondary' : hasRealLeadData ? 'success' : 'outline'}>
                  {getMetricBadgeLabel({ isDemoMode, showingSampleLeads, hasRealLeadData })}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border bg-background/90 p-4">
                  <p className="text-sm text-muted-foreground">Missed calls captured</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{displayedMetrics.missedCallsCaptured}</p>
                </div>
                <div className="rounded-2xl border bg-background/90 p-4">
                  <p className="text-sm text-muted-foreground">Recovered leads</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{displayedMetrics.recoveredLeads}</p>
                </div>
                <div className="rounded-2xl border bg-background/90 p-4">
                  <p className="text-sm text-muted-foreground">Booked jobs</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{displayedMetrics.bookedJobs}</p>
                </div>
                <div className="rounded-2xl border bg-background/90 p-4">
                  <p className="text-sm text-muted-foreground">Estimated revenue saved</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{formatCurrency(displayedMetrics.estimatedRevenueSaved)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Revenue saved is estimated from booked/recovered leads and your average job value.</p>
              {displayedMetrics.usesDefaultAverageJobValue ? (
                <p className="text-xs text-muted-foreground">
                  Using the default {formatCurrency(displayedMetrics.averageJobValue)} average job value until a business-specific average is configured.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="bg-card/95">
            <CardHeader>
              <CardTitle>Test your missed-call recovery flow</CardTitle>
              <CardDescription>Send yourself a sample missed-call lead so you can see the text flow, owner alert, and dashboard update.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link className={cn(buttonVariants(), 'w-full')} href={simulatorHref}>
                Test demo flow
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
