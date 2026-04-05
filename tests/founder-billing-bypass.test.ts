import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { getBusinessBillingAccessState, isSubscriptionActive } from '../lib/subscription.ts';
import { resolveUsageTierFromSubscription } from '../lib/usage.ts';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('founder billing bypass only activates for the configured founder-owned business', () => {
  const env = {
    ALLOW_FOUNDER_BILLING_BYPASS: 'true',
    FOUNDER_CLERK_USER_ID: 'user_founder',
  };

  const founderBusiness = {
    ownerClerkId: 'user_founder',
    subscriptionStatus: 'INACTIVE' as const,
  };
  const customerBusiness = {
    ownerClerkId: 'user_customer',
    subscriptionStatus: 'INACTIVE' as const,
  };

  assert.deepEqual(getBusinessBillingAccessState(founderBusiness, env), {
    rawSubscriptionActive: false,
    founderBillingBypassActive: true,
    billingActive: true,
  });
  assert.equal(isSubscriptionActive(founderBusiness, env), true);
  assert.equal(isSubscriptionActive(customerBusiness, env), false);
});

test('founder billing bypass maps the founder-owned smoke-test business to starter usage limits', () => {
  const env = {
    ALLOW_FOUNDER_BILLING_BYPASS: 'true',
    FOUNDER_CLERK_USER_ID: 'user_founder',
    STRIPE_PRICE_STARTER: 'price_starter_123',
    STRIPE_PRICE_PRO: 'price_pro_456',
  };

  assert.equal(
    resolveUsageTierFromSubscription(
      {
        ownerClerkId: 'user_founder',
        subscriptionStatus: 'INACTIVE',
        stripePriceId: null,
      },
      env
    ),
    'starter'
  );
});

test('billing and settings pages disclose the founder-only billing bypass', () => {
  const billingPage = read('app/app/billing/page.tsx');
  const settingsPage = read('app/app/settings/page.tsx');

  assert.match(billingPage, /Founder-only billing bypass is active/i);
  assert.match(settingsPage, /Founder-only billing bypass is active/i);
  assert.match(billingPage, /Normal customer accounts still require real active billing/i);
});
