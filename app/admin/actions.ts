'use server';

import {
  BusinessPhoneSetupPath,
  BusinessProvisioningStatus,
  ForwardedCallAnswerMode,
  ForwardingVerificationStatus,
  ManagedTwilioStatus,
  MessagingSetupMode,
  MessagingComplianceType,
  PortingStatus,
  Prisma,
  SubscriptionStatus,
  TollFreeVerificationStatus,
  TwilioAccountMode,
  TwilioNumberSetupMode,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  buildPendingOwnerClerkId,
  connectExistingBusinessOwner,
  findClerkUserByEmail,
  getAdminOwnerState,
  getTwilioWebhookSnapshot,
  inviteBusinessOwner,
  runAdminProvisioning,
  syncBusinessTwilioWebhooks,
  updateBusinessProvisioningStatus,
} from '@/lib/admin-provisioning';
import {
  deleteAllBusinessesForFounderReset,
  deleteBusinessPermanently,
  deleteDeletableTestBusiness,
  FOUNDER_DELETE_ALL_BUSINESSES_CONFIRMATION,
} from '@/lib/admin-business-lifecycle';
import {
  PERMANENT_DELETE_EXTERNAL_REVIEW_NOTE,
  requiresRealCustomerDeleteConfirmation,
  validatePermanentDeleteConfirmation,
} from '@/lib/admin-business-delete';
import { buildAdminOnboardingConfidence, canDeleteTestBusiness, getDeleteTestBusinessBlockedReason } from '@/lib/admin-dashboard';
import { buildAdminMissedCallValidationTruth } from '@/lib/admin-operator-proof';
import { requireAdmin, requireFounderAdmin } from '@/lib/admin';
import {
  bulkDeleteTestDemoBusinesses,
  BULK_TEST_DATA_RESET_CONFIRMATION,
  DEMO_OWNER_CLERK_ID,
} from '@/lib/admin-test-data-reset';
import { logAuditEvent } from '@/lib/audit-log';
import { buildAdminTestSmsTruth, buildTwilioSetupUpdateEventMetadata } from '@/lib/admin-operator-visibility';
import { deriveTwilioNumberSetupModeFromPhoneSetupPath } from '@/lib/business-phone-setup';
import { sendCustomerReadyNotification } from '@/lib/customer-setup-handoff';
import { db } from '@/lib/db';
import { formatPhoneDetail, listBusinessOperatorEvents, maskSid, recordBusinessOperatorEvent } from '@/lib/operator-events';
import { maskPhoneForAudit, normalizePhoneNumber, normalizePhoneNumberToE164 } from '@/lib/phone';
import {
  getBusinessTwilioSaveErrorMessage,
  getMessagingComplianceSidValidationError,
  getOptionalTwilioSidError,
  getTestSmsSuppressionMessage,
  normalizeOptionalSid,
} from '@/lib/twilio-compliance';
import { sendAndPersistOutboundMessage } from '@/lib/twilio-messaging';
import {
  adminArchiveBusinessSchema,
  adminBulkDeleteTestBusinessesSchema,
  adminBusinessDraftSchema,
  adminConnectExistingOwnerSchema,
  adminDeleteBusinessSchema,
  adminForwardingVerificationSchema,
  adminInviteOwnerSchema,
  adminMarkBusinessLiveSchema,
  adminMissedCallValidationConfirmationSchema,
  adminSendTestSmsSchema,
  adminSetupBasicsSchema,
  adminTwilioSetupSchema,
  adminBusinessUpdateSchema,
  adminFounderDeleteAllBusinessesSchema,
  adminProvisionBusinessSchema,
  adminProvisioningStatusSchema,
  adminWebhookSyncSchema,
} from '@/lib/validators';
import { createMessagingServiceForBusiness, createSubaccountForBusiness } from '@/lib/managed-twilio';
import { buildTwilioSetupFlow } from '@/lib/twilio-setup';

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

const TWILIO_SETUP_STEP_KEYS = new Set([
  'owner_connected',
  'account_mode',
  'number_path',
  'account_ready',
  'messaging_service_ready',
  'number_assigned',
  'forwarding_verified',
  'voice_webhook_synced',
  'sms_webhook_synced',
  'status_callback_synced',
  'a2p_status_recorded',
  'test_sms_delivered',
  'missed_call_validated',
  'safe_to_mark_live',
]);

function getReturnStep(formData: FormData) {
  const value = getString(formData, 'returnStep');
  return TWILIO_SETUP_STEP_KEYS.has(value) ? value : null;
}

function withReturnStepParam(
  params: Record<string, string | number | boolean | null | undefined>,
  returnStep: string | null
) {
  if (!returnStep) return params;
  return {
    ...params,
    step: returnStep,
  };
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
  const step = typeof params.step === 'string' && TWILIO_SETUP_STEP_KEYS.has(params.step) ? params.step : null;

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  const path = query ? `/admin/${businessId}?${query}` : `/admin/${businessId}`;
  return step ? `${path}#step-${step}` : path;
}

async function revalidateAdminPaths(businessId: string) {
  revalidatePath('/admin');
  revalidatePath(`/admin/${businessId}`);
  revalidatePath(`/admin/${businessId}/workspace`);
}

