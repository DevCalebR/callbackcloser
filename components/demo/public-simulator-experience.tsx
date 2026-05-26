'use client';

import Link from 'next/link';
import { startTransition, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  PUBLIC_SIMULATOR_BUSINESS_NAME,
  PUBLIC_SIMULATOR_DEMO_PHONE,
  advancePublicSimulatorSession,
  applyPublicSimulatorReply,
  buildPublicSimulatorLeadSummary,
  buildPublicSimulatorOwnerAlert,
  canReplyToPublicSimulator,
  getPublicSimulatorQuickReplies,
  publicSimulatorStages,
  startPublicSimulatorSession,
  type PublicSimulatorSession,
} from '@/lib/public-simulator';
import { PUBLIC_CREATE_ACCOUNT_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';
import { cn } from '@/lib/utils';

const timelineCopy: Record<(typeof publicSimulatorStages)[number], { detail: string; label: string }> = {
  started: {
    detail: 'A private demo run is created for this browser session only.',
    label: 'Run started',
  },
  missed_call_received: {
    detail: 'CallbackCloser detects the missed call and opens a safe preview lead.',
    label: 'Missed call received',
  },
  first_message_shown: {
    detail: 'The recovery text appears on-page instead of sending a real SMS.',
    label: 'First message shown',
  },
  service_captured: {
    detail: 'The visitor reply has been captured and categorized by service intent.',
    label: 'Service captured',
  },
  urgency_captured: {
    detail: 'The callback priority is now clear enough to qualify the lead.',
    label: 'Urgency captured',
  },
  owner_alert_ready: {
    detail: 'The business handoff summary and owner alert are ready to review.',
    label: 'Owner alert ready',
  },
  completed: {
    detail: 'The demo run is complete and ready for the sales CTA.',
    label: 'Completed',
  },
};

function getStageStatus(stage: (typeof publicSimulatorStages)[number], currentStage: (typeof publicSimulatorStages)[number]) {
  const stageIndex = publicSimulatorStages.indexOf(stage);
  const currentIndex = publicSimulatorStages.indexOf(currentStage);

  if (stageIndex < currentIndex) return 'complete';
  if (stageIndex === currentIndex) return 'current';
  return 'pending';
}

function getReplyPlaceholder(session: PublicSimulatorSession | null) {
  if (!session) return 'Type a caller reply';
  if (session.stage === 'first_message_shown') return 'Example: AC repair, my unit is not cooling';
  if (session.stage === 'service_captured') return 'Example: Today';
  return 'Type a caller reply';
}

export function PublicSimulatorExperience() {
  const [phoneInput, setPhoneInput] = useState(PUBLIC_SIMULATOR_DEMO_PHONE);
  const [replyInput, setReplyInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [session, setSession] = useState<PublicSimulatorSession | null>(null);

  useEffect(() => {
    if (!session) return;
    if (session.stage !== 'started' && session.stage !== 'missed_call_received' && session.stage !== 'urgency_captured' && session.stage !== 'owner_alert_ready') {
      return;
    }

    const timeout = window.setTimeout(() => {
      startTransition(() => {
        setSession((currentSession) => (currentSession ? advancePublicSimulatorSession(currentSession) : currentSession));
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [session]);

  const leadSummary = session ? buildPublicSimulatorLeadSummary(session) : null;
  const ownerAlert = session ? buildPublicSimulatorOwnerAlert(session) : null;
  const quickReplies = session ? getPublicSimulatorQuickReplies(session.stage) : [];
  const canReply = session ? canReplyToPublicSimulator(session.stage) : false;

  function handleStart() {
    const nextSession = startPublicSimulatorSession(phoneInput);
    if (!nextSession) {
      setErrorMessage('Enter a phone number or use the demo phone number to start the preview.');
      return;
    }

    setErrorMessage('');
    setReplyInput('');
    startTransition(() => {
      setSession(nextSession);
    });
  }

  function handleReply(nextReply: string) {
    if (!session || !canReply) return;

    const trimmedReply = nextReply.trim();
    if (!trimmedReply) {
      setErrorMessage('Enter a reply or use one of the quick replies to continue the demo.');
      return;
    }

    setErrorMessage('');
    setReplyInput('');
    startTransition(() => {
      setSession((currentSession) => (currentSession ? applyPublicSimulatorReply(currentSession, trimmedReply) : currentSession));
    });
  }

  function handleReset() {
    setErrorMessage('');
    setReplyInput('');
    setSession(null);
    setPhoneInput(PUBLIC_SIMULATOR_DEMO_PHONE);
  }

  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div className="space-y-5">
          <Badge variant="outline">Interactive preview mode</Badge>
          <div className="space-y-3">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">See how CallbackCloser would recover a missed call</h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Start a private demo run, watch the missed-call text flow appear instantly, and see exactly what the business would get back.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-card/85 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Safety</p>
              <p className="mt-2 font-medium">No real SMS will be sent in this demo</p>
            </div>
            <div className="rounded-2xl border bg-card/85 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Experience</p>
              <p className="mt-2 font-medium">Private demo run for each visitor</p>
            </div>
            <div className="rounded-2xl border bg-card/85 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Outcome</p>
              <p className="mt-2 font-medium">Lead summary plus owner alert preview</p>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-medium">Interactive preview mode</p>
            <p className="mt-2 text-muted-foreground">
              This public simulator stays on-page only. No Twilio calls, no real customer leads, and no login are required to walk through the missed-call recovery flow.
            </p>
          </div>
        </div>

        <Card className="border-primary/20 bg-card/95">
          <CardHeader>
            <CardTitle>Start the missed-call simulator</CardTitle>
            <CardDescription>Enter a phone number or use the demo phone number to create a private preview run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="simulator-phone">Phone number</Label>
              <Input
                id="simulator-phone"
                name="simulator-phone"
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="+1 555 123 4567"
                type="tel"
                value={phoneInput}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleStart}>Start private demo run</Button>
              <Button onClick={() => setPhoneInput(PUBLIC_SIMULATOR_DEMO_PHONE)} variant="outline">
                Use demo phone number
              </Button>
              {session ? (
                <Button onClick={handleReset} variant="ghost">
                  Reset and replay
                </Button>
              ) : null}
            </div>

            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              CallbackCloser will simulate a missed call for <span className="font-medium text-foreground">{PUBLIC_SIMULATOR_BUSINESS_NAME}</span> and keep the full demo inside this page.
            </div>

            {errorMessage ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{errorMessage}</div> : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Simulator state machine</CardTitle>
            <CardDescription>Every state below is deterministic and safe for public traffic.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {publicSimulatorStages.map((stage, index) => {
              const status = session ? getStageStatus(stage, session.stage) : index === 0 ? 'current' : 'pending';

              return (
                <div key={stage} className="flex gap-4 rounded-2xl border bg-background/70 p-4">
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-medium',
                      status === 'complete' && 'border-accent/40 bg-accent/20',
                      status === 'current' && 'border-primary/40 bg-primary/10',
                    )}
                  >
                    {index + 1}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{timelineCopy[stage].label}</p>
                      <Badge variant={status === 'complete' ? 'success' : status === 'current' ? 'secondary' : 'outline'}>
                        {status === 'complete' ? 'Complete' : status === 'current' ? 'Current' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{timelineCopy[stage].detail}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-card/95">
          <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-background to-secondary/40">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Realistic conversation transcript</CardTitle>
                  <Badge variant={session?.completed ? 'success' : 'outline'}>{session?.completed ? 'Complete' : 'Live preview'}</Badge>
                </div>
                <CardDescription>The demo thread updates on-page as if CallbackCloser were handling the missed call live.</CardDescription>
              </div>
              {session ? (
                <div className="rounded-xl border bg-background/80 px-4 py-3 text-sm">
                  <p className="font-medium">{session.callerPhoneMasked}</p>
                  <p className="text-muted-foreground">Masked caller view for public demo safety</p>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 p-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-3">
              {session ? (
                session.transcript.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'rounded-2xl border p-4 text-sm',
                      message.kind === 'assistant' && 'bg-primary/5',
                      message.kind === 'caller' && 'bg-background',
                      message.kind === 'event' && 'border-dashed bg-muted/20',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{message.label}</span>
                      <span>{message.timestamp}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{message.body}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                  Start a private demo run to reveal the missed call event, recovery text, and owner handoff.
                </div>
              )}

              <div className="rounded-2xl border bg-background/85 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Reply as the caller</p>
                    <p className="text-sm text-muted-foreground">Type a reply or use the quick replies to keep the demo moving.</p>
                  </div>
                  <Badge variant={canReply ? 'secondary' : 'outline'}>{canReply ? 'Input enabled' : 'Waiting'}</Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  {quickReplies.map((reply) => (
                    <Button key={reply} onClick={() => handleReply(reply)} size="sm" variant="outline">
                      {reply}
                    </Button>
                  ))}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Input
                    disabled={!canReply}
                    onChange={(event) => setReplyInput(event.target.value)}
                    placeholder={getReplyPlaceholder(session)}
                    value={replyInput}
                  />
                  <Button disabled={!canReply} onClick={() => handleReply(replyInput)}>
                    Send reply
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Card className={cn('border-primary/20 bg-primary/5', session?.stage === 'owner_alert_ready' || session?.stage === 'completed' ? 'border-accent/40 bg-accent/20' : null)}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>What the business sees</CardTitle>
                    <Badge variant={session?.stage === 'owner_alert_ready' || session?.stage === 'completed' ? 'success' : 'outline'}>
                      {session?.stage === 'owner_alert_ready' || session?.stage === 'completed' ? 'Owner alert ready' : 'Waiting on qualification'}
                    </Badge>
                  </div>
                  <CardDescription>Owner alert preview plus the lead summary card that would appear in CallbackCloser.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="rounded-xl border bg-background/90 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner alert subject</p>
                    <p className="mt-2 font-medium">{ownerAlert?.subject || `${PUBLIC_SIMULATOR_BUSINESS_NAME}: lead preview pending`}</p>
                  </div>
                  <div className="rounded-xl border bg-background/90 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Lead summary</p>
                    <p className="mt-2 font-medium">{leadSummary?.issue || 'Waiting for the caller to explain what they need.'}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
                        <p className="mt-2 font-medium">{leadSummary?.service || 'Pending'}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Urgency</p>
                        <p className="mt-2 font-medium">{leadSummary?.urgency || 'Pending'}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Caller</p>
                        <p className="mt-2 font-medium">{leadSummary?.callerPhone || 'Private demo caller'}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Next step</p>
                        <p className="mt-2 font-medium">{leadSummary?.callbackWindow || 'Pending'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background/90 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner alert body</p>
                    <p className="mt-2 text-muted-foreground">{ownerAlert?.body || 'CallbackCloser will prepare the owner alert after service and urgency are captured.'}</p>
                    <p className="mt-3 text-xs text-muted-foreground">{ownerAlert?.note || 'Demo-only preview. No real customer, owner, or Twilio traffic is involved.'}</p>
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-2xl border bg-background/85 p-4 text-sm">
                <p className="font-medium">What this proves in a sales conversation</p>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <p>- The caller gets a fast response even when the business misses the call.</p>
                  <p>- The business gets the service type and urgency before the callback.</p>
                  <p>- The public demo stays safe because everything is simulated inside the browser.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-3xl border bg-gradient-to-r from-background via-muted/30 to-background p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-3">
            <Badge variant="outline">Final CTA</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Show this flow on your own number next</h2>
            <p className="max-w-2xl text-muted-foreground">
              The interactive preview shows how CallbackCloser recovers a missed call, qualifies the lead, and prepares the owner follow-up. The next step is getting that flow live for your business.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants({ size: 'lg' })} href={PUBLIC_START_FREE_PILOT_PATH}>
              Start Free Pilot
            </Link>
            <Link className={buttonVariants({ size: 'lg', variant: 'outline' })} href={PUBLIC_CREATE_ACCOUNT_PATH}>
              Create Account
            </Link>
            <Link className={buttonVariants({ size: 'lg', variant: 'ghost' })} href="/contact">
              Contact support
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
