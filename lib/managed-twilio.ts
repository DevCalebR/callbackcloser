import { ManagedTwilioStatus, type Business } from '@prisma/client';

import { db } from '@/lib/db';
import {
  getManagedTextingNumber,
  getManagedTwilioStatusSummary,
  managedTwilioStatusDescriptions,
  managedTwilioStatusLabels,
  resolveManagedTwilioStatus,
  type ManagedTwilioSummary,
} from '@/lib/managed-twilio-status';
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
  | 'twilioPhoneNumberSid'
  | 'twilioPhoneNumber'
  | 'managedTwilioStatus'
  | 'a2pCustomerProfileSid'
  | 'a2pBrandSid'
  | 'a2pCampaignSid'
  | 'a2pFailureReason'
  | 'a2pApprovedAt'
  | 'twilioWebhookSyncedAt'
>;

type AreaCodeInput = string | number | null | undefined;

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

export {
  getManagedTextingNumber,
  getManagedTwilioStatusSummary,
  managedTwilioStatusDescriptions,
  managedTwilioStatusLabels,
  resolveManagedTwilioStatus,
};

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

async function updateManagedTwilioFields(
  businessId: string,
  data: Partial<
    Pick<
      Business,
      | 'twilioSubaccountSid'
      | 'twilioMessagingServiceSid'
      | 'twilioPrimaryNumberSid'
      | 'twilioPrimaryPhoneNumber'
      | 'twilioPhoneNumberSid'
      | 'twilioPhoneNumber'
      | 'twilioWebhookSyncedAt'
      | 'a2pCustomerProfileSid'
      | 'a2pBrandSid'
      | 'a2pCampaignSid'
      | 'a2pSubmittedAt'
      | 'a2pApprovedAt'
      | 'a2pFailureReason'
      | 'twilioProvisioningStartedAt'
      | 'twilioProvisionedAt'
    >
  >
) {
  return db.business.update({
    where: { id: businessId },
    data,
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

export async function syncManagedTwilioNumberWebhooks(
  business: Pick<
    ManagedTwilioBusiness,
    | 'id'
    | 'name'
    | 'twilioSubaccountSid'
    | 'twilioPrimaryNumberSid'
    | 'twilioPhoneNumberSid'
    | 'twilioPrimaryPhoneNumber'
    | 'twilioPhoneNumber'
  >,
  correlationId = 'n/a'
) {
  const phoneNumberSid = business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid;
  if (!phoneNumberSid) {
    throw new Error('Managed Twilio primary number is missing');
  }

  const subaccountSid = business.twilioSubaccountSid || (await createSubaccountForBusiness(business, correlationId));
  const client = getTwilioSubaccountClient(subaccountSid);
  const { number } = await syncTwilioIncomingPhoneNumberWebhooks(phoneNumberSid, client);
  const normalized = normalizePhoneNumber(number.phoneNumber);
  const syncedAt = new Date();

  await updateManagedTwilioFields(business.id, {
    twilioSubaccountSid: subaccountSid,
    twilioPrimaryNumberSid: number.sid,
    twilioPrimaryPhoneNumber: normalized,
    twilioPhoneNumberSid: number.sid,
    twilioPhoneNumber: normalized,
    twilioWebhookSyncedAt: syncedAt,
  });

  logTwilioInfo('provisioning', 'number_webhooks_synced', {
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
    syncedAt,
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

export async function syncComplianceStatus(
  business: Pick<
    ManagedTwilioBusiness,
    | 'id'
    | 'managedTwilioStatus'
    | 'twilioSubaccountSid'
    | 'twilioMessagingServiceSid'
    | 'twilioPrimaryNumberSid'
    | 'twilioPhoneNumberSid'
    | 'twilioPrimaryPhoneNumber'
    | 'twilioPhoneNumber'
    | 'a2pCustomerProfileSid'
    | 'a2pBrandSid'
    | 'a2pCampaignSid'
    | 'a2pFailureReason'
    | 'a2pApprovedAt'
  >
) {
  const nextStatus = resolveManagedTwilioStatus(business);
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
  const syncedNumber = await syncManagedTwilioNumberWebhooks(
    {
      ...business,
      twilioSubaccountSid: subaccountSid,
      twilioPrimaryNumberSid: primaryNumber.phoneNumberSid,
      twilioPhoneNumberSid: primaryNumber.phoneNumberSid,
      twilioPrimaryPhoneNumber: primaryNumber.phoneNumber,
      twilioPhoneNumber: primaryNumber.phoneNumber,
    },
    correlationId
  );
  await attachNumberToMessagingService(
    {
      ...business,
      twilioSubaccountSid: subaccountSid,
      twilioMessagingServiceSid: messagingServiceSid,
      twilioPrimaryNumberSid: syncedNumber.phoneNumberSid,
    },
    correlationId
  );

  const nextStatus = resolveManagedTwilioStatus({
    ...business,
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

  await updateManagedTwilioStatus(business.id, nextStatus, {
    twilioSubaccountSid: subaccountSid,
    twilioMessagingServiceSid: messagingServiceSid,
    twilioPrimaryNumberSid: syncedNumber.phoneNumberSid,
    twilioPrimaryPhoneNumber: syncedNumber.phoneNumber,
    twilioPhoneNumberSid: syncedNumber.phoneNumberSid,
    twilioPhoneNumber: syncedNumber.phoneNumber,
    twilioWebhookSyncedAt: syncedNumber.syncedAt,
    twilioProvisionedAt: new Date(),
  });

  return db.business.findUniqueOrThrow({ where: { id: business.id } });
}
