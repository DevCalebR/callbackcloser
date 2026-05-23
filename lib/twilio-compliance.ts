import { MessagingComplianceType, Prisma } from '@prisma/client';

const TWILIO_SID_BODY = '[0-9a-fA-F]{32}';

function getTwilioSidPattern(prefix: string) {
  return new RegExp(`^${prefix}${TWILIO_SID_BODY}$`);
}

export function normalizeOptionalSid(value: string | null | undefined) {
  const trimmed = value?.trim() || '';
  return trimmed || null;
}

export function getOptionalTwilioSidError(value: string | null, prefix: string, label: string) {
  if (!value) return null;
  if (!getTwilioSidPattern(prefix).test(value)) {
    return `${label} must be a valid Twilio SID starting with ${prefix}.`;
  }
  return null;
}

export function getMessagingComplianceSidValidationError(input: {
  messagingComplianceType: MessagingComplianceType;
  a2pCustomerProfileSid: string | null;
  a2pBrandSid: string | null;
  a2pCampaignSid: string | null;
  tollFreeVerificationSid: string | null;
}) {
  if (input.messagingComplianceType === MessagingComplianceType.LOCAL_A2P) {
    return (
      getOptionalTwilioSidError(input.a2pCustomerProfileSid, 'BU', 'A2P customer profile SID') ||
      getOptionalTwilioSidError(input.a2pBrandSid, 'BN', 'A2P brand SID') ||
      getOptionalTwilioSidError(input.a2pCampaignSid, 'QE', 'A2P campaign SID')
    );
  }

  if (input.messagingComplianceType === MessagingComplianceType.TOLL_FREE) {
    return getOptionalTwilioSidError(input.tollFreeVerificationSid, 'BU', 'Toll-free verification SID');
  }

  return null;
}

function getUniqueTarget(error: Prisma.PrismaClientKnownRequestError) {
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.map((value) => String(value));
  if (typeof target === 'string') return [target];
  return [];
}

export function getBusinessTwilioSaveErrorMessage(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = getUniqueTarget(error);

    if (target.includes('twilioPhoneNumber')) {
      return 'That Twilio number is already linked to another business.';
    }

    if (target.includes('twilioPhoneNumberSid') || target.includes('twilioPrimaryNumberSid')) {
      return 'That Twilio number SID is already linked to another business.';
    }

    if (target.includes('twilioMessagingServiceSid')) {
      return 'That Messaging Service SID is already linked to another business.';
    }

    if (target.includes('twilioSubaccountSid')) {
      return 'That Twilio subaccount SID is already linked to another business.';
    }

    if (target.includes('a2pCustomerProfileSid')) {
      return 'That A2P customer profile SID is already linked to another business.';
    }

    if (target.includes('a2pBrandSid')) {
      return 'That A2P brand SID is already linked to another business.';
    }

    if (target.includes('a2pCampaignSid')) {
      return 'That A2P campaign SID is already linked to another business.';
    }

    if (target.includes('tollFreeVerificationSid')) {
      return 'That toll-free verification SID is already linked to another business.';
    }

    return 'One of those Twilio identifiers is already linked to another business.';
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return null;
}
