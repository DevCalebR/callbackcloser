import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PUBLIC_CREATE_ACCOUNT_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';

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
    label: 'Response timing',
    value: 'Seconds, not hours',
    detail: 'Missed callers hear back quickly while the job is still active and the lead still wants help.',
  },
  {
    label: 'Lead handoff',
    value: 'Qualified before callback',
    detail: 'Owners see the job type, urgency, ZIP, and callback context before the next phone call.',
  },
  {
    label: 'Setup model',
    value: 'Managed for you',
    detail: 'CallbackCloser handles the texting line, routing support, and activation checklist in one place.',
  },
  {
    label: 'Public trust',
    value: 'Visible and clear',
    detail: 'Privacy Policy, Terms & Conditions, Refund Policy, and SMS Consent stay public and easy to review.',
  },
];

const screenshotCards = [
  {
    label: 'Leads list',
    title: 'Recovered leads prioritized for callback',
    description: 'See new leads, urgency, location, and follow-up status in one clean queue.',
  },
  {
    label: 'Conversation detail',
    title: 'Full SMS thread with quick follow-up actions',
    description: 'Read the conversation, confirm what the caller needs, and move the lead forward fast.',
  },
  {
    label: 'Business settings',
    title: 'Activation checklist, routing, and owner alerts in one place',
    description: 'Keep routing, owner alerts, and launch status visible before your team depends on it.',
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
  'We set up your business texting line and missed-call follow-up so you can see the full flow clearly.',
  'We test the first text, lead questions, and handoff details with you before real callers rely on it.',
  'We confirm owner alerts and run a missed-call practice test before you go live.',
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
                  <Link className={buttonVariants({ size: 'lg' })} href={PUBLIC_START_FREE_PILOT_PATH}>
                    Start 14-Day Pilot
                  </Link>
                  <Link className={buttonVariants({ size: 'lg', variant: 'outline' })} href="/demo">
                    See Demo
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span className="rounded-full border bg-card px-3 py-1">Reply in seconds</span>
                  <span className="rounded-full border bg-card px-3 py-1">Recover more jobs</span>
                  <span className="rounded-full border bg-card px-3 py-1">Ready-to-close leads</span>
                  <span className="rounded-full border bg-card px-3 py-1">Less admin chasing</span>
                </div>
                <p className="text-base font-medium text-foreground">Close one extra job and this can pay for itself.</p>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Start a hands-on pilot and we&apos;ll help you get set up, test the missed-call text flow, and confirm owner
                  alerts before you go live.
                </p>
                <p className="text-sm text-muted-foreground">
                  Need a new owner login first?{' '}
                  <Link className="font-medium text-foreground underline underline-offset-4" href={PUBLIC_CREATE_ACCOUNT_PATH}>
                    Create account
                  </Link>
                </p>
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
                <div className="rounded-2xl border bg-background/80 p-4">
                  <p className="font-medium">Show the product in 30 seconds</p>
                  <p className="mt-2 text-muted-foreground">
                    Open the public demo to show the missed-call follow-up, owner alert, and dashboard handoff without login or setup.
                  </p>
                  <Link className={buttonVariants({ className: 'mt-4' })} href="/demo">
                    See Demo
                  </Link>
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
                CallbackCloser helps you reply faster, qualify the lead before you call back, and keep the setup clear before you put
                it in front of real customers.
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
                <CardTitle>14-Day Pilot</CardTitle>
                <CardDescription>Try CallbackCloser with hands-on setup before you rely on it with real customers.</CardDescription>
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
                    We help you test missed-call texting, owner alerts, and lead handoff before your team depends on it every day.
                  </p>
                </div>
                <div className="rounded-2xl border bg-background/80 p-5 text-sm text-muted-foreground">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">What the pilot covers</p>
                  <p className="mt-3 text-lg font-medium text-foreground">
                    A short pilot is the fastest way to confirm the system fits your team before you rely on it with real customers.
                  </p>
                  <div className="mt-4 space-y-2">
                    <p>- Missed-call texting and lead questions are tested with you.</p>
                    <p>- Owner alerts and callback summaries are verified before launch.</p>
                    <p>- Trust pages stay visible before activation.</p>
                  </div>
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
              A quick look at the product surfaces that keep missed-call follow-up organized for the owner and the office.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {screenshotCards.map((card) => (
              <Card key={card.label} className="overflow-hidden bg-card/90">
                <div className="aspect-[4/3] border-b bg-[linear-gradient(135deg,rgba(234,88,12,0.08),rgba(13,148,136,0.12),rgba(255,255,255,0.85))] p-6">
                  <div className="flex h-full flex-col justify-between rounded-2xl border border-dashed border-foreground/20 bg-background/70 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="outline">{card.label}</Badge>
                      <span className="text-xs text-muted-foreground">Inside CallbackCloser</span>
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
                <CardDescription>Pick the setup that matches your call volume, team size, and rollout pace.</CardDescription>
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
                    See pricing
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>Trust stays visible</CardTitle>
                <CardDescription>Review the details before you start your pilot or turn it on for customers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  CallbackCloser keeps pricing, refund, Privacy Policy, Terms &amp; Conditions, contact, and SMS Consent pages visible
                  before your business starts a pilot.
                </p>
                <p>
                  Your customers can also see clear SMS consent language, including STOP, START, HELP, message frequency, and
                  message/data rates.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <Link className={buttonVariants({ size: 'sm' })} href="/sms-consent">
                    Review SMS consent
                  </Link>
                  <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/privacy">
                    Privacy Policy &amp; Terms
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
