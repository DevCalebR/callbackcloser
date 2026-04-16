'use server';

import { BusinessProvisioningStatus, ManagedTwilioStatus, SubscriptionStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  buildPendingOwnerClerkId,
  connectOrInviteBusinessOwner,
  runAdminProvisioning,
  syncBusinessTwilioWebhooks,
  updateBusinessProvisioningStatus,
} from '@/lib/admin-provisioning';
import { requireAdmin } from '@/lib/admin';
import { logAuditEvent } from '@/lib/audit-log';
import { db } from '@/lib/db';
import { maskPhoneForAudit, normalizePhoneNumber, normalizePhoneNumberToE164 } from '@/lib/phone';
import {
  adminBusinessDraftSchema,
  adminBusinessUpdateSchema,
  adminConnectOwnerSchema,
  adminProvisionBusinessSchema,
  adminProvisioningStatusSchema,
  adminWebhookSyncSchema,
} from '@/lib/validators';

const DEMO_OWNER_CLERK_ID = 'simulator_demo_callbackcloser';
const DEFAULT_DEMO_NAME = 'CallbackCloser Demo';
const DEFAULT_DEMO_TEXTING_NUMBER = '+15005550006';
const DEFAULT_DEMO_FORWARDING_NUMBER = '+15005550001';

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function buildAdminBusinessRedirectPath(
  businessId: string,
  params: Record<string, string | number | boolean | null | undefined> = {}
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `/admin/${businessId}?${query}` : `/admin/${businessId}`;
}

async function revalidateAdminPaths(businessId: string) {
  revalidatePath('/admin');
  revalidatePath(`/admin/${businessId}`);
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

function buildChangedFieldMetadata(changes: Array<{ key: string; label: string; before: string | null; after: string | null }>) {
  return changes.map((change) => ({
    key: change.key,
    label: change.label,
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
  }));
}

export async function createDemoBusinessAction(formData: FormData) {
  const admin = await requireAdmin();
  const ownerPhone = normalizePhoneNumber(getString(formData, 'ownerPhone')) || null;
  const ownerEmail = getString(formData, 'ownerEmail').toLowerCase() || admin.email || null;
  const forwardingNumber = normalizePhoneNumber(getString(formData, 'forwardingNumber')) || ownerPhone || DEFAULT_DEMO_FORWARDING_NUMBER;
  const existingBusiness = await db.business.findUnique({ where: { ownerClerkId: DEMO_OWNER_CLERK_ID } });
  const demoTextingNumber = existingBusiness?.twilioPrimaryPhoneNumber || DEFAULT_DEMO_TEXTING_NUMBER;

  const business = await db.business.upsert({
    where: { ownerClerkId: DEMO_OWNER_CLERK_ID },
    create: {
      ownerClerkId: DEMO_OWNER_CLERK_ID,
      ownerName: 'CallbackCloser Demo',
      name: DEFAULT_DEMO_NAME,
      forwardingNumber,
      notifyPhone: ownerPhone,
      provisioningStatus: BusinessProvisioningStatus.DRAFT,
      missedCallSeconds: 20,
      serviceLabel1: 'Repair',
      serviceLabel2: 'Install',
      serviceLabel3: 'Maintenance',
      timezone: 'America/New_York',
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionStatusUpdatedAt: new Date(),
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      managedTwilioStatusUpdatedAt: new Date(),
      twilioPrimaryPhoneNumber: demoTextingNumber,
      internalNotes: 'Dedicated demo workspace for simulator traffic.',
    },
    update: {
      ownerName: 'CallbackCloser Demo',
      name: DEFAULT_DEMO_NAME,
      forwardingNumber,
      notifyPhone: ownerPhone,
      provisioningStatus: BusinessProvisioningStatus.DRAFT,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      subscriptionStatusUpdatedAt: new Date(),
      managedTwilioStatusUpdatedAt: new Date(),
      twilioPrimaryPhoneNumber: demoTextingNumber,
      internalNotes: 'Dedicated demo workspace for simulator traffic.',
    },
  });

  await db.businessNotificationSettings.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      ownerPhone,
      ownerEmail,
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
    update: {
      ownerPhone,
      ownerEmail,
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
  });

  await revalidateAdminPaths(business.id);
  redirect(`/admin?createdDemo=1&businessId=${encodeURIComponent(business.id)}`);
}

