import Link from 'next/link';
import { LeadStatus, MessageDirection } from '@prisma/client';

import { updateLeadStatusAction } from '@/app/app/leads/actions';
import { UpgradeBanner } from '@/components/upgrade-banner';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  formatDateTime,
  getLeadCallbackState,
  getLeadLastActivityAt,
  getLeadStatusBadgeVariant,
  isMessageDeliveryIssueStatus,
  leadStatusLabels,
  leadStatusOrder,
  smsStateLabels,
} from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoBlockedCount, getPortfolioDemoLeadDetail, getPortfolioDemoLeads, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getConversationUsageForBusiness, resolveUsageTierFromSubscription } from '@/lib/usage';
import {
  describeAutomationBlockReason,
  formatUsageSummary,
  formatUsageTierLabel,
  resolveAutomationBlockReason,
} from '@/lib/usage-visibility';
import { cn } from '@/lib/utils';

type SearchParams = Record<string, string | string[] | undefined>;

function buildLeadsHref(status: LeadStatus | null, leadId?: string | null) {
  const params = new URLSearchParams();
  if (status) params.set('status', status.toLowerCase());
  if (leadId) params.set('leadId', leadId);
  const query = params.toString();
  return query ? `/app/leads?${query}` : '/app/leads';
}

function buildBadgeVariant(value: number) {
  return value > 0 ? 'success' : 'outline';
}

