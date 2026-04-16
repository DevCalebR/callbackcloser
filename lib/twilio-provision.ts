import type { Business } from '@prisma/client';

import { db } from '@/lib/db';
import { provisionManagedTwilioForBusiness } from '@/lib/managed-twilio';
import { isPortfolioDemoModeEnabled } from '@/lib/portfolio-demo-guardrail';
import { getTwilioClient, hasTwilioClientEnv } from '@/lib/twilio-client';
import { logTwilioInfo } from '@/lib/twilio-logging';
import { buildManagedProvisioningBusinessInput } from '@/lib/twilio-provisioning-input';

type EnvMap = Readonly<Record<string, string | undefined>>;

export type TwilioProvisioningBlockReason = 'already_has_number' | 'missing_twilio_credentials' | 'demo_mode';

type ProvisionableBusiness = Pick<
  Business,
  | 'id'
  | 'name'
  | 'twilioSubaccountSid'
  | 'twilioPhoneNumber'
  | 'twilioPhoneNumberSid'
  | 'twilioMessagingServiceSid'
  | 'twilioPrimaryNumberSid'
  | 'twilioPrimaryPhoneNumber'
>;

type ProvisionPhoneNumberOptions = {
  businessId: string;
  businessName: string;
  areaCode?: string | number | null;
  correlationId?: string;
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
  const business = await db.business.findUnique({
    where: { id: options.businessId },
    select: {
      id: true,
      name: true,
      twilioSubaccountSid: true,
      twilioMessagingServiceSid: true,
      twilioPrimaryNumberSid: true,
      twilioPrimaryPhoneNumber: true,
      twilioPhoneNumberSid: true,
      twilioPhoneNumber: true,
    },
  });

  if (!business) {
    throw new Error('Business not found');
  }

  const correlationId = options.correlationId ?? 'n/a';
  const managedBusiness = await provisionManagedTwilioForBusiness(
    buildManagedProvisioningBusinessInput(business, options.businessName),
    {
      areaCode: parseAreaCode(options.areaCode),
      correlationId,
    }
  );

  const syncedAt = managedBusiness.twilioWebhookSyncedAt ?? new Date();

  return {
    phoneNumber: managedBusiness.twilioPrimaryPhoneNumber,
    phoneNumberSid: managedBusiness.twilioPrimaryNumberSid ?? managedBusiness.twilioPhoneNumberSid ?? '',
    syncedAt,
    subaccountSid: managedBusiness.twilioSubaccountSid ?? '',
  };
}
