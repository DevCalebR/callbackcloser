import assert from 'node:assert/strict';
import test from 'node:test';

import type { SubscriptionStatus } from '@prisma/client';

import {
  buildConversationUsage,
  getCurrentMonthWindowUtc,
  isConversationLimitReached,
  resolveUsageTierFromSubscription,
} from '../lib/usage';

test('getCurrentMonthWindowUtc uses America/New_York boundaries (EST month)', () => {
  const now = new Date('2026-02-15T12:00:00.000Z');
  const { start, end, timezone } = getCurrentMonthWindowUtc(now);

  assert.equal(timezone, 'America/New_York');
  assert.equal(start.toISOString(), '2026-02-01T05:00:00.000Z');
  assert.equal(end.toISOString(), '2026-03-01T05:00:00.000Z');
});

test('getCurrentMonthWindowUtc handles DST shift across March in America/New_York', () => {
  const now = new Date('2026-03-20T12:00:00.000Z');
  const { start, end } = getCurrentMonthWindowUtc(now);

  assert.equal(start.toISOString(), '2026-03-01T05:00:00.000Z');
  assert.equal(end.toISOString(), '2026-04-01T04:00:00.000Z');
});

test('starter and pro limits block when used equals limit', () => {
  const start = new Date('2026-02-01T05:00:00.000Z');
  const end = new Date('2026-03-01T05:00:00.000Z');

  const starterAtLimit = buildConversationUsage('starter', 200, start, end);
  const proAtLimit = buildConversationUsage('pro', 1000, start, end);
  const starterBelowLimit = buildConversationUsage('starter', 199, start, end);

  assert.equal(isConversationLimitReached(starterAtLimit), true);
  assert.equal(isConversationLimitReached(proAtLimit), true);
  assert.equal(isConversationLimitReached(starterBelowLimit), false);
});

test('resolveUsageTierFromSubscription maps active stripe price IDs to tiers', () => {
  const env = {
    STRIPE_PRICE_STARTER: 'price_starter_123',
    STRIPE_PRICE_PRO: 'price_pro_456',
  };

  assert.equal(
    resolveUsageTierFromSubscription(
      { subscriptionStatus: 'ACTIVE' as SubscriptionStatus, stripePriceId: 'price_starter_123' },
      env
    ),
    'starter'
  );
  assert.equal(
    resolveUsageTierFromSubscription({ subscriptionStatus: 'ACTIVE' as SubscriptionStatus, stripePriceId: 'price_pro_456' }, env),
    'pro'
  );
  assert.equal(
    resolveUsageTierFromSubscription({ subscriptionStatus: 'INACTIVE' as SubscriptionStatus, stripePriceId: 'price_pro_456' }, env),
    'free'
  );
});