function redirectToBusinessActionError(formData: FormData, message: string, returnStep = getReturnStep(formData)): never {
  const businessId = getString(formData, 'businessId');
  const returnTo = getString(formData, 'returnTo');

  if (businessId) {
    redirect(buildAdminBusinessRedirectPath(businessId, withReturnStepParam({ error: message }, returnStep)));
  }

  if (returnTo) {
    redirect(appendParamsToAdminPath(returnTo, { error: message }, `/admin?error=${encodeURIComponent(message)}`));
  }

  redirect(`/admin?error=${encodeURIComponent(message)}`);
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
        : change.key === 'a2pFailureReason' || change.key === 'tollFreeVerificationNote'
          ? change.before
        : maskSidForAudit(change.before) ?? change.before,
    after:
      change.key === 'ownerPhone' || change.key === 'twilioPhoneNumber'
        ? maskPhoneForAudit(change.after)
        : change.key === 'a2pFailureReason' || change.key === 'tollFreeVerificationNote'
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

async function loadBusinessLaunchContext(businessId: string) {
  const [business, successfulLeadCount, operatorEvents] = await Promise.all([
    db.business.findUnique({
      where: { id: businessId },
      include: {
        notificationSettings: true,
      },
    }),
    db.lead.count({
      where: {
        businessId,
        OR: [{ ownerNotifiedAt: { not: null } }, { notifiedAt: { not: null } }],
      },
    }),
    listBusinessOperatorEvents(businessId, 'all', 160),
  ]);

  if (!business) {
    throw new Error('Business not found.');
  }

  const testSmsTruth = buildAdminTestSmsTruth(operatorEvents);
  const [ownerState, webhookSnapshot] = await Promise.all([
    getAdminOwnerState(business, business.notificationSettings),
    getTwilioWebhookSnapshot(business),
  ]);
  const missedCallValidation = buildAdminMissedCallValidationTruth({
    events: operatorEvents,
    successfulLeadCount,
  });
  const setupFlow = buildTwilioSetupFlow({
    business,
    notificationSettings: business.notificationSettings,
    ownerConnected: ownerState.connected,
    successfulLeadCount,
    testSmsState:
      testSmsTruth.state === 'not_run'
        ? 'not_started'
        : testSmsTruth.state === 'pending'
          ? 'pending_delivery'
          : testSmsTruth.state,
    webhookSnapshot,
    missedCallValidation: {
      complete: missedCallValidation.countsAsLaunchProof,
      stateLabel: missedCallValidation.label,
      detail: missedCallValidation.detail,
      tone:
        missedCallValidation.tone === 'success'
          ? 'success'
          : missedCallValidation.tone === 'attention'
            ? 'attention'
            : missedCallValidation.tone === 'pending'
              ? 'pending'
              : 'neutral',
    },
  });
  const confidence = buildAdminOnboardingConfidence({
    business,
    notificationSettings: business.notificationSettings,
    ownerConnected: ownerState.connected,
    successfulLeadCount,
    operatorEvents,
    webhookSnapshot,
    missedCallValidation,
  });

  return {
    business,
    confidence,
    missedCallValidation,
    setupFlow,
    ownerState,
    operatorEvents,
    testSmsTruth,
    webhookSnapshot,
    successfulLeadCount,
  };
}

export async function createDemoBusinessAction(formData: FormData) {
  const admin = await requireAdmin();
  const ownerPhone = normalizePhoneNumber(getString(formData, 'ownerPhone')) || null;
  const ownerEmail = getString(formData, 'ownerEmail').toLowerCase() || admin.email || null;
  const forwardingNumber = normalizePhoneNumber(getString(formData, 'forwardingNumber')) || ownerPhone || DEFAULT_DEMO_FORWARDING_NUMBER;
  const publicBusinessPhone = normalizePhoneNumber(getString(formData, 'publicBusinessPhone')) || DEFAULT_DEMO_TEXTING_NUMBER;
  const existingBusiness = await db.business.findUnique({ where: { ownerClerkId: DEMO_OWNER_CLERK_ID } });
  const demoTextingNumber = existingBusiness?.twilioPrimaryPhoneNumber || DEFAULT_DEMO_TEXTING_NUMBER;

  const business = await db.business.upsert({
    where: { ownerClerkId: DEMO_OWNER_CLERK_ID },
    create: {
      ownerClerkId: DEMO_OWNER_CLERK_ID,
      ownerName: 'CallbackCloser Demo',
      name: DEFAULT_DEMO_NAME,
      isTestBusiness: true,
      publicBusinessPhone,
      forwardingNumber,
      notifyPhone: ownerPhone,
      provisioningStatus: BusinessProvisioningStatus.DRAFT,
      phoneSetupPath: BusinessPhoneSetupPath.NEW_TWILIO_NUMBER,
      forwardedCallAnswerMode: ForwardedCallAnswerMode.PRESS_1_REQUIRED,
      messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
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
      publicBusinessPhone,
      forwardingNumber,
      notifyPhone: ownerPhone,
      provisioningStatus: BusinessProvisioningStatus.DRAFT,
      phoneSetupPath: BusinessPhoneSetupPath.NEW_TWILIO_NUMBER,
      forwardedCallAnswerMode: ForwardedCallAnswerMode.PRESS_1_REQUIRED,
      messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
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
  const publicBusinessPhone = normalizePhoneNumber(data.publicBusinessPhone || '') || null;
  const phoneSetupPath = data.phoneSetupPath as BusinessPhoneSetupPath;
  const forwardedCallAnswerMode = data.forwardedCallAnswerMode as ForwardedCallAnswerMode;
  const messagingSetupMode = data.messagingSetupMode as MessagingSetupMode;

  const business = await db.business.create({
    data: {
      ownerClerkId: buildPendingOwnerClerkId(),
      ownerName: data.ownerName || null,
      name: data.name,
      isTestBusiness: data.isTestBusiness,
      publicBusinessPhone,
      forwardingNumber,
      notifyPhone: ownerPhone,
      provisioningStatus: BusinessProvisioningStatus.DRAFT,
      phoneSetupPath,
      forwardedCallAnswerMode,
      messagingSetupMode,
      twilioNumberSetupMode: deriveTwilioNumberSetupModeFromPhoneSetupPath(phoneSetupPath),
      forwardingVerificationStatus:
        phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING
          ? ForwardingVerificationStatus.PENDING
          : ForwardingVerificationStatus.NOT_STARTED,
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
    const existingOwner = await findClerkUserByEmail(data.ownerEmail);
    if (existingOwner) {
      await connectExistingBusinessOwner({
        businessId: business.id,
        ownerEmail: data.ownerEmail,
        ownerName: data.ownerName || null,
        ownerClerkId: existingOwner.id,
      });

      redirectPath = buildAdminBusinessRedirectPath(business.id, {
        created: 1,
        ownerAction: 'connected',
      });
    } else {
      const inviteResult = await inviteBusinessOwner({
        businessId: business.id,
        ownerEmail: data.ownerEmail,
        ownerName: data.ownerName || null,
      });

      redirectPath = buildAdminBusinessRedirectPath(business.id, {
        created: 1,
        ownerAction: inviteResult.state,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Business created, but owner setup failed.';
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
      },
    });
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'onboarding.owner_setup_failed',
      category: 'ONBOARDING',
      status: 'FAILED',
      summary: 'Owner setup failed after business creation',
      details: {
        error: message,
      },
    });

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
  const returnStep = getReturnStep(formData);

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
        withReturnStepParam(
          {
            error: `Confirm clearing live fields before removing: ${criticalFieldClears.join(', ')}.`,
          },
          returnStep
        )
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
    buildAdminBusinessRedirectPath(
      data.businessId,
      withReturnStepParam(
        {
          saved: 1,
          changed: changedFields.map((field) => field.key).join(','),
        },
        returnStep
      )
    )
  );
}

export async function saveAdminTwilioSetupAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnStep = getReturnStep(formData);

  const parsed = adminTwilioSetupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Invalid Twilio setup update.', returnStep);
  }

  const data = parsed.data;
  const existingBusiness = await db.business.findUnique({
    where: { id: data.businessId },
  });

  if (!existingBusiness) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
  }

  const twilioAccountMode = data.twilioAccountMode as TwilioAccountMode;
  const phoneSetupPath = data.phoneSetupPath as BusinessPhoneSetupPath;
  const forwardedCallAnswerMode = data.forwardedCallAnswerMode as ForwardedCallAnswerMode;
  const messagingSetupMode = data.messagingSetupMode as MessagingSetupMode;
  const twilioNumberSetupMode = deriveTwilioNumberSetupModeFromPhoneSetupPath(phoneSetupPath) as TwilioNumberSetupMode;
  const twilioSubaccountSid = twilioAccountMode === TwilioAccountMode.MAIN_ACCOUNT ? null : normalizeOptionalSid(data.twilioSubaccountSid);
  let twilioPhoneNumber: string | null;

  try {
    twilioPhoneNumber = normalizeOptionalE164Phone(data.twilioPhoneNumber || '', 'Twilio number');
  } catch (error) {
    redirectToBusinessActionError(formData, getBusinessTwilioSaveErrorMessage(error) || 'Unable to save Twilio setup.', returnStep);
  }

  const twilioPhoneNumberSid = normalizeOptionalSid(data.twilioPhoneNumberSid);
  const twilioMessagingServiceSid = normalizeOptionalSid(data.twilioMessagingServiceSid);
  const forwardingVerificationStatus = data.forwardingVerificationStatus as ForwardingVerificationStatus;
  const forwardingVerificationNote = data.forwardingVerificationNote?.trim() || null;
  const portingStatus = data.portingStatus as PortingStatus;
  const portingNotes = data.portingNotes?.trim() || null;
  const messagingComplianceType = data.messagingComplianceType as MessagingComplianceType;
  const a2pCustomerProfileSid = normalizeOptionalSid(data.a2pCustomerProfileSid);
  const a2pBrandSid = normalizeOptionalSid(data.a2pBrandSid);
  const a2pCampaignSid = normalizeOptionalSid(data.a2pCampaignSid);
  const a2pFailureReason = data.a2pFailureReason?.trim() || null;
  const tollFreeVerificationStatus = data.tollFreeVerificationStatus as TollFreeVerificationStatus;
  const tollFreeVerificationSid = normalizeOptionalSid(data.tollFreeVerificationSid);
  const tollFreeVerificationNote = data.tollFreeVerificationNote?.trim() || null;
  const sidValidationError =
    getOptionalTwilioSidError(twilioSubaccountSid, 'AC', 'Twilio subaccount SID') ||
    getOptionalTwilioSidError(twilioPhoneNumberSid, 'PN', 'Twilio number SID') ||
    getOptionalTwilioSidError(twilioMessagingServiceSid, 'MG', 'Messaging Service SID') ||
    getMessagingComplianceSidValidationError({
      messagingComplianceType,
      a2pCustomerProfileSid,
      a2pBrandSid,
      a2pCampaignSid,
      tollFreeVerificationSid,
    });

  if (sidValidationError) {
    redirect(buildAdminBusinessRedirectPath(data.businessId, withReturnStepParam({ error: sidValidationError }, returnStep)));
  }

  const criticalFieldClears = [
    existingBusiness.twilioSubaccountSid && !twilioSubaccountSid && twilioAccountMode === TwilioAccountMode.BUSINESS_SUBACCOUNT
      ? 'Twilio subaccount SID'
      : null,
    (existingBusiness.twilioPrimaryPhoneNumber || existingBusiness.twilioPhoneNumber) && !twilioPhoneNumber ? 'Twilio number' : null,
    (existingBusiness.twilioPrimaryNumberSid || existingBusiness.twilioPhoneNumberSid) && !twilioPhoneNumberSid ? 'Twilio number SID' : null,
    existingBusiness.twilioMessagingServiceSid && !twilioMessagingServiceSid ? 'messaging service SID' : null,
  ].filter(Boolean) as string[];

  if (criticalFieldClears.length > 0 && !data.confirmCriticalFieldClears) {
    redirect(
      buildAdminBusinessRedirectPath(
        data.businessId,
        withReturnStepParam(
          {
            error: `Confirm clearing live fields before removing: ${criticalFieldClears.join(', ')}.`,
          },
          returnStep
        )
      )
    );
  }

  const managedTwilioStatusChanged = existingBusiness.managedTwilioStatus !== data.managedTwilioStatus;
  const twilioMappingChanged =
    existingBusiness.twilioAccountMode !== twilioAccountMode ||
    existingBusiness.phoneSetupPath !== phoneSetupPath ||
    existingBusiness.forwardedCallAnswerMode !== forwardedCallAnswerMode ||
    existingBusiness.messagingSetupMode !== messagingSetupMode ||
    existingBusiness.twilioNumberSetupMode !== twilioNumberSetupMode ||
    existingBusiness.twilioSubaccountSid !== twilioSubaccountSid ||
    (existingBusiness.twilioPrimaryPhoneNumber || existingBusiness.twilioPhoneNumber) !== twilioPhoneNumber ||
    (existingBusiness.twilioPrimaryNumberSid || existingBusiness.twilioPhoneNumberSid) !== twilioPhoneNumberSid ||
    existingBusiness.twilioMessagingServiceSid !== twilioMessagingServiceSid;
  const phonePathStatusChanged =
    existingBusiness.forwardingVerificationStatus !== forwardingVerificationStatus ||
    existingBusiness.forwardingVerificationNote !== forwardingVerificationNote ||
    existingBusiness.portingStatus !== portingStatus ||
    existingBusiness.portingNotes !== portingNotes;
  const a2pMetadataChanged =
    existingBusiness.a2pCustomerProfileSid !== a2pCustomerProfileSid ||
    existingBusiness.a2pBrandSid !== a2pBrandSid ||
    existingBusiness.a2pCampaignSid !== a2pCampaignSid ||
    existingBusiness.a2pFailureReason !== a2pFailureReason;
  const tollFreeMetadataChanged =
    existingBusiness.tollFreeVerificationStatus !== tollFreeVerificationStatus ||
    existingBusiness.tollFreeVerificationSid !== tollFreeVerificationSid ||
    existingBusiness.tollFreeVerificationNote !== tollFreeVerificationNote;
  const messagingComplianceTypeChanged = existingBusiness.messagingComplianceType !== messagingComplianceType;

  const changedFields = [
    existingBusiness.twilioAccountMode !== twilioAccountMode
      ? { key: 'twilioAccountMode', label: 'Twilio account mode', before: existingBusiness.twilioAccountMode, after: twilioAccountMode }
      : null,
    existingBusiness.phoneSetupPath !== phoneSetupPath
      ? { key: 'phoneSetupPath', label: 'business number path', before: existingBusiness.phoneSetupPath, after: phoneSetupPath }
      : null,
    existingBusiness.forwardedCallAnswerMode !== forwardedCallAnswerMode
      ? {
          key: 'forwardedCallAnswerMode',
          label: 'forwarded call answer mode',
          before: existingBusiness.forwardedCallAnswerMode,
          after: forwardedCallAnswerMode,
        }
      : null,
    existingBusiness.messagingSetupMode !== messagingSetupMode
      ? {
          key: 'messagingSetupMode',
          label: 'messaging setup mode',
          before: existingBusiness.messagingSetupMode,
          after: messagingSetupMode,
        }
      : null,
    existingBusiness.twilioNumberSetupMode !== twilioNumberSetupMode
      ? {
          key: 'twilioNumberSetupMode',
          label: 'Twilio number path',
          before: existingBusiness.twilioNumberSetupMode,
          after: twilioNumberSetupMode,
        }
      : null,
    existingBusiness.twilioSubaccountSid !== twilioSubaccountSid
      ? { key: 'twilioSubaccountSid', label: 'Twilio subaccount SID', before: existingBusiness.twilioSubaccountSid, after: twilioSubaccountSid }
      : null,
    (existingBusiness.twilioPrimaryPhoneNumber || existingBusiness.twilioPhoneNumber) !== twilioPhoneNumber
      ? {
          key: 'twilioPhoneNumber',
          label: 'Twilio number',
          before: existingBusiness.twilioPrimaryPhoneNumber || existingBusiness.twilioPhoneNumber,
          after: twilioPhoneNumber,
        }
      : null,
    (existingBusiness.twilioPrimaryNumberSid || existingBusiness.twilioPhoneNumberSid) !== twilioPhoneNumberSid
      ? {
          key: 'twilioPhoneNumberSid',
          label: 'Twilio number SID',
          before: existingBusiness.twilioPrimaryNumberSid || existingBusiness.twilioPhoneNumberSid,
          after: twilioPhoneNumberSid,
        }
      : null,
    existingBusiness.twilioMessagingServiceSid !== twilioMessagingServiceSid
      ? {
          key: 'twilioMessagingServiceSid',
          label: 'messaging service SID',
          before: existingBusiness.twilioMessagingServiceSid,
          after: twilioMessagingServiceSid,
        }
      : null,
    existingBusiness.forwardingVerificationStatus !== forwardingVerificationStatus
      ? {
          key: 'forwardingVerificationStatus',
          label: 'forwarding verification status',
          before: existingBusiness.forwardingVerificationStatus,
          after: forwardingVerificationStatus,
        }
      : null,
    existingBusiness.forwardingVerificationNote !== forwardingVerificationNote
      ? {
          key: 'forwardingVerificationNote',
          label: 'forwarding verification note',
          before: existingBusiness.forwardingVerificationNote,
          after: forwardingVerificationNote,
        }
      : null,
    existingBusiness.portingStatus !== portingStatus
      ? { key: 'portingStatus', label: 'porting status', before: existingBusiness.portingStatus, after: portingStatus }
      : null,
    existingBusiness.portingNotes !== portingNotes
      ? { key: 'portingNotes', label: 'porting notes', before: existingBusiness.portingNotes, after: portingNotes }
      : null,
    existingBusiness.messagingComplianceType !== messagingComplianceType
      ? {
          key: 'messagingComplianceType',
          label: 'number type',
          before: existingBusiness.messagingComplianceType,
          after: messagingComplianceType,
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
      ? { key: 'a2pBrandSid', label: 'A2P brand SID', before: existingBusiness.a2pBrandSid, after: a2pBrandSid }
      : null,
    existingBusiness.a2pCampaignSid !== a2pCampaignSid
      ? { key: 'a2pCampaignSid', label: 'A2P campaign SID', before: existingBusiness.a2pCampaignSid, after: a2pCampaignSid }
      : null,
    existingBusiness.a2pFailureReason !== a2pFailureReason
      ? {
          key: 'a2pFailureReason',
          label: 'A2P failure reason',
          before: existingBusiness.a2pFailureReason,
          after: a2pFailureReason,
        }
      : null,
    existingBusiness.tollFreeVerificationStatus !== tollFreeVerificationStatus
      ? {
          key: 'tollFreeVerificationStatus',
          label: 'toll-free verification status',
          before: existingBusiness.tollFreeVerificationStatus,
          after: tollFreeVerificationStatus,
        }
      : null,
    existingBusiness.tollFreeVerificationSid !== tollFreeVerificationSid
      ? {
          key: 'tollFreeVerificationSid',
          label: 'toll-free verification SID',
          before: existingBusiness.tollFreeVerificationSid,
          after: tollFreeVerificationSid,
        }
      : null,
    existingBusiness.tollFreeVerificationNote !== tollFreeVerificationNote
      ? {
          key: 'tollFreeVerificationNote',
          label: 'toll-free blocker note',
          before: existingBusiness.tollFreeVerificationNote,
          after: tollFreeVerificationNote,
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

  try {
    await db.business.update({
      where: { id: data.businessId },
      data: {
        twilioAccountMode,
        phoneSetupPath,
        forwardedCallAnswerMode,
        messagingSetupMode,
        twilioNumberSetupMode,
        twilioSubaccountSid,
        forwardingVerificationStatus:
          phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING ? forwardingVerificationStatus : ForwardingVerificationStatus.NOT_STARTED,
        forwardingVerifiedAt:
          phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING &&
          forwardingVerificationStatus === ForwardingVerificationStatus.VERIFIED
            ? existingBusiness.forwardingVerifiedAt || new Date()
            : null,
        forwardingVerificationNote:
          phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING ? forwardingVerificationNote : null,
        portingStatus: phoneSetupPath === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER ? portingStatus : PortingStatus.NOT_STARTED,
        portingNotes: phoneSetupPath === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER ? portingNotes : null,
        portingCompletedAt:
          phoneSetupPath === BusinessPhoneSetupPath.PORT_EXISTING_NUMBER && portingStatus === PortingStatus.COMPLETED
            ? existingBusiness.portingCompletedAt || new Date()
            : null,
        managedTwilioStatus: data.managedTwilioStatus as ManagedTwilioStatus,
        managedTwilioStatusUpdatedAt: managedTwilioStatusChanged ? new Date() : existingBusiness.managedTwilioStatusUpdatedAt,
        twilioPhoneNumber,
        twilioPrimaryPhoneNumber: twilioPhoneNumber,
        twilioPhoneNumberSid,
        twilioPrimaryNumberSid: twilioPhoneNumberSid,
        twilioMessagingServiceSid,
        messagingComplianceType,
        a2pCustomerProfileSid,
        a2pBrandSid,
        a2pCampaignSid,
        a2pFailureReason,
        tollFreeVerificationStatus,
        tollFreeVerificationSid,
        tollFreeVerificationNote,
        a2pSubmittedAt:
          managedTwilioStatusChanged &&
          messagingComplianceType === MessagingComplianceType.LOCAL_A2P &&
          ['AWAITING_BUSINESS_VERIFICATION', 'BRAND_SUBMITTED', 'CAMPAIGN_SUBMITTED'].includes(data.managedTwilioStatus)
            ? existingBusiness.a2pSubmittedAt || new Date()
            : existingBusiness.a2pSubmittedAt,
        a2pApprovedAt:
          messagingComplianceType === MessagingComplianceType.LOCAL_A2P &&
          data.managedTwilioStatus === ManagedTwilioStatus.COMPLIANT_LIVE
            ? existingBusiness.a2pApprovedAt || new Date()
            : managedTwilioStatusChanged
              ? null
              : existingBusiness.a2pApprovedAt,
        ...(twilioMappingChanged ? { twilioWebhookSyncedAt: null } : {}),
        ...(
          twilioMappingChanged ||
          phonePathStatusChanged ||
          a2pMetadataChanged ||
          tollFreeMetadataChanged ||
          messagingComplianceTypeChanged ||
          managedTwilioStatusChanged
            ? { provisioningLastRunAt: new Date() }
            : {}
        ),
        provisioningError: null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Error) {
      redirectToBusinessActionError(formData, getBusinessTwilioSaveErrorMessage(error) || 'Unable to save Twilio setup.', returnStep);
    }
    throw error;
  }

  if (changedFields.length > 0) {
    const setupUpdateEvent = buildTwilioSetupUpdateEventMetadata(changedFields);
    await recordBusinessOperatorEvent({
      businessId: data.businessId,
      type: 'admin.twilio_setup_updated',
      category: 'ONBOARDING',
      status: 'INFO',
      summary: setupUpdateEvent.summary,
      details: {
        remediationStepKey: setupUpdateEvent.primaryStepKey,
        remediationStepKeys: setupUpdateEvent.stepKeys,
        changedFields: buildChangedFieldMetadata(changedFields),
      },
    });
    logAuditEvent({
      event: 'admin_twilio_setup_saved',
      actorType: 'user',
      actorId: admin.userId,
      businessId: data.businessId,
      targetType: 'business',
      targetId: data.businessId,
      metadata: {
        actorEmail: admin.email,
        source: 'twilio_setup_flow',
        changedFields: buildChangedFieldMetadata(changedFields),
      },
    });
  }

  await revalidateAdminPaths(data.businessId);
  revalidatePath('/app/settings');
  revalidatePath('/app/call-flow');
  redirect(
    buildAdminBusinessRedirectPath(
      data.businessId,
      withReturnStepParam(
        {
          saved: 1,
          changed: changedFields.map((field) => field.key).join(','),
        },
        returnStep
      )
    )
  );
}

export async function saveAdminSetupBasicsAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnStep = getReturnStep(formData);

  const parsed = adminSetupBasicsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Invalid setup update.', returnStep);
  }

  const business = await db.business.findUnique({
    where: { id: parsed.data.businessId },
    include: {
      notificationSettings: true,
    },
  });

  if (!business) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
  }

  const ownerPhone = normalizeOptionalE164Phone(parsed.data.ownerPhone || '', 'Owner alert phone');
  const forwardingNumber = normalizeOptionalE164Phone(parsed.data.forwardingNumber || '', 'Forwarding number');
  const publicBusinessPhone = normalizeOptionalE164Phone(parsed.data.publicBusinessPhone || '', 'Public business number');
  const ownerEmail = parsed.data.ownerEmail?.trim().toLowerCase() || null;
  const ownerName = parsed.data.ownerName?.trim() || null;
  const shouldResetForwardingVerification =
    business.phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING &&
    publicBusinessPhone !== (business.publicBusinessPhone || null);

  const changedFields = [
    business.ownerName !== ownerName ? { key: 'ownerName', label: 'owner name', before: business.ownerName, after: ownerName } : null,
    (business.notificationSettings?.ownerEmail || null) !== ownerEmail
      ? {
          key: 'ownerEmail',
          label: 'owner email',
          before: business.notificationSettings?.ownerEmail || null,
          after: ownerEmail,
        }
      : null,
    (business.notificationSettings?.ownerPhone || business.notifyPhone || null) !== ownerPhone
      ? {
          key: 'ownerPhone',
          label: 'owner alert phone',
          before: business.notificationSettings?.ownerPhone || business.notifyPhone || null,
          after: ownerPhone,
        }
      : null,
    business.forwardingNumber !== forwardingNumber
      ? { key: 'forwardingNumber', label: 'forwarding number', before: business.forwardingNumber, after: forwardingNumber }
      : null,
    (business.publicBusinessPhone || null) !== publicBusinessPhone
      ? { key: 'publicBusinessPhone', label: 'public business number', before: business.publicBusinessPhone || null, after: publicBusinessPhone }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; before: string | null; after: string | null }>;

  await db.business.update({
    where: { id: business.id },
    data: {
      ownerName,
      publicBusinessPhone,
      forwardingNumber: forwardingNumber || business.forwardingNumber,
      notifyPhone: ownerPhone,
      forwardingVerificationStatus:
        business.phoneSetupPath === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING
          ? shouldResetForwardingVerification
            ? ForwardingVerificationStatus.PENDING
            : business.forwardingVerificationStatus
          : business.forwardingVerificationStatus,
      forwardingVerifiedAt: shouldResetForwardingVerification ? null : business.forwardingVerifiedAt,
      forwardingVerificationNote: shouldResetForwardingVerification ? null : business.forwardingVerificationNote,
      provisioningError: null,
      provisioningLastRunAt: changedFields.length > 0 ? new Date() : business.provisioningLastRunAt,
    },
  });

  await db.businessNotificationSettings.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      ownerEmail,
      ownerPhone,
      notifySms: business.notificationSettings?.notifySms ?? true,
      notifyEmail: business.notificationSettings?.notifyEmail ?? true,
      notifyInApp: business.notificationSettings?.notifyInApp ?? true,
      urgentOnly: business.notificationSettings?.urgentOnly ?? false,
    },
    update: {
      ownerEmail,
      ownerPhone,
    },
  });

  if (changedFields.length > 0) {
    const remediationStepKey = returnStep === 'missed_call_validated' ? 'missed_call_validated' : 'owner_connected';

    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'admin.setup_basics_updated',
      category: 'ADMIN_ACTIONS',
      status: 'SUCCESS',
      summary: remediationStepKey === 'missed_call_validated' ? 'Missed-call validation details updated' : 'Owner setup details updated',
      details: {
        remediationStepKey,
        changedFields: buildChangedFieldMetadata(changedFields),
      },
    });

    logAuditEvent({
      event: 'admin_setup_basics_saved',
      actorType: 'user',
      actorId: admin.userId,
      businessId: business.id,
      targetType: 'business',
      targetId: business.id,
      metadata: {
        actorEmail: admin.email,
        changedFields: buildChangedFieldMetadata(changedFields),
        source: 'admin_setup_panels',
      },
    });
  }

  await revalidateAdminPaths(business.id);
  redirect(
    buildAdminBusinessRedirectPath(
      business.id,
      withReturnStepParam(
        {
          saved: 1,
          changed: changedFields.map((field) => field.key).join(','),
        },
        returnStep
      )
    )
  );
}

