import { ManagedTwilioStatus, type Prisma, SubscriptionStatus } from '@prisma/client';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';

export async function upsertBusinessForOwner(ownerClerkId: string, input: {
  name: string;
  forwardingNumber: string;
  notifyPhone?: string | null;
  missedCallSeconds: number;
  serviceLabel1: string;
  serviceLabel2: string;
  serviceLabel3: string;
  timezone: string;
}) {
  const data: Prisma.BusinessUncheckedCreateInput = {
    ownerClerkId,
    name: input.name,
    forwardingNumber: normalizePhoneNumber(input.forwardingNumber),
    notifyPhone: normalizePhoneNumber(input.notifyPhone || '' ) || null,
    missedCallSeconds: input.missedCallSeconds,
    serviceLabel1: input.serviceLabel1,
    serviceLabel2: input.serviceLabel2,
    serviceLabel3: input.serviceLabel3,
    timezone: input.timezone,
    subscriptionStatus: SubscriptionStatus.INACTIVE,
    managedTwilioStatus: ManagedTwilioStatus.DRAFT,
    managedTwilioStatusUpdatedAt: new Date(),
  };

  return db.business.upsert({
    where: { ownerClerkId },
    create: data,
    update: {
      name: data.name,
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
