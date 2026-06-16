import Link from 'next/link';
import { LeadReadiness, LeadStatus } from '@prisma/client';

import { CustomerLeadRow } from '@/components/customer-lead-row';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { listAllDashboardLeadsForBusiness } from '@/lib/business-access';
import { getLeadLastActivityAt, isLeadOpenStatus, leadStatusLabels } from '@/lib/lead-presenters';
import { getPortfolioDemoLeads, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { cn } from '@/lib/utils';

type SearchParams = Record<string, string | string[] | undefined>;
type InboxView = 'attention' | 'all' | 'booked' | 'lost';

function buildLeadsHref(view: InboxView) {
  if (view === 'attention') return '/app/leads?view=attention';
  if (view === 'all') return '/app/leads';
  return `/app/leads?view=${view}`;
}

function buildStatusHref(status: LeadStatus) {
  return `/app/leads?status=${status.toLowerCase()}`;
}

function buildLeadDetailHref(leadId: string, params: { view?: InboxView; status?: LeadStatus | null }) {
  const query = new URLSearchParams();

  if (params.status) {
    query.set('from', buildStatusHref(params.status));
  } else if (params.view && params.view !== 'all') {
    query.set('from', buildLeadsHref(params.view));
  }

  const queryString = query.toString();
  return queryString ? `/app/leads/${leadId}?${queryString}` : `/app/leads/${leadId}`;
}

function parseInboxView(value: string | undefined): InboxView {
  if (value === 'all' || value === 'booked' || value === 'lost' || value === 'attention') {
    return value;
  }

  return 'attention';
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

function sortAttentionLeads<
  T extends {
    status: LeadStatus;
    readiness: LeadReadiness;
    createdAt: Date;
    lastInteractionAt: Date | null;
    lastInboundAt: Date | null;
    lastOutboundAt: Date | null;
  },
>(leads: T[]) {
  return [...leads].sort((left, right) => {
    const leftPriority = getAttentionPriority(left);
    const rightPriority = getAttentionPriority(right);

    if (leftPriority.status !== rightPriority.status) {
      return leftPriority.status - rightPriority.status;
    }

    if (leftPriority.readiness !== rightPriority.readiness) {
      return leftPriority.readiness - rightPriority.readiness;
    }

    return rightPriority.activityAt - leftPriority.activityAt;
  });
}

export default async function LeadsPage({ searchParams }: { searchParams?: SearchParams }) {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const saved = searchParams?.saved === '1';
  const rawStatus = typeof searchParams?.status === 'string' ? searchParams.status.toUpperCase() : null;
  const statusFilter = rawStatus && Object.values(LeadStatus).includes(rawStatus as LeadStatus) ? (rawStatus as LeadStatus) : null;
  const view = statusFilter ? 'all' : parseInboxView(typeof searchParams?.view === 'string' ? searchParams.view : undefined);
  const allLeads = demoMode ? getPortfolioDemoLeads(null) : await listAllDashboardLeadsForBusiness(business.id);
  const hasLeads = allLeads.length > 0;

  const filteredLeads = statusFilter
    ? allLeads.filter((lead) => lead.status === statusFilter)
    : view === 'attention'
      ? sortAttentionLeads(allLeads.filter((lead) => isLeadOpenStatus(lead.status)))
      : view === 'booked'
        ? allLeads.filter((lead) => lead.status === LeadStatus.BOOKED)
        : view === 'lost'
          ? allLeads.filter((lead) => lead.status === LeadStatus.LOST)
          : allLeads;

  const filterChips = [
    {
      key: 'attention' as const,
      label: 'Needs follow-up',
      href: buildLeadsHref('attention'),
      count: allLeads.filter((lead) => isLeadOpenStatus(lead.status)).length,
      active: !statusFilter && view === 'attention',
    },
    {
      key: 'all' as const,
      label: 'All leads',
      href: buildLeadsHref('all'),
      count: allLeads.length,
      active: !statusFilter && view === 'all',
    },
    {
      key: 'booked' as const,
      label: 'Booked',
      href: buildLeadsHref('booked'),
      count: allLeads.filter((lead) => lead.status === LeadStatus.BOOKED).length,
      active: !statusFilter && view === 'booked',
    },
    {
      key: 'lost' as const,
      label: 'Lost',
      href: buildLeadsHref('lost'),
      count: allLeads.filter((lead) => lead.status === LeadStatus.LOST).length,
      active: !statusFilter && view === 'lost',
    },
  ];

  const listDescription = statusFilter
    ? `Showing ${leadStatusLabels[statusFilter].toLowerCase()} leads. Open a lead to act on it.`
    : view === 'attention'
      ? 'Showing leads that still need action. Open one to call back or mark the outcome.'
      : 'Open any lead to review the conversation and mark it contacted, booked, or lost.';

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Badge variant="outline">Lead inbox</Badge>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Lead inbox</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Scan missed-call leads, then open one to call back and mark the outcome.
          </p>
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Lead updated.</div> : null}

      {!hasLeads ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>No leads yet</CardTitle>
            <CardDescription>When a missed call becomes a lead, it will appear here automatically.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/settings">
              Check setup
            </Link>
            <Link className={buttonVariants()} href="/app/call-flow">
              Run a test call
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card/95">
          <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Leads</CardTitle>
              <CardDescription>{listDescription}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {filterChips.map((chip) => (
                <Link
                  key={chip.key}
                  className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-muted', chip.active && 'bg-muted')}
                  href={chip.href}
                >
                  {chip.label} <span className="text-muted-foreground">{chip.count}</span>
                </Link>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusFilter ? (
              <div className="flex items-center gap-3 rounded-2xl border bg-muted/20 px-4 py-3 text-sm">
                <span className="font-medium">Status filter:</span>
                <Badge variant="secondary">{leadStatusLabels[statusFilter]}</Badge>
                <Link className="text-muted-foreground underline underline-offset-4" href="/app/leads?view=attention">
                  Clear filter
                </Link>
              </div>
            ) : null}

            {filteredLeads.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                No leads match this view right now.
              </div>
            ) : (
              filteredLeads.map((lead) => (
                <CustomerLeadRow
                  key={lead.id}
                  lead={lead}
                  href={buildLeadDetailHref(lead.id, {
                    view,
                    status: statusFilter,
                  })}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