export async function createAdminBusinessAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminBusinessDraftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid business draft.')}`);
  }

  const data = parsed.data;
  const ownerPhone = normalizePhoneNumber(data.ownerPhone || '') || null;
  const forwardingNumber = normalizePhoneNumber(data.forwardingNumber);

  const business = await db.business.create({
    data: {
      ownerClerkId: buildPendingOwnerClerkId(),
      ownerName: data.ownerName || null,
      name: data.name,
      forwardingNumber,
      notifyPhone: ownerPhone,
      provisioningStatus: BusinessProvisioningStatus.DRAFT,
      missedCallSeconds: data.missedCallSeconds,
      serviceLabel1: data.serviceLabel1,
      serviceLabel2: data.serviceLabel2,
      serviceLabel3: data.serviceLabel3,
      timezone: data.timezone,
      subscriptionStatus: SubscriptionStatus.INACTIVE,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      managedTwilioStatusUpdatedAt: new Date(),
    },
  });

  await db.businessNotificationSettings.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      ownerPhone,
      ownerEmail: data.ownerEmail.trim().toLowerCase(),
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
    update: {
      ownerPhone,
      ownerEmail: data.ownerEmail.trim().toLowerCase(),
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
  });

  let redirectPath: string;
  try {
    const ownerResult = await connectOrInviteBusinessOwner({
      businessId: business.id,
      ownerEmail: data.ownerEmail,
      ownerName: data.ownerName || null,
      inviteIfMissing: true,
    });

    redirectPath = buildAdminBusinessRedirectPath(business.id, {
      created: 1,
      ownerState: ownerResult.state,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Business created, but owner setup failed.';

    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
      },
    });

    redirectPath = buildAdminBusinessRedirectPath(business.id, { created: 1, error: message });
  }

  await revalidateAdminPaths(business.id);
  redirect(redirectPath);
}

