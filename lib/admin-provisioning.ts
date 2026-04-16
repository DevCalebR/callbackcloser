import { clerkClient } from '@clerk/nextjs/server';
import { BusinessProvisioningStatus, ManagedTwilioStatus, type Business, type BusinessNotificationSettings } from '@prisma/client';

import {
  buildPendingOwnerClerkId,
  isPendingOwnerClerkId,
  type TwilioWebhookSnapshot,
} from '@/lib/admin-provisioning-presenters';
import { ensureBusinessNotificationSettings } from '@/lib/business-notification-settings';
import { db } from '@/lib/db';
import { getConfiguredAppBaseUrl } from '@/lib/env.server';
import {
  attachNumberToMessagingService,
  createMessagingServiceForBusiness,
  createSubaccountForBusiness,
  provisionManagedTwilioForBusiness,
  resolveManagedTwilioStatus,
  syncManagedTwilioNumberWebhooks,
  updateManagedTwilioStatus,
} from '@/lib/managed-twilio';
import { normalizePhoneNumber } from '@/lib/phone';
import { getTwilioBusinessClient, hasTwilioClientEnv } from '@/lib/twilio-client';
import { getTwilioWebhookConfig, syncTwilioIncomingPhoneNumberWebhooks, type TwilioWebhookSyncOptions } from '@/lib/twilio';

export type AdminOwnerState = {
  connected: boolean;
  pending: boolean;
  invitedAt: Date | null;
  clerkUserId: string | null;
  name: string | null;
  email: string | null;
};

export {
  adminProvisioningStatusLabels,
  buildAdminProvisioningChecklist,
  buildPendingOwnerClerkId,
  getAdminProvisioningStatusVariant,
  isPendingOwnerClerkId,
} from '@/lib/admin-provisioning-presenters';
export type { AdminProvisioningChecklistItem } from '@/lib/admin-provisioning-presenters';

export async function findClerkUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const client = await clerkClient();
  const result = await client.users.getUserList({
    emailAddress: [normalized],
    limit: 1,
  });

  return result.data[0] ?? null;
}

export async function getAdminOwnerState(
  business: Pick<Business, 'ownerClerkId' | 'ownerName' | 'ownerInviteSentAt'>,
  notificationSettings: Pick<BusinessNotificationSettings, 'ownerEmail'> | null
): Promise<AdminOwnerState> {
  const ownerEmail = notificationSettings?.ownerEmail?.trim().toLowerCase() || null;

  if (isPendingOwnerClerkId(business.ownerClerkId)) {
    return {
      connected: false,
      pending: true,
      invitedAt: business.ownerInviteSentAt,
      clerkUserId: null,
      name: business.ownerName?.trim() || null,
      email: ownerEmail,
    };
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(business.ownerClerkId);
    const primaryEmail =
      user.primaryEmailAddressId
        ? user.emailAddresses.find((emailAddress) => emailAddress.id === user.primaryEmailAddressId)?.emailAddress
        : user.emailAddresses[0]?.emailAddress;
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || business.ownerName?.trim() || null;

    return {
      connected: true,
      pending: false,
      invitedAt: business.ownerInviteSentAt,
      clerkUserId: user.id,
      name: fullName,
      email: primaryEmail?.trim().toLowerCase() || ownerEmail,
    };
  } catch {
    return {
      connected: false,
      pending: false,
      invitedAt: business.ownerInviteSentAt,
      clerkUserId: business.ownerClerkId,
      name: business.ownerName?.trim() || null,
      email: ownerEmail,
    };
  }
}

async function assertOwnerNotAttachedElsewhere(ownerClerkId: string, businessId: string) {
  const existing = await db.business.findUnique({
    where: { ownerClerkId },
    select: { id: true, name: true },
  });

  if (existing && existing.id !== businessId) {
    throw new Error(`This owner is already attached to ${existing.name}. CallbackCloser still supports one business per owner.`);
  }
}

