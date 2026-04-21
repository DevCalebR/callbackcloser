'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ManagedTwilioStatus, TwilioAccountMode, TwilioNumberSetupMode } from '@prisma/client';

import { requireAdmin } from '@/lib/admin';
import { logAuditEvent } from '@/lib/audit-log';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import { db } from '@/lib/db';
import { formatPhoneDetail, maskSid, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { maskPhoneForAudit, normalizePhoneNumber, normalizePhoneNumberToE164 } from '@/lib/phone';
import { getTwilioBusinessClient } from '@/lib/twilio-client';
import { logTwilioError } from '@/lib/twilio-logging';
import { sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
import { provisionPhoneNumber } from '@/lib/twilio-provision';
import { syncTwilioIncomingPhoneNumberWebhooks } from '@/lib/twilio';
import {
  businessSettingsSchema,
  businessTwilioAdminOverrideSchema,
  businessTwilioSetupChoiceSchema,
  businessTwilioTestSmsSchema,
  buyNumberSchema,
} from '@/lib/validators';

async function getBusinessForOwner() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const business = await getBusinessForOwnerClerkId(userId);
  if (!business) redirect('/app/onboarding');
  return business;
}

async function saveBusinessTwilioNumber(businessId: string, params: { phoneNumber: string | null; phoneNumberSid: string; syncedAt: Date }) {
  const normalizedPhoneNumber = normalizePhoneNumber(params.phoneNumber);
  await db.business.update({
    where: { id: businessId },
    data: {
      twilioPhoneNumber: normalizedPhoneNumber,
      twilioPhoneNumberSid: params.phoneNumberSid,
      twilioPrimaryPhoneNumber: normalizedPhoneNumber,
      twilioPrimaryNumberSid: params.phoneNumberSid,
      twilioWebhookSyncedAt: params.syncedAt,
    },
  });
}

function normalizeOptionalE164Phone(value: string | null | undefined, label: string) {
  const trimmed = value?.trim() || '';
  if (!trimmed) return null;

  const normalized = normalizePhoneNumberToE164(trimmed);
  if (!normalized) {
    throw new Error(`${label} must be a valid phone number in E.164 or a standard US format.`);
  }

  return normalized;
}

function normalizeOptionalSid(value: string | null | undefined) {
  const trimmed = value?.trim() || '';
  return trimmed || null;
}

function maskSidForAudit(value: string | null | undefined) {
  const trimmed = value?.trim() || '';
  if (!trimmed) return null;
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export async function saveBusinessSettingsAction(formData: FormData) {
  const business = await getBusinessForOwner();
  const parsed = businessSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid form data')}`);
  }

  const user = await currentUser();
  const fallbackOwnerEmail =
    (user?.primaryEmailAddressId
      ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
      : user?.emailAddresses[0]?.emailAddress) || null;

  await db.business.update({
    where: { id: business.id },
    data: {
      name: parsed.data.name,
      forwardingNumber: normalizePhoneNumber(parsed.data.forwardingNumber),
      notifyPhone: normalizePhoneNumber(parsed.data.notifyPhone || '') || null,
      missedCallSeconds: parsed.data.missedCallSeconds,
      serviceLabel1: parsed.data.serviceLabel1,
      serviceLabel2: parsed.data.serviceLabel2,
      serviceLabel3: parsed.data.serviceLabel3,
      timezone: parsed.data.timezone,
    },
  });

  await db.businessNotificationSettings.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      ownerPhone: normalizePhoneNumber(parsed.data.notifyPhone || '') || null,
      ownerEmail: parsed.data.ownerEmail?.trim().toLowerCase() || fallbackOwnerEmail?.trim().toLowerCase() || null,
      notifySms: parsed.data.notifySms,
      notifyEmail: parsed.data.notifyEmail,
      notifyInApp: parsed.data.notifyInApp,
      urgentOnly: parsed.data.urgentOnly,
    },
    update: {
      ownerPhone: normalizePhoneNumber(parsed.data.notifyPhone || '') || null,
      ownerEmail: parsed.data.ownerEmail?.trim().toLowerCase() || fallbackOwnerEmail?.trim().toLowerCase() || null,
      notifySms: parsed.data.notifySms,
      notifyEmail: parsed.data.notifyEmail,
      notifyInApp: parsed.data.notifyInApp,
      urgentOnly: parsed.data.urgentOnly,
    },
  });

  revalidatePath('/app/settings');
  revalidatePath('/app/leads');
  revalidatePath(`/app/leads`);
  revalidatePath('/app/call-flow');
  redirect('/app/settings?saved=1');
}