export async function saveAdminBusinessProfileAction(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = adminBusinessUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid admin business update.')}`);
  }

  const data = parsed.data;
  const existingBusiness = await db.business.findUnique({
    where: { id: data.businessId },
    include: {
      notificationSettings: true,
    },
  });

  if (!existingBusiness) {
    redirect(`/admin?error=${encodeURIComponent('Business not found.')}`);
  }

  const ownerPhone = normalizeOptionalE164Phone(data.ownerPhone || '', 'Owner alert phone');
  const twilioPhoneNumber = normalizeOptionalE164Phone(data.twilioPhoneNumber || '', 'Twilio number');
  const twilioPhoneNumberSid = normalizeOptionalSid(data.twilioPhoneNumberSid);
  const twilioMessagingServiceSid = normalizeOptionalSid(data.twilioMessagingServiceSid);
  const a2pCustomerProfileSid = normalizeOptionalSid(data.a2pCustomerProfileSid);
  const a2pBrandSid = normalizeOptionalSid(data.a2pBrandSid);
  const a2pCampaignSid = normalizeOptionalSid(data.a2pCampaignSid);
  const a2pFailureReason = data.a2pFailureReason?.trim() || null;
  const existingOwnerPhone = existingBusiness.notificationSettings?.ownerPhone || existingBusiness.notifyPhone || null;
  const existingTwilioPhoneNumber = existingBusiness.twilioPrimaryPhoneNumber || existingBusiness.twilioPhoneNumber || null;
  const existingTwilioPhoneNumberSid = existingBusiness.twilioPrimaryNumberSid || existingBusiness.twilioPhoneNumberSid || null;
  const criticalFieldClears = [
    existingOwnerPhone && !ownerPhone ? 'owner alert phone' : null,
    existingTwilioPhoneNumber && !twilioPhoneNumber ? 'Twilio number' : null,
    existingTwilioPhoneNumberSid && !twilioPhoneNumberSid ? 'Twilio number SID' : null,
    existingBusiness.twilioMessagingServiceSid && !twilioMessagingServiceSid ? 'messaging service SID' : null,
  ].filter(Boolean) as string[];

  if (criticalFieldClears.length > 0 && !data.confirmCriticalFieldClears) {
    redirect(
      buildAdminBusinessRedirectPath(
        data.businessId,
        {
          error: `Confirm clearing live fields before removing: ${criticalFieldClears.join(', ')}.`,
        }
      )
    );
  }

  const twilioMappingChanged =
    existingTwilioPhoneNumber !== twilioPhoneNumber ||
    existingTwilioPhoneNumberSid !== twilioPhoneNumberSid ||
    existingBusiness.twilioMessagingServiceSid !== twilioMessagingServiceSid;
  const managedTwilioStatusChanged = existingBusiness.managedTwilioStatus !== data.managedTwilioStatus;
  const a2pMetadataChanged =
    existingBusiness.a2pCustomerProfileSid !== a2pCustomerProfileSid ||
    existingBusiness.a2pBrandSid !== a2pBrandSid ||
    existingBusiness.a2pCampaignSid !== a2pCampaignSid ||
    existingBusiness.a2pFailureReason !== a2pFailureReason;

  const changedFields = [
    existingOwnerPhone !== ownerPhone
      ? { key: 'ownerPhone', label: 'owner alert phone', before: existingOwnerPhone, after: ownerPhone }
      : null,
    existingTwilioPhoneNumber !== twilioPhoneNumber
      ? { key: 'twilioPhoneNumber', label: 'Twilio number', before: existingTwilioPhoneNumber, after: twilioPhoneNumber }
      : null,
    existingTwilioPhoneNumberSid !== twilioPhoneNumberSid
      ? { key: 'twilioPhoneNumberSid', label: 'Twilio number SID', before: existingTwilioPhoneNumberSid, after: twilioPhoneNumberSid }
      : null,
    existingBusiness.twilioMessagingServiceSid !== twilioMessagingServiceSid
      ? {
          key: 'twilioMessagingServiceSid',
          label: 'messaging service SID',
          before: existingBusiness.twilioMessagingServiceSid,
          after: twilioMessagingServiceSid,
        }
      : null,
    existingBusiness.a2pCustomerProfileSid !== a2pCustomerProfileSid
      ? {
          key: 'a2pCustomerProfileSid',
          label: 'A2P customer profile SID',
          before: existingBusiness.a2pCustomerProfileSid,
          after: a2pCustomerProfileSid,
        }
      : null,
    existingBusiness.a2pBrandSid !== a2pBrandSid
      ? {
          key: 'a2pBrandSid',
          label: 'A2P brand SID',
          before: existingBusiness.a2pBrandSid,
          after: a2pBrandSid,
        }
      : null,
    existingBusiness.a2pCampaignSid !== a2pCampaignSid
      ? {
          key: 'a2pCampaignSid',
          label: 'A2P campaign SID',
          before: existingBusiness.a2pCampaignSid,
          after: a2pCampaignSid,
        }
      : null,
    existingBusiness.a2pFailureReason !== a2pFailureReason
      ? {
          key: 'a2pFailureReason',
          label: 'A2P failure reason',
          before: existingBusiness.a2pFailureReason,
          after: a2pFailureReason,
        }
      : null,
    managedTwilioStatusChanged
      ? {
          key: 'managedTwilioStatus',
          label: 'managed Twilio status',
          before: existingBusiness.managedTwilioStatus,
          after: data.managedTwilioStatus,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; before: string | null; after: string | null }>;

  await db.business.update({
    where: { id: data.businessId },
    data: {
      ownerName: data.ownerName || null,
      name: data.name,
      forwardingNumber: normalizePhoneNumber(data.forwardingNumber),
      notifyPhone: ownerPhone,
      missedCallSeconds: data.missedCallSeconds,
      serviceLabel1: data.serviceLabel1,
      serviceLabel2: data.serviceLabel2,
      serviceLabel3: data.serviceLabel3,
      timezone: data.timezone,
      internalNotes: data.internalNotes || null,
      provisioningError: null,
      managedTwilioStatus: data.managedTwilioStatus as ManagedTwilioStatus,
      managedTwilioStatusUpdatedAt: managedTwilioStatusChanged ? new Date() : existingBusiness.managedTwilioStatusUpdatedAt,
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
        ['AWAITING_BUSINESS_VERIFICATION', 'BRAND_SUBMITTED', 'CAMPAIGN_SUBMITTED'].includes(data.managedTwilioStatus)
          ? existingBusiness.a2pSubmittedAt || new Date()
          : existingBusiness.a2pSubmittedAt,
      a2pApprovedAt:
        data.managedTwilioStatus === ManagedTwilioStatus.COMPLIANT_LIVE
          ? existingBusiness.a2pApprovedAt || new Date()
          : managedTwilioStatusChanged
            ? null
            : existingBusiness.a2pApprovedAt,
      ...(a2pMetadataChanged || managedTwilioStatusChanged ? { provisioningLastRunAt: new Date() } : {}),
      ...(twilioMappingChanged ? { twilioWebhookSyncedAt: null } : {}),
    },
  });

  await db.businessNotificationSettings.upsert({
    where: { businessId: data.businessId },
    create: {
      businessId: data.businessId,
      ownerPhone,
      ownerEmail: data.ownerEmail.trim().toLowerCase(),
      notifySms: data.notifySms,
      notifyEmail: data.notifyEmail,
      notifyInApp: data.notifyInApp,
      urgentOnly: data.urgentOnly,
    },
    update: {
      ownerPhone,
      ownerEmail: data.ownerEmail.trim().toLowerCase(),
      notifySms: data.notifySms,
      notifyEmail: data.notifyEmail,
      notifyInApp: data.notifyInApp,
      urgentOnly: data.urgentOnly,
    },
  });

  if (changedFields.length > 0) {
    logAuditEvent({
      event: 'admin_business_editor_saved',
      actorType: 'user',
      actorId: admin.userId,
      businessId: data.businessId,
      targetType: 'business',
      targetId: data.businessId,
      metadata: {
        actorEmail: admin.email,
        changedFields: buildChangedFieldMetadata(changedFields),
        source: 'admin_dashboard',
      },
    });
  }

  await revalidateAdminPaths(data.businessId);
  revalidatePath('/app/settings');
  revalidatePath('/app/call-flow');
  redirect(
    buildAdminBusinessRedirectPath(data.businessId, {
      saved: 1,
      changed: changedFields.map((field) => field.key).join(','),
    })
  );
}