export async function connectOrInviteBusinessOwner(params: {
  businessId: string;
  ownerEmail: string;
  ownerName?: string | null;
  ownerClerkId?: string | null;
  inviteIfMissing?: boolean;
}) {
  const ownerEmail = params.ownerEmail.trim().toLowerCase();
  if (!ownerEmail) {
    throw new Error('Owner email is required to connect or invite the business owner.');
  }

  const business = await db.business.findUnique({
    where: { id: params.businessId },
    select: {
      id: true,
      ownerClerkId: true,
      ownerName: true,
      ownerInviteSentAt: true,
      notifyPhone: true,
    },
  });

  if (!business) {
    throw new Error('Business not found.');
  }

  const client = await clerkClient();
  let userId = params.ownerClerkId?.trim() || '';

  if (!userId) {
    const existingUser = await findClerkUserByEmail(ownerEmail);
    userId = existingUser?.id || '';
  }

  if (userId) {
    await assertOwnerNotAttachedElsewhere(userId, business.id);

    await db.business.update({
      where: { id: business.id },
      data: {
        ownerClerkId: userId,
        ownerName: params.ownerName?.trim() || business.ownerName || null,
        ownerInviteSentAt: null,
      },
    });

    await ensureBusinessNotificationSettings(
      {
        id: business.id,
        ownerClerkId: userId,
        notifyPhone: business.notifyPhone,
      },
      {
        ownerEmail,
      }
    );

    return { state: 'connected' as const, ownerClerkId: userId };
  }

  if (!params.inviteIfMissing) {
    throw new Error('No existing Clerk user was found for that email address.');
  }

  const appBaseUrl = getConfiguredAppBaseUrl();
  await client.invitations.createInvitation({
    emailAddress: ownerEmail,
    notify: true,
    ignoreExisting: true,
    ...(appBaseUrl ? { redirectUrl: `${appBaseUrl}/sign-up` } : {}),
  });

  const pendingOwnerId = isPendingOwnerClerkId(business.ownerClerkId) ? business.ownerClerkId : buildPendingOwnerClerkId();
  await db.business.update({
    where: { id: business.id },
    data: {
      ownerClerkId: pendingOwnerId,
      ownerName: params.ownerName?.trim() || business.ownerName || null,
      ownerInviteSentAt: new Date(),
    },
  });

  await ensureBusinessNotificationSettings(
    {
      id: business.id,
      ownerClerkId: pendingOwnerId,
      notifyPhone: business.notifyPhone,
    },
    {
      ownerEmail,
    }
  );

  return { state: 'invited' as const, ownerClerkId: pendingOwnerId };
}

export function sanitizeWebhookUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export async function getTwilioWebhookSnapshot(
  business: Pick<Business, 'twilioPhoneNumberSid' | 'twilioPrimaryNumberSid' | 'twilioSubaccountSid'>
): Promise<TwilioWebhookSnapshot | null> {
  const phoneNumberSid = business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid;
  if (!phoneNumberSid || !hasTwilioClientEnv()) {
    return null;
  }

  try {
    const client = getTwilioBusinessClient(business.twilioSubaccountSid);
    const number = await client.incomingPhoneNumbers(phoneNumberSid).fetch();
    const expected = getTwilioWebhookConfig();

    return {
      voiceSynced: number.voiceUrl === expected.voiceUrl,
      smsSynced: number.smsUrl === expected.smsUrl,
      statusSynced: number.statusCallback === expected.statusUrl,
      currentVoiceUrl: sanitizeWebhookUrl(number.voiceUrl),
      currentSmsUrl: sanitizeWebhookUrl(number.smsUrl),
      currentStatusUrl: sanitizeWebhookUrl(number.statusCallback),
      expectedVoiceUrl: sanitizeWebhookUrl(expected.voiceUrl) ?? '/api/twilio/voice',
      expectedSmsUrl: sanitizeWebhookUrl(expected.smsUrl) ?? '/api/twilio/sms',
      expectedStatusUrl: sanitizeWebhookUrl(expected.statusUrl) ?? '/api/twilio/status',
      error: null,
    };
  } catch (error) {
    return {
      voiceSynced: false,
      smsSynced: false,
      statusSynced: false,
      currentVoiceUrl: null,
      currentSmsUrl: null,
      currentStatusUrl: null,
      expectedVoiceUrl: '/api/twilio/voice',
      expectedSmsUrl: '/api/twilio/sms',
      expectedStatusUrl: '/api/twilio/status',
      error: error instanceof Error ? error.message : 'Unable to read the current webhook configuration.',
    };
  }
}

