import type { Business } from '@prisma/client';

import { db } from '@/lib/db';
import { normalizePhoneNumber } from '@/lib/phone';
import { isPortfolioDemoModeEnabled } from '@/lib/portfolio-demo-guardrail';
import { getTwilioClient, getTwilioSubaccountClient, hasTwilioClientEnv } from '@/lib/twilio-client';
import { logTwilioInfo } from '@/lib/twilio-logging';
import { getTwilioWebhookConfig, syncTwilioIncomingPhoneNumberWebhooks } from '@/lib/twilio';

type EnvMap = Readonly<Record<string, string | undefined>>;

export type TwilioProvisioningBlockReason = 'already_has_number' | 'missing_twilio_credentials' | 'demo_mode';

type ProvisionableBusiness = Pick<Business, 'id' | 'name' | 'twilioSubaccountSid' | 'twilioPhoneNumber' | 'twilioPhoneNumberSid'>;

type ProvisionPhoneNumberOptions = {
  businessId: string;
  businessName: string;
  areaCode?: string | number | null;
  correlationId?: string;
};

type LinkProvisionedPhoneNumberParams = {
  businessId: string;
  phoneNumber: string | null;
  phoneNumberSid: string;
  syncedAt?: Date;
  correlationId?: string;
  subaccountSid?: string | null;
};

export type ProvisionPhoneNumberResult = {
  phoneNumber: string | null;
  phoneNumberSid: string;
  syncedAt: Date;
  subaccountSid: string;
};

function parseAreaCode(areaCode: ProvisionPhoneNumberOptions['areaCode']) {
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

export function getTwilioProvisioningBlockReason(
  business: Pick<ProvisionableBusiness, 'twilioPhoneNumber' | 'twilioPhoneNumberSid'>,
  env: EnvMap = process.env
): TwilioProvisioningBlockReason | null {
  if (isPortfolioDemoModeEnabled(env)) {
    return 'demo_mode';
  }

  if (business.twilioPhoneNumber || business.twilioPhoneNumberSid) {
    return 'already_has_number';
  }

  if (!hasTwilioClientEnv(env)) {
    return 'missing_twilio_credentials';
  }

  return null;
}

export async function ensureTwilioSubaccount(
  businessId: string,
  businessName: string,
  correlationId = 'n/a'
) {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { id: true, twilioSubaccountSid: true },
  });

  if (!business) {
    throw new Error('Business not found');
  }

  if (business.twilioSubaccountSid) {
    return business.twilioSubaccountSid;
  }

  const parentClient = getTwilioClient();
  const subaccount = await parentClient.api.accounts.create({
    friendlyName: `CallbackCloser-${businessId}`,
  });

  await db.business.update({
    where: { id: businessId },
    data: { twilioSubaccountSid: subaccount.sid },
  });

  logTwilioInfo('provisioning', 'subaccount_created', {
    correlationId,
    businessId,
    businessName,
    twilioSubaccountSid: subaccount.sid,
    ownerAccountSid: subaccount.ownerAccountSid,
  });

  return subaccount.sid;
}

export async function provisionPhoneNumber(options: ProvisionPhoneNumberOptions): Promise<ProvisionPhoneNumberResult> {
  const correlationId = options.correlationId ?? 'n/a';
  const webhookConfig = getTwilioWebhookConfig();
  const subaccountSid = await ensureTwilioSubaccount(options.businessId, options.businessName, correlationId);
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
    throw new Error('No US local phone numbers available');
  }

  const purchasedNumber = await client.incomingPhoneNumbers.create({
    phoneNumber: candidate.phoneNumber,
    friendlyName: `${options.businessName} - CallbackCloser`,
  });

  logTwilioInfo('provisioning', 'number_purchased', {
    correlationId,
    twilioSubaccountSid: subaccountSid,
    phoneNumberSid: purchasedNumber.sid,
    phoneNumber: purchasedNumber.phoneNumber,
    appBaseUrl: webhookConfig.appBaseUrl,
  });

  const { number } = await syncTwilioIncomingPhoneNumberWebhooks(purchasedNumber.sid, client);

  logTwilioInfo('provisioning', 'webhooks_configured', {
    correlationId,
    twilioSubaccountSid: subaccountSid,
    phoneNumberSid: number.sid,
    phoneNumber: number.phoneNumber,
    voiceUrl: webhookConfig.voiceUrl,
    smsUrl: webhookConfig.smsUrl,
    statusUrl: webhookConfig.statusUrl,
  });

  const syncedAt = new Date();
  await linkProvisionedPhoneNumberToBusiness({
    businessId: options.businessId,
    phoneNumber: number.phoneNumber,
    phoneNumberSid: number.sid,
    syncedAt,
    correlationId,
    subaccountSid,
  });

  return {
    phoneNumber: number.phoneNumber,
    phoneNumberSid: number.sid,
    syncedAt,
    subaccountSid,
  };
}

export async function linkProvisionedPhoneNumberToBusiness(params: LinkProvisionedPhoneNumberParams) {
  const syncedAt = params.syncedAt ?? new Date();
  const business = await db.business.update({
    where: { id: params.businessId },
    data: {
      ...(params.subaccountSid !== undefined ? { twilioSubaccountSid: params.subaccountSid } : {}),
      twilioPhoneNumber: normalizePhoneNumber(params.phoneNumber),
      twilioPhoneNumberSid: params.phoneNumberSid,
      twilioWebhookSyncedAt: syncedAt,
    },
  });

  logTwilioInfo('provisioning', 'account_linked', {
    correlationId: params.correlationId ?? 'n/a',
    businessId: business.id,
    twilioSubaccountSid: business.twilioSubaccountSid,
    phoneNumberSid: business.twilioPhoneNumberSid,
    phoneNumber: business.twilioPhoneNumber,
  });

  return business;
}
