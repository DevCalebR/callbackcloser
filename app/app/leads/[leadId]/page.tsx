import Link from 'next/link';
import { LeadStatus, MessageDirection, OwnerNotificationChannel } from '@prisma/client';
import { notFound } from 'next/navigation';

import { updateLeadStatusAction } from '@/app/app/leads/actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { getLeadDetailForBusiness } from '@/lib/business-access';
import { isLeadClosedWonStatus, isLeadLostStatus } from '@/lib/lead-outcomes';
import {
  formatDateTime,
  formatRelativeTime,
  getLeadNextStepLabel,
  getLeadStatusBadgeVariant,
  isLeadOpenStatus,
  isMessageDeliveryIssueStatus,
  leadReadinessLabels,
  leadStatusLabels,
  smsStateLabels,
} from '@/lib/lead-presenters';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoLeadDetail, isPortfolioDemoMode } from '@/lib/portfolio-demo';

function resolveSafeReturnPath(value: string | null | undefined) {
  if (!value) return '/app/leads';
  const nextPath = value.trim();
  if (!nextPath.startsWith('/app/') || nextPath.startsWith('//')) {
    return '/app/leads';
  }
  return nextPath;
}

function getLeadActionSummary(status: LeadStatus) {
  if (isLeadClosedWonStatus(status)) {
    return 'This lead is marked booked. Keep the details here for reference.';
  }

  if (isLeadLostStatus(status)) {
    return 'This lead is marked lost. You can still review the call and message history here.';
  }

  if (status === LeadStatus.CONTACTED) {
    return 'You have already made contact. Update the final outcome when the customer decides.';
  }

  return 'Call this lead back, then mark it contacted, booked, or lost.';
}