export async function listAdminTwilioNumbers(
  business: Pick<Business, 'twilioSubaccountSid'>
) {
  if (!hasTwilioClientEnv()) {
    return {
      numbers: [] as Array<{ sid: string; phoneNumber: string | null; friendlyName: string | null }>,
      sourceLabel: null as string | null,
      error: 'Twilio credentials are not configured in this environment.',
    };
  }

  try {
    const client = getTwilioBusinessClient(business.twilioSubaccountSid);
    const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });
    return {
      numbers: numbers.map((number) => ({
        sid: number.sid,
        phoneNumber: normalizePhoneNumber(number.phoneNumber),
        friendlyName: number.friendlyName || null,
      })),
      sourceLabel: business.twilioSubaccountSid ? 'business subaccount' : 'parent account',
      error: null as string | null,
    };
  } catch (error) {
    return {
      numbers: [] as Array<{ sid: string; phoneNumber: string | null; friendlyName: string | null }>,
      sourceLabel: business.twilioSubaccountSid ? 'business subaccount' : 'parent account',
      error: error instanceof Error ? error.message : 'Unable to load Twilio numbers.',
    };
  }
}

export async function syncBusinessTwilioWebhooks(
  business: Pick<Business, 'id' | 'twilioSubaccountSid' | 'twilioPhoneNumberSid' | 'twilioPrimaryNumberSid'>,
  options: TwilioWebhookSyncOptions
) {
  const phoneNumberSid = business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid;
  if (!phoneNumberSid) {
    throw new Error('No Twilio number is assigned to this business yet.');
  }

  const client = getTwilioBusinessClient(business.twilioSubaccountSid);
  const { number } = await syncTwilioIncomingPhoneNumberWebhooks(phoneNumberSid, client, options);
  const normalizedPhoneNumber = normalizePhoneNumber(number.phoneNumber);
  const syncedAt = new Date();

  await db.business.update({
    where: { id: business.id },
    data: {
      twilioPhoneNumber: normalizedPhoneNumber,
      twilioPhoneNumberSid: number.sid,
      twilioPrimaryPhoneNumber: normalizedPhoneNumber,
      twilioPrimaryNumberSid: number.sid,
      twilioWebhookSyncedAt: syncedAt,
      provisioningError: null,
    },
  });

  return { number, syncedAt };
}

export async function attachExistingNumberToBusiness(params: {
  business: Pick<
    Business,
    | 'id'
    | 'name'
    | 'twilioSubaccountSid'
    | 'twilioMessagingServiceSid'
    | 'twilioPrimaryNumberSid'
    | 'twilioPrimaryPhoneNumber'
    | 'twilioPhoneNumberSid'
    | 'twilioPhoneNumber'
  >;
  phoneNumberSid: string;
  correlationId?: string;
}) {
  const correlationId = params.correlationId ?? `admin_existing_${params.business.id}`;
  const subaccountSid = params.business.twilioSubaccountSid || (await createSubaccountForBusiness(params.business, correlationId));
  const client = getTwilioBusinessClient(subaccountSid);

  const existingNumber = await client.incomingPhoneNumbers(params.phoneNumberSid).fetch();
  const normalizedPhoneNumber = normalizePhoneNumber(existingNumber.phoneNumber);
  if (!normalizedPhoneNumber) {
    throw new Error('The selected Twilio number could not be normalized.');
  }

  const messagingServiceSid = await createMessagingServiceForBusiness(
    {
      ...params.business,
      twilioSubaccountSid: subaccountSid,
      twilioMessagingServiceSid: params.business.twilioMessagingServiceSid,
    },
    correlationId
  );

  const syncedNumber = await syncManagedTwilioNumberWebhooks(
    {
      ...params.business,
      twilioSubaccountSid: subaccountSid,
      twilioPhoneNumberSid: existingNumber.sid,
      twilioPrimaryNumberSid: existingNumber.sid,
      twilioPrimaryPhoneNumber: normalizedPhoneNumber,
      twilioPhoneNumber: normalizedPhoneNumber,
    },
    correlationId
  );

  await attachNumberToMessagingService(
    {
      ...params.business,
      twilioSubaccountSid: subaccountSid,
      twilioMessagingServiceSid: messagingServiceSid,
      twilioPrimaryNumberSid: existingNumber.sid,
    },
    correlationId
  );

  const nextStatus = resolveManagedTwilioStatus({
    ...params.business,
    managedTwilioStatus: ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION,
    twilioSubaccountSid: subaccountSid,
    twilioMessagingServiceSid: messagingServiceSid,
    twilioPrimaryNumberSid: syncedNumber.phoneNumberSid,
    twilioPhoneNumberSid: syncedNumber.phoneNumberSid,
    twilioPrimaryPhoneNumber: syncedNumber.phoneNumber,
    twilioPhoneNumber: syncedNumber.phoneNumber,
    a2pCustomerProfileSid: null,
    a2pBrandSid: null,
    a2pCampaignSid: null,
    a2pFailureReason: null,
    a2pApprovedAt: null,
  });

  await updateManagedTwilioStatus(params.business.id, nextStatus, {
    twilioSubaccountSid: subaccountSid,
    twilioMessagingServiceSid: messagingServiceSid,
    twilioPrimaryNumberSid: syncedNumber.phoneNumberSid,
    twilioPrimaryPhoneNumber: syncedNumber.phoneNumber,
    twilioPhoneNumberSid: syncedNumber.phoneNumberSid,
    twilioPhoneNumber: syncedNumber.phoneNumber,
    twilioProvisionedAt: new Date(),
    twilioWebhookSyncedAt: syncedNumber.syncedAt,
  });

  return db.business.findUniqueOrThrow({ where: { id: params.business.id } });
}

