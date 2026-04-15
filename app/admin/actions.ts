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
import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
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

  try {
    const ownerResult = await connectOrInviteBusinessOwner({
      businessId: business.id,
      ownerEmail: data.ownerEmail,
      ownerName: data.ownerName || null,
      inviteIfMissing: true,
    });

    await revalidateAdminPaths(business.id);
    redirect(
      buildAdminBusinessRedirectPath(business.id, {
        created: 1,
        ownerState: ownerResult.state,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Business created, but owner setup failed.';

    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
      },
    });

    await revalidateAdminPaths(business.id);
    redirect(buildAdminBusinessRedirectPath(business.id, { created: 1, error: message }));
  }
}

export async function saveAdminBusinessProfileAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminBusinessUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid admin business update.')}`);
  }

  const data = parsed.data;
  await db.business.update({
    where: { id: data.businessId },
    data: {
      ownerName: data.ownerName || null,
      name: data.name,
      forwardingNumber: normalizePhoneNumber(data.forwardingNumber),
      notifyPhone: normalizePhoneNumber(data.ownerPhone || '') || null,
      missedCallSeconds: data.missedCallSeconds,
      serviceLabel1: data.serviceLabel1,
      serviceLabel2: data.serviceLabel2,
      serviceLabel3: data.serviceLabel3,
      timezone: data.timezone,
      internalNotes: data.internalNotes || null,
      provisioningError: null,
    },
  });

  await db.businessNotificationSettings.upsert({
    where: { businessId: data.businessId },
    create: {
      businessId: data.businessId,
      ownerPhone: normalizePhoneNumber(data.ownerPhone || '') || null,
      ownerEmail: data.ownerEmail.trim().toLowerCase(),
      notifySms: data.notifySms,
      notifyEmail: data.notifyEmail,
      notifyInApp: data.notifyInApp,
      urgentOnly: data.urgentOnly,
    },
    update: {
      ownerPhone: normalizePhoneNumber(data.ownerPhone || '') || null,
      ownerEmail: data.ownerEmail.trim().toLowerCase(),
      notifySms: data.notifySms,
      notifyEmail: data.notifyEmail,
      notifyInApp: data.notifyInApp,
      urgentOnly: data.urgentOnly,
    },
  });

  await revalidateAdminPaths(data.businessId);
  redirect(buildAdminBusinessRedirectPath(data.businessId, { saved: 1 }));
}

export async function connectBusinessOwnerAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminConnectOwnerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid owner connection request.')}`);
  }

  try {
    const result = await connectOrInviteBusinessOwner({
      businessId: parsed.data.businessId,
      ownerEmail: parsed.data.ownerEmail,
      ownerName: parsed.data.ownerName || null,
      ownerClerkId: parsed.data.ownerClerkId || null,
      inviteIfMissing: true,
    });

    await revalidateAdminPaths(parsed.data.businessId);
    redirect(buildAdminBusinessRedirectPath(parsed.data.businessId, { ownerState: result.state }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner setup failed.';
    await db.business.update({
      where: { id: parsed.data.businessId },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
      },
    });

    await revalidateAdminPaths(parsed.data.businessId);
    redirect(buildAdminBusinessRedirectPath(parsed.data.businessId, { error: message }));
  }
}

export async function provisionBusinessAction(formData: FormData) {
  await requireAdmin();

  const parsed = adminProvisionBusinessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid provisioning request.')}`);
  }

  try {
    await runAdminProvisioning({
      businessId: parsed.data.businessId,
      mode: parsed.data.mode,
      areaCode: parsed.data.areaCode || null,
      existingNumberSid: parsed.data.existingNumberSidSelect || parsed.data.existingNumberSidManual || parsed.data.existingNumberSid || null,
    });

    await revalidateAdminPaths(parsed.data.businessId);
    redirect(
      buildAdminBusinessRedirectPath(parsed.data.businessId, {
        provisioned: 1,
        mode: parsed.data.mode.toLowerCase(),
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provisioning failed.';
    await revalidateAdminPaths(parsed.data.businessId);
    redirect(buildAdminBusinessRedirectPath(parsed.data.businessId, { error: message }));
  }
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

  try {
    await syncBusinessTwilioWebhooks(business, options);
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningError: null,
      },
    });
    await revalidateAdminPaths(business.id);
    redirect(buildAdminBusinessRedirectPath(business.id, { synced: parsed.data.target.toLowerCase() }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook sync failed.';
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
      },
    });

    await revalidateAdminPaths(business.id);
    redirect(buildAdminBusinessRedirectPath(business.id, { error: message }));
  }
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
