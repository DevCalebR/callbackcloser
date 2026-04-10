import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';

const EFFECTIVE_DATE = 'April 5, 2026';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container py-12">
        <article className="mx-auto max-w-3xl space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Terms &amp; Conditions</h1>
            <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
          </header>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Service Scope</h2>
            <p className="text-sm text-muted-foreground">
              CallbackCloser provides automation tools for missed-call recovery workflows, including SMS qualification, owner notification, and lead tracking.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Acceptable Use</h2>
            <p className="text-sm text-muted-foreground">
              You are responsible for lawful use of the platform, including consent, opt-out compliance, and messaging rules required by your jurisdiction.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">SMS Messaging</h2>
            <p className="text-sm text-muted-foreground">
              CallbackCloser currently uses SMS for customer care, account notifications, missed call follow-up, and service updates.
              CallbackCloser is not presented on the public website as a promotional SMS marketing program.
            </p>
            <p className="text-sm text-muted-foreground">
              Public opt-in language is described on the{' '}
              <Link className="underline underline-offset-4" href="/sms-consent">
                SMS Consent
              </Link>{' '}
              page. Recipients can use STOP to opt out and HELP for help where messaging is active. Message frequency varies and
              message and data rates may apply.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Billing</h2>
            <p className="text-sm text-muted-foreground">
              Subscription charges are processed through Stripe. Plan changes and cancellations are handled through the billing portal when available for your account.
              If billing is inactive or past due, CallbackCloser may continue capturing missed-call leads while automated SMS follow-up stays paused.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Customer Responsibilities</h2>
            <p className="text-sm text-muted-foreground">
              You are responsible for accurate business phone routing, lawful messaging practices, honoring opt-out requests, and the
              accuracy of any call forwarding or notification numbers you configure.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Limitation of Liability</h2>
            <p className="text-sm text-muted-foreground">
              The service is provided as-is. CallbackCloser does not guarantee uninterrupted delivery or booking outcomes and is not liable for indirect or consequential damages arising from use of the platform.
            </p>
          </section>

          <footer className="text-sm text-muted-foreground">
            Questions: <a className="underline" href="mailto:support@callbackcloser.com">support@callbackcloser.com</a> ·{' '}
            <Link className="underline" href="/privacy">
              Privacy Policy
            </Link>{' '}
            ·{' '}
            <Link className="underline" href="/contact">
              Contact
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
