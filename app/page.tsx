import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const roiPoints = [
  {
    title: 'Reply before they move on',
    description: 'Missed callers hear back fast instead of calling the next business on the list.',
  },
  {
    title: 'Get the details without chasing them',
    description: 'You get the job type, urgency, ZIP, and callback timing without manually texting back and forth.',
  },
  {
    title: 'Know who is worth calling first',
    description: 'Qualified leads are handed off with a ready-to-close summary instead of a cold voicemail.',
  },
  {
    title: 'One extra job can cover the cost',
    description: 'For most service businesses, a single recovered repair or install pays for CallbackCloser.',
  },
];

const painPoints = [
  {
    title: 'Every missed call can become a lost job',
    description: 'When the phone rings and nobody answers, that customer usually needs help now, not tomorrow.',
  },
  {
    title: 'Customers move on fast',
    description: 'If they do not hear back quickly, they call the next shop and you never get the chance to close them.',
  },
  {
    title: 'Voicemail rarely saves the lead',
    description: 'Most callers do not leave enough detail to help you call back with confidence, if they leave one at all.',
  },
  {
    title: 'Most owners never see the lost revenue',
    description: 'Missed calls feel small until you add up how many booked jobs disappear every month.',
  },
];

const workflowSteps = [
  {
    title: 'A customer calls and you miss it',
    description: 'The lead does not have to sit in voicemail while your team is on jobs or with other customers.',
  },
  {
    title: 'CallbackCloser texts them right away',
    description: 'They hear back in seconds, not hours, so you stay in the running for the job.',
  },
  {
    title: 'We find out what they need',
    description: 'The conversation captures the job type, urgency, and location without your team doing the back-and-forth.',
  },
  {
    title: 'You get a qualified lead to follow up with',
    description: 'You get a ready-to-close handoff so the next call is focused on booking the job.',
  },
];

const proofStats = [
  {
    label: 'Average response time',
    value: '< 30 sec',
    detail: 'Pilot placeholder until measured live response data is published.',
  },
  {
    label: 'Leads recovered',
    value: '124+',
    detail: 'Placeholder count shown until cumulative recovered-lead data is finalized.',
  },
  {
    label: 'Businesses onboarded',
    value: '18',
    detail: 'Placeholder onboarding count shown until the next verified update.',
  },
  {
    label: 'Pilot result',
    value: '7 missed callers in 10 days',
    detail: 'Pilot placeholder result shown until an approved customer quote is published.',
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
    description: 'Start turning missed calls into real opportunities with one included business texting number and less admin work.',
  },
  {
    name: 'Growth',
    description: 'Handle more missed-call opportunities and keep follow-up clean as your team gets busier.',
  },
  {
    name: 'Agency / Multi-location',
    description: 'Hands-on rollout planning for teams covering multiple brands or locations.',
  },
];

const onboardingSteps = [
  'We provision your business texting line and connect routing so missed callers are covered fast.',
  'We confirm the first text and lead questions before live traffic starts.',
  'We verify owner notifications and run a missed-call test with you before go-live.',
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
                    Stop losing jobs from missed calls
                  </h1>
                  <p className="max-w-2xl text-lg text-muted-foreground">
                    CallbackCloser texts missed callers instantly, qualifies them, and sends you a ready-to-close lead.
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
                  <span className="rounded-full border bg-card px-3 py-1">Reply in seconds</span>
                  <span className="rounded-full border bg-card px-3 py-1">Recover more jobs</span>
                  <span className="rounded-full border bg-card px-3 py-1">Ready-to-close leads</span>
                  <span className="rounded-full border bg-card px-3 py-1">Less admin chasing</span>
                </div>
                <p className="text-base font-medium text-foreground">Close one extra job and this can pay for itself.</p>
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
                <CardTitle>What you get back</CardTitle>
                <CardDescription>Faster response, fewer cold leads, and a clearer path to closing the job.</CardDescription>
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
                    CallbackCloser replies right away so the customer does not disappear before you can get back to them.
                  </p>
                </div>
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-medium">2:16 PM</p>
                    <Badge variant="secondary">Lead qualified</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    The job type, urgency, ZIP, and callback timing come in before you even make the next call.
                  </p>
                </div>
                <div className="rounded-2xl border border-accent/40 bg-accent/20 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-medium">2:16 PM</p>
                    <Badge variant="success">Owner alert sent</Badge>
                  </div>
                  <p className="font-medium">Ready-to-close lead</p>
                  <p className="mt-2 text-muted-foreground">
                    AC repair, urgent today, ZIP 78660, asked for an afternoon callback. Your team can call back ready to book the job, not hunt for details.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-y bg-muted/20">
          <div className="container space-y-6 py-16">
            <div className="max-w-2xl space-y-3">
              <Badge variant="outline">The real problem</Badge>
              <h2 className="text-3xl font-semibold tracking-tight">Most missed calls are not just missed calls</h2>
              <p className="text-muted-foreground">
                They are missed estimates, missed repairs, missed installs, and missed revenue you never get a clean chance to win back.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {painPoints.map((point) => (
                <Card key={point.title} className="bg-card/90">
                  <CardHeader>
                    <CardTitle>{point.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{point.description}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="container space-y-6 py-16" id="how-it-works">
          <div className="max-w-2xl space-y-3">
            <Badge variant="outline">Simple follow-up</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">What happens when you miss a call</h2>
            <p className="text-muted-foreground">
              CallbackCloser keeps the handoff simple so you can focus on calling back the right lead and closing the work.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              <h2 className="text-3xl font-semibold tracking-tight">Proof that missed calls can still turn into paying work</h2>
              <p className="text-muted-foreground">
                Lead recovery, response speed, and jobs saved should be obvious at a glance. These placeholders are ready for real proof when you have it.
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
                <CardDescription>Hands-on setup so your missed calls are covered fast and the first test goes cleanly.</CardDescription>
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
                    We help you get live fast, cover the missed-call gap, and confirm the first real handoff before your team depends on it.
                  </p>
                </div>
                <div className="rounded-2xl border bg-background/80 p-5 text-sm text-muted-foreground">
                  {/* TODO: Replace this placeholder with a real pilot testimonial or founder quote once verified data is approved. */}
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pilot placeholder</p>
                  <p className="mt-3 text-lg font-medium text-foreground">
                    “Pilot customer recovered 7 missed callers in 10 days and turned missed calls into real follow-up opportunities.”
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
            <h2 className="text-3xl font-semibold tracking-tight">See how missed calls turn into follow-up-ready leads</h2>
            <p className="text-muted-foreground">
              These placeholders are ready for real screenshots so the site can show business value, not just describe it.
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
                <CardTitle>Simple plan choices</CardTitle>
                <CardDescription>Visitors should understand the offer in under 20 seconds.</CardDescription>
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
                    Start capturing missed leads
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
