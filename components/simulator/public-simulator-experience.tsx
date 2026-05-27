'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  applyPublicSimulatorReply,
  buildPublicSimulatorLeadSummary,
  buildPublicSimulatorOwnerAlert,
  canReplyToPublicSimulator,
  createPublicSimulatorSession,
  getPublicSimulatorReplyOptions,
  type PublicSimulatorReplyOption,
} from '@/lib/public-simulator';

function MessageBubble({ body, role }: { body: string; role: 'system' | 'customer' | 'event' }) {
  const roleLabel = role === 'system' ? 'CallbackCloser' : role === 'customer' ? 'Customer reply' : 'Missed call';
  const bubbleClassName =
    role === 'system'
      ? 'border-primary/30 bg-primary/5'
      : role === 'customer'
        ? 'border-border bg-background'
        : 'border-accent/30 bg-accent/15';

  return (
    <div className={`rounded-2xl border p-4 text-sm ${bubbleClassName}`}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{roleLabel}</p>
      <p className="whitespace-pre-wrap leading-6">{body}</p>
    </div>
  );
}

function QuickReplies({
  options,
  onChoose,
}: {
  options: PublicSimulatorReplyOption[];
  onChoose: (value: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button key={option.label} size="sm" type="button" variant="outline" onClick={() => onChoose(option.value)}>
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function PublicSimulatorExperience() {
  const [phoneDraft, setPhoneDraft] = useState('+1 (865) 555-0148');
  const [reply, setReply] = useState('');
  const [session, setSession] = useState(() => createPublicSimulatorSession(phoneDraft));

  const leadSummary = buildPublicSimulatorLeadSummary(session);
  const ownerAlert = buildPublicSimulatorOwnerAlert(session);
  const canReply = canReplyToPublicSimulator(session.stage);
  const quickReplies = getPublicSimulatorReplyOptions(session.stage);

  function restartDemo(nextPhone = phoneDraft) {
    setReply('');
    setSession(createPublicSimulatorSession(nextPhone));
  }

  function sendReply(nextReply: string) {
    if (!nextReply.trim() || !canReply) return;
    setSession((currentSession) => applyPublicSimulatorReply(currentSession, nextReply));
    setReply('');
  }

  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div className="space-y-5">
          <Badge variant="outline">Self-contained sales demo</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Show the missed-call recovery flow without setup</h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              This interactive preview runs entirely in your browser. It shows the exact intake flow a missed caller sees, then reveals the qualified lead and owner alert your customer would get.
            </p>
          </div>
          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Current progress</p>
                <p className="mt-1 text-sm text-muted-foreground">{session.progressLabel}</p>
              </div>
              <Badge variant={session.qualified ? 'success' : 'secondary'}>{session.qualified ? 'Lead qualified' : 'Intake in progress'}</Badge>
            </div>
            <div className="mt-4 h-2 rounded-full bg-background/80">
              <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${session.progressValue}%` }} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Public `/simulator` is intentionally self-contained. It should stay usable with no Twilio setup, no login, and no backend demo workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a className={buttonVariants({ size: 'lg' })} href="#simulator-chat">
              Start the conversation
            </a>
            <Button size="lg" type="button" variant="outline" onClick={() => restartDemo()}>
              Restart demo
            </Button>
          </div>
        </div>

        <Card className="border-primary/20 bg-card/95">
          <CardHeader>
            <CardTitle>Demo controls</CardTitle>
            <CardDescription>Use any phone number for the preview. It stays masked and never leaves the page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="simulator-phone">Caller phone number</Label>
              <Input
                id="simulator-phone"
                value={phoneDraft}
                onChange={(event) => setPhoneDraft(event.target.value)}
                placeholder="+1 (865) 555-0148"
                type="tel"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => restartDemo(phoneDraft)}>
                Restart with this number
              </Button>
              <p className="self-center text-sm text-muted-foreground">The demo masks it automatically in the transcript, summary, and alert.</p>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              No real SMS is sent. No lead is written to a live workspace. This is a polished preview for sales conversations and public demos.
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="bg-card/95" id="simulator-chat">
          <CardHeader>
            <CardTitle>Missed-call conversation</CardTitle>
            <CardDescription>The demo keeps the full thread moving through service, urgency, name plus location, callback timing, and confirmation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {session.messages.map((message) => (
              <MessageBubble key={message.id} body={message.body} role={message.role} />
            ))}

            <div className="space-y-3 rounded-2xl border bg-background/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Reply as the customer</p>
                  <p className="text-sm text-muted-foreground">
                    {canReply ? 'Free text always works. Quick replies are here when the flow expects a short choice.' : 'The lead is qualified. Restart any time to run it again.'}
                  </p>
                </div>
                {canReply ? <Badge variant="outline">Reply open</Badge> : <Badge variant="success">Complete</Badge>}
              </div>
              <QuickReplies options={quickReplies} onChoose={sendReply} />
              <form
                className="space-y-3 sm:flex sm:items-end sm:gap-3 sm:space-y-0"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendReply(reply);
                }}
              >
                <div className="flex-1 space-y-2">
                  <Label htmlFor="simulator-reply">Customer reply</Label>
                  <Input
                    id="simulator-reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={canReply ? 'Type the next reply' : 'Demo complete'}
                    disabled={!canReply}
                  />
                </div>
                <Button type="submit" disabled={!canReply || !reply.trim()}>
                  Send reply
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card/95">
            <CardHeader>
              <CardTitle>Qualified lead summary</CardTitle>
              <CardDescription>The payoff is the structured lead your customer sees in the callback queue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Name</span>
                <span>{leadSummary.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Phone</span>
                <span>{leadSummary.phone}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Service</span>
                <span>{leadSummary.service}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Urgency</span>
                <span>{leadSummary.urgency}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Location / address</span>
                <span>{leadSummary.location}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Best callback time</span>
                <span>{leadSummary.callbackTime}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Lead priority</span>
                <span>{leadSummary.priority}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Status</span>
                <span>{leadSummary.status}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-accent/40 bg-accent/15">
            <CardHeader>
              <CardTitle>Owner alert preview</CardTitle>
              <CardDescription>Once the callback time is captured, the business gets a clean, ready-to-call alert.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border bg-background/90 p-4 text-sm">
                <pre className="whitespace-pre-wrap font-sans leading-6">{ownerAlert}</pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
