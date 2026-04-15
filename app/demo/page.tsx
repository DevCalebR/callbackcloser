import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicDemoReplay } from '@/components/demo/public-demo-replay';
import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  demoConversationMessages,
  demoHeroStats,
  demoInboxLeads,
  demoLeadDetail,
  demoOwnerAlert,
  demoTrustPoints,
  demoWorkflowSteps,
} from '@/lib/demo-data';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Live Product Demo | CallbackCloser',
  description: 'See how CallbackCloser turns a missed HVAC call into a qualified lead and owner alert in under 30 seconds.',
};

function getLeadRowBadgeVariant(status: string) {
  if (status === 'Qualified') return 'success';
  if (status === 'Contacted') return 'secondary';
  return 'outline';
}

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main>
        <section className="border-b bg-gradient-to-b from-background via-background to-muted/30">
          <div className="container grid gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20">
            <div className="space-y-8">
              <div className="space-y-4">
                <Badge variant="outline">Public HVAC demo</Badge>
                <div className="space-y-4">
                  <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
                    Turn missed HVAC calls into paying jobs while the lead is still hot
                  </h1>
                  <p className="max-w-2xl text-lg text-muted-foreground">
                    This is a safe public walkthrough of the real CallbackCloser flow: missed call, instant text, lead qualification, and the owner alert
                    that tells your team who to call first.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link className={buttonVariants({ size: 'lg' })} href="/contact">
                    See this on your business
                  </Link>
                  <Link className={buttonVariants({ size: 'lg', variant: 'outline' })} href="#demo-workspace">
                    Watch the demo
                  </Link>
                  <Link className={buttonVariants({ size: 'lg', variant: 'ghost' })} href="/sign-up">
                    Get set up in 10 minutes
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {demoHeroStats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl border bg-card/85 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-lg font-semibold">{stat.value}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{stat.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <Card className="overflow-hidden border-primary/20 bg-card/95 shadow-lg">
              <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-background to-secondary/40">
                <CardTitle>What you are looking at</CardTitle>
                <CardDescription>A realistic public demo page built for live sales calls. No login, no real customer data, no live Twilio traffic.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6 text-sm">
                {demoTrustPoints.map((point) => (
                  <div key={point} className="rounded-2xl border bg-background/80 p-4">
                    {point}
                  </div>
                ))}
                <div className="rounded-2xl border border-accent/40 bg-accent/20 p-4">
                  <p className="font-medium">30-second sales story</p>
                  <p className="mt-2 text-muted-foreground">
                    A homeowner calls, the business misses it, CallbackCloser texts instantly, the lead replies, and the owner gets a ready-to-call HVAC job
                    instead of a dead voicemail.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container space-y-8 py-12" id="demo-workspace">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">Live-looking product view</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">See the recovered lead before your prospect zones out</h2>
            <p className="text-muted-foreground">
              The inbox on the left looks like the real app. The selected lead opens into the same kind of conversation and owner handoff your team would
              use after setup.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>Recovered leads</CardTitle>
                <CardDescription>What the owner sees when CallbackCloser has already done the first part of the follow-up.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {demoInboxLeads.map((lead, index) => (
                  <div
                    key={lead.id}
                    className={cn(
                      'rounded-2xl border p-4',
                      index === 0 ? 'border-primary/30 bg-primary/5' : 'bg-background/80',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{lead.customerName}</p>
                        <p className="text-sm text-muted-foreground">{lead.customerPhone}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={getLeadRowBadgeVariant(lead.status)}>{lead.status}</Badge>
                        <Badge variant={lead.readiness === 'Hot Lead' ? 'destructive' : lead.readiness === 'Working' ? 'secondary' : 'outline'}>
                          {lead.readiness}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <p>{lead.serviceType}</p>
                      <p>{lead.urgency}</p>
                      <p>{lead.location}</p>
                      <p>{lead.createdLabel}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <PublicDemoReplay messages={demoConversationMessages} ownerAlert={demoOwnerAlert} />
          </div>
        </section>

        <section className="border-y bg-muted/20">
          <div className="container grid gap-6 py-14 lg:grid-cols-[1fr_1fr]">
            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>Lead detail at a glance</CardTitle>
                <CardDescription>This is the context your prospect needs to understand immediately on a sales call.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-background/85 p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
                  <p className="mt-2 font-medium">{demoLeadDetail.customerName}</p>
                  <p className="mt-1 text-muted-foreground">{demoLeadDetail.customerPhone}</p>
                </div>
                <div className="rounded-xl border bg-background/85 p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Issue</p>
                  <p className="mt-2 font-medium">{demoLeadDetail.issueSummary}</p>
                  <p className="mt-1 text-muted-foreground">{demoLeadDetail.serviceType}</p>
                </div>
                <div className="rounded-xl border bg-background/85 p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Urgency</p>
                  <p className="mt-2 font-medium">{demoLeadDetail.urgency}</p>
                  <p className="mt-1 text-muted-foreground">{demoLeadDetail.callbackWindow}</p>
                </div>
                <div className="rounded-xl border bg-background/85 p-4 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Timing</p>
                  <p className="mt-2 font-medium">Created {demoLeadDetail.createdAt}</p>
                  <p className="mt-1 text-muted-foreground">Qualified {demoLeadDetail.qualifiedAt}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-accent/40 bg-accent/20">
              <CardHeader>
                <CardTitle>The owner alert is the sales moment</CardTitle>
                <CardDescription>
                  This is where a missed call stops feeling like lost revenue and starts looking like a job the owner can actually close.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border bg-background/90 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-lg font-semibold">{demoOwnerAlert.headline}</p>
                    <Badge variant="success">Ready to call</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Service</p>
                      <p className="mt-2 font-medium">{demoOwnerAlert.service}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Urgency</p>
                      <p className="mt-2 font-medium">{demoOwnerAlert.urgency}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/20 p-3 text-sm">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Call now</p>
                      <p className="mt-2 font-medium">{demoOwnerAlert.customerPhone}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">{demoOwnerAlert.summary}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link className={buttonVariants()} href="/contact">
                    Want this on your business?
                  </Link>
                  <Link className={buttonVariants({ variant: 'outline' })} href="/sign-up">
                    Try CallbackCloser on your number
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container space-y-6 py-14" id="how-it-works">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">How it works</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Three steps. One clearer handoff.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {demoWorkflowSteps.map((step, index) => (
              <Card key={step.title} className="bg-card/90">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border font-medium">{index + 1}</div>
                    <CardTitle>{step.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{step.detail}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t bg-gradient-to-b from-background to-muted/30">
          <div className="container space-y-6 py-16 text-center">
            <Badge variant="outline">Close with a demo, not a long explanation</Badge>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Want this on your business?</h2>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                CallbackCloser is built to help HVAC teams recover missed jobs fast. If this looks like the kind of handoff your team needs, the next step is
                getting it on your number and running one live test.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link className={buttonVariants({ size: 'lg' })} href="/contact">
                Book a setup call
              </Link>
              <Link className={buttonVariants({ size: 'lg', variant: 'outline' })} href="/sign-up">
                Start free pilot
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
