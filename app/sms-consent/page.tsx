import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';

const EFFECTIVE_DATE = 'March 28, 2026';

export default function SmsConsentPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container py-12">
        <article className="mx-auto max-w-3xl space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">SMS Consent &amp; Opt-Out</h1>
            <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
          </header>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">How CallbackCloser SMS follow-up works</h2>
            <p className="text-sm text-muted-foreground">
              CallbackCloser is used by service businesses to follow up after a missed phone call, ask a few qualification questions,
              and help the owner respond faster. The exact message flow is controlled by the business using the platform.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">STOP, START, and HELP</h2>
            <p className="text-sm text-muted-foreground">
              CallbackCloser supports standard STOP-like opt-out commands, START or YES opt-back-in commands, and HELP responses.
              Outbound text delivery is suppressed for opted-out recipients until they opt back in.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Business responsibilities</h2>
            <p className="text-sm text-muted-foreground">
              Businesses using CallbackCloser are responsible for lawful use of text messaging, including the consent and contact
              practices required by their market, campaign type, and jurisdiction.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Questions</h2>
            <p className="text-sm text-muted-foreground">
              For questions about messaging practices, privacy, or account use, email{' '}
              <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
                support@callbackcloser.com
              </a>{' '}
              or review the{' '}
              <Link className="underline underline-offset-4" href="/privacy">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link className="underline underline-offset-4" href="/terms">
                Terms of Service
              </Link>
              .
            </p>
          </section>
        </article>
      </main>

      <PublicSiteFooter />
    </div>
  );
}

