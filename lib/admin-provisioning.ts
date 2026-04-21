import { clerkClient } from '@clerk/nextjs/server';
import { BusinessProvisioningStatus, ManagedTwilioStatus, type Business, type BusinessNotificationSettings } from '@prisma/client';

import {
  buildPendingOwnerClerkId,
  isPendingOwnerClerkId,
  type TwilioWebhookSnapshot,
} from '@/lib/admin-provisioning-presenters';
import { ensureBusinessNotificationSettings } from '@/lib/business-notification-settings';
import { findClerkUserByEmail, getOwnerLinkStateForBusiness, type OwnerLinkState } from '@/lib/business-owner-link';
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
import { formatPhoneDetail, maskSid, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { normalizePhoneNumber } from '@/lib/phone';
import { getTwilioBusinessClient, hasTwilioClientEnv } from '@/lib/twilio-client';
import { getTwilioWebhookConfig, syncTwilioIncomingPhoneNumberWebhooks, type TwilioWebhookSyncOptions } from '@/lib/twilio';

export type AdminOwnerState = {
  connected: OwnerLinkState['connected'];
  pending: OwnerLinkState['pending'];
  accountReady: OwnerLinkState['accountReady'];
  needsRepair: OwnerLinkState['needsRepair'];
  status: OwnerLinkState['status'];
  invitedAt: Date | null;
  clerkUserId: string | null;
  name: string | null;
  email: string | null;
  detail: string;
};

export {
  adminProvisioningStatusLabels,
  buildAdminProvisioningChecklist,
  buildPendingOwnerClerkId,
  getAdminProvisioningStatusVariant,
  isPendingOwnerClerkId,
} from '@/lib/admin-provisioning-presenters';
export type { AdminProvisioningChecklistItem } from '@/lib/admin-provisioning-presenters';

export async function getAdminOwnerState(
  business: Pick<Business, 'id' | 'ownerClerkId' | 'ownerName' | 'ownerInviteSentAt'>,
  notificationSettings: Pick<BusinessNotificationSettings, 'ownerEmail'> | null
): Promise<AdminOwnerState> {
  return getOwnerLinkStateForBusiness(business, notificationSettings);
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

    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'onboarding.owner_connected',
      category: 'ONBOARDING',
      status: 'SUCCESS',
      summary: 'Owner connected to business',
      details: {
        ownerEmail,
        ownerClerkId: userId,
      },
    });

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

  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'onboarding.owner_invited',
    category: 'ONBOARDING',
    status: 'PENDING',
    summary: 'Owner invite sent',
    details: {
      ownerEmail,
      inviteSentAt: new Date().toISOString(),
    },
  });

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
  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'webhooks.sync_succeeded',
    category: 'WEBHOOKS',
    status: 'SUCCESS',
    summary: 'Webhook sync completed',
    details: {
      target: options,
      phoneNumber: formatPhoneDetail(normalizedPhoneNumber),
      phoneNumberSid: maskSid(number.sid),
      syncedAt: syncedAt.toISOString(),
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
  await recordBusinessOperatorEvent({
    businessId: params.business.id,
    type: 'provisioning.existing_number_attached',
    category: 'PROVISIONING',
    status: 'SUCCESS',
    summary: 'Existing number attached',
    details: {
      phoneNumber: formatPhoneDetail(syncedNumber.phoneNumber),
      phoneNumberSid: maskSid(syncedNumber.phoneNumberSid),
      messagingServiceSid: maskSid(messagingServiceSid),
      subaccountSid: maskSid(subaccountSid),
      correlationId,
    },
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
  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'provisioning.started',
    category: 'PROVISIONING',
    status: 'PENDING',
    summary: 'Provisioning started',
    details: {
      mode: params.mode,
      areaCode: params.areaCode ?? null,
      existingNumberSid: maskSid(params.existingNumberSid),
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
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'provisioning.run_completed',
      category: 'PROVISIONING',
      status: 'SUCCESS',
      summary: 'Provisioning run completed',
      details: {
        mode: params.mode,
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
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'provisioning.failed',
      category: 'PROVISIONING',
      status: 'FAILED',
      summary: 'Provisioning failed',
      details: {
        mode: params.mode,
        error: message,
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
  const updated = await db.business.update({
    where: { id: businessId },
    data: {
      provisioningStatus: status,
      provisioningLastRunAt: new Date(),
      provisioningError: error,
    },
  });
  await recordBusinessOperatorEvent({
    businessId,
    type: 'admin.provisioning_status_updated',
    category: 'ADMIN_ACTIONS',
    status: status === BusinessProvisioningStatus.PAUSED ? 'WARNING' : 'INFO',
    summary:
      status === BusinessProvisioningStatus.PAUSED
        ? 'Automation paused'
        : status === BusinessProvisioningStatus.LIVE
          ? 'Business marked live'
          : `Provisioning state set to ${status.toLowerCase().replace(/_/g, ' ')}`,
    details: {
      provisioningStatus: status,
      error,
    },
  });
  return updated;
}