export async function createBusinessTwilioSubaccountAction(formData: FormData) {
  const admin = await requireAdmin();
  const businessId = getString(formData, 'businessId');
  const returnStep = getReturnStep(formData);

  if (!businessId) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
  }

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      twilioSubaccountSid: true,
    },
  });

  if (!business) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
  }

  const correlationId = `admin-subaccount-${business.id}-${Date.now()}`;

  try {
    await createSubaccountForBusiness({ id: business.id, name: business.name }, correlationId);
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningError: null,
        provisioningLastRunAt: new Date(),
      },
    });

    logAuditEvent({
      event: 'admin_twilio_subaccount_created',
      actorType: 'user',
      actorId: admin.userId,
      businessId: business.id,
      targetType: 'business',
      targetId: business.id,
      metadata: {
        actorEmail: admin.email,
        source: 'admin_setup_panels',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create the Twilio subaccount.';
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
        provisioningLastRunAt: new Date(),
      },
    });
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'provisioning.twilio_subaccount_failed',
      category: 'PROVISIONING',
      status: 'FAILED',
      summary: 'Twilio subaccount creation failed',
      details: {
        remediationStepKey: 'account_ready',
        error: message,
      },
    });

    await revalidateAdminPaths(business.id);
    redirect(buildAdminBusinessRedirectPath(business.id, withReturnStepParam({ error: message }, returnStep)));
  }

  await revalidateAdminPaths(business.id);
  redirect(buildAdminBusinessRedirectPath(business.id, withReturnStepParam({ saved: 1 }, returnStep)));
}

