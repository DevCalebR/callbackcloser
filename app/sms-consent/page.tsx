import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicSmsConsentForm } from '@/components/public-sms-consent-form';
import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const EFFECTIVE_DATE = 'April 5, 2026';

export const metadata: Metadata = {
  title: 'SMS Consent | CallbackCloser',
  description: 'Learn how CallbackCloser collects SMS consent for missed call follow-up, callback coordination, customer care, and account updates.',
};

const messageTypes = ['Missed call follow-up', 'Callback coordination', 'Service-related questions', 'Customer care', 'Account notifications'];

const expectations = [
  'You enter your phone number and choose whether to receive text updates.',
  'The consent checkbox starts unchecked and must be selected before the form can be submitted.',
  'Message frequency varies based on the missed-call follow-up or service conversation.',
  'Message and data rates may apply depending on your mobile plan.',
  'Reply STOP at any time to opt out of future messages, or HELP for help.',
];

export default function SmsConsentPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container py-12">
        <article className="mx-auto max-w-5xl space-y-8">
          <header className="max-w-3xl space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">SMS Consent</h1>
            <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
            <p className="text-base text-muted-foreground">
              Use this page to understand how CallbackCloser collects consent for SMS updates tied to missed call follow-up, callback
              coordination, service-related questions, customer care, and account notifications.
            </p>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>What you&apos;re signing up for</CardTitle>
                  <CardDescription>CallbackCloser uses text messages to keep missed-call recovery and service communication moving.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Customers who provide their phone number and agree to receive messages can get updates related to missed call
                    follow-up, callback coordination, service questions, customer care, and account or service notifications.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {messageTypes.map((type) => (
                      <div key={type} className="rounded-lg border bg-muted/30 px-4 py-3">
                        <p className="font-medium text-foreground">{type}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>What to expect</CardTitle>
                  <CardDescription>These disclosures stay visible before someone agrees to receive SMS messages.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {expectations.map((item) => (
                    <p key={item}>- {item}</p>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Your choices</CardTitle>
                  <CardDescription>Consent is optional, and you can change your choice any time a text conversation is active.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>Reply STOP to opt out of future messages.</p>
                  <p>Reply HELP for help or email support@callbackcloser.com.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Related trust pages</CardTitle>
                  <CardDescription>Review the public policies connected to CallbackCloser messaging and service use.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3 text-sm">
                  <Link className="underline underline-offset-4" href="/privacy">
                    Privacy Policy
                  </Link>
                  <Link className="underline underline-offset-4" href="/terms">
                    Terms &amp; Conditions
                  </Link>
                  <Link className="underline underline-offset-4" href="/contact">
                    Contact
                  </Link>
                </CardContent>
              </Card>

              <section className="space-y-2 rounded-2xl border bg-muted/20 p-5">
                <h2 className="text-xl font-semibold">Need help?</h2>
                <p className="text-sm text-muted-foreground">
                  If you have questions about CallbackCloser messaging, support, or account updates, email{' '}
                  <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
                    support@callbackcloser.com
                  </a>
                  .
                </p>
              </section>
            </div>

            <PublicSmsConsentForm />
          </section>
        </article>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