export async function saveBusinessTwilioSetupChoiceAction(formData: FormData) {
  const business = await getBusinessForOwner();
  const parsed = businessTwilioSetupChoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid Twilio setup choice')}`);
  }

  await db.business.update({
    where: { id: business.id },
    data: {
      twilioAccountMode: parsed.data.twilioAccountMode as TwilioAccountMode,
      twilioNumberSetupMode: parsed.data.twilioNumberSetupMode as TwilioNumberSetupMode,
      provisioningLastRunAt: new Date(),
    },
  });

  revalidatePath('/app/settings');
  redirect('/app/settings?saved=1');
}

export async function saveBusinessTwilioAdminOverridesAction(formData: FormData) {
  const business = await getBusinessForOwner();
  const admin = await requireAdmin();
  const parsed = businessTwilioAdminOverrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid Twilio admin update')}`);
  }

  const twilioAccountMode = parsed.data.twilioAccountMode as TwilioAccountMode;
  const twilioNumberSetupMode = parsed.data.twilioNumberSetupMode as TwilioNumberSetupMode;
  const twilioSubaccountSid = twilioAccountMode === TwilioAccountMode.MAIN_ACCOUNT ? null : normalizeOptionalSid(parsed.data.twilioSubaccountSid);
  const twilioPhoneNumber = normalizeOptionalE164Phone(parsed.data.twilioPhoneNumber || '', 'Twilio number');
  const twilioPhoneNumberSid = normalizeOptionalSid(parsed.data.twilioPhoneNumberSid);
  const twilioMessagingServiceSid = normalizeOptionalSid(parsed.data.twilioMessagingServiceSid);
  const a2pCustomerProfileSid = normalizeOptionalSid(parsed.data.a2pCustomerProfileSid);
  const a2pBrandSid = normalizeOptionalSid(parsed.data.a2pBrandSid);
  const a2pCampaignSid = normalizeOptionalSid(parsed.data.a2pCampaignSid);
  const a2pFailureReason = parsed.data.a2pFailureReason?.trim() || null;
  const ownerPhone = normalizeOptionalE164Phone(parsed.data.ownerPhone || '', 'Owner alert phone');
  const notificationSettings = await db.businessNotificationSettings.findUnique({
    where: { businessId: business.id },
  });
  const existingOwnerPhone = notificationSettings?.ownerPhone || business.notifyPhone || null;
  const existingTwilioPhoneNumber = business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || null;
  const existingTwilioPhoneNumberSid = business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || null;
  const criticalFieldClears = [
    existingOwnerPhone && !ownerPhone ? 'owner alert phone' : null,
    business.twilioSubaccountSid && !twilioSubaccountSid && twilioAccountMode === TwilioAccountMode.BUSINESS_SUBACCOUNT ? 'Twilio subaccount SID' : null,
    existingTwilioPhoneNumber && !twilioPhoneNumber ? 'Twilio number' : null,
    existingTwilioPhoneNumberSid && !twilioPhoneNumberSid ? 'Twilio number SID' : null,
    business.twilioMessagingServiceSid && !twilioMessagingServiceSid ? 'messaging service SID' : null,
  ].filter(Boolean) as string[];

  if (criticalFieldClears.length > 0 && !parsed.data.confirmCriticalFieldClears) {
    redirect(`/app/settings?error=${encodeURIComponent(`Confirm clearing live fields before removing: ${criticalFieldClears.join(', ')}.`)}`);
  }

  const twilioMappingChanged =
    business.twilioAccountMode !== twilioAccountMode ||
    business.twilioNumberSetupMode !== twilioNumberSetupMode ||
    business.twilioSubaccountSid !== twilioSubaccountSid ||
    existingTwilioPhoneNumber !== twilioPhoneNumber ||
    existingTwilioPhoneNumberSid !== twilioPhoneNumberSid ||
    business.twilioMessagingServiceSid !== twilioMessagingServiceSid;
  const a2pMetadataChanged =
    business.a2pCustomerProfileSid !== a2pCustomerProfileSid ||
    business.a2pBrandSid !== a2pBrandSid ||
    business.a2pCampaignSid !== a2pCampaignSid ||
    business.a2pFailureReason !== a2pFailureReason;
  const managedTwilioStatusChanged = business.managedTwilioStatus !== parsed.data.managedTwilioStatus;

  const changedFields = [
    business.twilioAccountMode !== twilioAccountMode
      ? { key: 'twilioAccountMode', before: business.twilioAccountMode, after: twilioAccountMode }
      : null,
    business.twilioNumberSetupMode !== twilioNumberSetupMode
      ? { key: 'twilioNumberSetupMode', before: business.twilioNumberSetupMode, after: twilioNumberSetupMode }
      : null,
    business.twilioSubaccountSid !== twilioSubaccountSid
      ? { key: 'twilioSubaccountSid', before: business.twilioSubaccountSid, after: twilioSubaccountSid }
      : null,
    existingOwnerPhone !== ownerPhone ? { key: 'ownerPhone', before: existingOwnerPhone, after: ownerPhone } : null,
    existingTwilioPhoneNumber !== twilioPhoneNumber
      ? { key: 'twilioPhoneNumber', before: existingTwilioPhoneNumber, after: twilioPhoneNumber }
      : null,
    existingTwilioPhoneNumberSid !== twilioPhoneNumberSid
      ? { key: 'twilioPhoneNumberSid', before: existingTwilioPhoneNumberSid, after: twilioPhoneNumberSid }
      : null,
    business.twilioMessagingServiceSid !== twilioMessagingServiceSid
      ? { key: 'twilioMessagingServiceSid', before: business.twilioMessagingServiceSid, after: twilioMessagingServiceSid }
      : null,
    business.a2pCustomerProfileSid !== a2pCustomerProfileSid
      ? { key: 'a2pCustomerProfileSid', before: business.a2pCustomerProfileSid, after: a2pCustomerProfileSid }
      : null,
    business.a2pBrandSid !== a2pBrandSid ? { key: 'a2pBrandSid', before: business.a2pBrandSid, after: a2pBrandSid } : null,
    business.a2pCampaignSid !== a2pCampaignSid
      ? { key: 'a2pCampaignSid', before: business.a2pCampaignSid, after: a2pCampaignSid }
      : null,
    business.a2pFailureReason !== a2pFailureReason
      ? { key: 'a2pFailureReason', before: business.a2pFailureReason, after: a2pFailureReason }
      : null,
    managedTwilioStatusChanged
      ? { key: 'managedTwilioStatus', before: business.managedTwilioStatus, after: parsed.data.managedTwilioStatus }
      : null,
  ].filter(Boolean) as Array<{ key: string; before: string | null; after: string | null }>;

  await db.business.update({
    where: { id: business.id },
    data: {
      twilioAccountMode,
      twilioNumberSetupMode,
      twilioSubaccountSid,
      notifyPhone: ownerPhone,
      managedTwilioStatus: parsed.data.managedTwilioStatus as ManagedTwilioStatus,
      managedTwilioStatusUpdatedAt: managedTwilioStatusChanged ? new Date() : business.managedTwilioStatusUpdatedAt,
      twilioPhoneNumber,
      twilioPrimaryPhoneNumber: twilioPhoneNumber,
      twilioPhoneNumberSid,
      twilioPrimaryNumberSid: twilioPhoneNumberSid,
      twilioMessagingServiceSid,
      a2pCustomerProfileSid,
      a2pBrandSid,
      a2pCampaignSid,
      a2pFailureReason,
      a2pSubmittedAt:
        managedTwilioStatusChanged &&
        ['AWAITING_BUSINESS_VERIFICATION', 'BRAND_SUBMITTED', 'CAMPAIGN_SUBMITTED'].includes(parsed.data.managedTwilioStatus)
          ? business.a2pSubmittedAt || new Date()
          : business.a2pSubmittedAt,
      a2pApprovedAt:
        parsed.data.managedTwilioStatus === ManagedTwilioStatus.COMPLIANT_LIVE
          ? business.a2pApprovedAt || new Date()
          : managedTwilioStatusChanged
            ? null
            : business.a2pApprovedAt,
      ...(twilioMappingChanged ? { twilioWebhookSyncedAt: null } : {}),
      ...(twilioMappingChanged || a2pMetadataChanged || managedTwilioStatusChanged ? { provisioningLastRunAt: new Date() } : {}),
    },
  });

  await db.businessNotificationSettings.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      ownerPhone,
    },
    update: {
      ownerPhone,
    },
  });

  if (changedFields.length > 0) {
    logAuditEvent({
      event: 'business_settings_twilio_admin_saved',
      actorType: 'user',
      actorId: admin.userId,
      businessId: business.id,
      targetType: 'business',
      targetId: business.id,
      metadata: {
        actorEmail: admin.email,
        source: 'business_settings',
        changedFields: changedFields.map((change) => ({
          key: change.key,
          before:
            change.key === 'ownerPhone' || change.key === 'twilioPhoneNumber'
              ? maskPhoneForAudit(change.before)
              : change.key === 'a2pFailureReason'
                ? change.before
              : maskSidForAudit(change.before) ?? change.before,
          after:
            change.key === 'ownerPhone' || change.key === 'twilioPhoneNumber'
              ? maskPhoneForAudit(change.after)
              : change.key === 'a2pFailureReason'
                ? change.after
              : maskSidForAudit(change.after) ?? change.after,
        })),
      },
    });
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/call-flow');
  redirect(`/app/settings?adminTwilioSaved=1&adminChanged=${encodeURIComponent(changedFields.map((field) => field.key).join(','))}`);
}