export async function createBusinessMessagingServiceAction(formData: FormData) {
  const admin = await requireAdmin();
  const businessId = getString(formData, 'businessId');
  const returnStep = getReturnStep(formData);

  if (!businessId) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
  }

  const business = await db.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      twilioAccountMode: true,
      twilioSubaccountSid: true,
      twilioMessagingServiceSid: true,
    },
  });

  if (!business) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
  }

  const correlationId = `admin-messaging-service-${business.id}-${Date.now()}`;

  try {
    await createMessagingServiceForBusiness(
      {
        id: business.id,
        name: business.name,
        twilioAccountMode: business.twilioAccountMode,
        twilioSubaccountSid: business.twilioSubaccountSid,
        twilioMessagingServiceSid: business.twilioMessagingServiceSid,
      },
      correlationId
    );
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningError: null,
        provisioningLastRunAt: new Date(),
      },
    });

    logAuditEvent({
      event: 'admin_messaging_service_created',
      actorType: 'user',
      actorId: admin.userId,
      businessId: business.id,
      targetType: 'business',
      targetId: business.id,
      metadata: {
        actorEmail: admin.email,
        source: 'admin_setup_panels',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create the Messaging Service.';
    await db.business.update({
      where: { id: business.id },
      data: {
        provisioningStatus: BusinessProvisioningStatus.NEEDS_ATTENTION,
        provisioningError: message,
        provisioningLastRunAt: new Date(),
      },
    });
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'provisioning.messaging_service_failed',
      category: 'PROVISIONING',
      status: 'FAILED',
      summary: 'Messaging Service creation failed',
      details: {
        remediationStepKey: 'messaging_service_ready',
        error: message,
      },
    });

    await revalidateAdminPaths(business.id);
    redirect(buildAdminBusinessRedirectPath(business.id, withReturnStepParam({ error: message }, returnStep)));
  }

  await revalidateAdminPaths(business.id);
  redirect(buildAdminBusinessRedirectPath(business.id, withReturnStepParam({ saved: 1 }, returnStep)));
}

