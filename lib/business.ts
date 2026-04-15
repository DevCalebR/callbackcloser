import { BusinessProvisioningStatus, ManagedTwilioStatus, type Prisma, SubscriptionStatus } from '@prisma/client';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';

export async function upsertBusinessForOwner(ownerClerkId: string, input: {
  name: string;
  ownerName?: string | null;
  forwardingNumber: string;
  notifyPhone?: string | null;
  ownerEmail?: string | null;
  missedCallSeconds: number;
  serviceLabel1: string;
  serviceLabel2: string;
  serviceLabel3: string;
  timezone: string;
}) {
  const data: Prisma.BusinessUncheckedCreateInput = {
    ownerClerkId,
    name: input.name,
    ownerName: input.ownerName?.trim() || null,
    forwardingNumber: normalizePhoneNumber(input.forwardingNumber),
    notifyPhone: normalizePhoneNumber(input.notifyPhone || '' ) || null,
    provisioningStatus: BusinessProvisioningStatus.DRAFT,
    missedCallSeconds: input.missedCallSeconds,
    serviceLabel1: input.serviceLabel1,
    serviceLabel2: input.serviceLabel2,
    serviceLabel3: input.serviceLabel3,
    timezone: input.timezone,
    subscriptionStatus: SubscriptionStatus.INACTIVE,
    managedTwilioStatus: ManagedTwilioStatus.DRAFT,
    managedTwilioStatusUpdatedAt: new Date(),
  };

  const business = await db.business.upsert({
    where: { ownerClerkId },
    create: data,
    update: {
      name: data.name,
      ownerName: data.ownerName,
      forwardingNumber: data.forwardingNumber,
      notifyPhone: data.notifyPhone,
      missedCallSeconds: data.missedCallSeconds,
      serviceLabel1: data.serviceLabel1,
      serviceLabel2: data.serviceLabel2,
      serviceLabel3: data.serviceLabel3,
      timezone: data.timezone,
      managedTwilioStatusUpdatedAt: new Date(),
    },
  });

  await db.businessNotificationSettings.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      ownerPhone: data.notifyPhone,
      ownerEmail: input.ownerEmail?.trim() || null,
    },
    update: {
      ownerPhone: data.notifyPhone,
      ownerEmail: input.ownerEmail?.trim() || undefined,
    },
  });

  return business;
}

export async function findBusinessByTwilioNumber(phoneNumber: string) {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) return null;

  return db.business.findFirst({
    where: {
      OR: [
        { twilioPrimaryPhoneNumber: normalized },
        { twilioPrimaryPhoneNumber: phoneNumber },
        { twilioPhoneNumber: normalized },
        { twilioPhoneNumber: phoneNumber },
      ],
    },
  });
}
