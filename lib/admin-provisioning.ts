import { clerkClient } from '@clerk/nextjs/server';
import { BusinessProvisioningStatus, ManagedTwilioStatus, type Business, type BusinessNotificationSettings } from '@prisma/client';

import {
  deriveAdminOwnerState,
  buildPendingOwnerClerkId,
  isPendingOwnerClerkId,
  type AdminOwnerState,
  type OwnerInvitationSnapshot,
  type TwilioWebhookSnapshot,
} from '@/lib/admin-provisioning-presenters';
import { ensureBusinessNotificationSettings } from '@/lib/business-notification-settings';
import { db } from '@/lib/db';
import { getConfiguredAppBaseUrl } from '@/lib/env.server';
import { findVerifiedClerkUserByEmail } from '@/lib/owner-linking';
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

export {
  adminProvisioningStatusLabels,
  buildAdminProvisioningChecklist,
  buildPendingOwnerClerkId,
  deriveAdminOwnerState,
  getAdminProvisioningStatusVariant,
  isPendingOwnerClerkId,
} from '@/lib/admin-provisioning-presenters';
export type { AdminProvisioningChecklistItem } from '@/lib/admin-provisioning-presenters';

export async function findClerkUserByEmail(email: string) {
  return findVerifiedClerkUserByEmail(email);
}

function invitationBelongsToBusiness(invitation: { publicMetadata: Record<string, unknown> | null }, businessId: string) {
  return invitation.publicMetadata?.businessId === businessId;
}

async function listOwnerInvitations(businessId: string, ownerEmail: string) {
  const normalizedEmail = ownerEmail.trim().toLowerCase();
  if (!normalizedEmail) return [] as OwnerInvitationSnapshot[];

  const client = await clerkClient();
  const invitations = await client.invitations.getInvitationList({
    query: normalizedEmail,
    limit: 10,
  });

  return invitations.data
    .filter((invitation) => invitation.emailAddress.trim().toLowerCase() === normalizedEmail)
    .filter((invitation) => invitationBelongsToBusiness(invitation, businessId))
    .map((invitation) => ({
      id: invitation.id,
      status: invitation.status,
      createdAt: new Date(invitation.createdAt),
    }))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export async function getAdminOwnerState(
  business: Pick<Business, 'id' | 'ownerClerkId' | 'ownerName' | 'ownerInviteSentAt'>,
  notificationSettings: Pick<BusinessNotificationSettings, 'ownerEmail'> | null
): Promise<AdminOwnerState> {
  const ownerEmail = notificationSettings?.ownerEmail?.trim().toLowerCase() || null;
  const invitation = ownerEmail ? (await listOwnerInvitations(business.id, ownerEmail))[0] || null : null;
  const existingUser = ownerEmail ? await findClerkUserByEmail(ownerEmail) : null;

  if (!isPendingOwnerClerkId(business.ownerClerkId)) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(business.ownerClerkId);
      const primaryEmail =
        user.primaryEmailAddressId
          ? user.emailAddresses.find((emailAddress) => emailAddress.id === user.primaryEmailAddressId)?.emailAddress
          : user.emailAddresses[0]?.emailAddress;
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || business.ownerName?.trim() || null;

      return deriveAdminOwnerState({
        ownerClerkId: business.ownerClerkId,
        ownerName: business.ownerName,
        ownerEmail,
        ownerInviteSentAt: business.ownerInviteSentAt,
        linkedUserId: user.id,
        linkedUserName: fullName,
        linkedUserEmail: primaryEmail || ownerEmail,
        existingUserIdByEmail: existingUser?.id || null,
        invitation,
      });
    } catch {
      return deriveAdminOwnerState({
        ownerClerkId: business.ownerClerkId,
        ownerName: business.ownerName,
        ownerEmail,
        ownerInviteSentAt: business.ownerInviteSentAt,
        existingUserIdByEmail: existingUser?.id || null,
        invitation,
      });
    }
  }

  return deriveAdminOwnerState({
    ownerClerkId: business.ownerClerkId,
    ownerName: business.ownerName,
    ownerEmail,
    ownerInviteSentAt: business.ownerInviteSentAt,
    existingUserIdByEmail: existingUser?.id || null,
    invitation,
  });
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