export async function inviteBusinessOwnerAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnStep = getReturnStep(formData);

  const parsed = adminInviteOwnerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Invalid owner invite request.', returnStep);
  }

  let redirectPath: string;
  try {
    const result = await inviteBusinessOwner({
      businessId: parsed.data.businessId,
      ownerEmail: parsed.data.ownerEmail,
      ownerName: parsed.data.ownerName || null,
    });

    redirectPath = buildAdminBusinessRedirectPath(
      parsed.data.businessId,
      withReturnStepParam({ ownerAction: result.state }, returnStep)
    );

    logAuditEvent({
      event: 'admin_business_owner_invited',
      actorType: 'user',
      actorId: admin.userId,
      businessId: parsed.data.businessId,
      targetType: 'business',
      targetId: parsed.data.businessId,
      metadata: {
        actorEmail: admin.email,
        ownerAction: result.state,
        source: 'admin_setup_panels',
      },
    });
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

    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, withReturnStepParam({ error: message }, returnStep));
  }

  await revalidateAdminPaths(parsed.data.businessId);
  redirect(redirectPath);
}

export async function connectExistingBusinessOwnerAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnStep = getReturnStep(formData);

  const parsed = adminConnectExistingOwnerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Invalid owner connection request.', returnStep);
  }

  let redirectPath: string;
  try {
    await connectExistingBusinessOwner({
      businessId: parsed.data.businessId,
      ownerEmail: parsed.data.ownerEmail,
      ownerName: parsed.data.ownerName || null,
      ownerClerkId: parsed.data.ownerClerkId || null,
    });

    redirectPath = buildAdminBusinessRedirectPath(
      parsed.data.businessId,
      withReturnStepParam({ ownerAction: 'connected' }, returnStep)
    );

    logAuditEvent({
      event: 'admin_business_owner_connected',
      actorType: 'user',
      actorId: admin.userId,
      businessId: parsed.data.businessId,
      targetType: 'business',
      targetId: parsed.data.businessId,
      metadata: {
        actorEmail: admin.email,
        connectionMethod: parsed.data.ownerClerkId?.trim() ? 'clerk_user_id' : 'email_lookup',
        source: 'admin_setup_panels',
      },
    });
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

    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, withReturnStepParam({ error: message }, returnStep));
  }

  await revalidateAdminPaths(parsed.data.businessId);
  redirect(redirectPath);
}