export async function runAdminProvisioning(params: {
  businessId: string;
  mode: 'NEW_NUMBER' | 'EXISTING_NUMBER';
  areaCode?: string | null;
  existingNumberSid?: string | null;
}) {
  const business = await db.business.findUnique({
    where: { id: params.businessId },
    select: {
      id: true,
      name: true,
      twilioSubaccountSid: true,
      twilioMessagingServiceSid: true,
      twilioPrimaryNumberSid: true,
      twilioPrimaryPhoneNumber: true,
      twilioPhoneNumberSid: true,
      twilioPhoneNumber: true,
      notifyPhone: true,
      ownerClerkId: true,
    },
  });

  if (!business) {
    throw new Error('Business not found.');
  }

  await db.business.update({
    where: { id: business.id },
    data: {
      provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
      provisioningLastRunAt: new Date(),
      provisioningError: null,
    },
  });

  await ensureBusinessNotificationSettings({
    id: business.id,
    ownerClerkId: business.ownerClerkId,
    notifyPhone: business.notifyPhone,
  });

  try {
    if (params.mode === 'NEW_NUMBER') {
      await provisionManagedTwilioForBusiness(
        {
          id: business.id,
          name: business.name,
          twilioSubaccountSid: business.twilioSubaccountSid,
          twilioMessagingServiceSid: business.twilioMessagingServiceSid,
          twilioPrimaryNumberSid: business.twilioPrimaryNumberSid,
          twilioPrimaryPhoneNumber: business.twilioPrimaryPhoneNumber,
        },
        {
          areaCode: params.areaCode || undefined,
          correlationId: `admin_provision_${business.id}`,
        }
      );
    } else {
      const existingNumberSid = params.existingNumberSid?.trim();
      if (!existingNumberSid) {
        throw new Error('Choose an existing Twilio number before provisioning this business.');
      }

      await attachExistingNumberToBusiness({
        business,
        phoneNumberSid: existingNumberSid,
        correlationId: `admin_attach_${business.id}`,
      });
    }

    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
        provisioningLastRunAt: new Date(),
        provisioningError: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provisioning failed.';
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningLastRunAt: new Date(),
        provisioningError: message,
      },
    });
    throw error;
  }
}

export async function updateBusinessProvisioningStatus(
  businessId: string,
  status: BusinessProvisioningStatus,
  error: string | null = null
) {
  return db.business.update({
    where: { id: businessId },
    data: {
      provisioningStatus: status,
      provisioningLastRunAt: new Date(),
      provisioningError: error,
    },
  });
}
