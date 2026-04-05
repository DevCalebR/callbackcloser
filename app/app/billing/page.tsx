import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import { getPortfolioDemoBlockedCount, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getConversationUsageForBusiness, resolveUsageTierFromSubscription } from '@/lib/usage';
import {
  describeAutomationBlockReason,
  formatUsageSummary,
  formatUsageTierLabel,
  resolveAutomationBlockReason,
} from '@/lib/usage-visibility';

function planPrice(priceId: string | undefined) {
  return priceId ? 'Exact charge is shown in Stripe checkout for this environment.' : 'Billing is not configured in this environment.';
}

function parseRequestedPlan(searchParams?: Record<string, string | string[] | undefined>) {
  const rawPlan = searchParams?.plan;
  const normalized = typeof rawPlan === 'string' ? rawPlan.trim().toLowerCase() : '';
  if (normalized === 'starter' || normalized === 'pro') return normalized;
  return null;
}

export default async function BillingPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const starterPriceId = process.env.STRIPE_PRICE_STARTER;
  const proPriceId = process.env.STRIPE_PRICE_PRO;
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const checkout = typeof searchParams?.checkout === 'string' ? searchParams.checkout : undefined;
  const requestedPlan = parseRequestedPlan(searchParams);
  const billingAccess = getBusinessBillingAccessState(business);
  const subscriptionActive = billingAccess.billingActive;
  const checkoutSucceeded = checkout === 'success';
  const checkoutCanceled = checkout === 'canceled';
  const demoMode = isPortfolioDemoMode();
  const [blockedCount, usage] = demoMode
    ? [getPortfolioDemoBlockedCount(), null]
    : await Promise.all([
        db.lead.count({ where: { businessId: business.id, billingRequired: true } }),
        getConversationUsageForBusiness(business),
      ]);
  const usageTierLabel = formatUsageTierLabel(resolveUsageTierFromSubscription(business));
  const usageSummary = usage ? formatUsageSummary(usage) : 'Unavailable in portfolio demo mode.';
  const automationBlockReason = resolveAutomationBlockReason({
    blockedCount,
    subscriptionStatus: business.subscriptionStatus,
    billingActive: billingAccess.billingActive,
    usage,
  });
  const automationStatusMessage = describeAutomationBlockReason(automationBlockReason, {
    blockedCount,
    usage: usage ?? undefined,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Stripe controls whether new missed-call leads receive automated SMS follow-up. Exact pricing is confirmed in Stripe checkout.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Need the public-facing overview?{' '}
          <Link className="underline underline-offset-4" href="/pricing">
            Pricing
          </Link>{' '}
          ·{' '}
          <Link className="underline underline-offset-4" href="/refund">
            Refund policy
          </Link>{' '}
          ·{' '}
          <Link className="underline underline-offset-4" href="/contact">
            Contact
          </Link>
        </p>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {billingAccess.founderBillingBypassActive ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950">
          Founder-only billing bypass is active for this founder-owned business. CallbackCloser will allow missed-call SMS automation
          for smoke testing without a live Stripe charge. Normal customer accounts still require real active billing.
        </div>
      ) : null}
      {requestedPlan ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          Selected plan: <strong>{requestedPlan === 'starter' ? 'Starter' : 'Pro'}</strong>. Continue checkout below.
        </div>
      ) : null}
      {checkoutSucceeded && billingAccess.rawSubscriptionActive ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Subscription is active. Next steps: connect your Twilio number in{' '}
          <Link className="underline underline-offset-4" href="/app/settings">
            Business Settings
          </Link>
          , then monitor new leads in{' '}
          <Link className="underline underline-offset-4" href="/app/leads">
            Dashboard
          </Link>
          .
        </div>
      ) : null}
      {checkoutSucceeded && !billingAccess.rawSubscriptionActive ? (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p>Stripe checkout completed. Subscription status is still syncing from webhook events.</p>
          <p className="text-muted-foreground">
            If this does not update shortly, refresh this page and verify `STRIPE_WEBHOOK_SECRET` and the Stripe webhook endpoint configuration.
          </p>
          <div>
            <Link href="/app/billing">
              <Button size="sm" variant="outline">
                Refresh Status
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
      {checkoutCanceled ? <div className="rounded-md border bg-muted/40 p-3 text-sm">Checkout canceled. You can restart anytime below.</div> : null}
      {!subscriptionActive && !checkoutSucceeded ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Billing is not active yet. Missed calls can still be captured, but automated SMS follow-up stays paused until Stripe marks the subscription active.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Current Subscription</CardTitle>
          <CardDescription>Status is synced from Stripe webhook events, not just the browser redirect.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={business.subscriptionStatus === 'ACTIVE' ? 'success' : 'outline'}>
            {business.subscriptionStatus.toLowerCase()}
          </Badge>
          {billingAccess.founderBillingBypassActive ? <Badge variant="outline">founder_bypass_active</Badge> : null}
          <Badge variant="outline">{usageTierLabel}</Badge>
          <span className="text-muted-foreground">Usage: {usageSummary}</span>
          {business.stripeCustomerId ? <span className="text-muted-foreground">Customer: {business.stripeCustomerId}</span> : null}
          {business.stripeSubscriptionId ? <span className="text-muted-foreground">Subscription: {business.stripeSubscriptionId}</span> : null}
          {billingAccess.founderBillingBypassActive ? (
            <span className="text-muted-foreground">Stripe status remains {business.subscriptionStatus.toLowerCase()} while the founder override is enabled.</span>
          ) : null}
        </CardContent>
      </Card>

      <Card className={automationBlockReason === 'none' ? 'border-accent/40 bg-accent/20' : 'border-destructive/30 bg-destructive/5'}>
        <CardHeader>
          <CardTitle>Automation Status</CardTitle>
          <CardDescription>Why missed-call follow-up is running or paused.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{automationStatusMessage}</p>
          {automationBlockReason !== 'none' ? (
            <Link
              href="#plan-options"
              className="inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Upgrade Plan
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <div id="plan-options" className="grid gap-6 md:grid-cols-2">
        <Card className={requestedPlan === 'starter' ? 'border-primary/40 bg-primary/5' : ''}>
          <CardHeader>
            <CardTitle>Starter</CardTitle>
            <CardDescription>Missed-call recovery, SMS qualification, owner alerts, and dashboard access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{planPrice(starterPriceId)}</p>
            <p className="text-muted-foreground">Best for smaller pilot volumes.</p>
          </CardContent>
          <CardFooter>
            <form action="/api/stripe/checkout" method="post" className="w-full">
              <input type="hidden" name="priceId" value={starterPriceId ?? ''} />
              <Button type="submit" className="w-full" disabled={!starterPriceId}>
                Start Starter Pilot
              </Button>
            </form>
          </CardFooter>
        </Card>

        <Card className={requestedPlan === 'pro' ? 'border-primary/40 bg-primary/5' : ''}>
          <CardHeader>
            <CardTitle>Pro</CardTitle>
            <CardDescription>Higher conversation volume and closer rollout support.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{planPrice(proPriceId)}</p>
            <p className="text-muted-foreground">Best for teams that need more pilot capacity.</p>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <form action="/api/stripe/checkout" method="post" className="w-full">
              <input type="hidden" name="priceId" value={proPriceId ?? ''} />
              <Button type="submit" className="w-full" disabled={!proPriceId}>
                Start Pro Pilot
              </Button>
            </form>
            {business.stripeCustomerId ? (
              <form action="/api/stripe/portal" method="post" className="w-full">
                <Button type="submit" variant="outline" className="w-full">
                  Open Billing Portal
                </Button>
              </form>
            ) : null}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
