import { ManagedTwilioStatus, type Business } from '@prisma/client';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { logTwilioInfo } from '@/lib/twilio-logging';
import { getTwilioWebhookConfig, syncTwilioIncomingPhoneNumberWebhooks } from '@/lib/twilio';
import { getTwilioSubaccountClient } from '@/lib/twilio-client';
import { ensureTwilioSubaccount } from '@/lib/twilio-provision';

type ManagedTwilioBusiness = Pick<
  Business,
  | 'id'
  | 'name'
  | 'twilioSubaccountSid'
  | 'twilioMessagingServiceSid'
  | 'twilioPrimaryNumberSid'
  | 'twilioPrimaryPhoneNumber'
  | 'managedTwilioStatus'
  | 'a2pCustomerProfileSid'
  | 'a2pBrandSid'
  | 'a2pCampaignSid'
  | 'a2pFailureReason'
>;

type AreaCodeInput = string | number | null | undefined;

export const managedTwilioStatusLabels: Record<ManagedTwilioStatus, string> = {
  DRAFT: 'Draft',
  PROVISIONING: 'Provisioning',
  AWAITING_BUSINESS_VERIFICATION: 'Awaiting business verification',
  BRAND_SUBMITTED: 'Brand submitted',
  CAMPAIGN_SUBMITTED: 'Campaign submitted',
  COMPLIANT_LIVE: 'Compliant and live',
  PAUSED_NONCOMPLIANT: 'Paused for compliance',
  FAILED_REVIEW: 'Failed review',
};

export const managedTwilioStatusDescriptions: Record<ManagedTwilioStatus, string> = {
  DRAFT: 'We still need to provision your texting line and managed messaging setup.',
  PROVISIONING: 'We are provisioning your texting line and managed Twilio setup.',
  AWAITING_BUSINESS_VERIFICATION: 'Your texting line is provisioned. Compliance details still need to be verified.',
  BRAND_SUBMITTED: 'Your compliance brand details have been submitted for review.',
  CAMPAIGN_SUBMITTED: 'Your messaging campaign details have been submitted for review.',
  COMPLIANT_LIVE: 'Your managed texting line is live and ready for missed-call recovery.',
  PAUSED_NONCOMPLIANT: 'Messaging is paused until compliance issues are resolved.',
  FAILED_REVIEW: 'Compliance review failed and needs attention before texting can resume.',
};

function parseAreaCode(areaCode: AreaCodeInput) {
  if (typeof areaCode === 'number' && Number.isInteger(areaCode) && areaCode >= 100 && areaCode <= 999) {
    return areaCode;
  }

  if (typeof areaCode !== 'string') {
    return undefined;
  }

  const trimmed = areaCode.trim();
  if (!/^\d{3}$/.test(trimmed)) {
    return undefined;
  }

  return Number.parseInt(trimmed, 10);
}

function getFriendlyManagedTwilioName(businessName: string) {
  return `${businessName} - CallbackCloser`;
}

export function getManagedTextingNumber(business: Pick<Business, 'twilioPrimaryPhoneNumber' | 'twilioPhoneNumber'>) {
  return business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || null;
}

export function getManagedTwilioStatusSummary(
  business: Pick<
    Business,
    | 'managedTwilioStatus'
    | 'twilioPrimaryPhoneNumber'
    | 'twilioMessagingServiceSid'
    | 'a2pFailureReason'
    | 'a2pApprovedAt'
    | 'a2pCampaignSid'
    | 'a2pBrandSid'
    | 'a2pCustomerProfileSid'
  >
) {
  const label = managedTwilioStatusLabels[business.managedTwilioStatus];
  const description =
    business.a2pFailureReason && business.managedTwilioStatus === ManagedTwilioStatus.FAILED_REVIEW
      ? business.a2pFailureReason
      : managedTwilioStatusDescriptions[business.managedTwilioStatus];

  return {
    label,
    description,
    numberAssigned: Boolean(business.twilioPrimaryPhoneNumber),
    messagingServiceReady: Boolean(business.twilioMessagingServiceSid),
    complianceReady: business.managedTwilioStatus === ManagedTwilioStatus.COMPLIANT_LIVE,
    complianceStarted: Boolean(business.a2pCustomerProfileSid || business.a2pBrandSid || business.a2pCampaignSid),
    approvedAt: business.a2pApprovedAt,
  };
}

export async function updateManagedTwilioStatus(
  businessId: string,
  status: ManagedTwilioStatus,
  data: Partial<
    Pick<
      Business,
      | 'a2pFailureReason'
      | 'twilioProvisioningStartedAt'
      | 'twilioProvisionedAt'
      | 'a2pSubmittedAt'
      | 'a2pApprovedAt'
      | 'twilioSubaccountSid'
      | 'twilioMessagingServiceSid'
      | 'twilioPrimaryNumberSid'
      | 'twilioPrimaryPhoneNumber'
      | 'twilioPhoneNumber'
      | 'twilioPhoneNumberSid'
      | 'twilioWebhookSyncedAt'
      | 'a2pCustomerProfileSid'
      | 'a2pBrandSid'
      | 'a2pCampaignSid'
    >
  > = {}
) {
  return db.business.update({
    where: { id: businessId },
    data: {
      ...data,
      managedTwilioStatus: status,
      managedTwilioStatusUpdatedAt: new Date(),
    },
  });
}

