import Link from 'next/link';
import { LeadStatus } from '@prisma/client';

import { updateLeadStatusAction } from '@/app/app/leads/actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getLeadStatusBadgeVariant, leadStatusLabels } from '@/lib/lead-presenters';
import { cn } from '@/lib/utils';

type DashboardFeedback = {
  error?: string | null;
  saved?: boolean;
};

export type DashboardSummaryCard = {
  label: string;
  value: number;
  detail: string;
  href?: string;
};

export type DashboardStatusItem = {
  label: string;
  value: string;
  detail: string;
  tone: 'success' | 'secondary' | 'outline';
};

export type DashboardLeadCard = {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceNeeded: string;
  urgencyLabel: string;
  createdLabel: string;
  lastActivityLabel: string;
  summary: string;
  recommendedNextAction: string;
  status: LeadStatus;
  callHref: string;
  leadHref: string;
};

function LeadStatusActionForm({
  leadId,
  status,
  redirectTo,
  label,
  variant,
}: {
  leadId: string;
  status: 'CONTACTED' | 'BOOKED' | 'LOST';
  redirectTo: string;
  label: string;
  variant?: 'default' | 'outline' | 'destructive';
}) {
  return (
    <form action={updateLeadStatusAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <input type="hidden" name="successRedirectTo" value={redirectTo} />
      <Button size="sm" type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

function LeadAttentionCard({ lead }: { lead: DashboardLeadCard }) {
  return (
    <Card className="border-primary/15 bg-card/95">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{lead.customerName}</CardTitle>
            <CardDescription>{lead.customerPhone}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
            <Badge variant={lead.urgencyLabel.toLowerCase().includes('urgent') ? 'destructive' : 'outline'}>{lead.urgencyLabel}</Badge>
          </div>
        </div>
        <div className="rounded-2xl border bg-background/80 p-3 text-sm">
          <p className="font-medium">{lead.recommendedNextAction}</p>
          <p className="mt-2 text-muted-foreground">{lead.serviceNeeded}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{lead.summary}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Created {lead.createdLabel}</span>
          <span>Last activity {lead.lastActivityLabel}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={buttonVariants({ size: 'sm' })} href={lead.callHref}>
            Call now
          </Link>
          <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={lead.leadHref}>
            Open lead
          </Link>
          <LeadStatusActionForm leadId={lead.id} label="Mark contacted" redirectTo="/app" status="CONTACTED" variant="outline" />
          <LeadStatusActionForm leadId={lead.id} label="Mark booked" redirectTo="/app" status="BOOKED" />
        </div>
      </CardContent>
    </Card>
  );
}

function RecentLeadRow({ lead }: { lead: DashboardLeadCard }) {
  return (
    <Link className="block rounded-2xl border bg-background/90 p-4 transition-colors hover:bg-muted/20" href={lead.leadHref}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{lead.customerName}</p>
          <p className="mt-1 text-sm text-muted-foreground">{lead.serviceNeeded}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Created {lead.createdLabel} · Last activity {lead.lastActivityLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
          <Badge variant="outline">{lead.urgencyLabel}</Badge>
        </div>
      </div>
    </Link>
  );
}

export function HomeDashboard({
  attentionLeads,
  recentLeads,
  feedback,
  isDemoMode,
  statusItems,
  summaryCards,
  simulatorHref,
}: {
  attentionLeads: DashboardLeadCard[];
  recentLeads: DashboardLeadCard[];
  feedback: DashboardFeedback;
  isDemoMode: boolean;
  statusItems: DashboardStatusItem[];
  summaryCards: DashboardSummaryCard[];
  simulatorHref: string;
}) {
  return (
    <div className="space-y-6">
      {feedback.error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{feedback.error}</div> : null}
      {feedback.saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Lead updated.</div> : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Owner dashboard</Badge>
          {isDemoMode ? <Badge variant="secondary">Demo data</Badge> : null}
        </div>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Missed-call leads</h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              See who needs a callback, open the lead, and mark the outcome after you talk to them.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants()} href="/app/leads?view=attention">
              Open lead inbox
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href={simulatorHref}>
              Test recovery flow
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const content = (
            <Card className={cn('h-full bg-card/95', card.href && 'transition-colors hover:bg-muted/20')}>
              <CardHeader className="pb-3">
                <CardDescription>{card.label}</CardDescription>
                <CardTitle className="text-3xl">{card.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{card.detail}</p>
              </CardContent>
            </Card>
          );

          return card.href ? (
            <Link key={card.label} href={card.href}>
              {content}
            </Link>
          ) : (
            <div key={card.label}>{content}</div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="space-y-6">
          <Card className="bg-card/95">
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Leads needing attention</CardTitle>
                <CardDescription>Call these missed callers first.</CardDescription>
              </div>
              <Link className={buttonVariants({ variant: 'ghost' })} href="/app/leads?view=attention">
                View inbox
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              {attentionLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-6">
                  <p className="text-sm font-medium text-foreground">No leads need follow-up right now.</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    When a missed caller replies or needs a callback, they will appear here first.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 2xl:grid-cols-2">
                  {attentionLeads.map((lead) => (
                    <LeadAttentionCard key={lead.id} lead={lead} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/95">
            <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Recent leads</CardTitle>
                <CardDescription>The latest missed-call leads captured for your business.</CardDescription>
              </div>
              <Link className={buttonVariants({ variant: 'ghost' })} href="/app/leads">
                View all leads
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 p-6">
                  <p className="text-sm font-medium text-foreground">No leads yet.</p>
                  <p className="mt-2 text-sm text-muted-foreground">Your first missed-call lead will appear here automatically.</p>
                </div>
              ) : (
                recentLeads.map((lead) => <RecentLeadRow key={lead.id} lead={lead} />)
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="bg-card/95">
            <CardHeader>
              <CardTitle>System status</CardTitle>
              <CardDescription>Simple setup signals only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {statusItems.map((item) => (
                <div key={item.label} className="rounded-2xl border bg-background/90 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.label}</p>
                    <Badge variant={item.tone}>{item.value}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                </div>
              ))}
              <Link className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'w-full')} href="/app/settings">
                Review settings
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-card/95">
            <CardHeader>
              <CardTitle>Want to test it?</CardTitle>
              <CardDescription>Run the public simulator to see a sample missed-call flow.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link className={cn(buttonVariants(), 'w-full')} href={simulatorHref}>
                Test recovery flow
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