export async function provisionBusinessAction(formData: FormData) {
  await requireAdmin();
  const returnStep = getReturnStep(formData);

  const parsed = adminProvisionBusinessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Invalid provisioning request.', returnStep);
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
      ...withReturnStepParam(
        {
          provisioned: 1,
          mode: parsed.data.mode.toLowerCase(),
        },
        returnStep
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provisioning failed.';
    redirectPath = buildAdminBusinessRedirectPath(parsed.data.businessId, withReturnStepParam({ error: message }, returnStep));
  }

  await revalidateAdminPaths(parsed.data.businessId);
  redirect(redirectPath);
}

export async function resyncBusinessWebhooksAction(formData: FormData) {
  await requireAdmin();
  const returnStep = getReturnStep(formData);

  const parsed = adminWebhookSyncSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Invalid webhook sync request.', returnStep);
  }

  const options =
    parsed.data.target === 'VOICE'
      ? { voice: true, sms: false, status: false }
      : parsed.data.target === 'SMS'
        ? { voice: false, sms: true, status: false }
        : parsed.data.target === 'STATUS'
          ? { voice: false, sms: false, status: true }
        : { voice: true, sms: true, status: true };

  const business = await db.business.findUnique({
    where: { id: parsed.data.businessId },
    select: {
      id: true,
      twilioAccountMode: true,
      twilioSubaccountSid: true,
      twilioPhoneNumberSid: true,
      twilioPrimaryNumberSid: true,
    },
  });

  if (!business) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
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
    redirectPath = buildAdminBusinessRedirectPath(
      business.id,
      withReturnStepParam({ synced: parsed.data.target.toLowerCase() }, returnStep)
    );
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

    redirectPath = buildAdminBusinessRedirectPath(business.id, withReturnStepParam({ error: message }, returnStep));
  }

  await revalidateAdminPaths(business.id);
  redirect(redirectPath);
}

