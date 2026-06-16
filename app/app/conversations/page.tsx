import Link from 'next/link';
import { MessageDirection } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { getConversationDetailForBusiness, listConversationsForBusiness } from '@/lib/business-access';
import {
  formatDateTime,
  getLeadCallbackState,
  getLeadLastActivityAt,
  getLeadStatusBadgeVariant,
  leadReadinessLabels,
  leadStatusLabels,
} from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoLeadDetail, getPortfolioDemoLeads, isPortfolioDemoMode } from '@/lib/portfolio-demo';

export default async function ConversationsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const leads = demoMode
    ? getPortfolioDemoLeads(null).filter((lead) => lead.lastInboundAt || lead.lastOutboundAt)
    : await listConversationsForBusiness(business.id);

  const selectedLeadId = typeof searchParams?.leadId === 'string' ? searchParams.leadId : leads[0]?.id;
  const selectedLead = selectedLeadId
    ? demoMode
      ? getPortfolioDemoLeadDetail(selectedLeadId)
      : await getConversationDetailForBusiness(business.id, selectedLeadId)
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
          Open leads
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
              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No conversations yet</p>
                <p className="mt-2">Once your system is live, missed callers who text back will appear here automatically.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className={buttonVariants({ size: 'sm' })} href="/app/call-flow">
                    Run your first test call
                  </Link>
                  <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/app/settings">
                    Check setup
                  </Link>
                </div>
              </div>
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
                        <p className="text-xs text-muted-foreground">{lead.callerName || lead.contactName || 'Name pending'}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
                        <Badge variant={lead.readiness === 'URGENT' ? 'destructive' : lead.readiness === 'QUALIFIED' ? 'secondary' : 'outline'}>
                          {leadReadinessLabels[lead.readiness]}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {lead.summary || latestMessage?.body || 'No message preview available.'}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{lead.serviceType || lead.serviceRequested || getLeadCallbackState(lead)}</span>
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
                {leads.length === 0
                  ? 'Once your system is live, conversations will appear here with the full SMS thread and callback context.'
                  : 'Pick a conversation on the left to review the full thread.'}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getLeadStatusBadgeVariant(selectedLead.status)}>{leadStatusLabels[selectedLead.status]}</Badge>
                  <Badge variant="outline">{getLeadCallbackState(selectedLead)}</Badge>
                  <Badge variant={selectedLead.readiness === 'URGENT' ? 'destructive' : selectedLead.readiness === 'QUALIFIED' ? 'secondary' : 'outline'}>
                    {leadReadinessLabels[selectedLead.readiness]}
                  </Badge>
                  <Link className="text-sm underline underline-offset-4" href={`/app/leads/${selectedLead.id}?from=%2Fapp%2Fconversations`}>
                    Open lead details
                  </Link>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                  <p className="font-medium">Lead summary</p>
                  <p className="mt-2 text-muted-foreground">{selectedLead.summary || 'CallbackCloser is still gathering the summary for this lead.'}</p>
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
