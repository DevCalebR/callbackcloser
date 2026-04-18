import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';

const EFFECTIVE_DATE = 'April 5, 2026';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container py-12">
        <article className="mx-auto max-w-3xl space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
          </header>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Information We Collect</h2>
            <p className="text-sm text-muted-foreground">
              We collect account details, business contact details, call and message metadata, missed-call records, lead qualification
              responses, SMS conversation content, and billing-related identifiers needed to operate CallbackCloser.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">How We Use Data</h2>
            <p className="text-sm text-muted-foreground">
              Data is used to support callback coordination, customer support, service updates, account or service notifications,
              lead visibility in the dashboard, service reliability, and account operations.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">SMS And Customer Communications</h2>
            <p className="text-sm text-muted-foreground">
              CallbackCloser may process phone numbers, missed-call records, and SMS conversation content to provide callback
              coordination, customer support, service updates, and account or service notifications related to a user&apos;s request.
            </p>
            <p className="text-sm text-muted-foreground">
              Message frequency varies by conversation. Message and data rates may apply. Recipients can reply STOP to opt out or HELP
              for help where SMS messaging is active.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Service Providers</h2>
            <p className="text-sm text-muted-foreground">
              CallbackCloser relies on service providers such as Twilio, Stripe, Clerk, and Neon to handle messaging, billing, authentication,
              and database hosting. Those providers process the data required for their part of the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Data Sharing</h2>
            <p className="text-sm text-muted-foreground">
              CallbackCloser uses service providers (for example Twilio, Stripe, Clerk, and Neon) solely to provide the platform. We do not sell your data.
            </p>
            <p className="text-sm text-muted-foreground">
              CallbackCloser does not sell mobile numbers or share mobile numbers with third parties for their own marketing purposes.
              Mobile numbers are disclosed to service providers only as needed to operate the CallbackCloser service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Pilot Operations</h2>
            <p className="text-sm text-muted-foreground">
              During white-glove launch periods, CallbackCloser may review account setup details, webhook health, and recent lead
              activity to diagnose rollout issues. That access is limited to support and operational launch needs.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Data Requests</h2>
            <p className="text-sm text-muted-foreground">
              For access, correction, or deletion requests, contact support@callbackcloser.com and include your business name and
              account email.
            </p>
          </section>

          <footer className="text-sm text-muted-foreground">
            Contact: <a className="underline" href="mailto:support@callbackcloser.com">support@callbackcloser.com</a> ·{' '}
            <Link className="underline" href="/sms-consent">
              SMS Consent
            </Link>{' '}
            ·{' '}
            <Link className="underline" href="/terms">
              Terms &amp; Conditions
            </Link>{' '}
            ·{' '}
            <Link className="underline" href="/">
              Back to home
            </Link>
          </footer>
        </article>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
