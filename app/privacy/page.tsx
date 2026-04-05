import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';

const EFFECTIVE_DATE = 'March 2, 2026';

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
              We collect account details, call/message metadata, lead qualification responses, and billing-related identifiers needed to operate CallbackCloser.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">How We Use Data</h2>
            <p className="text-sm text-muted-foreground">
              Data is used to deliver automation workflows, surface leads in the dashboard, maintain service reliability, and support account operations.
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
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Pilot Operations</h2>
            <p className="text-sm text-muted-foreground">
              During founder-led pilots, CallbackCloser may review account setup details, webhook health, and recent lead activity to help diagnose launch issues.
              That access is limited to support and rollout needs.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Data Requests</h2>
            <p className="text-sm text-muted-foreground">
              For access, correction, or deletion requests, contact support and include your business name and account email.
            </p>
          </section>

          <footer className="text-sm text-muted-foreground">
            Contact: <a className="underline" href="mailto:support@callbackcloser.com">support@callbackcloser.com</a> · Founder-led pilot support ·{' '}
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
