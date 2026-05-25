import { ManagedTwilioStatus, MessagingComplianceType, MessagingSetupMode, Prisma, TollFreeVerificationStatus } from '@prisma/client';

import { getManagedTwilioStatusSummary } from '@/lib/managed-twilio-status';

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

  if (input.messagingComplianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION) {
    return getOptionalTwilioSidError(input.tollFreeVerificationSid, 'BU', 'Toll-free verification SID');
  }

  return null;
}

export type OutboundMessagingSuppressionReason =
  | 'recipient_opted_out'
  | 'messaging_compliance_type_required'
  | 'a2p_compliance_pending'
  | 'a2p_compliance_blocked'
  | 'toll_free_verification_required'
  | 'toll_free_verification_pending'
  | 'toll_free_verification_blocked';

export type OutboundMessagingComplianceGate = {
  reason: Exclude<OutboundMessagingSuppressionReason, 'recipient_opted_out'>;
  detail: string;
  nextStep: string;
};

export function getOutboundMessagingComplianceGate(input: {
  twilioSubaccountSid?: string | null;
  messagingServiceSid?: string | null;
  messagingSetupMode?: MessagingSetupMode | null;
  managedTwilioStatus?: ManagedTwilioStatus | null;
  a2pFailureReason?: string | null;
  messagingComplianceType?: MessagingComplianceType | null;
  tollFreeVerificationStatus?: TollFreeVerificationStatus | null;
  tollFreeVerificationSid?: string | null;
  tollFreeVerificationNote?: string | null;
}) {
  const summary = getManagedTwilioStatusSummary({
    managedTwilioStatus: input.managedTwilioStatus ?? ManagedTwilioStatus.DRAFT,
    messagingSetupMode: input.messagingSetupMode ?? MessagingSetupMode.PER_BUSINESS_TWILIO,
    twilioAccountMode: input.twilioSubaccountSid ? 'BUSINESS_SUBACCOUNT' : 'MAIN_ACCOUNT',
    twilioSubaccountSid: input.twilioSubaccountSid ?? null,
    twilioPrimaryPhoneNumber: null,
    twilioPhoneNumber: null,
    twilioPrimaryNumberSid: null,
    twilioPhoneNumberSid: null,
    twilioMessagingServiceSid: input.messagingServiceSid ?? null,
    twilioWebhookSyncedAt: null,
    messagingComplianceType: input.messagingComplianceType ?? MessagingComplianceType.UNKNOWN,
    a2pFailureReason: input.a2pFailureReason ?? null,
    a2pApprovedAt: null,
    a2pCampaignSid: null,
    a2pBrandSid: null,
    a2pCustomerProfileSid: null,
    tollFreeVerificationStatus: input.tollFreeVerificationStatus ?? TollFreeVerificationStatus.NOT_STARTED,
    tollFreeVerificationSid: input.tollFreeVerificationSid ?? null,
    tollFreeVerificationNote: input.tollFreeVerificationNote ?? null,
  });

  if (summary.complianceReady) {
    return null;
  }

  if (summary.complianceTypeUnknown) {
    return {
      reason: 'messaging_compliance_type_required',
      detail: 'Choose number type before live messaging can be evaluated.',
      nextStep: summary.nextStep,
    } satisfies OutboundMessagingComplianceGate;
  }

  if (summary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION) {
    if (summary.attentionRequired) {
      return {
        reason: 'toll_free_verification_blocked',
        detail: 'Resolve the toll-free verification issue before live messaging resumes.',
        nextStep: summary.nextStep,
      } satisfies OutboundMessagingComplianceGate;
    }

    if (summary.compliancePendingReview) {
      return {
        reason: 'toll_free_verification_pending',
        detail: 'Toll-free verification is pending Twilio review.',
        nextStep: summary.nextStep,
      } satisfies OutboundMessagingComplianceGate;
    }

    return {
      reason: 'toll_free_verification_required',
      detail: 'Record the toll-free verification status before live messaging starts.',
      nextStep: summary.nextStep,
    } satisfies OutboundMessagingComplianceGate;
  }

  if (summary.attentionRequired) {
    return {
      reason: 'a2p_compliance_blocked',
      detail: 'Resolve the A2P compliance issue before live messaging resumes.',
      nextStep: summary.nextStep,
    } satisfies OutboundMessagingComplianceGate;
  }

  return {
    reason: 'a2p_compliance_pending',
    detail: 'A2P approval is still pending.',
    nextStep: summary.nextStep,
  } satisfies OutboundMessagingComplianceGate;
}

export function getTestSmsSuppressionMessage(reason: OutboundMessagingSuppressionReason) {
  switch (reason) {
    case 'recipient_opted_out':
      return 'Test SMS was suppressed because that destination has opted out of SMS.';
    case 'messaging_compliance_type_required':
      return 'Choose number type before sending a live test SMS.';
    case 'toll_free_verification_required':
    case 'toll_free_verification_pending':
      return 'Test SMS is blocked until toll-free verification is approved.';
    case 'toll_free_verification_blocked':
      return 'Test SMS is blocked until the toll-free verification issue is resolved.';
    case 'a2p_compliance_blocked':
      return 'Test SMS is blocked until the A2P compliance issue is resolved.';
    case 'a2p_compliance_pending':
      return 'Test SMS is blocked until A2P approval is complete.';
    default:
      return 'Unable to send the test SMS until messaging compliance is ready.';
  }
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
