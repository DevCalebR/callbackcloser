'use client';

import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DemoConversationMessage } from '@/lib/demo-data';
import { cn } from '@/lib/utils';

const REPLAY_INTERVAL_MS = 850;

function getReplayStage(messageCount: number, totalMessages: number) {
  if (messageCount >= totalMessages) return 'qualified';
  if (messageCount >= Math.max(totalMessages - 1, 1)) return 'qualifying';
  if (messageCount > 0) return 'active';
  return 'idle';
}

export function PublicDemoReplay({
  messages,
  ownerAlert,
}: {
  messages: DemoConversationMessage[];
  ownerAlert: {
    headline: string;
    service: string;
    urgency: string;
    customerName: string;
    customerPhone: string;
    summary: string;
    footer: string;
  };
}) {
  const [visibleCount, setVisibleCount] = useState(messages.length);
  const [isReplaying, setIsReplaying] = useState(false);

  useEffect(() => {
    if (!isReplaying) return;

    if (visibleCount >= messages.length) {
      setIsReplaying(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + 1, messages.length));
    }, REPLAY_INTERVAL_MS);

    return () => window.clearTimeout(timeout);
  }, [isReplaying, visibleCount, messages.length]);

  const visibleMessages = useMemo(() => messages.slice(0, visibleCount), [messages, visibleCount]);
  const replayStage = getReplayStage(visibleMessages.length, messages.length);
  const ownerAlertReady = replayStage === 'qualified';

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="overflow-hidden bg-card/95">
        <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-background to-secondary/40">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>Lead workspace</CardTitle>
                <Badge variant="success">Qualified</Badge>
                <Badge variant="destructive">Hot Lead</Badge>
              </div>
              <CardDescription>
                This mirrors the real CallbackCloser lead detail flow: missed call, text follow-up, qualification, and owner handoff.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setVisibleCount(0);
                  setIsReplaying(true);
                }}
                type="button"
                variant="outline"
              >
                Replay demo
              </Button>
              <Button
                onClick={() => {
                  setVisibleCount(messages.length);
                  setIsReplaying(false);
                }}
                type="button"
              >
                Show full flow
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-3">
            <div className="rounded-2xl border bg-background/80 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{ownerAlert.customerName}</p>
                  <p className="text-muted-foreground">{ownerAlert.customerPhone}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{ownerAlert.service}</Badge>
                  <Badge variant="destructive">{ownerAlert.urgency}</Badge>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Callback state</p>
                  <p className="mt-2 font-medium">
                    {replayStage === 'idle'
                      ? 'Missed call detected'
                      : replayStage === 'active'
                        ? 'Texting lead now'
                        : replayStage === 'qualifying'
                          ? 'Qualifying by text'
                          : 'Owner ready to call'}
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">What got captured</p>
                  <p className="mt-2 font-medium">
                    {replayStage === 'qualified' ? `${ownerAlert.service} • ${ownerAlert.urgency}` : 'Issue + service + urgency in progress'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-background/80 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Conversation history</p>
                  <p className="text-sm text-muted-foreground">Watch the missed-call follow-up unfold step by step.</p>
                </div>
                <Badge variant={ownerAlertReady ? 'success' : 'outline'}>
                  {ownerAlertReady ? 'Qualified' : 'In progress'}
                </Badge>
              </div>
              <div className="space-y-3">
                {visibleMessages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'rounded-xl border p-3 text-sm transition-opacity',
                      message.sender === 'system' ? 'bg-primary/5' : 'bg-card',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{message.label}</span>
                      <span>{message.timestamp}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{message.body}</p>
                  </div>
                ))}
                {visibleMessages.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Hit replay to reveal the missed-call text thread like a live sales walkthrough.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Card className={cn('border-primary/20 bg-primary/5 transition-all', ownerAlertReady && 'border-accent/40 bg-accent/20')}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle>{ownerAlert.headline}</CardTitle>
                  <Badge variant={ownerAlertReady ? 'success' : 'outline'}>
                    {ownerAlertReady ? 'Owner alert sent' : 'Waiting on qualification'}
                  </Badge>
                </div>
                <CardDescription>The sales moment: what the owner sees after the lead is qualified.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-background/85 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
                    <p className="mt-2 font-medium">{ownerAlert.service}</p>
                  </div>
                  <div className="rounded-xl border bg-background/85 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Urgency</p>
                    <p className="mt-2 font-medium">{ownerAlert.urgency}</p>
                  </div>
                </div>
                <div className="rounded-xl border bg-background/85 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Call now</p>
                  <p className="mt-2 text-lg font-semibold">{ownerAlert.customerPhone}</p>
                  <p className="mt-2 text-muted-foreground">{ownerAlert.summary}</p>
                </div>
                <div className="rounded-xl border bg-background/85 p-4">
                  <p className="font-medium">{ownerAlert.footer}</p>
                  <p className="mt-2 text-muted-foreground">
                    Open the lead, read the full text thread, and call back with the right context instead of guessing from voicemail.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-2xl border bg-background/80 p-4 text-sm">
              <p className="font-medium">Why this closes faster</p>
              <div className="mt-3 space-y-2 text-muted-foreground">
                <p>- The homeowner gets a fast reply while the problem still feels urgent.</p>
                <p>- The owner sees repair intent and timing before making the callback.</p>
                <p>- The conversation is captured in one place instead of lost across voicemail and manual texting.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
