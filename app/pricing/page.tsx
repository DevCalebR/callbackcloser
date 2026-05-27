import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PUBLIC_CREATE_ACCOUNT_PATH, PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';

const pilotFeatures = [
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
  { href: '/refund', label: 'Refund Policy' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/sms-consent', label: 'SMS Consent' },
  { href: '/contact', label: 'Contact' },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container space-y-10 py-12">
        <section className="max-w-3xl space-y-4">
          <Badge variant="outline">Pricing</Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Start with a 14-day pilot</h1>
          <p className="text-lg text-muted-foreground">
            CallbackCloser is currently offered as a hands-on pilot for local service businesses that want missed-call recovery set up for them.
          </p>
          <p className="text-sm text-muted-foreground">
            We keep the offer straightforward: you try the simulator, create your account, we handle the setup, and we notify you when your Lead Recovery Command Center is ready.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>Early pilot pricing</CardTitle>
              <CardDescription>
                Early pilot pricing starts at $50 for the first 14 days to cover setup, texting, and usage while we prove the system can recover leads for your business.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {pilotFeatures.map((feature) => (
                <p key={feature}>- {feature}</p>
              ))}
              <div className="flex flex-wrap gap-3 pt-4">
                <Link className={buttonVariants()} href={PUBLIC_START_FREE_PILOT_PATH}>
                  Start 14-day pilot
                </Link>
                <Link className={buttonVariants({ variant: 'outline' })} href="/simulator">
                  Try the missed-call simulator
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>What the pilot includes</CardTitle>
              <CardDescription>Built for a founder-run, done-for-you setup instead of an unfinished DIY rollout.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-2xl border bg-background/80 p-4">
                We prepare the texting flow, confirm the first qualification handoff, and keep the launch status visible before you rely on it.
              </div>
              <div className="rounded-2xl border bg-background/80 p-4">
                Your workspace stays on a setup-in-progress view until the system is ready. Then we notify you and unlock the full dashboard.
              </div>
              <div className="rounded-2xl border bg-background/80 p-4">
                If you need multi-location rollout help or a custom setup path, contact us before activation so the pilot matches your operating model.
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link className={buttonVariants({ size: 'sm' })} href={PUBLIC_CREATE_ACCOUNT_PATH}>
                  Create account
                </Link>
                <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/contact">
                  Talk to us
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Why the pilot is structured this way</CardTitle>
              <CardDescription>The offer is designed to feel clear and founder-operated, not like unfinished plan cards.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>We keep the setup managed so you are not asked to run a phone-system project on day one.</p>
              <p>The simulator shows the full customer experience before you commit.</p>
              <p>If the pilot proves the missed-call recovery flow is working for your business, we can continue from there with real billing inside the app.</p>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Trust and compliance</CardTitle>
              <CardDescription>Important public pages stay visible without crowding the main offer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>STOP, START, and HELP handling remain part of the live messaging flow, and the consent page stays public.</p>
              <p>Privacy, terms, refund, and contact information remain available before activation.</p>
              <div className="flex flex-wrap gap-3 pt-2">
                {trustLinks.map((link) => (
                  <Link key={link.href} className={buttonVariants({ size: 'sm', variant: 'outline' })} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
