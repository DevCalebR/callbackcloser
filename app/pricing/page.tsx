import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const pricingPlans = [
  {
    name: 'Starter',
    summary: 'For owner-operators who need missed-call recovery live fast.',
    details: [
      'Missed-call capture and fast SMS follow-up',
      'Lead qualification and owner alert handoff',
      'Protected leads dashboard and billing visibility',
      'White-glove pilot onboarding to get live cleanly',
    ],
  },
  {
    name: 'Growth',
    summary: 'For growing service teams that need more follow-up capacity and clearer handoff management.',
    details: [
      'Everything in Starter',
      'Higher conversation capacity for busier inbound volume',
      'Priority rollout help for phone routing and notification tuning',
      'Clearer billing visibility and upgrade path as usage grows',
    ],
  },
  {
    name: 'Agency / Multi-location',
    summary: 'For operators running multiple locations, brands, or client accounts.',
    details: [
      'Multi-location rollout planning',
      'Packaging guidance for multiple phone flows',
      'Custom onboarding and deployment sequencing',
      'Contact sales before activation',
    ],
  },
];

const clarityPoints = [
  'Current plan, next billing date, usage, and portal access live inside the app.',
  'If billing is inactive, lead capture can remain visible while automated SMS follow-up is paused.',
  'If usage caps are reached, the app warns clearly instead of hiding the state.',
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container space-y-10 py-12">
        <section className="max-w-3xl space-y-4">
          <Badge variant="outline">Transparent packaging</Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Simple pricing for missed-call recovery</h1>
          <p className="text-lg text-muted-foreground">
            CallbackCloser is packaged so owners can understand the rollout path, the plan tiers, and the billing expectations quickly.
          </p>
          <p className="text-sm text-muted-foreground">
            Exact checkout pricing is still confirmed in Stripe for this environment, but the public structure stays simple:
            Starter, Growth, and Agency / Multi-location. If you want rollout help before checkout, email{' '}
            <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
              support@callbackcloser.com
            </a>
            .
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          {pricingPlans.map((plan) => (
            <Card key={plan.name} className="bg-card/90">
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {plan.details.map((detail) => (
                  <p key={detail}>- {detail}</p>
                ))}
                <div className="pt-3">
                  {plan.name === 'Agency / Multi-location' ? (
                    <Link className={buttonVariants({ variant: 'outline' })} href="/contact">
                      Contact Sales
                    </Link>
                  ) : (
                    <Link className={buttonVariants()} href="/sign-up">
                      Start Free Pilot
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Billing clarity inside the app</CardTitle>
              <CardDescription>The in-app billing page is designed to remove fear of hidden telecom costs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {clarityPoints.map((point) => (
                <div key={point} className="rounded-2xl border bg-background/80 p-4">
                  {point}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Trust and compliance</CardTitle>
              <CardDescription>Premium presentation does not mean hiding the guardrails.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Public pricing, contact, privacy, terms, refund, and SMS consent pages remain visible before activation.</p>
              <p>STOP, START, and HELP handling remain part of the live messaging flow, and the consent page stays public.</p>
              <p>Businesses remain responsible for lawful texting practices and consent requirements in their market.</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link className={buttonVariants({ size: 'sm' })} href="/sms-consent">
                  Review SMS consent
                </Link>
                <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/contact">
                  Talk to us
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
