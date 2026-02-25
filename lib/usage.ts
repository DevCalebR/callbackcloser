import type { Business } from '@prisma/client';

import { isSubscriptionActive } from './subscription';

export const BILLING_TIME_ZONE = 'America/New_York' as const;

export type UsageTier = 'free' | 'starter' | 'pro';

export type ConversationUsage = {
  tier: UsageTier;
  used: number;
  limit: number;
  remaining: number;
  periodStartUtc: Date;
  periodEndUtc: Date;
  timezone: typeof BILLING_TIME_ZONE;
};

type UsageBusiness = Pick<Business, 'id' | 'subscriptionStatus' | 'stripePriceId'>;

type LeadCountClient = {
  lead: {
    count(args: {
      where: {
        businessId: string;
        smsStartedAt: { gte: Date; lt: Date };
      };
    }): Promise<number>;
  };
};

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const CONVERSATION_LIMITS: Record<UsageTier, number> = {
  free: 0,
  starter: 200,
  pro: 1000,
};

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timeZone: string) {
  const cached = dateTimeFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  dateTimeFormatterCache.set(timeZone, formatter);
  return formatter;
}

function getZonedDateTimeParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const parts = getDateTimeFormatter(timeZone).formatToParts(date);
  const mapped: Partial<ZonedDateTimeParts> = {};

  for (const part of parts) {
    if (part.type === 'year') mapped.year = Number(part.value);
    if (part.type === 'month') mapped.month = Number(part.value);
    if (part.type === 'day') mapped.day = Number(part.value);
    if (part.type === 'hour') mapped.hour = Number(part.value);
    if (part.type === 'minute') mapped.minute = Number(part.value);
    if (part.type === 'second') mapped.second = Number(part.value);
  }

  return {
    year: mapped.year ?? 0,
    month: mapped.month ?? 0,
    day: mapped.day ?? 0,
    hour: mapped.hour ?? 0,
    minute: mapped.minute ?? 0,
    second: mapped.second ?? 0,
  };
}

function zonedDateTimeToUtc(parts: ZonedDateTimeParts, timeZone: string) {
  let guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));

  // Iterate to reconcile the guessed instant with the desired wall-clock time in the target time zone.
  for (let i = 0; i < 3; i += 1) {
    const zoned = getZonedDateTimeParts(guess, timeZone);
    const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
    const targetAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const deltaMs = targetAsUtc - zonedAsUtc;

    if (deltaMs === 0) {
      break;
    }

    guess = new Date(guess.getTime() + deltaMs);
  }

  return guess;
}

export function getCurrentMonthWindowUtc(now: Date = new Date(), timeZone: string = BILLING_TIME_ZONE) {
  const zonedNow = getZonedDateTimeParts(now, timeZone);
  const start = zonedDateTimeToUtc(
    {
      year: zonedNow.year,
      month: zonedNow.month,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );

  const nextMonthYear = zonedNow.month === 12 ? zonedNow.year + 1 : zonedNow.year;
  const nextMonth = zonedNow.month === 12 ? 1 : zonedNow.month + 1;
  const end = zonedDateTimeToUtc(
    {
      year: nextMonthYear,
      month: nextMonth,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone
  );

  return { start, end, timezone: timeZone };
}

export function resolveUsageTierFromSubscription(
  input: Pick<UsageBusiness, 'subscriptionStatus' | 'stripePriceId'>,
  env: Readonly<Record<string, string | undefined>> = process.env
): UsageTier {
  if (!isSubscriptionActive(input.subscriptionStatus)) {
    return 'free';
  }

  const priceId = input.stripePriceId?.trim();
  const starterPriceId = env.STRIPE_PRICE_STARTER?.trim();
  const proPriceId = env.STRIPE_PRICE_PRO?.trim();

  if (priceId && proPriceId && priceId === proPriceId) {
    return 'pro';
  }

  if (priceId && starterPriceId && priceId === starterPriceId) {
    return 'starter';
  }

  return 'free';
}

export function getConversationLimitForTier(tier: UsageTier) {
  return CONVERSATION_LIMITS[tier];
}

export function buildConversationUsage(
  tier: UsageTier,
  used: number,
  periodStartUtc: Date,
  periodEndUtc: Date
): ConversationUsage {
  const limit = getConversationLimitForTier(tier);
  return {
    tier,
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    periodStartUtc,
    periodEndUtc,
    timezone: BILLING_TIME_ZONE,
  };
}

export function isConversationLimitReached(usage: Pick<ConversationUsage, 'used' | 'limit'>) {
  if (usage.limit <= 0) return true;
  return usage.used >= usage.limit;
}

export async function countConversationsStartedThisMonth(
  client: LeadCountClient,
  businessId: string,
  now: Date = new Date()
) {
  const { start, end } = getCurrentMonthWindowUtc(now, BILLING_TIME_ZONE);

  const used = await client.lead.count({
    where: {
      businessId,
      smsStartedAt: {
        gte: start,
        lt: end,
      },
    },
  });

  return { used, periodStartUtc: start, periodEndUtc: end };
}

export async function getConversationUsageForBusiness(
  business: UsageBusiness,
  now: Date = new Date()
): Promise<ConversationUsage> {
  const { db } = await import('./db');
  return getConversationUsageForBusinessWithClient(db, business, now);
}

export async function getConversationUsageForBusinessWithClient(
  client: LeadCountClient,
  business: UsageBusiness,
  now: Date = new Date()
): Promise<ConversationUsage> {
  const tier = resolveUsageTierFromSubscription(business);
  const { used, periodStartUtc, periodEndUtc } = await countConversationsStartedThisMonth(client, business.id, now);
  return buildConversationUsage(tier, used, periodStartUtc, periodEndUtc);
}

export function describeUsageLimit(usage: Pick<ConversationUsage, 'tier' | 'used' | 'limit' | 'remaining'>) {
  return `${usage.tier} ${usage.used}/${usage.limit} used (${usage.remaining} remaining)`;
}
