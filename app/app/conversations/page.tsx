import Link from 'next/link';
import { MessageDirection } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDateTime, getLeadCallbackState, getLeadLastActivityAt, getLeadStatusBadgeVariant, leadStatusLabels } from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoLeadDetail, getPortfolioDemoLeads } from '@/lib/portfolio-demo';
import { getDemoWorkspaceMode } from '@/lib/review-mode';

export default async function ConversationsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const demoMode = Boolean(await getDemoWorkspaceMode());
  const leads = demoMode
    ? getPortfolioDemoLeads(null).filter((lead) => lead.lastInboundAt || lead.lastOutboundAt)
    : await db.lead.findMany({
        where: {
          businessId: business.id,
          OR: [{ lastInboundAt: { not: null } }, { lastOutboundAt: { not: null } }],
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ lastInteractionAt: 'desc' }, { createdAt: 'desc' }],
      });

  const selectedLeadId = typeof searchParams?.leadId === 'string' ? searchParams.leadId : leads[0]?.id;
  const selectedLead = selectedLeadId
    ? demoMode
      ? getPortfolioDemoLeadDetail(selectedLeadId)
      : await db.lead.findFirst({
          where: { businessId: business.id, id: selectedLeadId },
          include: {
            call: true,
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Badge variant="outline">Conversations</Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lead conversations</h1>
            <p className="text-sm text-muted-foreground">Review the latest replies first, then jump back to the lead that is most likely to close.</p>
          </div>
        </div>
        <Link className={buttonVariants({ variant: 'outline' })} href="/app/leads">
          Open Recovered Leads
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Open conversations</CardTitle>
            <CardDescription>{leads.length} conversation{leads.length === 1 ? '' : 's'} where a missed caller texted back</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {leads.length === 0 ? (
              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">No active conversations yet.</div>
            ) : (
              leads.map((lead) => {
                const latestMessage = lead.messages[0];
                const selected = lead.id === selectedLead?.id;
                return (
                  <Link
                    key={lead.id}
                    href={`/app/conversations?leadId=${lead.id}`}
                    className={`block rounded-xl border p-4 transition-colors hover:bg-muted/20 ${selected ? 'bg-primary/5' : 'bg-background/80'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone)}</p>
                        <p className="text-xs text-muted-foreground">{lead.contactName || 'Name pending'}</p>
                      </div>
                      <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{latestMessage?.body || 'No message preview available.'}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{getLeadCallbackState(lead)}</span>
                      <span>{formatDateTime(getLeadLastActivityAt(lead))}</span>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Conversation detail</CardTitle>
            <CardDescription>
              {selectedLead ? formatPhoneForDisplay(selectedLead.callerPhoneNormalized || selectedLead.callerPhone) : 'Select a conversation'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedLead ? (
              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                Pick a conversation on the left to review the full thread.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getLeadStatusBadgeVariant(selectedLead.status)}>{leadStatusLabels[selectedLead.status]}</Badge>
                  <Badge variant="outline">{getLeadCallbackState(selectedLead)}</Badge>
                  <Link className="text-sm underline underline-offset-4" href={`/app/leads?leadId=${selectedLead.id}`}>
                    Open in leads view
                  </Link>
                </div>
                <div className="space-y-3">
                  {selectedLead.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-xl border p-3 text-sm ${message.direction === MessageDirection.OUTBOUND ? 'bg-primary/5' : 'bg-card'}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>{message.direction === MessageDirection.OUTBOUND ? 'CallbackCloser' : 'Lead'}</span>
                        <span>{formatDateTime(message.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{message.body}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
