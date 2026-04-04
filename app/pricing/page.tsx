import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const starterFeatures = [
  'Missed-call capture and immediate text follow-up',
  'Lead qualification flow and protected dashboard access',
  'Owner summary texts once the lead is qualified',
  'Founder-led pilot onboarding and Twilio setup guidance',
];

const proFeatures = [
  'Everything in Starter',
  'Support for higher lead volume and rollout tuning',
  'Priority pilot onboarding help for live traffic cutover',
  'Closer collaboration on message flow and owner workflow fit',
];

const goLiveChecklist = [
  'Create your business record and set the owner notification phone',
  'Connect or buy your Twilio number and confirm forwarding',
  'Activate billing so live missed-call text follow-up can run',
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container space-y-10 py-12">
        <section className="max-w-3xl space-y-4">
          <Badge variant="outline">Founder-led pilots</Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Pricing for early pilot onboarding</h1>
          <p className="text-lg text-muted-foreground">
            CallbackCloser is currently sold through direct outreach and demos so each business can confirm fit, Twilio setup,
            owner notification routing, and rollout details before live traffic is turned on.
          </p>
          <p className="text-sm text-muted-foreground">
            Need current pilot pricing? Email{' '}
            <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
              support@callbackcloser.com
            </a>{' '}
            and we will walk you through the plan that matches your team before any Stripe checkout.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Starter</CardTitle>
              <CardDescription>For smaller service teams that want missed-call follow-up live quickly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {starterFeatures.map((feature) => (
                <p key={feature}>- {feature}</p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pro</CardTitle>
              <CardDescription>For teams that want more rollout support and higher-volume readiness.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {proFeatures.map((feature) => (
                <p key={feature}>- {feature}</p>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>What happens before go-live</CardTitle>
              <CardDescription>These are the same three steps used in the product during pilot setup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {goLiveChecklist.map((step, index) => (
                <div key={step} className="rounded-lg border bg-muted/30 p-4">
                  <p className="font-medium text-foreground">
                    {index + 1}. {step}
                  </p>
                </div>
              ))}
              <p>
                Live automated SMS follow-up is only intended to run after the Twilio number is connected and billing is active.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Trust and compliance</CardTitle>
              <CardDescription>Early pilots still need clear public surfaces and straightforward expectations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>CallbackCloser supports STOP, START, and HELP handling and keeps public terms, privacy, refund, and SMS consent pages visible.</p>
              <p>Businesses remain responsible for lawful texting practices and consent requirements in their market.</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link href="/contact">
                  <Button size="sm">Contact us</Button>
                </Link>
                <Link href="/sms-consent">
                  <Button size="sm" variant="outline">
                    Read SMS consent policy
                  </Button>
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

