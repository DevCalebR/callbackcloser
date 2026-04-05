import { type SubscriptionStatus } from '@prisma/client';

import type { ConversationUsage, UsageTier } from './usage.ts';
import { isConversationLimitReached } from './usage.ts';
import { isSubscriptionActive } from './subscription.ts';

export type AutomationBlockReason = 'none' | 'billing_inactive' | 'usage_limit_reached' | 'billing_required';

const TIER_LABELS: Record<UsageTier, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
};

export function formatUsageTierLabel(tier: UsageTier) {
  return TIER_LABELS[tier];
}

export function formatUsageSummary(usage: Pick<ConversationUsage, 'used' | 'limit' | 'remaining'>) {
  return `${usage.used}/${usage.limit} used (${usage.remaining} remaining)`;
}

export function resolveAutomationBlockReason(input: {
  blockedCount: number;
  subscriptionStatus: SubscriptionStatus | null | undefined;
  usage?: Pick<ConversationUsage, 'used' | 'limit'> | null;
}): AutomationBlockReason {
  if (input.blockedCount <= 0) return 'none';
  if (!isSubscriptionActive(input.subscriptionStatus)) return 'billing_inactive';
  if (input.usage && isConversationLimitReached(input.usage)) return 'usage_limit_reached';
  return 'billing_required';
}

export function describeAutomationBlockReason(
  reason: AutomationBlockReason,
  input: {
    blockedCount?: number;
    usage?: Pick<ConversationUsage, 'used' | 'limit'>;
  } = {}
) {
  const blockedSuffix = typeof input.blockedCount === 'number' && input.blockedCount > 0
    ? ` ${input.blockedCount} lead${input.blockedCount === 1 ? '' : 's'} currently blocked.`
    : '';

  if (reason === 'billing_inactive') {
    return `Automation is paused because billing is inactive.${blockedSuffix}`;
  }
  if (reason === 'usage_limit_reached') {
    if (input.usage) {
      return `Automation is paused because your monthly conversation limit is reached (${input.usage.used}/${input.usage.limit}).${blockedSuffix}`;
    }
    return `Automation is paused because your monthly conversation limit is reached.${blockedSuffix}`;
  }
  if (reason === 'billing_required') {
    return `Automation is paused for leads that require billing action.${blockedSuffix}`;
  }
  return 'Automation is active.';
}
