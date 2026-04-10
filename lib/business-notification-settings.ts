import { clerkClient } from '@clerk/nextjs/server';
import type { Business, BusinessNotificationSettings } from '@prisma/client';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';

type NotificationBusiness = Pick<Business, 'id' | 'ownerClerkId' | 'notifyPhone'>;

export async function resolveBusinessOwnerEmail(ownerClerkId: string) {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(ownerClerkId);
    const primaryEmail =
      user.primaryEmailAddressId
        ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
        : user.emailAddresses[0]?.emailAddress;

    return primaryEmail?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function ensureBusinessNotificationSettings(
  business: NotificationBusiness,
  overrides: { ownerPhone?: string | null; ownerEmail?: string | null } = {}
) {
  const ownerPhone = normalizePhoneNumber(overrides.ownerPhone ?? business.notifyPhone ?? '') || null;
  const ownerEmail = overrides.ownerEmail?.trim().toLowerCase() || (await resolveBusinessOwnerEmail(business.ownerClerkId));

  return db.businessNotificationSettings.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      ownerPhone,
      ownerEmail,
    },
    update: {
      ownerPhone,
      ...(ownerEmail ? { ownerEmail } : {}),
    },
  });
}

export async function getEffectiveBusinessNotificationSettings(
  business: NotificationBusiness
): Promise<BusinessNotificationSettings & { ownerPhone: string | null; ownerEmail: string | null }> {
  const existing = await db.businessNotificationSettings.findUnique({ where: { businessId: business.id } });
  if (existing) {
    return {
      ...existing,
      ownerPhone: normalizePhoneNumber(existing.ownerPhone || business.notifyPhone || '') || null,
      ownerEmail: existing.ownerEmail || (await resolveBusinessOwnerEmail(business.ownerClerkId)),
    };
  }

  return ensureBusinessNotificationSettings(business);
}