export async function sendBusinessTwilioTestSmsAction(formData: FormData) {
  const business = await getBusinessForOwner();
  const parsed = businessTwilioTestSmsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid test SMS destination')}`);
  }

  const destinationPhone = normalizeOptionalE164Phone(parsed.data.destinationPhone, 'Test SMS destination');
  const fromPhone = business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber;
  if (!fromPhone) {
    redirect('/app/settings?error=Assign%20a%20business%20number%20before%20sending%20a%20test%20SMS');
  }

  try {
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'admin.test_sms_initiated',
      category: 'ADMIN_ACTIONS',
      status: 'PENDING',
      summary: 'Test SMS initiated',
      details: {
        destinationPhone: formatPhoneDetail(destinationPhone),
        fromPhone: formatPhoneDetail(fromPhone),
      },
    });

    const result = await sendAndPersistOutboundMessage({
      businessId: business.id,
      fromPhone,
      toPhone: destinationPhone!,
      body: `CallbackCloser setup test: ${business.name} is using ${fromPhone} for launch verification.`,
      participant: 'OWNER',
      context: 'admin_test',
      twilioSubaccountSid: business.twilioAccountMode === 'MAIN_ACCOUNT' ? null : business.twilioSubaccountSid,
      messagingServiceSid: business.twilioMessagingServiceSid,
      managedTwilioStatus: business.managedTwilioStatus,
      a2pFailureReason: business.a2pFailureReason,
    });

    if (result.suppressed) {
      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'admin.test_sms_suppressed',
        category: 'ADMIN_ACTIONS',
        status: 'WARNING',
        summary: 'Test SMS could not be sent',
        details: {
          destinationPhone: formatPhoneDetail(destinationPhone),
          reason: result.reason,
        },
      });
      redirect(`/app/settings?error=${encodeURIComponent(`Test SMS was suppressed: ${result.reason.replace(/_/g, ' ')}.`)}`);
    }

    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'admin.test_sms_accepted',
      category: 'ADMIN_ACTIONS',
      status: 'SUCCESS',
      summary: 'Test SMS accepted by Twilio',
      details: {
        destinationPhone: formatPhoneDetail(destinationPhone),
        fromPhone: formatPhoneDetail(fromPhone),
        messageSid: maskSid(result.sent.sid),
      },
      relatedEntityType: 'message',
      relatedEntityId: result.message.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Test SMS failed';
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'admin.test_sms_failed',
      category: 'ADMIN_ACTIONS',
      status: 'FAILED',
      summary: 'Test SMS failed',
      details: {
        error: message,
      },
    });
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/app/settings');
  redirect('/app/settings?twilioTestSms=1');
}

