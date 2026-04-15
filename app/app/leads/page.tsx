import Link from 'next/link';
import { LeadStatus } from '@prisma/client';

import { UpgradeBanner } from '@/components/upgrade-banner';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { listAllDashboardLeadsForBusiness, listDashboardLeadsForBusiness } from '@/lib/business-access';
import { db } from '@/lib/db';
import {
  formatDateTime,
  formatRelativeTime,
  getLeadStatusBadgeVariant,
  leadReadinessLabels,
  leadStatusLabels,
  leadStatusOrder,
} from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoBlockedCount, getPortfolioDemoLeads, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getConversationUsageForBusiness } from '@/lib/usage';
import { describeAutomationBlockReason, resolveAutomationBlockReason } from '@/lib/usage-visibility';
import { cn } from '@/lib/utils';

type SearchParams = Record<string, string | string[] | undefined>;

function buildLeadsHref(status: LeadStatus | null) {
  const params = new URLSearchParams();
  if (status) params.set('status', status.toLowerCase());
  const query = params.toString();
  return query ? `/app/leads?${query}` : '/app/leads';
}

function buildLeadDetailHref(leadId: string, status: LeadStatus | null) {
  const params = new URLSearchParams();
  const returnTo = buildLeadsHref(status);
  if (returnTo !== '/app/leads') {
    params.set('from', returnTo);
  }
  const query = params.toString();
  return query ? `/app/leads/${leadId}?${query}` : `/app/leads/${leadId}`;
}

function getLeadPrimaryLabel(lead: {
  callerName?: string | null;
  contactName?: string | null;
  callerPhoneNormalized?: string | null;
  callerPhone: string;
}) {
  return lead.callerName || lead.contactName || formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone);
}

function getLeadSecondaryLabel(lead: {
  callerName?: string | null;
  contactName?: string | null;
  callerPhoneNormalized?: string | null;
  callerPhone: string;
}) {
  if (lead.callerName || lead.contactName) {
    return formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone);
  }

  return 'Name not captured yet';
}

export default async function LeadsPage({ searchParams }: { searchParams?: SearchParams }) {
  const business = await requireBusiness();
  const rawFilter = typeof searchParams?.status === 'string' ? searchParams.status.toUpperCase() : 'ALL';
  const statusFilter = Object.values(LeadStatus).includes(rawFilter as LeadStatus) ? (rawFilter as LeadStatus) : null;
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const saved = searchParams?.saved === '1';
  const demoMode = isPortfolioDemoMode();
  const billingAccess = getBusinessBillingAccessState(business);

  const [filteredLeads, allLeads, blockedCount, usage] = demoMode
    ? [getPortfolioDemoLeads(statusFilter), getPortfolioDemoLeads(null), getPortfolioDemoBlockedCount(), null]
    : await Promise.all([
        listDashboardLeadsForBusiness(business.id, statusFilter),
        listAllDashboardLeadsForBusiness(business.id),
        db.lead.count({ where: { businessId: business.id, billingRequired: true } }),
        getConversationUsageForBusiness(business),
      ]);
  const hasLeads = allLeads.length > 0;
  const automationBlockReason = resolveAutomationBlockReason({
    blockedCount,
    subscriptionStatus: business.subscriptionStatus,
    billingActive: billingAccess.billingActive,
    usage,
  });
  const automationBlockMessage = describeAutomationBlockReason(automationBlockReason, {
    blockedCount,
    usage: usage ?? undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Badge variant="outline">Recovered Leads</Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lead inbox</h1>
            <p className="text-sm text-muted-foreground">
              Open any lead to call back, review the conversation, and update the outcome from one clear workspace.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={buttonVariants({ variant: 'outline' })} href="/app/conversations">
            Open Conversations
          </Link>
          <Link className={buttonVariants({ variant: 'outline' })} href="/app/call-flow">
            Run test flow
          </Link>
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Lead status updated.</div> : null}
      {automationBlockReason !== 'none' && blockedCount > 0 ? (
        <UpgradeBanner
          blockedCount={blockedCount}
          title="Automated follow-up needs billing attention."
          description={automationBlockMessage}
          ctaLabel={automationBlockReason === 'usage_limit_reached' ? 'Upgrade Plan' : 'Open Billing'}
        />
      ) : null}

      {!hasLeads ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>No recovered leads yet</CardTitle>
            <CardDescription>Run your first missed-call test. New leads will appear here as soon as CallbackCloser captures them.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link className={buttonVariants()} href="/app/call-flow">
              Run your first test call
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/settings">
              Finish setup
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card/90">
          <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Lead inbox</CardTitle>
              <CardDescription>
                {filteredLeads.length} visible lead{filteredLeads.length === 1 ? '' : 's'}.
                {' '}Click a lead to open the full action screen.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={buildLeadsHref(null)} className={cn('rounded-md border px-3 py-1.5 text-sm', !statusFilter && 'bg-muted')}>
                All
              </Link>
              {leadStatusOrder.map((status) => (
                <Link
                  key={status}
                  href={buildLeadsHref(status)}
                  className={cn('rounded-md border px-3 py-1.5 text-sm', statusFilter === status && 'bg-muted')}
                >
                  {leadStatusLabels[status]}
                </Link>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {filteredLeads.length === 0 ? (
              <div className="rounded-xl border bg-muted/20 p-6 text-sm text-muted-foreground">
                No leads match this filter right now.
              </div>
            ) : (
              filteredLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={buildLeadDetailHref(lead.id, statusFilter)}
                  className="block rounded-2xl border bg-background/70 p-4 transition-colors hover:bg-muted/20"
                >
                  <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] lg:items-center">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{getLeadPrimaryLabel(lead)}</p>
                      <p className="text-sm text-muted-foreground">{getLeadSecondaryLabel(lead)}</p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{lead.serviceType || lead.serviceRequested || 'Service not captured yet'}</p>
                      <p className="text-sm text-muted-foreground">
                        {lead.location || lead.zipCode ? `Location: ${lead.location || lead.zipCode}` : 'Location pending'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{lead.urgency || 'Urgency pending'}</p>
                      <p className="text-sm text-muted-foreground">
                        Created {formatRelativeTime(lead.createdAt)} · {formatDateTime(lead.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
                      <Badge variant={lead.readiness === 'URGENT' ? 'destructive' : lead.readiness === 'QUALIFIED' ? 'secondary' : 'outline'}>
                        {leadReadinessLabels[lead.readiness]}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
