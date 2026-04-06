import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const roiPoints = [
  {
    title: 'Respond in seconds',
    description: 'Missed callers hear back right away instead of calling the next shop on the list.',
  },
  {
    title: 'Capture lead details automatically',
    description: 'Service type, urgency, ZIP, and callback timing are collected without manual texting.',
  },
  {
    title: 'Alert the owner immediately',
    description: 'Qualified leads are handed off with a ready-to-call summary instead of a raw voicemail trail.',
  },
  {
    title: 'Cover the monthly cost with one job',
    description: 'For most service businesses, a single recovered repair or install more than pays for the software.',
  },
];

const workflowSteps = [
  {
    title: 'Missed call comes in',
    description: 'Your Twilio number logs the missed call and starts follow-up without waiting on office staff.',
  },
  {
    title: 'SMS qualification starts',
    description: 'CallbackCloser texts back in seconds and collects the details your team actually needs.',
  },
  {
    title: 'Owner gets the handoff',
    description: 'You receive a summary with urgency, ZIP, and callback timing so follow-up is faster and cleaner.',
  },
];

const proofStats = [
  {
    label: 'Average response time',
    value: '< 30 sec',
    detail: 'TODO: Replace placeholder with measured live pilot median.',
  },
  {
    label: 'Leads recovered',
    value: '124+',
    detail: 'TODO: Replace placeholder with verified cumulative recovered-lead count.',
  },
  {
    label: 'Businesses onboarded',
    value: '18',
    detail: 'TODO: Replace placeholder with current onboarding count.',
  },
  {
    label: 'Pilot result',
    value: '7 missed callers in 10 days',
    detail: 'TODO: Replace placeholder with a real testimonial or pilot quote.',
  },
];

const screenshotCards = [
  {
    label: 'Leads list',
    title: 'Recovered leads prioritized for callback',
    description: 'Placeholder for the recovered-leads dashboard screenshot.',
  },
  {
    label: 'Conversation detail',
    title: 'Full SMS thread with quick follow-up actions',
    description: 'Placeholder for the lead detail or conversation view screenshot.',
  },
  {
    label: 'Business settings',
    title: 'Activation checklist, routing, and owner alerts in one place',
    description: 'Placeholder for the business settings or notification setup screenshot.',
  },
];

const planTeasers = [
  {
    name: 'Starter',
    description: 'Recover missed calls, qualify by SMS, and notify the owner without hidden setup friction.',
  },
  {
    name: 'Growth',
    description: 'More volume, more follow-up capacity, and a cleaner handoff for growing service teams.',
  },
  {
    name: 'Agency / Multi-location',
    description: 'Founder-led rollout planning for teams managing multiple brands or locations.',
  },
];

