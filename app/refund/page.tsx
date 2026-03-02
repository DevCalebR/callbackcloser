import Link from 'next/link';

const EFFECTIVE_DATE = 'March 2, 2026';

export default function RefundPolicyPage() {
  return (
    <main className="container py-12">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Refund Policy</h1>
          <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Subscription Charges</h2>
          <p className="text-sm text-muted-foreground">
            CallbackCloser is billed as a recurring subscription through Stripe. Charges apply according to your selected plan and billing cycle.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Cancellation Timing</h2>
          <p className="text-sm text-muted-foreground">
            You may cancel at any time. Cancellation stops future renewals and access continues through the current paid period unless otherwise stated.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Refund Requests</h2>
          <p className="text-sm text-muted-foreground">
            Refunds are reviewed case-by-case for duplicate billing, platform defects, or accidental charges. Approved refunds are issued to the original payment method.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">How to Request</h2>
          <p className="text-sm text-muted-foreground">
            Email support with your account email, business name, charge date, and the reason for your request.
          </p>
        </section>

        <footer className="text-sm text-muted-foreground">
          Support: <a className="underline" href="mailto:support@callbackcloser.com">support@callbackcloser.com</a> ·{' '}
          <Link className="underline" href="/">
            Back to home
          </Link>
        </footer>
      </article>
    </main>
  );
}