export async function inviteBusinessOwner(params: {
  businessId: string;
  ownerEmail: string;
  ownerName?: string | null;
}) {
  const ownerEmail = params.ownerEmail.trim().toLowerCase();
  if (!ownerEmail) {
    throw new Error('Owner email is required before you can send an invite.');
  }

  const business = await db.business.findUnique({
    where: { id: params.businessId },
    select: {
      id: true,
      name: true,
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
  const existingUser = await findClerkUserByEmail(ownerEmail);
  if (existingUser) {
    if (business.ownerClerkId === existingUser.id) {
      throw new Error('That owner is already connected to this business.');
    }
    throw new Error('A CallbackCloser account already exists for that email. Use Connect existing owner instead.');
  }

  const appBaseUrl = getConfiguredAppBaseUrl();
  const priorInvitations = await listOwnerInvitations(business.id, ownerEmail);
  for (const invitation of priorInvitations.filter((item) => item.status === 'pending')) {
    await client.invitations.revokeInvitation(invitation.id);
  }

  const invitation = await client.invitations.createInvitation({
    emailAddress: ownerEmail,
    notify: true,
    publicMetadata: {
      businessId: business.id,
      businessName: business.name,
    },
    ...(appBaseUrl ? { redirectUrl: `${appBaseUrl}/sign-up` } : {}),
  });

  const pendingOwnerId = isPendingOwnerClerkId(business.ownerClerkId) ? business.ownerClerkId : buildPendingOwnerClerkId();
  const invitedAt = new Date();
  await db.business.update({
    where: { id: business.id },
    data: {
      ownerClerkId: pendingOwnerId,
      ownerName: params.ownerName?.trim() || business.ownerName || null,
      ownerInviteSentAt: invitedAt,
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
    type: priorInvitations.some((item) => item.status === 'pending') ? 'onboarding.owner_invite_resent' : 'onboarding.owner_invited',
    category: 'ONBOARDING',
    status: 'PENDING',
    summary: priorInvitations.some((item) => item.status === 'pending') ? 'Owner invite resent' : 'Owner invite sent',
    details: {
      ownerEmail,
      inviteId: invitation.id,
      inviteStatus: invitation.status,
      inviteSentAt: invitedAt.toISOString(),
    },
  });

  return {
    state: priorInvitations.some((item) => item.status === 'pending') ? ('resent' as const) : ('invited' as const),
    ownerClerkId: pendingOwnerId,
    invitationId: invitation.id,
  };
}

export async function connectExistingBusinessOwner(params: {
  businessId: string;
  ownerEmail: string;
  ownerName?: string | null;
  ownerClerkId?: string | null;
}) {
  const ownerEmail = params.ownerEmail.trim().toLowerCase();
  if (!ownerEmail) {
    throw new Error('Owner email is required before you can connect an existing owner.');
  }

  const business = await db.business.findUnique({
    where: { id: params.businessId },
    select: {
      id: true,
      ownerClerkId: true,
      ownerName: true,
      notifyPhone: true,
    },
  });

  if (!business) {
    throw new Error('Business not found.');
  }

  let userId = params.ownerClerkId?.trim() || '';
  if (!userId) {
    const existingUser = await findClerkUserByEmail(ownerEmail);
    userId = existingUser?.id || '';
  }

  if (!userId) {
    throw new Error('No existing CallbackCloser account was found for that email. Use Invite owner by email instead.');
  }

  await assertOwnerNotAttachedElsewhere(userId, business.id);

  const invitations = await listOwnerInvitations(business.id, ownerEmail);
  if (invitations.length > 0) {
    const client = await clerkClient();
    for (const invitation of invitations.filter((item) => item.status === 'pending')) {
      await client.invitations.revokeInvitation(invitation.id);
    }
  }

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
    summary: 'Existing owner connected',
    details: {
      ownerEmail,
      ownerClerkId: userId,
      connectionMethod: params.ownerClerkId?.trim() ? 'clerk_user_id' : 'email_lookup',
    },
  });

  return { state: 'connected' as const, ownerClerkId: userId };
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
  business: Pick<Business, 'twilioAccountMode' | 'twilioSubaccountSid'>
) {
  if (!hasTwilioClientEnv()) {
    return {
      numbers: [] as Array<{ sid: string; phoneNumber: string | null; friendlyName: string | null }>,
      sourceLabel: null as string | null,
      error: 'Twilio credentials are not configured in this environment.',
    };
  }

  try {
    const client = getTwilioBusinessClient(business.twilioAccountMode === 'MAIN_ACCOUNT' ? null : business.twilioSubaccountSid);
    const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });
    return {
      numbers: numbers.map((number) => ({
        sid: number.sid,
        phoneNumber: normalizePhoneNumber(number.phoneNumber),
        friendlyName: number.friendlyName || null,
      })),
      sourceLabel: business.twilioAccountMode === 'MAIN_ACCOUNT' ? 'parent account' : 'business subaccount',
      error: null as string | null,
    };
  } catch (error) {
    return {
      numbers: [] as Array<{ sid: string; phoneNumber: string | null; friendlyName: string | null }>,
      sourceLabel: business.twilioAccountMode === 'MAIN_ACCOUNT' ? 'parent account' : 'business subaccount',
      error: error instanceof Error ? error.message : 'Unable to load Twilio numbers.',
    };
  }
}

export async function syncBusinessTwilioWebhooks(
  business: Pick<Business, 'id' | 'twilioAccountMode' | 'twilioSubaccountSid' | 'twilioPhoneNumberSid' | 'twilioPrimaryNumberSid'>,
  options: TwilioWebhookSyncOptions
) {
  const phoneNumberSid = business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid;
  if (!phoneNumberSid) {
    throw new Error('No Twilio number is assigned to this business yet.');
  }

  const client = getTwilioBusinessClient(business.twilioAccountMode === 'MAIN_ACCOUNT' ? null : business.twilioSubaccountSid);
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
    | 'twilioAccountMode'
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
  const subaccountSid =
    params.business.twilioAccountMode === 'MAIN_ACCOUNT'
      ? null
      : params.business.twilioSubaccountSid || (await createSubaccountForBusiness(params.business, correlationId));
  const client = getTwilioBusinessClient(params.business.twilioAccountMode === 'MAIN_ACCOUNT' ? null : subaccountSid);

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
      twilioAccountMode: true,
      twilioSubaccountSid: true,
      twilioNumberSetupMode: true,
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
      twilioNumberSetupMode: params.mode,
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
          twilioAccountMode: business.twilioAccountMode,
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
