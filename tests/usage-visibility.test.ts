import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeAutomationBlockReason,
  formatUsageSummary,
  formatUsageTierLabel,
  resolveAutomationBlockReason,
} from '../lib/usage-visibility.ts';
import { buildConversationUsage } from '../lib/usage.ts';

test('formatUsageTierLabel returns readable tier names', () => {
  assert.equal(formatUsageTierLabel('free'), 'Free');
  assert.equal(formatUsageTierLabel('starter'), 'Starter');
  assert.equal(formatUsageTierLabel('pro'), 'Pro');
});

test('formatUsageSummary returns used and remaining values', () => {
  const usage = buildConversationUsage(
    'starter',
    42,
    new Date('2026-03-01T05:00:00.000Z'),
    new Date('2026-04-01T04:00:00.000Z')
  );

  assert.equal(formatUsageSummary(usage), '42/200 used (158 remaining)');
});

test('resolveAutomationBlockReason prioritizes inactive billing and usage limits', () => {
  assert.equal(
    resolveAutomationBlockReason({
      blockedCount: 0,
      subscriptionStatus: 'ACTIVE',
      usage: { used: 10, limit: 200 },
    }),
    'none'
  );

  assert.equal(
    resolveAutomationBlockReason({
      blockedCount: 2,
      subscriptionStatus: 'INACTIVE',
      usage: { used: 10, limit: 200 },
    }),
    'billing_inactive'
  );

  assert.equal(
    resolveAutomationBlockReason({
      blockedCount: 2,
      subscriptionStatus: 'ACTIVE',
      usage: { used: 200, limit: 200 },
    }),
    'usage_limit_reached'
  );

  assert.equal(
    resolveAutomationBlockReason({
      blockedCount: 2,
      subscriptionStatus: 'ACTIVE',
      usage: { used: 120, limit: 200 },
    }),
    'billing_required'
  );
});

test('describeAutomationBlockReason includes blocked counts and usage values', () => {
  assert.equal(
    describeAutomationBlockReason('billing_inactive', { blockedCount: 3 }),
    'Automation is paused because billing is inactive. 3 leads currently blocked.'
  );

  assert.equal(
    describeAutomationBlockReason('usage_limit_reached', {
      blockedCount: 1,
      usage: { used: 200, limit: 200 },
    }),
    'Automation is paused because your monthly conversation limit is reached (200/200). 1 lead currently blocked.'
  );

  assert.equal(
    describeAutomationBlockReason('billing_required', { blockedCount: 2 }),
    'Automation is paused for leads that require billing action. 2 leads currently blocked.'
  );

  assert.equal(describeAutomationBlockReason('none'), 'Automation is active.');
});