export async function connectBusinessOwnerAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminConnectOwnerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid owner connection request.')}`);
  }

  let redirectPath: string;
  try {
    const result = await connectOrInviteBusinessOwner({
      businessId: parsed.data.businessId,
      ownerEmail: parsed.data.ownerEmail,
      ownerName: parsed.data.ownerName || null,
      ownerClerkId: parsed.data.ownerClerkId || null,
      inviteIfMissing: true,
    });

    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, { ownerState: result.state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner setup failed.';
    await db.business.update({
      where: { id: parsed.data.businessId },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
      },
    });

    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, { error: message });
  }

  await revalidateAdminPaths(parsed.data.businessId);
  redirect(redirectPath);
}

export async function provisionBusinessAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminProvisionBusinessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid provisioning request.')}`);
  }

  let redirectPath: string;
  try {
    await runAdminProvisioning({
      businessId: parsed.data.businessId,
      mode: parsed.data.mode,
      areaCode: parsed.data.areaCode || null,
      existingNumberSid: parsed.data.existingNumberSidSelect || parsed.data.existingNumberSidManual || parsed.data.existingNumberSid || null,
    });

    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, {
      provisioned: 1,
      mode: parsed.data.mode.toLowerCase(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provisioning failed.';
    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, { error: message });
  }

  await revalidateAdminPaths(parsed.data.businessId);
  redirect(redirectPath);
}

export async function resyncBusinessWebhooksAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminWebhookSyncSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid webhook sync request.')}`);
  }

  const options =
    parsed.data.target === 'VOICE'
      ? { voice: true, sms: false, status: false }
      : parsed.data.target === 'SMS'
        ? { voice: false, sms: true, status: false }
        : { voice: true, sms: true, status: true };

  const business = await db.business.findUnique({
    where: { id: parsed.data.businessId },
    select: {
      id: true,
      twilioSubaccountSid: true,
      twilioPhoneNumberSid: true,
      twilioPrimaryNumberSid: true,
    },
  });

  if (!business) {
    redirect(`/admin?error=${encodeURIComponent('Business not found.')}`);
  }

  let redirectPath: string;
  try {
    await syncBusinessTwilioWebhooks(business, options);
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningError: null,
      },
    });
    redirectPath = buildAdminBusinessRedirectPath(business.id, { synced: parsed.data.target.toLowerCase() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook sync failed.';
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
      },
    });

    redirectPath = buildAdminBusinessRedirectPath(business.id, { error: message });
  }

  await revalidateAdminPaths(business.id);
  redirect(redirectPath);
}

export async function setBusinessProvisioningStatusAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminProvisioningStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid provisioning status update.')}`);
  }

  await updateBusinessProvisioningStatus(parsed.data.businessId, parsed.data.status as BusinessProvisioningStatus, null);
  await revalidateAdminPaths(parsed.data.businessId);
  redirect(buildAdminBusinessRedirectPath(parsed.data.businessId, { statusSaved: parsed.data.status.toLowerCase() }));
}
