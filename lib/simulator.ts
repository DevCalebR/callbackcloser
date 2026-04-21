import 'server-only';

import type { Business, Lead, Message, OwnerNotification, SimulatorRun } from '@prisma/client';

import { db } from '@/lib/db';

const SIMULATOR_PLACEHOLDER_NUMBERS = new Set(['+15005550006', '+15005550001']);

function parseBooleanFlag(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isPublicSimulatorEnabled() {
  return parseBooleanFlag(process.env.ENABLE_PUBLIC_MISSED_CALL_SIMULATOR);
}

export function shouldSendRealSimulatorSms() {
  return parseBooleanFlag(process.env.ENABLE_PUBLIC_SIMULATOR_REAL_SMS);
}

export function isPlaceholderSimulatorNumber(phoneNumber: string | null | undefined) {
  if (!phoneNumber) return true;
  return SIMULATOR_PLACEHOLDER_NUMBERS.has(phoneNumber.trim());
}

export function canSendRealSimulatorSms(business: { twilioPrimaryPhoneNumber?: string | null; twilioPhoneNumber?: string | null } | null) {
  const textingNumber = business?.twilioPrimaryPhoneNumber || business?.twilioPhoneNumber || null;
  return shouldSendRealSimulatorSms() && !isPlaceholderSimulatorNumber(textingNumber);
}

export function getSimulatorBusinessId() {
  return process.env.SIMULATOR_BUSINESS_ID?.trim() || null;
}

export async function getSimulatorBusiness() {
  const businessId = getSimulatorBusinessId();
  if (!businessId) return null;

  return db.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      ownerClerkId: true,
      notifyPhone: true,
      twilioAccountMode: true,
      twilioSubaccountSid: true,
      twilioMessagingServiceSid: true,
      twilioPhoneNumber: true,
      twilioPrimaryPhoneNumber: true,
      managedTwilioStatus: true,
      a2pFailureReason: true,
      subscriptionStatus: true,
      provisioningStatus: true,
      archivedAt: true,
      serviceLabel1: true,
      serviceLabel2: true,
      serviceLabel3: true,
    },
  });
}

export function createSimulatorPublicId() {
  return `sim_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export async function getSimulatorRun(publicId: string) {
  return db.simulatorRun.findUnique({
    where: { publicId },
    include: {
      lead: {
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          ownerNotifications: { orderBy: { createdAt: 'asc' } },
          call: true,
        },
      },
      business: {
        select: {
          id: true,
          name: true,
          twilioAccountMode: true,
          twilioSubaccountSid: true,
          twilioMessagingServiceSid: true,
          twilioPhoneNumber: true,
          twilioPrimaryPhoneNumber: true,
          managedTwilioStatus: true,
          a2pFailureReason: true,
          provisioningStatus: true,
          archivedAt: true,
          serviceLabel1: true,
          serviceLabel2: true,
          serviceLabel3: true,
        },
      },
    },
  });
}

export type SimulatorRunRecord = SimulatorRun & {
  lead: Lead & { messages: Message[]; ownerNotifications: OwnerNotification[]; call: { createdAt: Date } | null };
  business: Pick<
    Business,
    | 'id'
    | 'name'
    | 'twilioAccountMode'
    | 'twilioSubaccountSid'
    | 'twilioMessagingServiceSid'
    | 'twilioPhoneNumber'
    | 'twilioPrimaryPhoneNumber'
    | 'managedTwilioStatus'
    | 'a2pFailureReason'
    | 'provisioningStatus'
    | 'archivedAt'
    | 'serviceLabel1'
    | 'serviceLabel2'
    | 'serviceLabel3'
  >;
};
