import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicSmsConsentForm } from '@/components/public-sms-consent-form';
import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const EFFECTIVE_DATE = 'April 5, 2026';

export const metadata: Metadata = {
  title: 'SMS Consent | CallbackCloser',
  description:
    'CallbackCloser uses SMS messaging to respond to customer inquiries and provide service-related updates.',
};

const messageExamples = ['Callback coordination', 'Customer support', 'Service-related questions', 'Status updates', 'Account or service notifications'];
const requiredDisclosures = [
  'Message frequency varies.',
  'Message and data rates may apply.',
  'Reply STOP to opt out.',
  'Reply HELP for help.',
  'Contact: support@callbackcloser.com',
];

export default function SmsConsentPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container py-12">
        <article className="mx-auto max-w-4xl space-y-8">
          <header className="max-w-3xl space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">SMS Consent</h1>
            <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
            <p className="text-base text-muted-foreground">
              CallbackCloser uses SMS messaging to respond to customer inquiries and provide service-related updates.
            </p>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
            <PublicSmsConsentForm />

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Consent explanation</CardTitle>
                  <CardDescription>
                    By providing a phone number and agreeing to the disclosure, the user consents to receive SMS messages from
                    CallbackCloser related to callback coordination, customer support, service updates, and account or service
                    notifications related to the user&apos;s request.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Consent to receive SMS messages is not a condition of purchase.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>These messages may include</CardTitle>
                  <CardDescription>CallbackCloser uses SMS for coordination, support, and service-related communication tied to a request.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  {messageExamples.map((item) => (
                    <div key={item} className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                      <p className="font-medium text-foreground">{item}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Required disclosures</CardTitle>
                  <CardDescription>These terms apply to service-related SMS messages sent by CallbackCloser.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {requiredDisclosures.map((item) => (
                    <p key={item}>- {item}</p>
                  ))}
                </CardContent>
              </Card>

              <div className="rounded-2xl border bg-card/80 p-5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Related policies</p>
                <p className="mt-2">
                  Review our{' '}
                  <Link className="underline underline-offset-4" href="/privacy">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link className="underline underline-offset-4" href="/terms">
                    Terms &amp; Conditions
                  </Link>
                  .
                </p>
              </div>
            </div>
          </section>
        </article>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
