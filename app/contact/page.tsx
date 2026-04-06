import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const outreachInputs = [
  'Business name and service type',
  'Primary service area or ZIP codes served',
  'Approximate missed-call volume or after-hours load',
  'Whether you already use Twilio or need number setup help',
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container space-y-8 py-12">
        <section className="max-w-3xl space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight">Contact CallbackCloser</h1>
          <p className="text-lg text-muted-foreground">
            CallbackCloser is currently onboarded founder-to-founder. If you run a local service business and want to see how
            missed-call recovery, SMS qualification, and owner alerts would work for your team, email us and we will walk through fit,
            setup, and pilot rollout.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Best contact path</CardTitle>
              <CardDescription>Use email so we can review your workflow and reply with the right next steps.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Email:{' '}
                <a className="font-medium text-foreground underline underline-offset-4" href="mailto:support@callbackcloser.com">
                  support@callbackcloser.com
                </a>
              </p>
              <p>If you are already ready to try the product, you can also create an account and complete the in-app setup flow.</p>
              <p>If you are an active pilot customer, include your business name, Twilio number, and the recent call or SMS time when reporting an issue.</p>
              <p>
                For SMS consent, STOP or HELP behavior, or public trust-page questions, email support and reference{' '}
                <span className="font-medium text-foreground">callbackcloser.com</span> so we can match the request to the live pilot setup.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link className={buttonVariants()} href="/sign-up">
                  Start pilot onboarding
                </Link>
                <Link className={buttonVariants({ variant: 'outline' })} href="/pricing">
                  View pricing
                </Link>
                <Link className={buttonVariants({ variant: 'ghost' })} href="/sms-consent">
                  Review SMS consent
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Helpful details to include</CardTitle>
              <CardDescription>This helps us tell you quickly whether CallbackCloser is a good fit for your pilot.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {outreachInputs.map((item) => (
                <p key={item}>- {item}</p>
              ))}
              <p className="pt-2">
                Public trust pages: <Link className="underline underline-offset-4" href="/privacy">Privacy</Link>,{' '}
                <Link className="underline underline-offset-4" href="/terms">Terms</Link>, and{' '}
                <Link className="underline underline-offset-4" href="/sms-consent">SMS Consent</Link>.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
