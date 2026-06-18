import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { listConversationsForBusiness } from '@/lib/business-access';
import {
  formatDateTime,
  getLeadCallbackState,
  getLeadLastActivityAt,
  getLeadStatusBadgeVariant,
  leadReadinessLabels,
  leadStatusLabels,
} from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoLeads, isPortfolioDemoMode } from '@/lib/portfolio-demo';

export default async function ConversationsPage() {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const leads = demoMode
    ? getPortfolioDemoLeads(null).filter((lead) => lead.lastInboundAt || lead.lastOutboundAt)
    : await listConversationsForBusiness(business.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Badge variant="outline">Conversations</Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lead conversations</h1>
            <p className="text-sm text-muted-foreground">See the latest caller replies. Open a lead to call back or mark the outcome.</p>
          </div>
        </div>
        <Link className={buttonVariants({ variant: 'outline' })} href="/app/leads">
          Open leads
        </Link>
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Latest conversations</CardTitle>
          <CardDescription>{leads.length} conversation{leads.length === 1 ? '' : 's'} where a missed caller texted back</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {leads.length === 0 ? (
            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No conversations yet</p>
              <p className="mt-2">Once missed callers reply by text, their conversations will appear here.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link className={buttonVariants({ size: 'sm' })} href="/app/leads">
                  Open leads
                </Link>
                <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/app/call-flow">
                  How missed calls work
                </Link>
              </div>
            </div>
          ) : (
            leads.map((lead) => {
              const latestMessage = lead.messages[0];
              return (
                <Link
                  key={lead.id}
                  href={`/app/leads/${lead.id}?from=%2Fapp%2Fconversations`}
                  className="block rounded-xl border bg-background/80 p-4 transition-colors hover:bg-muted/20"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">{lead.callerName || lead.contactName || formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone)}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.callerName || lead.contactName ? formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone) : 'Name pending'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1 sm:justify-end">
                      <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
                      <Badge variant={lead.readiness === 'URGENT' ? 'destructive' : lead.readiness === 'QUALIFIED' ? 'secondary' : 'outline'}>
                        {leadReadinessLabels[lead.readiness]}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {latestMessage?.body || lead.summary || 'No message preview available.'}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{lead.serviceType || lead.serviceRequested || getLeadCallbackState(lead)}</span>
                    <span>Last activity {formatDateTime(getLeadLastActivityAt(lead))}</span>
                  </div>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
