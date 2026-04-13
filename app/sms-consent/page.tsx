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
const messageDetails = [
  'Message frequency varies.',
  'Message and data rates may apply.',
  'Reply STOP to opt out.',
  'Reply HELP for help.',
];

export default function SmsConsentPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container py-12">
        <article className="mx-auto max-w-4xl space-y-8">
          <header className="max-w-2xl space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">SMS Consent</h1>
            <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
            <p className="text-base text-muted-foreground">
              Enter your phone number to receive SMS updates related to missed call follow-up, callback coordination, service-related
              questions, and account or service updates.
            </p>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
            <PublicSmsConsentForm />

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>What to expect</CardTitle>
                  <CardDescription>CallbackCloser uses text messages to keep service conversations moving after a missed call.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="grid gap-2 sm:grid-cols-2">
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
                  <CardTitle>Message details</CardTitle>
                  <CardDescription>Consent requires an unchecked checkbox and a phone number before submission.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {messageDetails.map((item) => (
                    <p key={item}>- {item}</p>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Related trust pages</CardTitle>
                  <CardDescription>Review the policies connected to CallbackCloser messaging and service use.</CardDescription>
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

              <p className="text-sm text-muted-foreground">
                Need help? Email{' '}
                <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
                  support@callbackcloser.com
                </a>
                .
              </p>
            </div>
          </section>
        </article>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
