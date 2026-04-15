import { BusinessProvisioningStatus, ManagedTwilioStatus, type Prisma, SubscriptionStatus } from '@prisma/client';

import { db } from '@/lib/db';
import { normalizePhoneNumber, normalizePhoneNumberToE164, phoneNumbersEqual } from '@/lib/phone';

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
  const trimmed = phoneNumber.trim();
  const normalized = normalizePhoneNumberToE164(trimmed);
  if (!normalized) return null;

  const directCandidates = Array.from(new Set([normalized, normalizePhoneNumber(trimmed), trimmed].filter(Boolean)));

  const directMatch = await db.business.findFirst({
    where: {
      OR: directCandidates.flatMap((candidate) => [
        { twilioPrimaryPhoneNumber: candidate },
        { twilioPhoneNumber: candidate },
      ]),
    },
  });

  if (directMatch) {
    return directMatch;
  }

  const businessesWithNumbers = await db.business.findMany({
    where: {
      OR: [
        { twilioPrimaryPhoneNumber: { not: null } },
        { twilioPhoneNumber: { not: null } },
      ],
    },
    select: {
      id: true,
      twilioPrimaryPhoneNumber: true,
      twilioPhoneNumber: true,
    },
  });

  const normalizedMatch = businessesWithNumbers.find(
    (business) =>
      phoneNumbersEqual(business.twilioPrimaryPhoneNumber, normalized) || phoneNumbersEqual(business.twilioPhoneNumber, normalized)
  );

  if (!normalizedMatch) {
    return null;
  }

  return db.business.findUnique({ where: { id: normalizedMatch.id } });
}

export async function searchBusinessesForAdmin(query: string) {
  const trimmed = query.trim();
  const normalizedPhone = normalizePhoneNumberToE164(trimmed);
  const where: Prisma.BusinessWhereInput | undefined = trimmed
    ? {
        OR: [
          { id: { contains: trimmed, mode: 'insensitive' } },
          { name: { contains: trimmed, mode: 'insensitive' } },
          { twilioPhoneNumberSid: { contains: trimmed, mode: 'insensitive' } },
          { twilioPrimaryNumberSid: { contains: trimmed, mode: 'insensitive' } },
          {
            notificationSettings: {
              is: {
                ownerEmail: { contains: trimmed.toLowerCase(), mode: 'insensitive' },
              },
            },
          },
          ...(normalizedPhone
            ? [
                { twilioPhoneNumber: normalizedPhone },
                { twilioPrimaryPhoneNumber: normalizedPhone },
              ]
            : []),
        ],
      }
    : undefined;

  return db.business.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      notificationSettings: true,
    },
  });
}
