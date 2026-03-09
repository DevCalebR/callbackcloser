import Link from 'next/link';

const EFFECTIVE_DATE = 'March 2, 2026';
const SUPPORT_EMAIL = 'support@callbackcloser.com';

export default function ContactPage() {
  return (
    <main className="container py-12">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Contact</h1>
          <p className="text-sm text-muted-foreground">Effective date: {EFFECTIVE_DATE}</p>
        </header>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Support</h2>
          <p className="text-sm text-muted-foreground">
            Email <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and include your business name, account email, and a brief description of your request.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Billing and Refund Questions</h2>
          <p className="text-sm text-muted-foreground">
            Include the charge date, last 4 digits of the card (if available), and any relevant Stripe receipt details.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Privacy Requests</h2>
          <p className="text-sm text-muted-foreground">
            For data access, correction, or deletion requests, include your account email and business identifier so we can verify ownership.
          </p>
        </section>

        <footer className="text-sm text-muted-foreground">
          <Link className="underline" href="/">
            Back to home
          </Link>
        </footer>
      </article>
    </main>
  );
}