export async function buyTwilioNumberAction(formData: FormData) {
  const business = await getBusinessForOwner();
  const parsed = buyNumberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect('/app/settings?error=Invalid%20area%20code');
  }

  if (business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber) {
    redirect('/app/settings?error=This%20business%20already%20has%20a%20texting%20line');
  }

  const correlationId = `settings_buy_${business.id}`;
  try {
    await db.business.update({
      where: { id: business.id },
      data: {
        twilioNumberSetupMode: 'NEW_NUMBER',
      },
    });
    await provisionPhoneNumber({
      businessId: business.id,
      businessName: business.name,
      areaCode: parsed.data.areaCode,
      correlationId,
    });
  } catch (error) {
    logTwilioError(
      'provisioning',
      'settings_manual_provision_failed',
      {
        correlationId,
        businessId: business.id,
        decision: 'redirect_with_error',
      },
      error
    );
    const message = error instanceof Error ? error.message : 'Failed to provision business texting line';
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/call-flow');
  redirect('/app/settings?numberBought=1');
}

export async function connectExistingTwilioNumberAction(formData: FormData) {
  void formData;
  const business = await getBusinessForOwner();
  await db.business.update({
    where: { id: business.id },
    data: {
      twilioNumberSetupMode: 'EXISTING_NUMBER',
    },
  });
  redirect(
    '/app/settings?error=' +
      encodeURIComponent(
        'Keeping an existing number is still an admin-assisted launch step. CallbackCloser can attach it after the Twilio account context and A2P path are reviewed.'
      )
  );
}

export async function resyncTwilioWebhooksAction() {
  const business = await getBusinessForOwner();
  const phoneNumberSid = business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid;
  if (!phoneNumberSid) {
    redirect('/app/settings?error=No%20business%20texting%20line%20is%20assigned%20to%20this%20business');
  }

  try {
    const client = getTwilioBusinessClient(business.twilioAccountMode === 'MAIN_ACCOUNT' ? null : business.twilioSubaccountSid);
    const { number } = await syncTwilioIncomingPhoneNumberWebhooks(phoneNumberSid, client);
    const syncedAt = new Date();

    await saveBusinessTwilioNumber(business.id, {
      phoneNumber: number.phoneNumber,
      phoneNumberSid: number.sid,
      syncedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh managed texting setup';
    redirect(`/app/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/call-flow');
  redirect('/app/settings?twilioSynced=1');
}
