import Link from 'next/link';

const EFFECTIVE_DATE = 'March 2, 2026';

export default function TermsPage() {
  return (
    <main className="container py-12">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Service Scope</h2>
          <p className="text-sm text-muted-foreground">
            CallbackCloser provides automation tools for missed-call follow-up workflows, including SMS messaging and lead tracking.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Acceptable Use</h2>
          <p className="text-sm text-muted-foreground">
            You are responsible for lawful use of the platform, including consent, opt-out compliance, and messaging rules required by your jurisdiction.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Billing</h2>
          <p className="text-sm text-muted-foreground">
            Subscription charges are processed through Stripe. Plan changes and cancellations are handled through the billing portal.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Limitation of Liability</h2>
          <p className="text-sm text-muted-foreground">
            The service is provided as-is. CallbackCloser is not liable for indirect or consequential damages arising from use of the platform.
          </p>
        </section>

        <footer className="text-sm text-muted-foreground">
          Questions: <a className="underline" href="mailto:support@callbackcloser.com">support@callbackcloser.com</a> ·{' '}
          <Link className="underline" href="/">
            Back to home
          </Link>
        </footer>
      </article>
    </main>
  );
}