export async function confirmMissedCallValidationAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnStep = getReturnStep(formData);
  const businessId = getString(formData, 'businessId');
  const parsed = adminMissedCallValidationConfirmationSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Add a short validation note.', returnStep);
  }

  const business = await db.business.findUnique({
    where: { id: parsed.data.businessId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!business) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
  }

  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'admin.missed_call_validation_confirmed',
    category: 'ADMIN_ACTIONS',
    status: 'SUCCESS',
    summary: 'Missed-call flow manually confirmed',
    details: {
      remediationStepKey: 'missed_call_validated',
      note: parsed.data.note,
    },
  });

  logAuditEvent({
    event: 'admin_missed_call_validation_confirmed',
    actorType: 'user',
    actorId: admin.userId,
    businessId: business.id,
    targetType: 'business',
    targetId: business.id,
    metadata: {
      actorEmail: admin.email,
      source: 'admin_setup_panels',
      note: parsed.data.note,
    },
  });

  await revalidateAdminPaths(business.id);
  redirect(buildAdminBusinessRedirectPath(business.id, withReturnStepParam({ validationSaved: 1 }, returnStep)));
}

export async function confirmForwardingVerificationAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnStep = getReturnStep(formData);
  const parsed = adminForwardingVerificationSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Add a short forwarding verification note.', returnStep);
  }

  const business = await db.business.findUnique({
    where: { id: parsed.data.businessId },
    select: {
      id: true,
      phoneSetupPath: true,
    },
  });

  if (!business) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
  }

  if (business.phoneSetupPath !== BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING) {
    redirectToBusinessActionError(formData, 'Manual forwarding verification only applies to current-number forwarding.', returnStep);
  }

  const verifiedAt = new Date();
  await db.business.update({
    where: { id: business.id },
    data: {
      forwardingVerificationStatus: ForwardingVerificationStatus.VERIFIED,
      forwardingVerifiedAt: verifiedAt,
      forwardingVerificationNote: parsed.data.note,
    },
  });

  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: 'admin.forwarding_verification_confirmed',
    category: 'ADMIN_ACTIONS',
    status: 'SUCCESS',
    summary: 'Current-number forwarding manually confirmed',
    details: {
      remediationStepKey: 'forwarding_verified',
      note: parsed.data.note,
    },
  });

  logAuditEvent({
    event: 'admin_forwarding_verification_confirmed',
    actorType: 'user',
    actorId: admin.userId,
    businessId: business.id,
    targetType: 'business',
    targetId: business.id,
    metadata: {
      actorEmail: admin.email,
      source: 'admin_setup_panels',
      note: parsed.data.note,
    },
  });

  await revalidateAdminPaths(business.id);
  redirect(buildAdminBusinessRedirectPath(business.id, withReturnStepParam({ saved: 1 }, returnStep)));
}

export async function setBusinessProvisioningStatusAction(formData: FormData) {
  await requireAdmin();
  const returnStep = getReturnStep(formData);

  const parsed = adminProvisioningStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Invalid provisioning status update.', returnStep);
  }

  await updateBusinessProvisioningStatus(parsed.data.businessId, parsed.data.status as BusinessProvisioningStatus, null);
  await revalidateAdminPaths(parsed.data.businessId);
  redirect(
    buildAdminBusinessRedirectPath(
      parsed.data.businessId,
      withReturnStepParam({ statusSaved: parsed.data.status.toLowerCase() }, returnStep)
    )
  );
}

export async function markBusinessLiveAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnStep = getReturnStep(formData);
  const businessId = getString(formData, 'businessId');
  const parsed = adminMarkBusinessLiveSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect(
      buildAdminBusinessRedirectPath(
        businessId,
        withReturnStepParam({ error: parsed.error.issues[0]?.message || 'Unable to mark the business live.' }, returnStep)
      )
    );
  }

  const { business, confidence } = await loadBusinessLaunchContext(parsed.data.businessId);

  if (business.archivedAt) {
    redirect(buildAdminBusinessRedirectPath(business.id, withReturnStepParam({ error: 'Restore the archived business before marking it live.' }, returnStep)));
  }

  const blockers = confidence.blockers.map((blocker) => blocker.message);
  const note = parsed.data.note?.trim() || null;

  if (!confidence.canSafelyMarkLive && !parsed.data.acknowledgeWarnings) {
    redirect(
      buildAdminBusinessRedirectPath(
        business.id,
        withReturnStepParam(
          {
            error: blockers.length > 0 ? `Launch proof is still incomplete: ${blockers.join(' ')}` : 'Launch proof is still incomplete.',
          },
          returnStep
        )
      )
    );
  }

  if (!confidence.canSafelyMarkLive && !note) {
    redirect(
      buildAdminBusinessRedirectPath(
        business.id,
        withReturnStepParam(
          {
            error: 'Add a short operator note before marking this business live with warnings.',
          },
          returnStep
        )
      )
    );
  }

  await updateBusinessProvisioningStatus(business.id, BusinessProvisioningStatus.LIVE, null);
  await sendCustomerReadyNotification(business.id);
  await recordBusinessOperatorEvent({
    businessId: business.id,
    type: confidence.canSafelyMarkLive ? 'admin.go_live_marked_safe' : 'admin.go_live_marked_with_warnings',
    category: 'ADMIN_ACTIONS',
    status: confidence.canSafelyMarkLive ? 'SUCCESS' : 'WARNING',
    summary: confidence.canSafelyMarkLive ? 'Business marked live after launch checks' : 'Business marked live with known warnings',
    details: {
      remediationStepKey: 'safe_to_mark_live',
      note,
      blockers,
      acknowledgeWarnings: parsed.data.acknowledgeWarnings,
      canSafelyMarkLive: confidence.canSafelyMarkLive,
    },
  });

  logAuditEvent({
    event: 'admin_business_marked_live',
    actorType: 'user',
    actorId: admin.userId,
    businessId: business.id,
    targetType: 'business',
    targetId: business.id,
    metadata: {
      actorEmail: admin.email,
      source: 'admin_setup_panels',
      blockers,
      canSafelyMarkLive: confidence.canSafelyMarkLive,
      note,
    },
  });

  await revalidateAdminPaths(business.id);
  redirect(
    buildAdminBusinessRedirectPath(
      business.id,
      withReturnStepParam(
        {
          statusSaved: 'live',
          liveAcknowledged: confidence.canSafelyMarkLive ? 'safe' : 'warnings',
        },
        returnStep
      )
    )
  );
}

