import Link from 'next/link';

import { PublicSmsConsentForm } from '@/components/public-sms-consent-form';
import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const EFFECTIVE_DATE = 'April 5, 2026';

const messageTypes = ['Callback coordination', 'Customer support', 'Service updates', 'Account and service notifications'];

const expectations = [
  'Message frequency varies based on the callback or support conversation.',
  'Message and data rates may apply depending on the recipient mobile plan.',
  'Reply STOP at any time to opt out of future messages.',
  'Reply HELP for help or contact support@callbackcloser.com.',
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
              This page explains the public SMS consent language used by CallbackCloser for website-based opt-in during founder-led
              pilots. It is intended for callback coordination, customer support, service updates, and account or service notifications.
            </p>
          </header>

          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>What users are opting into</CardTitle>
                  <CardDescription>CallbackCloser uses SMS to keep callback and service conversations moving.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    By providing a phone number and submitting the web form below, the user agrees to receive SMS messages from
                    CallbackCloser related to callback coordination, customer support, service updates, and account or service
                    notifications.
                  </p>
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
                  <CardTitle>What to expect</CardTitle>
                  <CardDescription>These are the disclosures reviewers and customers should see in one place.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {expectations.map((item) => (
                    <p key={item}>- {item}</p>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Related public pages</CardTitle>
                  <CardDescription>Twilio reviewers and pilot customers should be able to reach the trust pages directly.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3 text-sm">
                  <Link className="underline underline-offset-4" href="/privacy">
                    Privacy Policy
                  </Link>
                  <Link className="underline underline-offset-4" href="/terms">
                    Terms of Service
                  </Link>
                  <Link className="underline underline-offset-4" href="/contact">
                    Contact
                  </Link>
                </CardContent>
              </Card>

              <section className="space-y-2">
                <h2 className="text-xl font-semibold">Business responsibilities</h2>
                <p className="text-sm text-muted-foreground">
                  Businesses using CallbackCloser remain responsible for lawful use of text messaging, including the consent and
                  contact practices required by their market, campaign type, and jurisdiction. CallbackCloser does not claim that this
                  page replaces legal advice.
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
