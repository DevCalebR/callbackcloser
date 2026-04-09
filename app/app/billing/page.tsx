import Link from 'next/link';
import type Stripe from 'stripe';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import { getManagedTextingNumber } from '@/lib/managed-twilio';
import { getPortfolioDemoBlockedCount, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getBillingDisplayLabel } from '@/lib/system-status';
import { getStripe } from '@/lib/stripe';
import { BILLING_TIME_ZONE, getConversationUsageForBusiness, getCurrentMonthWindowUtc, resolveUsageTierFromSubscription } from '@/lib/usage';
import {
  describeAutomationBlockReason,
  formatUsageSummary,
  formatUsageTierLabel,
  resolveAutomationBlockReason,
} from '@/lib/usage-visibility';

function formatDate(value: Date | null | undefined) {
  if (!value) return 'Unavailable';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: BILLING_TIME_ZONE,
  }).format(value);
}

function planPrice(priceId: string | undefined) {
  return priceId ? 'Exact price is confirmed in Stripe checkout for this environment.' : 'Billing is not configured in this environment.';
}

function parseRequestedPlan(searchParams?: Record<string, string | string[] | undefined>) {
  const rawPlan = typeof searchParams?.plan === 'string' ? searchParams.plan.trim().toLowerCase() : '';
  if (rawPlan === 'starter') return 'starter' as const;
  if (rawPlan === 'growth' || rawPlan === 'pro') return 'growth' as const;
  return null;
}

function formatPaymentMethod(paymentMethod: Stripe.PaymentMethod | null | undefined) {
  if (!paymentMethod) return 'Open Stripe Billing Portal to confirm payment method';
  if (paymentMethod.type === 'card' && paymentMethod.card) {
    return `${paymentMethod.card.brand.toUpperCase()} ending in ${paymentMethod.card.last4}`;
  }
  return paymentMethod.type.replace(/_/g, ' ');
}

async function getStripeBillingSnapshot(business: { stripeSubscriptionId: string | null; stripeCustomerId: string | null; stripePriceId: string | null }) {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!business.stripeSubscriptionId && !business.stripeCustomerId) return null;

  try {
    const stripe = getStripe();
    const subscription = business.stripeSubscriptionId
      ? await stripe.subscriptions.retrieve(business.stripeSubscriptionId, {
          expand: ['default_payment_method', 'items.data.price'],
        })
      : null;
    const customer = business.stripeCustomerId
      ? await stripe.customers.retrieve(business.stripeCustomerId, {
          expand: ['invoice_settings.default_payment_method'],
        })
      : null;

    const paymentMethodFromSubscription =
      subscription && subscription.default_payment_method && typeof subscription.default_payment_method === 'object'
        ? (subscription.default_payment_method as Stripe.PaymentMethod)
        : null;
    const paymentMethodFromCustomer =
      customer &&
      !('deleted' in customer && customer.deleted) &&
      customer.invoice_settings.default_payment_method &&
      typeof customer.invoice_settings.default_payment_method === 'object'
        ? (customer.invoice_settings.default_payment_method as Stripe.PaymentMethod)
        : null;
    const paymentMethod = paymentMethodFromSubscription ?? paymentMethodFromCustomer;
    const currentPrice = subscription?.items.data[0]?.price ?? null;
    const nextChargeTimestamp = subscription?.items.data[0]?.current_period_end ?? null;

    return {
      nextChargeDate: nextChargeTimestamp ? new Date(nextChargeTimestamp * 1000) : null,
      paymentMethodLabel: formatPaymentMethod(paymentMethod),
      stripePlanLabel: currentPrice?.nickname || currentPrice?.lookup_key || currentPrice?.id || business.stripePriceId || null,
    };
  } catch (error) {
    return {
      nextChargeDate: null,
      paymentMethodLabel: error instanceof Error ? `Unavailable in app (${error.message})` : 'Unavailable in app',
      stripePlanLabel: business.stripePriceId || null,
    };
  }
}

function mapPlanLabel(input: string | null | undefined, priceId: string | null | undefined, env: NodeJS.ProcessEnv) {
  if (!input && !priceId) return 'No active plan';
  if (priceId && env.STRIPE_PRICE_STARTER && priceId === env.STRIPE_PRICE_STARTER) return 'Starter';
  if (priceId && env.STRIPE_PRICE_PRO && priceId === env.STRIPE_PRICE_PRO) return 'Growth';
  if (input?.toLowerCase().includes('starter')) return 'Starter';
  if (input?.toLowerCase().includes('pro') || input?.toLowerCase().includes('growth')) return 'Growth';
  return input || 'Custom';
}

