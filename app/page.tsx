import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const workflowSteps = [
  {
    title: 'Missed call captured',
    description: 'A missed call hits your Twilio number, is logged, and is tied to the right business record.',
  },
  {
    title: 'Automatic text follow-up',
    description: 'CallbackCloser texts back right away so the lead hears from you before they call the next shop.',
  },
  {
    title: 'Lead qualification',
    description: 'The workflow collects service type, urgency, ZIP code, and best callback time by text.',
  },
  {
    title: 'Owner visibility',
    description: 'The owner gets a summary and the full conversation is available inside the protected dashboard.',
  },
];

const pilotSteps = [
  'Create your business profile and set the owner notification phone',
  'Connect or buy your Twilio number and confirm call forwarding',
  'Activate billing and run a live missed-call test before rollout',
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main>
        <section className="border-b bg-gradient-to-b from-background via-background to-muted/30">
          <div className="container grid gap-8 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
            <section className="space-y-6">
              <Badge variant="outline">Missed calls cost jobs</Badge>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
                  Recover missed calls with automatic text follow-up, lead qualification, and owner alerts.
                </h1>
                <p className="max-w-2xl text-lg text-muted-foreground">
                  CallbackCloser texts back when your team misses a call, qualifies the lead by SMS, logs the conversation,
                  and gives the owner a clear handoff inside the dashboard before the prospect goes cold.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link className={buttonVariants({ size: 'lg' })} href="/sign-up">
                  Start pilot onboarding
                </Link>
                <Link className={buttonVariants({ size: 'lg', variant: 'outline' })} href="/pricing">
                  View pricing
                </Link>
                <Link className={buttonVariants({ size: 'lg', variant: 'ghost' })} href="/contact">
                  Talk to us
                </Link>
              </div>

              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span className="rounded-full border bg-card px-3 py-1">Automatic text follow-up</span>
                <span className="rounded-full border bg-card px-3 py-1">Lead qualification</span>
                <span className="rounded-full border bg-card px-3 py-1">Owner summary text</span>
                <span className="rounded-full border bg-card px-3 py-1">STOP and HELP support</span>
              </div>
            </section>

            <Card className="border-primary/20 bg-card/95">
              <CardHeader>
                <CardTitle>What a recovered lead looks like</CardTitle>
                <CardDescription>No login required to understand the product promise during outreach.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="font-medium">2:14 PM</p>
                  <p className="text-muted-foreground">Missed call from a homeowner looking for same-day repair.</p>
                </div>
                <div className="rounded-lg border bg-primary/5 p-4">
                  <p className="font-medium">2:14 PM</p>
                  <p className="text-muted-foreground">CallbackCloser texts back right away and asks what service is needed.</p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="font-medium">2:16 PM</p>
                  <p className="text-muted-foreground">The lead replies with service type, urgency, ZIP code, and best callback time.</p>
                </div>
                <div className="rounded-lg border bg-primary/5 p-4">
                  <p className="font-medium">2:16 PM</p>
                  <p className="text-muted-foreground">The owner gets a summary text and sees the full conversation in the dashboard.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container space-y-6 py-16" id="how-it-works">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight">How CallbackCloser works</h2>
            <p className="text-muted-foreground">
              This is built for service businesses that lose jobs when the phone rings at the wrong moment. The workflow is
              simple: recover the lead fast, gather the important details, and make sure the owner can respond without extra admin work.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {workflowSteps.map((step, index) => (
              <Card key={step.title}>
                <CardHeader>
                  <CardDescription>Step {index + 1}</CardDescription>
                  <CardTitle>{step.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{step.description}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y bg-muted/20">
          <div className="container grid gap-6 py-16 lg:grid-cols-[1.05fr_0.95fr]">
            <Card>
              <CardHeader>
                <CardTitle>Pilot-ready onboarding</CardTitle>
                <CardDescription>Founder-led pilots move fastest when the setup path is obvious.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {pilotSteps.map((step, index) => (
                  <div key={step} className="rounded-lg border bg-card p-4">
                    <p className="font-medium text-foreground">
                      {index + 1}. {step}
                    </p>
                  </div>
                ))}
                <p>Need help before you sign up? Use the contact path below and we will walk through fit, setup, and pilot rollout.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Trust and compliance</CardTitle>
                <CardDescription>Public trust pages are available before a prospect ever logs in.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>CallbackCloser keeps pricing, contact, privacy, terms, refund, and SMS consent surfaces visible before live pilot rollout.</p>
                <p>The public SMS consent flow is web-form based and explains message frequency, message and data rates, and STOP or HELP handling.</p>
                <p>The product supports STOP, START, and HELP handling, but businesses still need to use lawful calling and texting practices.</p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Link className={buttonVariants({ size: 'sm' })} href="/pricing">
                    View pricing
                  </Link>
                  <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/sms-consent">
                    Review SMS consent
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
