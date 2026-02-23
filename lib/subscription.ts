import { SubscriptionStatus } from '@prisma/client';

export function isSubscriptionActive(status: SubscriptionStatus | null | undefined) {
  return status === SubscriptionStatus.ACTIVE;
}