function usageCostLabel(subscriptionActive: boolean, blockedCount: number) {
  if (!subscriptionActive) return 'Automation paused until billing is active';
  if (blockedCount > 0) return 'Review blocked leads before estimating extra usage';
  return 'No hidden in-app overage configured today';
}

export default async function BillingPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const starterPriceId = process.env.STRIPE_PRICE_STARTER;
  const growthPriceId = process.env.STRIPE_PRICE_PRO;
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const checkout = typeof searchParams?.checkout === 'string' ? searchParams.checkout : undefined;
  const requestedPlan = parseRequestedPlan(searchParams);
  const billingAccess = getBusinessBillingAccessState(business);
  const subscriptionActive = billingAccess.billingActive;
  const checkoutSucceeded = checkout === 'success';
  const checkoutCanceled = checkout === 'canceled';
  const demoMode = isPortfolioDemoMode();
  const demoModeLabel = 'portfolio demo mode';
  const currentMonth = getCurrentMonthWindowUtc();

  const [blockedCount, usage, cycleSmsSent, cycleMissedCalls, cycleOwnerAlerts, stripeSnapshot] = demoMode
    ? [getPortfolioDemoBlockedCount(), null, 8, 3, 2, null]
    : await Promise.all([
        db.lead.count({ where: { businessId: business.id, billingRequired: true } }),
        getConversationUsageForBusiness(business),
        db.message.count({
          where: {
            businessId: business.id,
            direction: 'OUTBOUND',
            createdAt: { gte: currentMonth.start, lt: currentMonth.end },
          },
        }),
        db.call.count({
          where: {
            businessId: business.id,
            missed: true,
            createdAt: { gte: currentMonth.start, lt: currentMonth.end },
          },
        }),
        db.lead.count({
          where: {
            businessId: business.id,
            ownerNotifiedAt: { gte: currentMonth.start, lt: currentMonth.end },
          },
        }),
        getStripeBillingSnapshot(business),
      ]);

  const usageTierLabel = formatUsageTierLabel(resolveUsageTierFromSubscription(business));
  const usageSummary = usage ? formatUsageSummary(usage) : `Unavailable in ${demoModeLabel}.`;
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

  const currentPlanLabel = mapPlanLabel(stripeSnapshot?.stripePlanLabel, business.stripePriceId, process.env);
  const billingStatusLabel = getBillingDisplayLabel(business.subscriptionStatus, billingAccess.billingActive);
  const billingNeedsAttention = business.subscriptionStatus === 'PAST_DUE' || business.subscriptionStatus === 'CANCELED' || !subscriptionActive;

  const summaryItems = [
    { label: 'Current plan', value: currentPlanLabel },
    { label: 'Next charge date', value: stripeSnapshot ? formatDate(stripeSnapshot.nextChargeDate) : 'Shown in Stripe Billing Portal' },
    { label: 'Included usage', value: usage ? `${usage.limit} SMS-qualified conversations / month` : `Unavailable in ${demoModeLabel}` },
    { label: 'Included number', value: getManagedTextingNumber(business) ? 'One business texting number is included' : 'Provisioned during setup' },
    { label: 'Overage policy', value: 'One business texting number and standard setup are included. Automation pauses at the limit until you upgrade.' },
    { label: 'Payment method', value: stripeSnapshot?.paymentMethodLabel || 'Add or update card in Stripe Billing Portal' },
    { label: 'Billing portal', value: business.stripeCustomerId ? 'Available below' : 'Available after customer setup' },
  ];

  const usageCards = [
    { label: 'SMS used', value: usage?.used ?? cycleSmsSent, detail: 'Conversation starts this cycle' },
    { label: 'Missed calls processed', value: cycleMissedCalls, detail: 'Missed calls captured this cycle' },
    { label: 'Owner alerts sent', value: cycleOwnerAlerts, detail: 'Qualified lead handoffs delivered' },
    { label: 'Estimated usage cost', value: usageCostLabel(subscriptionActive, blockedCount), detail: 'Made explicit so billing never feels vague' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Badge variant="outline">Billing</Badge>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Billing and usage visibility</h1>
            <p className="text-sm text-muted-foreground">
              Make your plan, payment state, and usage clear in under 20 seconds so billing never feels like a surprise.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Public-facing overview:{' '}
            <Link className="underline underline-offset-4" href="/pricing">
              Pricing
            </Link>{' '}
            ·{' '}
            <Link className="underline underline-offset-4" href="/refund">
              Refund
            </Link>{' '}
            ·{' '}
            <Link className="underline underline-offset-4" href="/contact">
              Contact
            </Link>
          </p>
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {requestedPlan ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          Selected plan: <strong>{requestedPlan === 'starter' ? 'Starter' : 'Growth'}</strong>. Continue with the checkout card below.
        </div>
      ) : null}
      {checkoutSucceeded && billingAccess.rawSubscriptionActive ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Billing is active. Next move: confirm routing in{' '}
          <Link className="underline underline-offset-4" href="/app/settings">
            Business Settings
          </Link>{' '}
          and run the missed-call test from{' '}
          <Link className="underline underline-offset-4" href="/app/leads">
            Recovered Leads
          </Link>
          .
        </div>
      ) : null}
      {checkoutSucceeded && !billingAccess.rawSubscriptionActive ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          Stripe checkout completed. Subscription status is still syncing in the background. Refresh shortly if this state lingers.
        </div>
      ) : null}
      {checkoutCanceled ? <div className="rounded-md border bg-muted/40 p-3 text-sm">Checkout canceled. You can restart from the plan cards below.</div> : null}
      {billingNeedsAttention ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle>Billing needs attention now</CardTitle>
            <CardDescription>This warning is designed to be impossible to miss.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Lead capture can remain active, but automated SMS follow-up is paused until the payment method is updated and Stripe marks billing active again.
            </p>
            <p>{automationStatusMessage}</p>
            <div className="flex flex-wrap gap-3">
              {business.stripeCustomerId ? (
                <form action="/api/stripe/portal" method="post">
                  <Button type="submit">Update Payment Method</Button>
                </form>
              ) : (
                <Link className={buttonVariants()} href="#plan-options">
                  Activate Billing
                </Link>
              )}
              <Link className={buttonVariants({ variant: 'outline' })} href="/app/settings">
                Open Business Settings
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-card/90">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Current billing summary</CardTitle>
              <CardDescription>Stripe remains the source of truth, but this page should still be easy for a business owner to scan.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={subscriptionActive ? 'success' : 'outline'}>{billingStatusLabel}</Badge>
              <Badge variant="outline">{usageTierLabel}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-xl border bg-background/80 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-2 font-medium">{item.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Current cycle usage</CardTitle>
          <CardDescription>
            This cycle runs from {formatDate(currentMonth.start)} to {formatDate(currentMonth.end)} · {usageSummary}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {usageCards.map((card) => (
            <div key={card.label} className="rounded-xl border bg-background/80 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-lg font-medium">{card.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{card.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className={automationBlockReason === 'none' ? 'border-accent/40 bg-accent/20' : 'border-primary/20 bg-primary/5'}>
        <CardHeader>
          <CardTitle>Automation status</CardTitle>
          <CardDescription>Whether missed-call follow-up is actively protecting revenue right now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{automationStatusMessage}</p>
          {!subscriptionActive ? (
            <p className="text-muted-foreground">This is where billing transparency matters most: capture can stay visible, but auto-texting will not resume until payment is fixed.</p>
          ) : null}
        </CardContent>
      </Card>

      <div id="plan-options" className="grid gap-6 lg:grid-cols-3">
        <Card className={requestedPlan === 'starter' ? 'border-primary/40 bg-primary/5' : 'bg-card/90'}>
          <CardHeader>
            <CardTitle>Starter</CardTitle>
            <CardDescription>Cover missed calls with one managed texting number, standard setup, and a clean owner handoff.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{planPrice(starterPriceId)}</p>
            <p>Best for smaller service teams that want missed-call coverage live fast without managing line setup.</p>
          </CardContent>
          <CardFooter>
            <form action="/api/stripe/checkout" method="post" className="w-full">
              <input type="hidden" name="priceId" value={starterPriceId ?? ''} />
              <Button type="submit" className="w-full" disabled={!starterPriceId}>
                Choose Starter
              </Button>
            </form>
          </CardFooter>
        </Card>

        <Card className={requestedPlan === 'growth' ? 'border-primary/40 bg-primary/5' : 'bg-card/90'}>
          <CardHeader>
            <CardTitle>Growth</CardTitle>
            <CardDescription>More follow-up capacity plus managed rollout help for teams with busier inbound traffic.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{planPrice(growthPriceId)}</p>
            <p>Best for service teams that need more follow-up capacity, optional add-ons, and a clearer path to scale.</p>
          </CardContent>
          <CardFooter>
            <form action="/api/stripe/checkout" method="post" className="w-full">
              <input type="hidden" name="priceId" value={growthPriceId ?? ''} />
              <Button type="submit" className="w-full" disabled={!growthPriceId}>
                Choose Growth
              </Button>
            </form>
          </CardFooter>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Agency / Multi-location</CardTitle>
            <CardDescription>For operators managing multiple brands, multiple locations, extra numbers, or white-glove launches.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Talk to us before activation so routing, billing, and onboarding structure match the operating model.</p>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Link className={buttonVariants({ className: 'w-full' })} href="/contact">
              Contact Sales
            </Link>
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