export default async function LeadsPage({ searchParams }: { searchParams?: SearchParams }) {
  const business = await requireBusiness();
  const rawFilter = typeof searchParams?.status === 'string' ? searchParams.status.toUpperCase() : 'ALL';
  const statusFilter = Object.values(LeadStatus).includes(rawFilter as LeadStatus) ? (rawFilter as LeadStatus) : null;
  const selectedLeadId = typeof searchParams?.leadId === 'string' ? searchParams.leadId : undefined;
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const saved = searchParams?.saved === '1';
  const demoMode = isPortfolioDemoMode();
  const billingAccess = getBusinessBillingAccessState(business);

  const [filteredLeads, allLeads, blockedCount, usage] = demoMode
    ? [
        getPortfolioDemoLeads(statusFilter),
        getPortfolioDemoLeads(null),
        getPortfolioDemoBlockedCount(),
        null,
      ]
    : await Promise.all([
        db.lead.findMany({
          where: {
            businessId: business.id,
            ...(statusFilter ? { status: statusFilter } : {}),
          },
          include: {
            call: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: [{ lastInteractionAt: 'desc' }, { createdAt: 'desc' }],
        }),
        db.lead.findMany({
          where: { businessId: business.id },
          include: {
            call: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: [{ lastInteractionAt: 'desc' }, { createdAt: 'desc' }],
        }),
        db.lead.count({ where: { businessId: business.id, billingRequired: true } }),
        getConversationUsageForBusiness(business),
      ]);

  const selectedLead =
    filteredLeads.length === 0
      ? null
      : demoMode
        ? getPortfolioDemoLeadDetail(selectedLeadId ?? filteredLeads[0]?.id ?? '')
        : await db.lead.findFirst({
            where: {
              businessId: business.id,
              id: selectedLeadId ?? filteredLeads[0]?.id,
            },
            include: {
              call: true,
              messages: {
                orderBy: { createdAt: 'asc' },
              },
            },
          });

  const usageTierLabel = formatUsageTierLabel(resolveUsageTierFromSubscription(business));
  const usageSummary = usage ? formatUsageSummary(usage) : 'Unavailable in portfolio demo mode.';
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

  const [missedCallsCount, smsSentCount, repliedLeadsCount, qualifiedLeadsCount, ownerAlertsCount] = demoMode
    ? (() => {
        const demoLeadDetails = allLeads
          .map((lead) => getPortfolioDemoLeadDetail(lead.id))
          .filter((lead): lead is NonNullable<ReturnType<typeof getPortfolioDemoLeadDetail>> => Boolean(lead));
        const demoSmsSent = demoLeadDetails.reduce(
          (count, lead) => count + lead.messages.filter((message) => message.direction === MessageDirection.OUTBOUND).length,
          0
        );

        return [
          demoLeadDetails.length,
          demoSmsSent,
          demoLeadDetails.filter((lead) => lead.lastInboundAt).length,
          demoLeadDetails.filter(
            (lead) => lead.status === LeadStatus.QUALIFIED || lead.status === LeadStatus.CONTACTED || lead.status === LeadStatus.BOOKED
          ).length,
          demoLeadDetails.filter((lead) => lead.ownerNotifiedAt).length,
        ];
      })()
    : await Promise.all([
        db.call.count({ where: { businessId: business.id, missed: true } }),
        db.message.count({ where: { businessId: business.id, direction: MessageDirection.OUTBOUND } }),
        db.lead.count({ where: { businessId: business.id, lastInboundAt: { not: null } } }),
        db.lead.count({
          where: {
            businessId: business.id,
            status: {
              in: [LeadStatus.QUALIFIED, LeadStatus.CONTACTED, LeadStatus.BOOKED],
            },
          },
        }),
        db.lead.count({ where: { businessId: business.id, ownerNotifiedAt: { not: null } } }),
      ]);

  const stats = [
    { label: 'Missed calls', value: missedCallsCount, detail: 'Calls captured and marked missed' },
    { label: 'SMS sent', value: smsSentCount, detail: 'Outbound automated follow-up messages' },
    { label: 'Replied leads', value: repliedLeadsCount, detail: 'Leads that texted back' },
    { label: 'Qualified leads', value: qualifiedLeadsCount, detail: 'Leads with useful follow-up detail' },
    { label: 'Owner alerts sent', value: ownerAlertsCount, detail: 'Ready-to-call handoffs delivered' },
  ];

  const selectedLeadReturnPath = selectedLead ? buildLeadsHref(statusFilter, selectedLead.id) : buildLeadsHref(statusFilter);
  const selectedLeadCallbackState = selectedLead ? getLeadCallbackState(selectedLead) : null;
  const selectedLeadMessageIssues = selectedLead?.messages.filter((message) => isMessageDeliveryIssueStatus(message.status)) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Badge variant="outline">Recovered Leads</Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Recovered leads dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Prioritize callback-ready leads, review the conversation, and move the outcome forward fast.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={buttonVariants({ variant: 'outline' })} href="/app/conversations">
            Open Conversations
          </Link>
          <Link className={buttonVariants({ variant: 'outline' })} href="/app/call-flow">
            Review Call Flow
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className="bg-card/90">
            <CardHeader className="space-y-2 pb-4">
              <CardDescription>{stat.label}</CardDescription>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
                <Badge variant={buildBadgeVariant(stat.value)}>{stat.value > 0 ? 'Active' : 'Waiting'}</Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{stat.detail}</CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Recovered lead pipeline</CardTitle>
          <CardDescription>
            {filteredLeads.length} visible lead{filteredLeads.length === 1 ? '' : 's'} · {usageTierLabel} plan · {usageSummary}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href={buildLeadsHref(null, selectedLead?.id)} className={cn('rounded-md border px-3 py-1.5 text-sm', !statusFilter && 'bg-muted')}>
            All
          </Link>
          {leadStatusOrder.map((status) => (
            <Link
              key={status}
              href={buildLeadsHref(status, selectedLead?.id)}
              className={cn('rounded-md border px-3 py-1.5 text-sm', statusFilter === status && 'bg-muted')}
            >
              {leadStatusLabels[status]}
            </Link>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="overflow-hidden bg-card/90">
          <CardHeader>
            <CardTitle>Recovered leads</CardTitle>
            <CardDescription>Click a row to open the right-side detail panel and take action.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Caller</th>
                  <th className="px-3 py-3 font-medium">Service type</th>
                  <th className="px-3 py-3 font-medium">Urgency</th>
                  <th className="px-3 py-3 font-medium">ZIP</th>
                  <th className="px-3 py-3 font-medium">Last message time</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Assigned owner / callback state</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const isSelected = lead.id === selectedLead?.id;
                  const callbackState = getLeadCallbackState(lead);
                  const lastMessage = getLeadLastActivityAt(lead);
                  const lastMessageIssue = lead.messages.some((message) => isMessageDeliveryIssueStatus(message.status));

                  return (
                    <tr key={lead.id} className={cn('border-b last:border-0 hover:bg-muted/20', isSelected && 'bg-primary/5')}>
                      <td className="px-3 py-3 align-top">
                        <Link href={buildLeadsHref(statusFilter, lead.id)} className="font-medium hover:underline">
                          {formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone)}
                        </Link>
                        <div className="text-xs text-muted-foreground">{lead.contactName || 'Caller name pending'}</div>
                      </td>
                      <td className="px-3 py-3 align-top text-muted-foreground">{lead.serviceRequested || 'Waiting on service reply'}</td>
                      <td className="px-3 py-3 align-top text-muted-foreground">{lead.urgency || 'Waiting'}</td>
                      <td className="px-3 py-3 align-top text-muted-foreground">{lead.zipCode || 'Waiting'}</td>
                      <td className="px-3 py-3 align-top text-muted-foreground">{formatDateTime(lastMessage)}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
                          {lead.ownerNotifiedAt ? <Badge variant="secondary">Owner alerted</Badge> : null}
                          {lead.billingRequired ? <Badge variant="destructive">Billing paused</Badge> : null}
                          {lastMessageIssue ? <Badge variant="outline">Message attention</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium">Primary owner</div>
                        <div className="text-xs text-muted-foreground">{callbackState}</div>
                      </td>
                    </tr>
                  );
                })}
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                      No recovered leads yet. Once your Twilio number is live, missed callers and SMS follow-up will show up here.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {selectedLead ? (
            <>
              <Card className="sticky top-24 bg-card/95">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>{formatPhoneForDisplay(selectedLead.callerPhoneNormalized || selectedLead.callerPhone)}</CardTitle>
                      <CardDescription>Lead detail panel</CardDescription>
                    </div>
                    <Badge variant={getLeadStatusBadgeVariant(selectedLead.status)}>{leadStatusLabels[selectedLead.status]}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {selectedLeadMessageIssues.length > 0 ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                      Automated SMS had at least one delivery issue on this lead. Manual follow-up is recommended.
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border bg-muted/20 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Lead summary</p>
                      <div className="mt-2 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Service</span>
                          <span>{selectedLead.serviceRequested || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Urgency</span>
                          <span>{selectedLead.urgency || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">ZIP</span>
                          <span>{selectedLead.zipCode || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Best time</span>
                          <span>{selectedLead.bestTime || '-'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">SMS state</span>
                          <span>{smsStateLabels[selectedLead.smsState]}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-muted/20 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Call attempts</p>
                      <div className="mt-2 space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Callback state</span>
                          <span>{selectedLeadCallbackState}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Owner alerted</span>
                          <span>{selectedLead.ownerNotifiedAt ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Voice attempt status</span>
                          <span>{selectedLead.call?.dialCallStatus || 'No call attempt logged'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Missed call</span>
                          <span>{selectedLead.call?.missed ? 'Yes' : 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Last activity</span>
                          <span>{formatDateTime(getLeadLastActivityAt(selectedLead))}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium">Quick actions</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <form action={updateLeadStatusAction}>
                        <input type="hidden" name="leadId" value={selectedLead.id} />
                        <input type="hidden" name="status" value="CONTACTED" />
                        <input type="hidden" name="redirectTo" value={selectedLeadReturnPath} />
                        <Button className="w-full" type="submit" variant="outline">
                          Mark Contacted
                        </Button>
                      </form>
                      <form action={updateLeadStatusAction}>
                        <input type="hidden" name="leadId" value={selectedLead.id} />
                        <input type="hidden" name="status" value="BOOKED" />
                        <input type="hidden" name="redirectTo" value={selectedLeadReturnPath} />
                        <Button className="w-full" type="submit">
                          Mark Booked
                        </Button>
                      </form>
                      <form action={updateLeadStatusAction}>
                        <input type="hidden" name="leadId" value={selectedLead.id} />
                        <input type="hidden" name="status" value="LOST" />
                        <input type="hidden" name="redirectTo" value={selectedLeadReturnPath} />
                        <Button className="w-full" type="submit" variant="destructive">
                          Mark Lost
                        </Button>
                      </form>
                      <Link className={buttonVariants({ variant: 'secondary', className: 'w-full' })} href={`tel:${selectedLead.callerPhoneNormalized || selectedLead.callerPhone}`}>
                        Call Now
                      </Link>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">SMS thread</p>
                      <Link className="text-sm underline underline-offset-4" href={`/app/leads/${selectedLead.id}`}>
                        Open full page
                      </Link>
                    </div>
                    <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                      {selectedLead.messages.length === 0 ? (
                        <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">No SMS messages yet.</div>
                      ) : (
                        selectedLead.messages.map((message) => (
                          <div
                            key={message.id}
                            className={cn(
                              'rounded-xl border p-3 text-sm',
                              message.direction === MessageDirection.OUTBOUND ? 'bg-primary/5' : 'bg-card'
                            )}
                          >
                            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                              <span>
                                {message.direction === MessageDirection.OUTBOUND ? 'CallbackCloser' : 'Lead'} ·{' '}
                                {formatDateTime(message.createdAt)}
                              </span>
                              {message.status && message.status.toLowerCase() !== 'delivered' ? (
                                <Badge variant={isMessageDeliveryIssueStatus(message.status) ? 'destructive' : 'outline'}>
                                  {message.status.replace(/_/g, ' ')}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="whitespace-pre-wrap">{message.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>No lead selected</CardTitle>
                <CardDescription>Select a recovered lead from the table to open the detail panel.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
