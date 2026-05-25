import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageDirection, OwnerNotificationChannel } from '@prisma/client';

import { replyToSimulatorRunAction, startSimulatorRunAction } from '@/app/simulator/actions';
import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateTime, getLeadStatusBadgeVariant, leadReadinessLabels, leadStatusLabels } from '@/lib/lead-presenters';
import { PUBLIC_CREATE_ACCOUNT_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';
import { canSendRealSimulatorSms, getSimulatorBusiness, getSimulatorRun, isPlaceholderSimulatorNumber, isPublicSimulatorEnabled } from '@/lib/simulator';

export const metadata: Metadata = {
  title: 'Missed-Call Simulator | CallbackCloser',
  description: 'Run the public CallbackCloser missed-call simulator and see the full recovery loop from missed call to qualified owner alert.',
};

export const dynamic = 'force-dynamic';

function timelineStep(label: string, complete: boolean, detail: string) {
  return { label, complete, detail };
}

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const runPublicId = typeof searchParams?.run === 'string' ? searchParams.run : null;
  const error = typeof searchParams?.error === 'string' ? searchParams.error : null;
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;
  const status = typeof searchParams?.status === 'string' ? searchParams.status : null;
  const enabled = isPublicSimulatorEnabled();
  const business = await getSimulatorBusiness();
  const run = runPublicId ? await getSimulatorRun(runPublicId) : null;

  const lead = run?.lead ?? null;
  const latestOwnerSms = lead?.ownerNotifications.find((notification) => notification.channel === OwnerNotificationChannel.SMS) ?? null;
  const latestOwnerEmail = lead?.ownerNotifications.find((notification) => notification.channel === OwnerNotificationChannel.EMAIL) ?? null;
  const inAppNotification = lead?.ownerNotifications.find((notification) => notification.channel === OwnerNotificationChannel.IN_APP) ?? null;
  const transcript = lead?.messages ?? [];
  const demoNumber = business?.twilioPrimaryPhoneNumber || business?.twilioPhoneNumber || null;
  const realSmsEnabled = canSendRealSimulatorSms(business);
  const usingPlaceholderTextingLine = isPlaceholderSimulatorNumber(demoNumber);

  const timeline = lead
    ? [
        timelineStep('Missed call detected', Boolean(lead.call || lead.createdAt), 'CallbackCloser records the missed call and opens a lead.'),
        timelineStep(
          'Recovery text sent',
          transcript.some((message) => message.direction === MessageDirection.OUTBOUND),
          'The caller gets the first SMS immediately so the lead does not go cold.'
        ),
        timelineStep(
          'Caller replied',
          transcript.some((message) => message.direction === MessageDirection.INBOUND),
          'The intake thread captures service details directly from the caller.'
        ),
        timelineStep(
          'Lead qualified',
          Boolean(lead.qualifiedAt),
          'Service type plus urgency or callback intent is enough to mark the lead ready.'
        ),
        timelineStep(
          'Owner notified',
          Boolean(lead.notifiedAt || latestOwnerSms || latestOwnerEmail || inAppNotification),
          'Owner delivery fans out to SMS, email, and in-app preview without repeating alerts.'
        ),
        timelineStep(
          'Dashboard updated',
          Boolean(lead.status === 'NOTIFIED' || inAppNotification),
          'The qualified lead appears with structured details and a ready-to-call summary.'
        ),
      ]
    : [];

  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container space-y-10 py-12">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="space-y-5">
            <Badge variant="outline">Missed-call simulator</Badge>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">See the full CallbackCloser lead loop in minutes</h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Trigger a missed call, watch the recovery text go out, complete the intake, and see how the owner gets a qualified lead.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {demoNumber ? (
                <Link className={buttonVariants({ size: 'lg' })} href={`tel:${demoNumber}`}>
                  Call demo number
                </Link>
              ) : (
                <Button disabled size="lg">
                  Demo number unavailable
                </Button>
              )}
              <Link className={buttonVariants({ size: 'lg', variant: 'outline' })} href={PUBLIC_START_FREE_PILOT_PATH}>
                Start Free Pilot
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              Use your own phone number to start a private simulator run, or call the demo line if one is configured for this environment.
            </p>
            <div className={`rounded-2xl border p-4 text-sm ${realSmsEnabled ? 'border-accent/40 bg-accent/20' : 'border-primary/20 bg-primary/5'}`}>
              <p className="font-medium">{realSmsEnabled ? 'Real SMS mode is active' : 'Preview mode is active'}</p>
              <p className="mt-2 text-muted-foreground">
                {realSmsEnabled
                  ? 'CallbackCloser will text the phone number you enter from the demo business texting line, then continue the rest of the flow in this page.'
                  : usingPlaceholderTextingLine
                    ? 'This demo workspace is still using the safe placeholder texting line, so CallbackCloser will show the recovery text and owner alerts on this page instead of sending a real SMS.'
                    : 'Real SMS mode is not enabled for this environment yet, so CallbackCloser will show the recovery text and owner alerts on this page instead of sending a real SMS.'}
              </p>
            </div>
          </div>

          <Card className="border-primary/20 bg-card/95">
            <CardHeader>
              <CardTitle>Start the simulator</CardTitle>
              <CardDescription>Enter a phone number and CallbackCloser will open a dedicated demo lead for this run.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!enabled || !business ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  The public simulator is not configured on this environment yet.
                </div>
              ) : (
                <form action={startSimulatorRunAction} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="simulator-phone">Your phone number</Label>
                    <Input id="simulator-phone" name="phone" placeholder="+1 555 123 4567" type="tel" required />
                  </div>
                  <Button type="submit">Trigger missed-call simulator</Button>
                </form>
              )}
              {notice ? (
                <div className={`rounded-lg border p-4 text-sm ${status === 'sms-sent' ? 'border-accent/40 bg-accent/20' : 'border-primary/20 bg-primary/5'}`}>
                  {notice}
                </div>
              ) : null}
              {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
            </CardContent>
          </Card>
        </section>

        {run && lead ? (
          <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>Live simulator timeline</CardTitle>
                <CardDescription>Each step below mirrors the actual missed-call recovery flow.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {timeline.map((step, index) => (
                  <div key={step.label} className="flex gap-4 rounded-2xl border bg-background/70 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-medium">{index + 1}</div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{step.label}</p>
                        <Badge variant={step.complete ? 'success' : 'outline'}>{step.complete ? 'Complete' : 'Pending'}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>Simulated owner alerts</CardTitle>
                <CardDescription>SMS, email, and dashboard previews all update off the same qualified lead.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border bg-background/80 p-4 text-sm">
                  <p className="font-medium">SMS preview</p>
                  <p className="mt-2 text-muted-foreground">{latestOwnerSms?.body || 'Owner SMS alert will appear after the lead qualifies.'}</p>
                </div>
                <div className="rounded-2xl border bg-background/80 p-4 text-sm">
                  <p className="font-medium">Email preview</p>
                  <p className="mt-2 text-muted-foreground">{latestOwnerEmail?.subject || 'Owner email subject will appear once qualification is complete.'}</p>
                  <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{latestOwnerEmail?.body || 'Email body preview will populate after qualification.'}</p>
                </div>
                <div className="rounded-2xl border bg-background/80 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">Dashboard lead card preview</p>
                    <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
                    <Badge variant={lead.readiness === 'URGENT' ? 'destructive' : lead.readiness === 'QUALIFIED' ? 'secondary' : 'outline'}>
                      {leadReadinessLabels[lead.readiness]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-muted-foreground">{lead.summary || 'Lead summary will appear as soon as enough detail is collected.'}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Qualified at: {formatDateTime(lead.qualifiedAt)} · Owner notified: {formatDateTime(lead.notifiedAt)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Continue the caller intake</CardTitle>
                <CardDescription>Reply as the caller to move the simulator through qualification and owner delivery.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3">
                  {transcript.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No simulator messages yet.</p>
                  ) : (
                    transcript.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-2xl border p-4 text-sm ${
                          message.direction === MessageDirection.OUTBOUND ? 'bg-primary/5' : 'bg-background'
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span>{message.direction === MessageDirection.OUTBOUND ? 'CallbackCloser' : 'Caller reply'}</span>
                          <span>{formatDateTime(message.createdAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{message.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border bg-muted/20 p-4 text-sm">
                    <p className="font-medium">Suggested reply prompts</p>
                    <div className="mt-3 space-y-2 text-muted-foreground">
                      <p>- Water heater repair</p>
                      <p>- Today</p>
                      <p>- 78704</p>
                      <p>- Afternoon</p>
                      <p>- Pat Morgan</p>
                    </div>
                  </div>

                  {lead.smsState !== 'COMPLETED' ? (
                    <form action={replyToSimulatorRunAction} className="space-y-4 rounded-2xl border bg-background/80 p-4">
                      <input type="hidden" name="publicId" value={run.publicId} />
                      <div className="space-y-2">
                        <Label htmlFor="simulator-reply">Reply as the caller</Label>
                        <Input id="simulator-reply" name="body" placeholder="Type the next intake answer" required />
                      </div>
                      <Button type="submit">Send simulator reply</Button>
                    </form>
                  ) : (
                    <div className="rounded-2xl border border-accent/40 bg-accent/20 p-4 text-sm">
                      Intake complete. The lead is qualified, the owner previews are populated, and the dashboard card is ready.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Link className={buttonVariants()} href={PUBLIC_CREATE_ACCOUNT_PATH}>
                      Create account
                    </Link>
                    <Link className={buttonVariants({ variant: 'outline' })} href={PUBLIC_START_FREE_PILOT_PATH}>
                      Start Free Pilot
                    </Link>
                    <Link className={buttonVariants({ variant: 'ghost' })} href="/pricing">
                      View pricing
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </main>

      <PublicSiteFooter />
    </div>
  );
}
