import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PUBLIC_CREATE_ACCOUNT_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';

const flowSteps = [
  {
    title: 'Missed call comes in',
    detail: 'Your customer calls. If the call is missed, CallbackCloser starts the follow-up immediately.',
  },
  {
    title: 'Text goes out in seconds',
    detail: 'The customer gets a simple reply asking what they need help with and how soon they need it.',
  },
  {
    title: 'The lead gets qualified',
    detail: 'CallbackCloser captures service need, urgency, location, and the best callback time without dragging the customer through a long form.',
  },
  {
    title: 'You get a ready-to-call summary',
    detail: 'Instead of a cold voicemail, you see a clear lead handoff and know who to call first.',
  },
];

const pilotIncludes = [
  '14-day pilot',
  'White-glove setup included',
  'Missed-call SMS recovery',
  'Qualified lead summaries',
  'Owner alerts',
  'Lead Recovery Command Center',
  'One business texting number included',
  'You approve before continuing',
];

const trustLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/refund', label: 'Refund' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/sms-consent', label: 'SMS Consent' },
  { href: '/contact', label: 'Contact' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main>
        <section className="border-b bg-gradient-to-b from-background via-background to-muted/30">
          <div className="container grid gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
            <section className="space-y-6">
              <Badge variant="outline">14-day pilot with white-glove setup</Badge>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
                  Turn missed calls into qualified leads automatically
                </h1>
                <p className="max-w-2xl text-lg text-muted-foreground">
                  CallbackCloser texts missed callers in seconds, collects the job details, and sends you a ready-to-call lead summary.
                </p>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Start a 14-day pilot. We help set up your missed-call recovery flow and notify you when it is ready.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className={buttonVariants({ size: 'lg' })} href="/simulator">
                  Try the missed-call simulator
                </Link>
                <Link className={buttonVariants({ size: 'lg', variant: 'outline' })} href={PUBLIC_START_FREE_PILOT_PATH}>
                  Start 14-day pilot
                </Link>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span className="rounded-full border bg-card px-3 py-1">Reply in seconds</span>
                <span className="rounded-full border bg-card px-3 py-1">Qualified before callback</span>
                <span className="rounded-full border bg-card px-3 py-1">White-glove setup</span>
                <span className="rounded-full border bg-card px-3 py-1">Live dashboard when ready</span>
              </div>
            </section>

            <Card className="overflow-hidden border-primary/20 bg-card/95 shadow-lg">
              <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-background to-secondary/30">
                <CardTitle>What the owner sees</CardTitle>
                <CardDescription>A short missed-call recovery flow that ends with a ready-to-call lead.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6 text-sm">
                <div className="rounded-2xl border bg-muted/30 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-medium">2:14 PM</p>
                    <Badge variant="outline">Missed call</Badge>
                  </div>
                  <p className="text-muted-foreground">A homeowner calls while your team is on jobs.</p>
                </div>
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <p className="font-medium">Customer reply</p>
                  <p className="mt-2 text-muted-foreground">“Repair. Today. John, Knoxville. ASAP.”</p>
                </div>
                <div className="rounded-2xl border border-accent/40 bg-accent/20 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-medium">Owner alert</p>
                    <Badge variant="success">Qualified lead</Badge>
                  </div>
                  <p className="font-medium">John · Repair · Today · Knoxville · ASAP</p>
                  <p className="mt-2 text-muted-foreground">
                    CallbackCloser hands off a clear summary so the callback can focus on booking the job instead of hunting for details.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link className={buttonVariants()} href="/simulator">
                    Run the simulator
                  </Link>
                  <Link className={buttonVariants({ variant: 'outline' })} href="/demo">
                    See the product story
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container space-y-6 py-16">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">How it works</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">A simple missed-call recovery flow built for service businesses</h2>
            <p className="text-muted-foreground">
              The goal is straightforward: keep the customer engaged, qualify the request quickly, and get the owner to the callback with context.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {flowSteps.map((step) => (
              <Card key={step.title} className="bg-card/90">
                <CardHeader>
                  <CardTitle>{step.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{step.detail}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y bg-muted/20">
          <div className="container grid gap-6 py-16 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="bg-card/95">
              <CardHeader>
                <CardTitle>Owner alert preview</CardTitle>
                <CardDescription>The handoff is short, practical, and ready for a callback.</CardDescription>
              </CardHeader>
              <CardContent className="rounded-3xl border bg-background/90 p-6 font-mono text-sm leading-7">
                <p>Hot missed-call lead</p>
                <p className="mt-4">Name: John</p>
                <p>Service: Repair</p>
                <p>Urgency: Today</p>
                <p>Location: Knoxville</p>
                <p>Callback: ASAP</p>
                <p className="mt-4">Call now: (555) 123-4567</p>
                <p>View lead: /app/leads/demo</p>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <div className="space-y-3">
                <Badge variant="outline">Pilot offer</Badge>
                <h2 className="text-3xl font-semibold tracking-tight">Start with a 14-day pilot</h2>
                <p className="text-muted-foreground">
                  We&apos;re onboarding a small number of local service businesses with hands-on setup. We set up your missed-call recovery flow, verify the first test, and notify you when your account is ready.
                </p>
              </div>

              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle>Early pilot pricing</CardTitle>
                  <CardDescription>
                    Early pilot pricing starts at $50 for the first 14 days to cover setup, texting, and usage while we prove the system can recover leads for your business.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {pilotIncludes.map((item) => (
                    <p key={item}>- {item}</p>
                  ))}
                  <div className="flex flex-wrap gap-3 pt-4">
                    <Link className={buttonVariants()} href={PUBLIC_START_FREE_PILOT_PATH}>
                      Start 14-day pilot
                    </Link>
                    <Link className={buttonVariants({ variant: 'outline' })} href={PUBLIC_CREATE_ACCOUNT_PATH}>
                      Create account
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="container space-y-4 py-16">
          <Badge variant="outline">Trust</Badge>
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">Everything important stays visible</h2>
            <p className="text-muted-foreground">
              Trust pages stay public and easy to review, without taking over the main product story.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {trustLinks.map((link) => (
              <Link key={link.href} className={buttonVariants({ size: 'sm', variant: 'outline' })} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
