'use server';

import { BusinessProvisioningStatus, ManagedTwilioStatus, SubscriptionStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  buildPendingOwnerClerkId,
  connectExistingBusinessOwner,
  inviteBusinessOwner,
  runAdminProvisioning,
  syncBusinessTwilioWebhooks,
  updateBusinessProvisioningStatus,
} from '@/lib/admin-provisioning';
import { deleteDeletableTestBusiness } from '@/lib/admin-business-lifecycle';
import { requireAdmin } from '@/lib/admin';
import { canDeleteTestBusiness, getDeleteTestBusinessBlockedReason } from '@/lib/admin-dashboard';
import { logAuditEvent } from '@/lib/audit-log';
import { db } from '@/lib/db';
import { formatPhoneDetail, maskSid, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { maskPhoneForAudit, normalizePhoneNumber, normalizePhoneNumberToE164 } from '@/lib/phone';
import { sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
import {
  adminArchiveBusinessSchema,
  adminBusinessDraftSchema,
  adminConnectExistingOwnerSchema,
  adminDeleteBusinessSchema,
  adminInviteOwnerSchema,
  adminSendTestSmsSchema,
  adminBusinessUpdateSchema,
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

function getAdminReturnPath(returnTo: string | null | undefined) {
  const trimmed = returnTo?.trim() || '';
  if (!trimmed.startsWith('/admin')) return null;
  return trimmed;
}

function appendParamsToAdminPath(
  path: string | null | undefined,
  params: Record<string, string | number | boolean | null | undefined>,
  fallback: string
) {
  const base = getAdminReturnPath(path);
  if (!base) return fallback;

  const url = new URL(base, 'http://callbackcloser.local');
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function clearBusinessSelectionFromReturnPath(
  path: string | null | undefined,
  params: Record<string, string | number | boolean | null | undefined>,
  fallback: string
) {
  const base = getAdminReturnPath(path);
  if (!base) return fallback;

  const url = new URL(base, 'http://callbackcloser.local');
  url.searchParams.delete('businessId');
  url.searchParams.delete('q');
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
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
  revalidatePath(`/admin/${businessId}/workspace`);
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

async function loadBusinessForLifecycleAction(businessId: string) {
  return db.business.findUnique({
    where: { id: businessId },
    include: {
      notificationSettings: true,
    },
  });
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
      isTestBusiness: true,
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
      isTestBusiness: true,
      archivedAt: null,
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
  redirect(`/admin?createdDemo=1&createdBusinessId=${encodeURIComponent(business.id)}`);
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
      isTestBusiness: data.isTestBusiness,
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
  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'onboarding.business_workspace_created',
    category: 'ONBOARDING',
    status: 'PENDING',
    summary: 'Business workspace created',
    details: {
      ownerEmail: data.ownerEmail.trim().toLowerCase(),
      ownerPhone: formatPhoneDetail(ownerPhone),
      isTestBusiness: data.isTestBusiness,
    },
  });

  let redirectPath: string;
  try {
    await runAdminProvisioning({
      businessId: business.id,
      mode: 'NEW_NUMBER',
      areaCode: data.areaCode || null,
    });

    redirectPath = buildAdminBusinessRedirectPath(business.id, {
      created: 1,
      provisioned: 1,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Business created, but managed Twilio provisioning failed.';
    redirectPath = buildAdminBusinessRedirectPath(business.id, {
      created: 1,
      error: message,
    });
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
  const testFlagChanged = existingBusiness.isTestBusiness !== data.isTestBusiness;

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
    testFlagChanged
      ? {
          key: 'isTestBusiness',
          label: 'test business flag',
          before: existingBusiness.isTestBusiness ? 'true' : 'false',
          after: data.isTestBusiness ? 'true' : 'false',
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
      isTestBusiness: data.isTestBusiness,
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
    await recordBusinessOperatorEvent({
      businessId: data.businessId,
      type: managedTwilioStatusChanged || a2pMetadataChanged ? 'admin.readiness_tracking_updated' : 'admin.business_profile_updated',
      category: managedTwilioStatusChanged || a2pMetadataChanged ? 'ONBOARDING' : 'ADMIN_ACTIONS',
      status: managedTwilioStatusChanged || a2pMetadataChanged ? 'INFO' : 'SUCCESS',
      summary: managedTwilioStatusChanged || a2pMetadataChanged ? 'Onboarding tracking updated' : 'Business profile updated',
      details: {
        changedFields: buildChangedFieldMetadata(changedFields),
      },
    });
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

export async function inviteBusinessOwnerAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminInviteOwnerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid owner invite request.')}`);
  }

  let redirectPath: string;
  try {
    const result = await inviteBusinessOwner({
      businessId: parsed.data.businessId,
      ownerEmail: parsed.data.ownerEmail,
      ownerName: parsed.data.ownerName || null,
    });

    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, { ownerAction: result.state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner invite failed.';
    await db.business.update({
      where: { id: parsed.data.businessId },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
      },
    });
    await recordBusinessOperatorEvent({
      businessId: parsed.data.businessId,
      type: 'onboarding.owner_invite_failed',
      category: 'ONBOARDING',
      status: 'FAILED',
      summary: 'Owner invite failed',
      details: {
        error: message,
      },
    });

    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, { error: message });
  }

  await revalidateAdminPaths(parsed.data.businessId);
  redirect(redirectPath);
}

export async function connectExistingBusinessOwnerAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminConnectExistingOwnerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid owner connection request.')}`);
  }

  let redirectPath: string;
  try {
    await connectExistingBusinessOwner({
      businessId: parsed.data.businessId,
      ownerEmail: parsed.data.ownerEmail,
      ownerName: parsed.data.ownerName || null,
      ownerClerkId: parsed.data.ownerClerkId || null,
    });

    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, { ownerAction: 'connected' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner connection failed.';
    await db.business.update({
      where: { id: parsed.data.businessId },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
      },
    });
    await recordBusinessOperatorEvent({
      businessId: parsed.data.businessId,
      type: 'onboarding.owner_connection_failed',
      category: 'ONBOARDING',
      status: 'FAILED',
      summary: 'Owner connection failed',
      details: {
        error: message,
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
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'webhooks.sync_failed',
      category: 'WEBHOOKS',
      status: 'FAILED',
      summary: 'Webhook sync failed',
      details: {
        target: parsed.data.target,
        error: message,
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

export async function sendBusinessTestSmsAction(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = adminSendTestSmsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid test SMS request.')}`);
  }

  const business = await loadBusinessForLifecycleAction(parsed.data.businessId);
  if (!business) {
    redirect(`/admin?error=${encodeURIComponent('Business not found.')}`);
  }

  const destinationPhone = normalizeOptionalE164Phone(parsed.data.destinationPhone, 'Test SMS destination');
  const fromPhone = business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber;
  if (!fromPhone) {
    redirect(buildAdminBusinessRedirectPath(business.id, { error: 'A business texting number is required before sending a test SMS.' }));
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
      body: `CallbackCloser admin test: ${business.name} is using ${fromPhone} for live support verification.`,
      participant: 'OWNER',
      twilioSubaccountSid: business.twilioSubaccountSid,
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
      redirect(
        buildAdminBusinessRedirectPath(business.id, {
          error: `Test SMS was suppressed: ${result.reason.replace(/_/g, ' ')}.`,
        })
      );
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

    logAuditEvent({
      event: 'admin_test_sms_sent',
      actorType: 'user',
      actorId: admin.userId,
      businessId: business.id,
      targetType: 'business',
      targetId: business.id,
      metadata: {
        actorEmail: admin.email,
        destinationPhone: maskPhoneForAudit(destinationPhone),
        messageSid: result.sent.sid,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send test SMS.';
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'admin.test_sms_failed',
      category: 'ADMIN_ACTIONS',
      status: 'FAILED',
      summary: 'Test SMS failed',
      details: {
        destinationPhone: formatPhoneDetail(destinationPhone),
        error: message,
      },
    });
    redirect(buildAdminBusinessRedirectPath(business.id, { error: message }));
  }

  await revalidateAdminPaths(business.id);
  redirect(buildAdminBusinessRedirectPath(business.id, { testSms: 1 }));
}

export async function archiveBusinessAction(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = adminArchiveBusinessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid archive request.')}`);
  }

  const business = await loadBusinessForLifecycleAction(parsed.data.businessId);
  if (!business) {
    redirect(appendParamsToAdminPath(parsed.data.returnTo, { error: 'Business not found.' }, `/admin?error=${encodeURIComponent('Business not found.')}`));
  }

  if (parsed.data.confirmationName !== business.name) {
    redirect(
      appendParamsToAdminPath(
        parsed.data.returnTo,
        { error: 'Type the exact business name to archive it.' },
        buildAdminBusinessRedirectPath(business.id, { error: 'Type the exact business name to archive it.' })
      )
    );
  }

  await db.business.update({
    where: { id: business.id },
    data: {
      archivedAt: new Date(),
      provisioningStatus: BusinessProvisioningStatus.PAUSED,
      provisioningError: null,
      provisioningLastRunAt: new Date(),
    },
  });

  logAuditEvent({
    event: 'admin_business_archived',
    actorType: 'user',
    actorId: admin.userId,
    businessId: business.id,
    targetType: 'business',
    targetId: business.id,
    metadata: {
      actorEmail: admin.email,
      businessName: business.name,
      isTestBusiness: business.isTestBusiness,
    },
  });
  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'admin.business_archived',
    category: 'ADMIN_ACTIONS',
    status: 'WARNING',
    summary: 'Business archived',
    details: {
      businessName: business.name,
      isTestBusiness: business.isTestBusiness,
    },
  });

  await revalidateAdminPaths(business.id);
  redirect(
    appendParamsToAdminPath(parsed.data.returnTo, { archived: 1 }, buildAdminBusinessRedirectPath(business.id, { archived: 1 }))
  );
}

export async function restoreBusinessAction(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = adminArchiveBusinessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid restore request.')}`);
  }

  const business = await loadBusinessForLifecycleAction(parsed.data.businessId);
  if (!business) {
    redirect(appendParamsToAdminPath(parsed.data.returnTo, { error: 'Business not found.' }, `/admin?error=${encodeURIComponent('Business not found.')}`));
  }

  if (parsed.data.confirmationName !== business.name) {
    redirect(
      appendParamsToAdminPath(
        parsed.data.returnTo,
        { error: 'Type the exact business name to restore it.' },
        buildAdminBusinessRedirectPath(business.id, { error: 'Type the exact business name to restore it.' })
      )
    );
  }

  await db.business.update({
    where: { id: business.id },
    data: {
      archivedAt: null,
      provisioningStatus:
        business.provisioningStatus === BusinessProvisioningStatus.PAUSED ? BusinessProvisioningStatus.ONBOARDING : business.provisioningStatus,
      provisioningLastRunAt: new Date(),
    },
  });

  logAuditEvent({
    event: 'admin_business_restored',
    actorType: 'user',
    actorId: admin.userId,
    businessId: business.id,
    targetType: 'business',
    targetId: business.id,
    metadata: {
      actorEmail: admin.email,
      businessName: business.name,
    },
  });
  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'admin.business_restored',
    category: 'ADMIN_ACTIONS',
    status: 'SUCCESS',
    summary: 'Business restored',
    details: {
      businessName: business.name,
    },
  });

  await revalidateAdminPaths(business.id);
  redirect(
    appendParamsToAdminPath(parsed.data.returnTo, { restored: 1 }, buildAdminBusinessRedirectPath(business.id, { restored: 1 }))
  );
}

export async function deleteTestBusinessAction(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = adminDeleteBusinessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid delete request.')}`);
  }

  const business = await loadBusinessForLifecycleAction(parsed.data.businessId);
  if (!business) {
    redirect(appendParamsToAdminPath(parsed.data.returnTo, { error: 'Business not found.' }, `/admin?error=${encodeURIComponent('Business not found.')}`));
  }

  if (parsed.data.confirmationName !== business.name) {
    redirect(
      appendParamsToAdminPath(
        parsed.data.returnTo,
        { error: 'Type the exact business name to delete it.' },
        buildAdminBusinessRedirectPath(business.id, { error: 'Type the exact business name to delete it.' })
      )
    );
  }

  const deleteBlockedReason = getDeleteTestBusinessBlockedReason(business);
  if (deleteBlockedReason || !canDeleteTestBusiness(business)) {
    redirect(
      appendParamsToAdminPath(
        parsed.data.returnTo,
        { error: deleteBlockedReason || 'Only archived demo/test businesses can be deleted.' },
        buildAdminBusinessRedirectPath(business.id, {
          error: deleteBlockedReason || 'Only archived demo/test businesses can be deleted.',
        })
      )
    );
  }

  await deleteDeletableTestBusiness(business.id);

  logAuditEvent({
    event: 'admin_test_business_deleted',
    actorType: 'user',
    actorId: admin.userId,
    businessId: business.id,
    targetType: 'business',
    targetId: business.id,
    metadata: {
      actorEmail: admin.email,
      businessName: business.name,
      isTestBusiness: business.isTestBusiness,
    },
  });

  revalidatePath('/admin');
  redirect(clearBusinessSelectionFromReturnPath(parsed.data.returnTo, { deleted: 1 }, '/admin?deleted=1'));
}
