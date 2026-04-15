import Link from 'next/link';
import { MessageDirection, OwnerNotificationChannel } from '@prisma/client';
import { notFound } from 'next/navigation';

import { updateLeadStatusAction } from '@/app/app/leads/actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { getLeadDetailForBusiness } from '@/lib/business-access';
import {
  formatDateTime,
  getLeadCallbackState,
  getLeadLastActivityAt,
  getLeadStatusBadgeVariant,
  isMessageDeliveryIssueStatus,
  leadReadinessLabels,
  leadStatusLabels,
} from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoLeadDetail, isPortfolioDemoMode } from '@/lib/portfolio-demo';

export default async function LeadDetailPage({ params, searchParams }: { params: { leadId: string }; searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const lead = demoMode
    ? getPortfolioDemoLeadDetail(params.leadId)
    : await getLeadDetailForBusiness(business.id, params.leadId);

  if (!lead) notFound();

  const saved = searchParams?.saved === '1';
  const messageIssues = lead.messages.filter((message) => isMessageDeliveryIssueStatus(message.status));
  const callbackState = getLeadCallbackState(lead);
  const returnPath = `/app/leads?leadId=${lead.id}`;
  const ownerNotifications = 'ownerNotifications' in lead ? lead.ownerNotifications : [];
  const latestSmsNotification =
    ownerNotifications.find((notification) => notification.channel === OwnerNotificationChannel.SMS) ?? null;
  const latestEmailNotification =
    ownerNotifications.find((notification) => notification.channel === OwnerNotificationChannel.EMAIL) ?? null;
  const latestInAppNotification =
    ownerNotifications.find((notification) => notification.channel === OwnerNotificationChannel.IN_APP) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Link className="text-sm text-muted-foreground underline underline-offset-4" href={returnPath}>
            Back to recovered leads
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone)}</h1>
            <p className="text-sm text-muted-foreground">Everything captured before the callback so the next call can focus on booking the work.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={lead.billingRequired ? 'destructive' : 'secondary'}>
            {lead.billingRequired ? 'Billing paused' : 'Billing OK'}
          </Badge>
          <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
        </div>
      </div>

      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Lead status updated.</div> : null}
      {messageIssues.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          This lead had an SMS delivery issue. Review the thread and follow up manually if needed.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lead summary</CardTitle>
              <CardDescription>What CallbackCloser captured before the callback.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Service</span><span>{lead.serviceType || lead.serviceRequested || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Urgency</span><span>{lead.urgency || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Location</span><span>{lead.location || lead.zipCode || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Best time</span><span>{lead.bestTime || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Name</span><span>{lead.callerName || lead.contactName || '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Callback requested</span><span>{typeof lead.callbackRequested === 'boolean' ? (lead.callbackRequested ? 'Yes' : 'No') : '-'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Readiness</span><span>{leadReadinessLabels[lead.readiness]}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Callback state</span><span>{callbackState}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Last activity</span><span>{formatDateTime(getLeadLastActivityAt(lead))}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Qualified at</span><span>{formatDateTime(lead.qualifiedAt)}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Owner alerted</span><span>{formatDateTime(lead.notifiedAt || lead.ownerNotifiedAt)}</span></div>
              <div className="rounded-lg bg-muted/30 p-3 text-muted-foreground">{lead.summary || 'Lead summary will appear as the intake flow captures more detail.'}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
              <CardDescription>Keep follow-up moving without leaving the page.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <form action={updateLeadStatusAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="status" value="CONTACTED" />
                <input type="hidden" name="redirectTo" value={`/app/leads/${lead.id}`} />
                <Button className="w-full" type="submit" variant="outline">
                  Mark Contacted
                </Button>
              </form>
              <form action={updateLeadStatusAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="status" value="BOOKED" />
                <input type="hidden" name="redirectTo" value={`/app/leads/${lead.id}`} />
                <Button className="w-full" type="submit">
                  Mark Booked
                </Button>
              </form>
              <form action={updateLeadStatusAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="status" value="LOST" />
                <input type="hidden" name="redirectTo" value={`/app/leads/${lead.id}`} />
                <Button className="w-full" type="submit" variant="destructive">
                  Mark Lost
                </Button>
              </form>
              <Link className={buttonVariants({ variant: 'secondary', className: 'w-full' })} href={`tel:${lead.callerPhoneNormalized || lead.callerPhone}`}>
                Call Now
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Owner delivery</CardTitle>
              <CardDescription>What was sent once the lead became ready to call back.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">SMS alert</span><span>{latestSmsNotification ? formatDateTime(latestSmsNotification.sentAt || latestSmsNotification.createdAt) : 'Not sent yet'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Email alert</span><span>{latestEmailNotification ? formatDateTime(latestEmailNotification.sentAt || latestEmailNotification.createdAt) : 'Not sent yet'}</span></div>
              <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Dashboard alert</span><span>{latestInAppNotification ? 'Visible in app' : 'Pending'}</span></div>
              {latestSmsNotification ? <div className="rounded-lg bg-muted/30 p-3 text-muted-foreground">{latestSmsNotification.body}</div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Call record</CardTitle>
              <CardDescription>The missed-call event that started this recovery flow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.call ? (
                <>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Call SID</span><span className="break-all">{lead.call.twilioCallSid}</span></div>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Dial status</span><span>{lead.call.dialCallStatus || '-'}</span></div>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Missed</span><span>{lead.call.missed ? 'Yes' : 'No'}</span></div>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Answered</span><span>{lead.call.answered ? 'Yes' : 'No'}</span></div>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Call duration</span><span>{lead.call.callDurationSeconds ?? 0}s</span></div>
                  <div className="grid grid-cols-2 gap-2"><span className="text-muted-foreground">Recording status</span><span>{lead.call.recordingStatus || 'not_available'}</span></div>
                </>
              ) : (
                <p className="text-muted-foreground">No call record linked.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>SMS thread</CardTitle>
            <CardDescription>Full inbound and outbound conversation for this lead.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lead.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              lead.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl border p-3 text-sm ${message.direction === MessageDirection.OUTBOUND ? 'bg-primary/5' : 'bg-card'}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{message.direction === MessageDirection.OUTBOUND ? 'CallbackCloser' : 'Lead'}</span>
                    <div className="flex items-center gap-2">
                      {message.status && message.status.toLowerCase() !== 'delivered' ? (
                        <Badge variant={isMessageDeliveryIssueStatus(message.status) ? 'destructive' : 'outline'}>
                          {message.status.replace(/_/g, ' ')}
                        </Badge>
                      ) : null}
                      <span>{formatDateTime(message.createdAt)}</span>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap">{message.body}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
