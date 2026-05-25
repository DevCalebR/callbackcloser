import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PUBLIC_CREATE_ACCOUNT_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';

const pricingPlans = [
  {
    name: 'Starter',
    summary: 'For owner-operators who want missed calls turning back into paying jobs quickly.',
    details: [
      'Includes one business texting number',
      'Includes standard setup and managed provisioning',
      'Text missed callers before they move on',
      'Get a qualified lead instead of a dead voicemail',
      'See recovered leads and follow-up status clearly',
      'White-glove pilot onboarding to get live quickly',
    ],
  },
  {
    name: 'Growth',
    summary: 'For growing service teams that need to protect more revenue from missed calls.',
    details: [
      'Everything in Starter',
      'Optional extra numbers and rollout help',
      'More follow-up capacity for busier inbound volume',
      'Priority rollout help so missed calls stay covered',
      'Clear billing visibility as usage grows',
    ],
  },
  {
    name: 'Agency / Multi-location',
    summary: 'For operators covering multiple locations, brands, or client accounts.',
    details: [
      'Multi-location rollout planning',
      'Hands-on guidance for multiple phone lines and routing',
      'Custom onboarding and launch sequencing',
      'Contact sales before activation',
    ],
  },
];

const clarityPoints = [
  'See your current plan, next billing date, and usage clearly inside the app.',
  'If billing is inactive, you still see captured leads while auto-texting is paused.',
  'If usage is capped, the app tells you plainly instead of leaving you guessing.',
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
            CallbackCloser is priced so business owners can understand the value quickly: protect more missed-call revenue without adding more office admin.
          </p>
          <p className="text-sm text-muted-foreground">
            CallbackCloser keeps the public structure simple: Starter, Growth, and Agency / Multi-location. Base service includes one
            business texting number, standard setup, and managed provisioning. If you want rollout help before checkout, email{' '}
            <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
              support@callbackcloser.com
            </a>
            . Founder-run customer pilot setup is separate from public signup.
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
                    <Link className={buttonVariants()} href={PUBLIC_START_FREE_PILOT_PATH}>
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
                <CardDescription>The billing page is designed to remove the fear of hidden costs and surprise pauses.</CardDescription>
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
              <CardDescription>Trust stays visible without turning the page into policy copy.</CardDescription>
              </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Public pricing, contact, Privacy Policy, Terms &amp; Conditions, refund, and SMS Consent pages remain visible before activation.</p>
              <p>STOP, START, and HELP handling remain part of the live messaging flow, and the consent page stays public.</p>
              <p>Businesses remain responsible for lawful texting practices and consent requirements in their market.</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={PUBLIC_CREATE_ACCOUNT_PATH}>
                  Create account
                </Link>
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
