'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAdmin } from '@/lib/admin';
import { logAuditEvent } from '@/lib/audit-log';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import { db } from '@/lib/db';
import { maskPhoneForAudit, normalizePhoneNumber, normalizePhoneNumberToE164 } from '@/lib/phone';
import { getTwilioBusinessClient } from '@/lib/twilio-client';
import { logTwilioError } from '@/lib/twilio-logging';
import { provisionPhoneNumber } from '@/lib/twilio-provision';
import { syncTwilioIncomingPhoneNumberWebhooks } from '@/lib/twilio';
import { businessSettingsSchema, businessTwilioAdminOverrideSchema, buyNumberSchema } from '@/lib/validators';

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

export async function saveBusinessTwilioAdminOverridesAction(formData: FormData) {
  const business = await getBusinessForOwner();
  const admin = await requireAdmin();
  const parsed = businessTwilioAdminOverrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid Twilio admin update')}`);
  }

  const twilioPhoneNumber = normalizeOptionalE164Phone(parsed.data.twilioPhoneNumber || '', 'Twilio number');
  const twilioPhoneNumberSid = normalizeOptionalSid(parsed.data.twilioPhoneNumberSid);
  const twilioMessagingServiceSid = normalizeOptionalSid(parsed.data.twilioMessagingServiceSid);
  const ownerPhone = normalizeOptionalE164Phone(parsed.data.ownerPhone || '', 'Owner alert phone');
  const notificationSettings = await db.businessNotificationSettings.findUnique({
    where: { businessId: business.id },
  });
  const existingOwnerPhone = notificationSettings?.ownerPhone || business.notifyPhone || null;
  const existingTwilioPhoneNumber = business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || null;
  const existingTwilioPhoneNumberSid = business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || null;
  const criticalFieldClears = [
    existingOwnerPhone && !ownerPhone ? 'owner alert phone' : null,
    existingTwilioPhoneNumber && !twilioPhoneNumber ? 'Twilio number' : null,
    existingTwilioPhoneNumberSid && !twilioPhoneNumberSid ? 'Twilio number SID' : null,
    business.twilioMessagingServiceSid && !twilioMessagingServiceSid ? 'messaging service SID' : null,
  ].filter(Boolean) as string[];

  if (criticalFieldClears.length > 0 && !parsed.data.confirmCriticalFieldClears) {
    redirect(`/app/settings?error=${encodeURIComponent(`Confirm clearing live fields before removing: ${criticalFieldClears.join(', ')}.`)}`);
  }

  const twilioMappingChanged =
    existingTwilioPhoneNumber !== twilioPhoneNumber ||
    existingTwilioPhoneNumberSid !== twilioPhoneNumberSid ||
    business.twilioMessagingServiceSid !== twilioMessagingServiceSid;

  const changedFields = [
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
  ].filter(Boolean) as Array<{ key: string; before: string | null; after: string | null }>;

  await db.business.update({
    where: { id: business.id },
    data: {
      notifyPhone: ownerPhone,
      twilioPhoneNumber,
      twilioPrimaryPhoneNumber: twilioPhoneNumber,
      twilioPhoneNumberSid,
      twilioPrimaryNumberSid: twilioPhoneNumberSid,
      twilioMessagingServiceSid,
      ...(twilioMappingChanged ? { twilioWebhookSyncedAt: null } : {}),
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
              : maskSidForAudit(change.before) ?? change.before,
          after:
            change.key === 'ownerPhone' || change.key === 'twilioPhoneNumber'
              ? maskPhoneForAudit(change.after)
              : maskSidForAudit(change.after) ?? change.after,
        })),
      },
    });
  }

  revalidatePath('/app/settings');
  revalidatePath('/app/call-flow');
  redirect(`/app/settings?adminTwilioSaved=1&adminChanged=${encodeURIComponent(changedFields.map((field) => field.key).join(','))}`);
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
  redirect(
    '/app/settings?error=' +
      encodeURIComponent(
        'Existing numbers are connected manually during white-glove launches so shared platform inventory stays off the self-serve settings page.'
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
    const client = getTwilioBusinessClient(business.twilioSubaccountSid);
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