export async function createSubaccountForBusiness(business: Pick<ManagedTwilioBusiness, 'id' | 'name'>, correlationId = 'n/a') {
  const subaccountSid = await ensureTwilioSubaccount(business.id, business.name, correlationId);
  await updateManagedTwilioStatus(business.id, ManagedTwilioStatus.PROVISIONING, {
    twilioSubaccountSid: subaccountSid,
    twilioProvisioningStartedAt: new Date(),
  });
  return subaccountSid;
}

export async function createMessagingServiceForBusiness(
  business: Pick<ManagedTwilioBusiness, 'id' | 'name' | 'twilioSubaccountSid' | 'twilioMessagingServiceSid'>,
  correlationId = 'n/a'
) {
  if (business.twilioMessagingServiceSid) {
    return business.twilioMessagingServiceSid;
  }

  const subaccountSid = business.twilioSubaccountSid || (await createSubaccountForBusiness(business, correlationId));
  const client = getTwilioSubaccountClient(subaccountSid);
  const service = await client.messaging.v1.services.create({
    friendlyName: getFriendlyManagedTwilioName(business.name),
    useInboundWebhookOnNumber: true,
  });

  await updateManagedTwilioStatus(business.id, ManagedTwilioStatus.PROVISIONING, {
    twilioSubaccountSid: subaccountSid,
    twilioMessagingServiceSid: service.sid,
    twilioProvisioningStartedAt: new Date(),
  });

  logTwilioInfo('provisioning', 'messaging_service_created', {
    correlationId,
    businessId: business.id,
    twilioSubaccountSid: subaccountSid,
    twilioMessagingServiceSid: service.sid,
  });

  return service.sid;
}

export async function buyOrProvisionPrimaryNumberForBusiness(
  business: Pick<ManagedTwilioBusiness, 'id' | 'name' | 'twilioSubaccountSid' | 'twilioPrimaryNumberSid' | 'twilioPrimaryPhoneNumber'>,
  options: { areaCode?: AreaCodeInput; correlationId?: string } = {}
) {
  const correlationId = options.correlationId ?? 'n/a';
  if (business.twilioPrimaryNumberSid && business.twilioPrimaryPhoneNumber) {
    return {
      phoneNumberSid: business.twilioPrimaryNumberSid,
      phoneNumber: business.twilioPrimaryPhoneNumber,
      subaccountSid: business.twilioSubaccountSid ?? null,
    };
  }

  const subaccountSid = business.twilioSubaccountSid || (await createSubaccountForBusiness(business, correlationId));
  const client = getTwilioSubaccountClient(subaccountSid);
  const areaCode = parseAreaCode(options.areaCode);
  const candidates = await client.availablePhoneNumbers('US').local.list({
    limit: 1,
    smsEnabled: true,
    voiceEnabled: true,
    ...(areaCode ? { areaCode } : {}),
  });

  const candidate = candidates[0];
  if (!candidate?.phoneNumber) {
    throw new Error('No US local phone numbers available for managed provisioning');
  }

  const purchasedNumber = await client.incomingPhoneNumbers.create({
    phoneNumber: candidate.phoneNumber,
    friendlyName: getFriendlyManagedTwilioName(business.name),
  });

  const { number } = await syncTwilioIncomingPhoneNumberWebhooks(purchasedNumber.sid, client);
  const normalized = normalizePhoneNumber(number.phoneNumber);
  const syncedAt = new Date();

  await updateManagedTwilioStatus(business.id, ManagedTwilioStatus.PROVISIONING, {
    twilioSubaccountSid: subaccountSid,
    twilioPrimaryNumberSid: number.sid,
    twilioPrimaryPhoneNumber: normalized,
    twilioPhoneNumberSid: number.sid,
    twilioPhoneNumber: normalized,
    twilioWebhookSyncedAt: syncedAt,
    twilioProvisioningStartedAt: new Date(),
  });

  logTwilioInfo('provisioning', 'primary_number_provisioned', {
    correlationId,
    businessId: business.id,
    twilioSubaccountSid: subaccountSid,
    phoneNumberSid: number.sid,
    phoneNumber: normalized,
    appBaseUrl: getTwilioWebhookConfig().appBaseUrl,
  });

  return {
    phoneNumberSid: number.sid,
    phoneNumber: normalized,
    subaccountSid,
  };
}