const onboardingSteps = [
  'Connect your phone routing and verify the number that should ring first.',
  'Confirm the first SMS reply and qualification flow before live traffic starts.',
  'Verify owner notifications and run a missed-call test so your team sees the full handoff.',
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main>
        <section className="border-b bg-gradient-to-b from-background via-background to-muted/30">
          <div className="container grid gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
            <section className="space-y-8">
              <div className="space-y-4">
                <Badge variant="outline">Built for service businesses that lose jobs to missed calls</Badge>
                <div className="space-y-4">
                  <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
                    Recover missed calls before they become lost jobs
                  </h1>
                  <p className="max-w-2xl text-lg text-muted-foreground">
                    CallbackCloser texts missed callers in seconds, qualifies the lead, and sends you a ready-to-call
                    summary.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link className={buttonVariants({ size: 'lg' })} href="/sign-up">
                    Start Free Pilot
                  </Link>
                  <Link className={buttonVariants({ size: 'lg', variant: 'outline' })} href="/#product-preview">
                    See Demo
                  </Link>
                  <Link className={buttonVariants({ size: 'lg', variant: 'ghost' })} href="/pricing">
                    Pricing
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span className="rounded-full border bg-card px-3 py-1">Fast missed-call response</span>
                  <span className="rounded-full border bg-card px-3 py-1">Less admin follow-up</span>
                  <span className="rounded-full border bg-card px-3 py-1">Owner-ready lead summaries</span>
                  <span className="rounded-full border bg-card px-3 py-1">Visible trust pages and SMS compliance</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {roiPoints.map((point) => (
                  <div key={point.title} className="rounded-2xl border bg-card/85 p-4 shadow-sm">
                    <p className="font-medium">{point.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{point.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <Card className="overflow-hidden border-primary/20 bg-card/95 shadow-lg">
              <CardHeader className="border-b bg-gradient-to-r from-primary/10 via-background to-secondary/40">
                <CardTitle>What the owner sees</CardTitle>
                <CardDescription>Faster response, less admin, and a cleaner handoff back to the business.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6 text-sm">
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-medium">2:14 PM</p>
                    <Badge variant="outline">Missed call</Badge>
                  </div>
                  <p className="text-muted-foreground">Homeowner calls about same-day AC repair while your techs are on jobs.</p>
                </div>
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-medium">2:14 PM</p>
                    <Badge variant="secondary">Auto-text sent</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    CallbackCloser replies right away, asks what service is needed, and keeps the conversation moving.
                  </p>
                </div>
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-medium">2:16 PM</p>
                    <Badge variant="secondary">Lead qualified</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Service type, urgency, ZIP, and callback time are collected automatically instead of sitting in voicemail.
                  </p>
                </div>
                <div className="rounded-2xl border border-accent/40 bg-accent/20 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-medium">2:16 PM</p>
                    <Badge variant="success">Owner alert sent</Badge>
                  </div>
                  <p className="font-medium">Ready-to-call summary</p>
                  <p className="mt-2 text-muted-foreground">
                    AC repair, urgent today, ZIP 78660, asked for an afternoon callback. Your team can call back with context instead of chasing details.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container space-y-6 py-16" id="how-it-works">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">Outcome-first workflow</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Built to recover revenue, not add another inbox</h2>
            <p className="text-muted-foreground">
              CallbackCloser is designed for owners who miss calls because they are busy running jobs. The goal is simple:
              respond fast, collect what matters, and make the callback obvious.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {workflowSteps.map((step, index) => (
              <Card key={step.title} className="bg-card/85">
                <CardHeader>
                  <CardDescription>Step {index + 1}</CardDescription>
                  <CardTitle>{step.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{step.description}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-y bg-muted/20" id="proof">
          <div className="container space-y-8 py-16">
            <div className="max-w-2xl space-y-3">
              <Badge variant="outline">Trust and proof</Badge>
              <h2 className="text-3xl font-semibold tracking-tight">Show the value fast and back it up with visible proof</h2>
              <p className="text-muted-foreground">
                The product should feel premium before a visitor ever logs in, so the page highlights speed, handoff quality,
                and clear trust language without hiding the pilot reality.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {proofStats.map((stat) => (
                <Card key={stat.label} className="bg-card/90">
                  <CardHeader>
                    <CardDescription>{stat.label}</CardDescription>
                    <CardTitle className="text-2xl">{stat.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{stat.detail}</CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-primary/20 bg-gradient-to-r from-card via-card to-primary/5">
              <CardHeader>
                <CardTitle>White-glove pilot onboarding</CardTitle>
                <CardDescription>Founder-led does not have to feel unfinished when the rollout path is clear.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3 text-sm text-muted-foreground">
                  {onboardingSteps.map((step, index) => (
                    <div key={step} className="rounded-2xl border bg-background/80 p-4">
                      <p className="font-medium text-foreground">
                        {index + 1}. {step}
                      </p>
                    </div>
                  ))}
                  <p>
                    We help you get live fast, verify your routing, and confirm a successful missed-call test before real traffic depends on it.
                  </p>
                </div>
                <div className="rounded-2xl border bg-background/80 p-5 text-sm text-muted-foreground">
                  {/* TODO: Replace this placeholder with a real pilot testimonial or founder quote once verified data is approved. */}
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pilot placeholder</p>
                  <p className="mt-3 text-lg font-medium text-foreground">
                    “Pilot customer recovered 7 missed callers in 10 days and cut the callback scramble.”
                  </p>
                  <p className="mt-3">
                    Replace this block with an approved testimonial, logo, or short pilot result before launch.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container space-y-8 py-16" id="product-preview">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">Product preview</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Show the product with clean, credible SaaS structure</h2>
            <p className="text-muted-foreground">
              These placeholders are ready for real captures so the marketing site can transition from promise to proof without another layout pass.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {screenshotCards.map((card) => (
              <Card key={card.label} className="overflow-hidden bg-card/90">
                <div className="aspect-[4/3] border-b bg-[linear-gradient(135deg,rgba(234,88,12,0.08),rgba(13,148,136,0.12),rgba(255,255,255,0.85))] p-6">
                  {/* TODO: Replace this placeholder surface with an actual product screenshot export. */}
                  <div className="flex h-full flex-col justify-between rounded-2xl border border-dashed border-foreground/20 bg-background/70 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="outline">{card.label}</Badge>
                      <span className="text-xs text-muted-foreground">Screenshot placeholder</span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-2/3 rounded-full bg-muted" />
                      <div className="h-3 w-5/6 rounded-full bg-muted" />
                      <div className="h-20 rounded-2xl border bg-card/90" />
                    </div>
                  </div>
                </div>
                <CardHeader>
                  <CardTitle>{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t bg-background">
          <div className="container grid gap-6 py-16 lg:grid-cols-[1.05fr_0.95fr]">
            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>Simple plan language</CardTitle>
                <CardDescription>Visitors should understand the packaging in under 20 seconds.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground">
                {planTeasers.map((plan) => (
                  <div key={plan.name} className="rounded-2xl border bg-background/80 p-4">
                    <p className="font-medium text-foreground">{plan.name}</p>
                    <p className="mt-2">{plan.description}</p>
                  </div>
                ))}
                <div className="pt-2">
                  <Link className={buttonVariants({ variant: 'outline' })} href="/pricing">
                    View Pricing
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>Compliance stays visible</CardTitle>
                <CardDescription>Trust language remains present without dominating the pitch.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  CallbackCloser keeps pricing, refund, privacy, terms, contact, and SMS consent pages visible before a business ever starts a pilot.
                </p>
                <p>
                  STOP, START, and HELP support remain part of the product flow, and the public consent page still explains message frequency and message/data rates.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Link className={buttonVariants({ size: 'sm' })} href="/sms-consent">
                    Review SMS consent
                  </Link>
                  <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/privacy">
                    Privacy and terms
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