function LeadStatusActionForm({
  leadId,
  status,
  redirectTo,
  successRedirectTo,
  label,
  variant,
}: {
  leadId: string;
  status: 'CONTACTED' | 'BOOKED' | 'LOST';
  redirectTo: string;
  successRedirectTo: string;
  label: string;
  variant?: 'default' | 'outline' | 'destructive';
}) {
  return (
    <form action={updateLeadStatusAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <input type="hidden" name="successRedirectTo" value={successRedirectTo} />
      <Button className="w-full" type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: { leadId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const lead = demoMode ? getPortfolioDemoLeadDetail(params.leadId) : await getLeadDetailForBusiness(business.id, params.leadId);

  if (!lead) notFound();

  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const saved = searchParams?.saved === '1';
  const returnPath = resolveSafeReturnPath(typeof searchParams?.from === 'string' ? searchParams.from : null);
  const messageIssues = lead.messages.filter((message) => isMessageDeliveryIssueStatus(message.status));
  const ownerNotifications = 'ownerNotifications' in lead ? lead.ownerNotifications : [];
  const latestSmsNotification =
    ownerNotifications.find((notification) => notification.channel === OwnerNotificationChannel.SMS) ?? null;
  const latestEmailNotification =
    ownerNotifications.find((notification) => notification.channel === OwnerNotificationChannel.EMAIL) ?? null;
  const latestInAppNotification =
    ownerNotifications.find((notification) => notification.channel === OwnerNotificationChannel.IN_APP) ?? null;
  const customerName = lead.callerName || lead.contactName || 'Name not captured yet';
  const customerPhone = formatPhoneForDisplay(lead.callerPhoneNormalized || lead.callerPhone);
  const primaryLabel = lead.callerName || lead.contactName || customerPhone;
  const secondaryLabel = lead.callerName || lead.contactName ? customerPhone : 'Caller name not captured yet';
  const serviceLabel = lead.serviceType || lead.serviceRequested || 'Still being captured';
  const locationLabel = lead.location || lead.zipCode || 'Still being captured';
  const callbackLabel = lead.bestTime || (lead.callbackRequested === false ? 'Text only' : 'No preferred time yet');
  const detailRedirectTo =
    returnPath === '/app/leads' ? `/app/leads/${lead.id}` : `/app/leads/${lead.id}?from=${encodeURIComponent(returnPath)}`;
  const successRedirectTo = '/app/leads';
  const recordingHref = lead.call?.recordingUrl ? `/api/leads/${lead.id}/recording` : null;
  const nextStepLabel = getLeadNextStepLabel(lead.status);
  const isOpenLead = isLeadOpenStatus(lead.status);
  const createdLabel = formatDateTime(lead.createdAt);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link className="text-sm text-muted-foreground underline underline-offset-4" href={returnPath}>
          Back
        </Link>
        <Badge variant="outline">Lead details</Badge>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Lead updated.</div> : null}
      {messageIssues.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          This lead had an SMS delivery issue. Manual follow-up is recommended.
        </div>
      ) : null}

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="gap-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{nextStepLabel}</p>
                <CardTitle className="text-3xl">{primaryLabel}</CardTitle>
                <CardDescription>{secondaryLabel}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
                <Badge variant={lead.readiness === 'URGENT' ? 'destructive' : lead.readiness === 'QUALIFIED' ? 'secondary' : 'outline'}>
                  {leadReadinessLabels[lead.readiness]}
                </Badge>
                <Badge variant="outline">{smsStateLabels[lead.smsState]}</Badge>
                {lead.notifiedAt || lead.ownerNotifiedAt ? <Badge variant="secondary">Owner alerted</Badge> : null}
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">{getLeadActionSummary(lead.status)}</p>
              {isOpenLead ? (
                <div className="rounded-2xl border bg-background/90 px-4 py-3 text-sm text-muted-foreground">
                  Did this lead turn into a real job? Mark the outcome here after the call so CallbackCloser can show the value clearly.
                </div>
              ) : null}
            </div>

            <div className="grid w-full gap-3 xl:max-w-2xl xl:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]">
              <Link className={buttonVariants({ className: 'w-full' })} href={`tel:${lead.callerPhoneNormalized || lead.callerPhone}`}>
                Call now
              </Link>
              <LeadStatusActionForm
                leadId={lead.id}
                status="CONTACTED"
                redirectTo={detailRedirectTo}
                successRedirectTo={successRedirectTo}
                label="Mark contacted"
                variant="outline"
              />
              <LeadStatusActionForm
                leadId={lead.id}
                status="BOOKED"
                redirectTo={detailRedirectTo}
                successRedirectTo={successRedirectTo}
                label="Mark booked"
              />
              <LeadStatusActionForm
                leadId={lead.id}
                status="LOST"
                redirectTo={detailRedirectTo}
                successRedirectTo={successRedirectTo}
                label="Mark lost"
                variant="destructive"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border bg-background/90 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
            <p className="mt-2 font-medium">{customerName}</p>
            <p className="mt-2 text-muted-foreground">{customerPhone}</p>
            <p className="mt-2 text-muted-foreground">Created {formatRelativeTime(lead.createdAt)}.</p>
            <p className="mt-2 text-muted-foreground">{createdLabel}</p>
          </div>
          <div className="rounded-2xl border bg-background/90 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
            <p className="mt-2 font-medium">{serviceLabel}</p>
            <p className="mt-2 text-muted-foreground">Urgency: {lead.urgency || 'Pending reply'}</p>
          </div>
          <div className="rounded-2xl border bg-background/90 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Callback timing</p>
            <p className="mt-2 font-medium">{callbackLabel}</p>
            <p className="mt-2 text-muted-foreground">
              Callback requested: {typeof lead.callbackRequested === 'boolean' ? (lead.callbackRequested ? 'Yes' : 'No') : 'Not answered'}
            </p>
          </div>
          <div className="rounded-2xl border bg-background/90 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
            <p className="mt-2 font-medium">{locationLabel}</p>
            <p className="mt-2 text-muted-foreground">{isOpenLead ? 'Still needs an outcome update.' : 'Outcome already captured.'}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.85fr]">
        <Card className="bg-card/95">
          <CardHeader>
            <CardTitle>Conversation history</CardTitle>
            <CardDescription>Review the full SMS thread before you call back.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lead.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No SMS messages have been saved for this lead yet.</p>
            ) : (
              lead.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-2xl border p-3 text-sm ${message.direction === MessageDirection.OUTBOUND ? 'bg-primary/5' : 'bg-card'}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{message.direction === MessageDirection.OUTBOUND ? 'CallbackCloser' : 'Caller replied'}</span>
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Qualification info</CardTitle>
              <CardDescription>The notes CallbackCloser collected before you call back.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Customer name</span>
                <span>{customerName}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Phone number</span>
                <span>{customerPhone}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Summary</span>
                <span>{lead.summary || 'Summary will update as the intake progresses.'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Service needed</span>
                <span>{serviceLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Urgency</span>
                <span>{lead.urgency || 'Pending reply'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Location / address</span>
                <span>{locationLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Preferred callback time</span>
                <span>{callbackLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Qualified at</span>
                <span>{formatDateTime(lead.qualifiedAt)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Current status</span>
                <span>{leadStatusLabels[lead.status]}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Missed call details</CardTitle>
              <CardDescription>The call record that started this lead.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {lead.call ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Call status</span>
                    <span>{lead.call.dialCallStatus || lead.call.status || '-'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Missed</span>
                    <span>{lead.call.missed ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Recorded at</span>
                    <span>{formatDateTime(lead.call.createdAt)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">Recording</span>
                    <span>{lead.call.recordingStatus || 'Unavailable'}</span>
                  </div>
                  {recordingHref ? (
                    <Link className={buttonVariants({ variant: 'outline', className: 'w-full' })} href={recordingHref} target="_blank">
                      Open recording
                    </Link>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">No call record linked to this lead.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Owner alerts</CardTitle>
              <CardDescription>When CallbackCloser told you this lead was ready.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">SMS alert</span>
                <span>{latestSmsNotification ? formatDateTime(latestSmsNotification.sentAt || latestSmsNotification.createdAt) : 'Not sent yet'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Email alert</span>
                <span>{latestEmailNotification ? formatDateTime(latestEmailNotification.sentAt || latestEmailNotification.createdAt) : 'Not sent yet'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">In-app alert</span>
                <span>{latestInAppNotification ? 'Visible in app' : 'Not sent yet'}</span>
              </div>
              {latestSmsNotification ? <div className="rounded-lg bg-muted/30 p-3 text-muted-foreground">{latestSmsNotification.body}</div> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