export async function attachNumberToMessagingService(
  business: Pick<ManagedTwilioBusiness, 'id' | 'name' | 'twilioSubaccountSid' | 'twilioMessagingServiceSid' | 'twilioPrimaryNumberSid'>,
  correlationId = 'n/a'
) {
  const messagingServiceSid = await createMessagingServiceForBusiness(business, correlationId);
  const primaryNumberSid = business.twilioPrimaryNumberSid;
  const subaccountSid = business.twilioSubaccountSid || (await createSubaccountForBusiness(business, correlationId));

  if (!primaryNumberSid) {
    throw new Error('Managed Twilio primary number is missing');
  }

  const client = getTwilioSubaccountClient(subaccountSid);
  try {
    await client.messaging.v1.services(messagingServiceSid).phoneNumbers.create({
      phoneNumberSid: primaryNumberSid,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.toLowerCase().includes('already')) {
      throw error;
    }
  }

  logTwilioInfo('provisioning', 'number_attached_to_messaging_service', {
    correlationId,
    businessId: business.id,
    twilioSubaccountSid: subaccountSid,
    twilioMessagingServiceSid: messagingServiceSid,
    phoneNumberSid: primaryNumberSid,
  });

  return messagingServiceSid;
}

export async function createA2pEntities(
  business: Pick<
    ManagedTwilioBusiness,
    'id' | 'managedTwilioStatus' | 'a2pCustomerProfileSid' | 'a2pBrandSid' | 'a2pCampaignSid'
  >,
  correlationId = 'n/a'
) {
  // TODO: Replace this safe placeholder with full Twilio TrustHub/A2P automation once the
  // business verification payload and review workflow are finalized for managed onboarding.
  if (business.a2pCampaignSid) {
    return business;
  }

  await updateManagedTwilioStatus(business.id, ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION, {
    a2pSubmittedAt: new Date(),
  });

  logTwilioInfo('provisioning', 'a2p_placeholder_started', {
    correlationId,
    businessId: business.id,
    decision: 'awaiting_business_verification',
  });

  return db.business.findUniqueOrThrow({ where: { id: business.id } });
}

export async function syncComplianceStatus(
  business: Pick<
    ManagedTwilioBusiness,
    | 'id'
    | 'managedTwilioStatus'
    | 'twilioMessagingServiceSid'
    | 'twilioPrimaryNumberSid'
    | 'a2pCustomerProfileSid'
    | 'a2pBrandSid'
    | 'a2pCampaignSid'
    | 'a2pFailureReason'
  >
) {
  let nextStatus = business.managedTwilioStatus;

  if (business.a2pFailureReason) {
    nextStatus = ManagedTwilioStatus.FAILED_REVIEW;
  } else if (business.a2pCampaignSid) {
    nextStatus = ManagedTwilioStatus.CAMPAIGN_SUBMITTED;
  } else if (business.a2pBrandSid) {
    nextStatus = ManagedTwilioStatus.BRAND_SUBMITTED;
  } else if (business.twilioMessagingServiceSid && business.twilioPrimaryNumberSid) {
    nextStatus = ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION;
  } else if (business.twilioMessagingServiceSid || business.twilioPrimaryNumberSid) {
    nextStatus = ManagedTwilioStatus.PROVISIONING;
  } else {
    nextStatus = ManagedTwilioStatus.DRAFT;
  }

  await updateManagedTwilioStatus(business.id, nextStatus);
  return db.business.findUniqueOrThrow({ where: { id: business.id } });
}

export async function provisionManagedTwilioForBusiness(
  business: Pick<
    ManagedTwilioBusiness,
    'id' | 'name' | 'twilioSubaccountSid' | 'twilioMessagingServiceSid' | 'twilioPrimaryNumberSid' | 'twilioPrimaryPhoneNumber'
  >,
  options: { areaCode?: AreaCodeInput; correlationId?: string } = {}
) {
  const correlationId = options.correlationId ?? 'n/a';
  await updateManagedTwilioStatus(business.id, ManagedTwilioStatus.PROVISIONING, {
    twilioProvisioningStartedAt: new Date(),
  });

  const subaccountSid = await createSubaccountForBusiness(business, correlationId);
  const messagingServiceSid = await createMessagingServiceForBusiness(
    { ...business, twilioSubaccountSid: subaccountSid, twilioMessagingServiceSid: business.twilioMessagingServiceSid },
    correlationId
  );
  const primaryNumber = await buyOrProvisionPrimaryNumberForBusiness(
    {
      ...business,
      twilioSubaccountSid: subaccountSid,
      twilioPrimaryNumberSid: business.twilioPrimaryNumberSid,
      twilioPrimaryPhoneNumber: business.twilioPrimaryPhoneNumber,
    },
    { areaCode: options.areaCode, correlationId }
  );
  await attachNumberToMessagingService(
    {
      ...business,
      twilioSubaccountSid: subaccountSid,
      twilioMessagingServiceSid: messagingServiceSid,
      twilioPrimaryNumberSid: primaryNumber.phoneNumberSid,
    },
    correlationId
  );

  await updateManagedTwilioStatus(business.id, ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION, {
    twilioSubaccountSid: subaccountSid,
    twilioMessagingServiceSid: messagingServiceSid,
    twilioPrimaryNumberSid: primaryNumber.phoneNumberSid,
    twilioPrimaryPhoneNumber: primaryNumber.phoneNumber,
    twilioPhoneNumberSid: primaryNumber.phoneNumberSid,
    twilioPhoneNumber: primaryNumber.phoneNumber,
    twilioProvisionedAt: new Date(),
  });

  return db.business.findUniqueOrThrow({ where: { id: business.id } });
}