export async function sendBusinessTestSmsAction(formData: FormData) {
  const admin = await requireAdmin();
  const returnStep = getReturnStep(formData);

  const parsed = adminSendTestSmsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirectToBusinessActionError(formData, parsed.error.issues[0]?.message || 'Invalid test SMS request.', returnStep);
  }

  const business = await loadBusinessForLifecycleAction(parsed.data.businessId);
  if (!business) {
    redirectToBusinessActionError(formData, 'Business not found.', returnStep);
  }

  let destinationPhone: string | null;
  try {
    destinationPhone = normalizeOptionalE164Phone(parsed.data.destinationPhone, 'Test SMS destination');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid test SMS destination.';
    redirectToBusinessActionError(formData, message, returnStep);
  }

  const fromPhone = business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber;
  if (!fromPhone) {
    redirect(
      buildAdminBusinessRedirectPath(
        business.id,
        withReturnStepParam({ error: 'A business texting number is required before sending a test SMS.' }, returnStep)
      )
    );
  }

  let redirectPath = buildAdminBusinessRedirectPath(business.id, withReturnStepParam({ testSms: 1 }, returnStep));

  try {
    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'admin.test_sms_initiated',
      category: 'ADMIN_ACTIONS',
      status: 'PENDING',
      summary: 'Test SMS requested',
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
      context: 'admin_test',
      twilioSubaccountSid: business.twilioAccountMode === TwilioAccountMode.MAIN_ACCOUNT ? null : business.twilioSubaccountSid,
      messagingServiceSid: business.twilioMessagingServiceSid,
      messagingSetupMode: business.messagingSetupMode,
      managedTwilioStatus: business.managedTwilioStatus,
      a2pFailureReason: business.a2pFailureReason,
      messagingComplianceType: business.messagingComplianceType,
      tollFreeVerificationStatus: business.tollFreeVerificationStatus,
      tollFreeVerificationSid: business.tollFreeVerificationSid,
      tollFreeVerificationNote: business.tollFreeVerificationNote,
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
      redirectPath = buildAdminBusinessRedirectPath(
        business.id,
        withReturnStepParam(
          {
            error: getTestSmsSuppressionMessage(result.reason),
          },
          returnStep
        )
      );
    } else {
      await recordBusinessOperatorEvent({
        businessId: business.id,
        type: 'admin.test_sms_accepted',
        category: 'ADMIN_ACTIONS',
        status: 'SUCCESS',
        summary: 'Test SMS accepted by Twilio',
        details: {
          destinationPhone: formatPhoneDetail(destinationPhone),
          fromPhone: formatPhoneDetail(fromPhone),
          messageSid: result.sent.sid,
          messageSidMasked: maskSid(result.sent.sid),
          messageStatus: result.sent.status,
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
    }
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
    redirectPath = buildAdminBusinessRedirectPath(
      business.id,
      withReturnStepParam({ error: `Test SMS failed: ${message}` }, returnStep)
    );
  }

  await revalidateAdminPaths(business.id);
  redirect(redirectPath);
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
  redirect(
    clearBusinessSelectionFromReturnPath(
      parsed.data.returnTo,
      { deleted: 1, deletedBusinessName: business.name },
      `/admin?deleted=1&deletedBusinessName=${encodeURIComponent(business.name)}`
    )
  );
}

export async function deleteBusinessPermanentlyAction(formData: FormData) {
  const founder = await requireFounderAdmin();

  const parsed = adminDeleteBusinessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid permanent delete request.')}`);
  }

  let redirectPath = '/admin';

  try {
    const business = await loadBusinessForLifecycleAction(parsed.data.businessId);
    if (!business) {
      throw new Error('Business not found.');
    }

    validatePermanentDeleteConfirmation({
      business,
      confirmationName: parsed.data.confirmationName,
      realCustomerConfirmation: parsed.data.realCustomerConfirmation,
    });

    await recordBusinessOperatorEvent({
      businessId: business.id,
      type: 'admin.business_permanently_deleted',
      category: 'ADMIN_ACTIONS',
      status: 'WARNING',
      summary: 'Business permanently deleted',
      details: {
        businessName: business.name,
        isTestBusiness: business.isTestBusiness,
        ownerEmail: business.notificationSettings?.ownerEmail || null,
        archivedAt: business.archivedAt?.toISOString() || null,
        externalReviewNote: PERMANENT_DELETE_EXTERNAL_REVIEW_NOTE,
      },
    });

    const result = await deleteBusinessPermanently({
      businessId: business.id,
      confirmationName: parsed.data.confirmationName,
      realCustomerConfirmation: parsed.data.realCustomerConfirmation,
    });

    logAuditEvent({
      event: 'admin_business_permanently_deleted',
      actorType: 'user',
      actorId: founder.userId,
      businessId: business.id,
      targetType: 'business',
      targetId: business.id,
      metadata: {
        actorEmail: founder.email,
        businessName: business.name,
        isTestBusiness: business.isTestBusiness,
        requiredRealCustomerConfirmation: requiresRealCustomerDeleteConfirmation(business),
        externalReviewNote: result.externalReviewNote,
      },
    });

    revalidatePath('/admin');
    revalidatePath(`/admin/${business.id}`);
    revalidatePath(`/admin/${business.id}/workspace`);

    redirectPath = clearBusinessSelectionFromReturnPath(
      parsed.data.returnTo,
      {
        deleted: 1,
        deletedBusinessName: result.business.name,
        deletedExternalReview: 1,
      },
      `/admin?deleted=1&deletedBusinessName=${encodeURIComponent(result.business.name)}&deletedExternalReview=1`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to permanently delete this business.';
    redirectPath = appendParamsToAdminPath(parsed.data.returnTo, { error: message }, `/admin?error=${encodeURIComponent(message)}`);
  }

  redirect(redirectPath);
}

export async function founderDeleteAllBusinessesAction(formData: FormData) {
  const founder = await requireFounderAdmin();

  const parsed = adminFounderDeleteAllBusinessesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid founder reset request.')}`);
  }

  let redirectPath = '/admin';

  try {
    const result = await deleteAllBusinessesForFounderReset({
      confirmation: parsed.data.confirmationText,
    });

    logAuditEvent({
      event: 'admin_all_businesses_bulk_deleted',
      actorType: 'user',
      actorId: founder.userId,
      targetType: 'business_collection',
      targetId: 'all_current_businesses',
      metadata: {
        actorEmail: founder.email,
        deletedCount: result.deletedCount,
        deletedBusinessNames: result.deletedBusinessNames,
        confirmationText: FOUNDER_DELETE_ALL_BUSINESSES_CONFIRMATION,
      },
    });

    revalidatePath('/admin');

    redirectPath =
      result.deletedCount > 0
        ? `/admin?founderResetResult=deleted&founderResetDeleted=${encodeURIComponent(String(result.deletedCount))}`
        : '/admin?founderResetResult=noop&founderResetDeleted=0';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete the current businesses.';
    redirectPath = `/admin?error=${encodeURIComponent(message)}`;
  }

  redirect(redirectPath);
}

export async function bulkDeleteTestBusinessesAction(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = adminBulkDeleteTestBusinessesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid reset request.')}`);
  }

  let redirectPath = '/admin';

  try {
    const result = await bulkDeleteTestDemoBusinesses({
      confirmation: parsed.data.confirmationText,
    });

    logAuditEvent({
      event: 'admin_test_businesses_bulk_deleted',
      actorType: 'user',
      actorId: admin.userId,
      targetType: 'business_collection',
      targetId: 'test_demo_businesses',
      metadata: {
        actorEmail: admin.email,
        deletedCount: result.deletedCount,
        deletedBusinessNames: result.deletedBusinessNames,
        confirmationText: BULK_TEST_DATA_RESET_CONFIRMATION,
      },
    });

    revalidatePath('/admin');

    redirectPath =
      result.deletedCount > 0
        ? `/admin?resetResult=deleted&resetDeleted=${encodeURIComponent(String(result.deletedCount))}`
        : '/admin?resetResult=noop&resetDeleted=0';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete test/demo businesses.';
    redirectPath = `/admin?error=${encodeURIComponent(message)}`;
  }

  redirect(redirectPath);
}
