import { type Business, SubscriptionStatus } from '@prisma/client';

type EnvMap = Readonly<Record<string, string | undefined>>;

export type BillingAccessBusiness = Pick<Business, 'ownerClerkId' | 'subscriptionStatus'>;

function readBooleanFlag(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isFounderBillingBypassEnabled(env: EnvMap = process.env) {
  return readBooleanFlag(env.ALLOW_FOUNDER_BILLING_BYPASS);
}

export function getFounderClerkUserId(env: EnvMap = process.env) {
  const founderClerkUserId = env.FOUNDER_CLERK_USER_ID?.trim();
  return founderClerkUserId || null;
}

export function hasFounderBillingBypassForOwnerClerkId(
  ownerClerkId: string | null | undefined,
  env: EnvMap = process.env
) {
  if (!ownerClerkId) return false;
  if (!isFounderBillingBypassEnabled(env)) return false;

  const founderClerkUserId = getFounderClerkUserId(env);
  return Boolean(founderClerkUserId && ownerClerkId === founderClerkUserId);
}

// Founder bypass is runtime-only and scoped to a single Clerk owner ID.
// It never mutates Stripe or database billing state for customer businesses.
export function getBusinessBillingAccessState(business: BillingAccessBusiness, env: EnvMap = process.env) {
  const rawSubscriptionActive = business.subscriptionStatus === SubscriptionStatus.ACTIVE;
  const founderBillingBypassActive =
    !rawSubscriptionActive && hasFounderBillingBypassForOwnerClerkId(business.ownerClerkId, env);

  return {
    rawSubscriptionActive,
    founderBillingBypassActive,
    billingActive: rawSubscriptionActive || founderBillingBypassActive,
  };
}

export function isSubscriptionActive(
  input: SubscriptionStatus | BillingAccessBusiness | null | undefined,
  env: EnvMap = process.env
) {
  if (input && typeof input === 'object' && 'subscriptionStatus' in input) {
    return getBusinessBillingAccessState(input, env).billingActive;
  }

  return input === SubscriptionStatus.ACTIVE;
}
