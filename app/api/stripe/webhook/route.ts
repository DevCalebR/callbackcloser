import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { db } from '@/lib/db';
import { getCorrelationIdFromRequest, reportApplicationError, withCorrelationIdHeader } from '@/lib/observability';
import { RATE_LIMIT_STRIPE_AUTH_MAX, RATE_LIMIT_STRIPE_UNAUTH_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status) {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'ACTIVE' as const;
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE' as const;
    case 'canceled':
      return 'CANCELED' as const;
    default:
      return 'INACTIVE' as const;
  }
}

async function upsertBusinessSubscriptionFromSubscription(subscription: Stripe.Subscription) {
  const metadataBusinessId = subscription.metadata?.businessId || undefined;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const priceId = subscription.items.data[0]?.price?.id || null;

  const business = metadataBusinessId
    ? await db.business.findUnique({ where: { id: metadataBusinessId } })
    : customerId
      ? await db.business.findUnique({ where: { stripeCustomerId: customerId } })
      : null;

  if (!business) return;

  await db.business.update({
    where: { id: business.id },
    data: {
      stripeCustomerId: customerId ?? business.stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      subscriptionStatus: mapStripeSubscriptionStatus(subscription.status),
      subscriptionStatusUpdatedAt: new Date(),
    },
  });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const businessId = session.metadata?.businessId || session.client_reference_id || undefined;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (!subscriptionId) {
    if (!businessId) return;

    const result = await db.business.updateMany({
      where: { id: businessId },
      data: {
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: undefined,
        subscriptionStatusUpdatedAt: new Date(),
      },
    });
    if (result.count === 0) {
      console.warn('Stripe checkout.session.completed: no Business found for businessId', { businessId });
    }
    return;
  }

  const stripe = getStripe();
  let subscription = await stripe.subscriptions.retrieve(subscriptionId);

  if (!subscription.metadata?.businessId && businessId) {
    subscription = await stripe.subscriptions.update(subscriptionId, {
      metadata: { ...subscription.metadata, businessId },
    });
  }

  await upsertBusinessSubscriptionFromSubscription(subscription);
}

export async function POST(request: Request) {
  const clientIp = getClientIpAddress(request);
  const correlationId = getCorrelationIdFromRequest(request);
  const withCorrelation = (response: NextResponse) => withCorrelationIdHeader(response, correlationId);
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return withCorrelation(NextResponse.json({ error: 'Missing Stripe webhook configuration' }, { status: 400 }));
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const unauthRateLimit = consumeRateLimit({
      key: `stripe:webhook:unauth:${clientIp}`,
      limit: RATE_LIMIT_STRIPE_UNAUTH_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    if (!unauthRateLimit.allowed) {
      console.warn('Stripe webhook rate-limited (invalid signature burst)', {
        clientIp,
        correlationId,
        decision: 'reject_429',
      });
      return withCorrelation(
        NextResponse.json(
        { error: 'Too many invalid webhook attempts' },
        { status: 429, headers: buildRateLimitHeaders(unauthRateLimit) }
        )
      );
    }

    const message = error instanceof Error ? error.message : 'Invalid webhook signature';
    reportApplicationError({
      source: 'stripe.webhook',
      event: 'invalid_signature',
      correlationId,
      error,
      alert: false,
      metadata: {
        clientIp,
      },
    });
    return withCorrelation(NextResponse.json({ error: message }, { status: 400 }));
  }

  const authRateLimit = consumeRateLimit({
    key: `stripe:webhook:auth:${clientIp}`,
    limit: RATE_LIMIT_STRIPE_AUTH_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!authRateLimit.allowed) {
    console.warn('Stripe webhook rate-limited', {
      clientIp,
      correlationId,
      eventType: event.type,
      decision: 'reject_429',
    });
    return withCorrelation(
      NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: buildRateLimitHeaders(authRateLimit) })
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await upsertBusinessSubscriptionFromSubscription(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await db.business.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: 'PAST_DUE', subscriptionStatusUpdatedAt: new Date() },
          });
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await db.business.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: 'ACTIVE', subscriptionStatusUpdatedAt: new Date() },
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    reportApplicationError({
      source: 'stripe.webhook',
      event: 'handler_error',
      correlationId,
      error,
      metadata: {
        clientIp,
        eventType: event.type,
      },
    });
    return withCorrelation(NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 }));
  }

  return withCorrelation(NextResponse.json({ received: true }));
}
