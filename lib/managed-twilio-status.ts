import {
  ManagedTwilioStatus,
  MessagingComplianceType,
  TollFreeVerificationStatus,
  TwilioAccountMode,
  type Business,
} from '@prisma/client';

type ManagedTwilioBlockerKey =
  | 'subaccount'
  | 'number'
  | 'messaging_service'
  | 'webhooks'
  | 'compliance_type'
  | 'a2p_details'
  | 'brand_review'
  | 'campaign_review'
  | 'toll_free_details'
  | 'toll_free_review'
  | 'compliance_rejected'
  | 'compliance_paused';

export type ManagedTwilioSummary = {
  label: string;
  description: string;
  accountMode: TwilioAccountMode;
  accountReady: boolean;
  subaccountReady: boolean;
  numberAssigned: boolean;
  messagingServiceReady: boolean;
  webhooksSynced: boolean;
  complianceType: MessagingComplianceType;
  complianceTypeLabel: string;
  complianceReady: boolean;
  complianceStarted: boolean;
  compliancePendingReview: boolean;
  complianceTypeUnknown: boolean;
  attentionRequired: boolean;
  onboardingReady: boolean;
  messagingReady: boolean;
  approvedAt: Date | null | undefined;
  blockers: Array<{ key: ManagedTwilioBlockerKey; label: string; detail: string }>;
  nextStep: string;
};

export const messagingComplianceTypeLabels: Record<MessagingComplianceType, string> = {
  UNKNOWN: 'Unknown / not selected',
  LOCAL_A2P: 'Local 10DLC / A2P',
  TOLL_FREE: 'Toll-free verification',
};

export function getMessagingComplianceTypeLabel(type: MessagingComplianceType) {
  return messagingComplianceTypeLabels[type] || messagingComplianceTypeLabels.UNKNOWN;
}

export const managedTwilioStatusLabels: Record<ManagedTwilioStatus, string> = {
  DRAFT: 'Draft',
  PROVISIONING: 'Provisioning',
  AWAITING_BUSINESS_VERIFICATION: 'Business verification needed',
  BRAND_SUBMITTED: 'Brand submitted',
  CAMPAIGN_SUBMITTED: 'Campaign pending review',
  COMPLIANT_LIVE: 'A2P approved',
  PAUSED_NONCOMPLIANT: 'Paused for compliance',
  FAILED_REVIEW: 'Rejected / failed review',
};

export const managedTwilioStatusDescriptions: Record<ManagedTwilioStatus, string> = {
  DRAFT: 'We still need to provision your texting line and managed messaging setup.',
  PROVISIONING: 'We are provisioning your texting line and managed Twilio setup.',
  AWAITING_BUSINESS_VERIFICATION:
    'Your number, Messaging Service, and webhooks are ready. A2P business details still need to be completed before compliant US messaging can go live.',
  BRAND_SUBMITTED: 'Your A2P brand details were submitted. Campaign registration is still pending.',
  CAMPAIGN_SUBMITTED: 'Your A2P campaign is submitted and waiting on Twilio or carrier review.',
  COMPLIANT_LIVE: 'Your Twilio setup and A2P registration are approved for compliant messaging.',
  PAUSED_NONCOMPLIANT: 'Messaging is paused until the Twilio or A2P issue is resolved.',
  FAILED_REVIEW: 'Twilio or the ecosystem rejected the current registration. Review the failure details before resubmitting.',
};

export const tollFreeVerificationStatusLabels: Record<TollFreeVerificationStatus, string> = {
  NOT_STARTED: 'Not started',
  PENDING: 'Pending verification',
  APPROVED: 'Verified',
  REJECTED: 'Rejected / failed review',
  NEEDS_UPDATE: 'Needs update',
  NOT_APPLICABLE: 'Not applicable',
};

export const tollFreeVerificationStatusDescriptions: Record<TollFreeVerificationStatus, string> = {
  NOT_STARTED: 'Record the toll-free verification path before live messaging starts.',
  PENDING: 'Toll-free verification was submitted and is still pending Twilio review.',
  APPROVED: 'Your Twilio setup and toll-free verification are approved for live messaging.',
  REJECTED: 'Twilio rejected the current toll-free verification. Review the failure details before resubmitting.',
  NEEDS_UPDATE: 'Messaging is paused until the toll-free verification issue is resolved.',
  NOT_APPLICABLE: 'This business is not using toll-free verification for live messaging.',
};

export function getManagedTextingNumber(business: Pick<Business, 'twilioPrimaryPhoneNumber' | 'twilioPhoneNumber'>) {
  return business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || null;
}

function hasManagedTwilioNumber(
  business: Pick<Business, 'twilioPrimaryNumberSid' | 'twilioPhoneNumberSid' | 'twilioPrimaryPhoneNumber' | 'twilioPhoneNumber'>
) {
  return Boolean((business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid) && getManagedTextingNumber(business));
}

export function resolveManagedTwilioStatus(
  business: Pick<
    Business,
    | 'managedTwilioStatus'
    | 'twilioAccountMode'
    | 'twilioSubaccountSid'
    | 'twilioMessagingServiceSid'
    | 'twilioPrimaryNumberSid'
    | 'twilioPhoneNumberSid'
    | 'twilioPrimaryPhoneNumber'
    | 'twilioPhoneNumber'
    | 'a2pCustomerProfileSid'
    | 'a2pBrandSid'
    | 'a2pCampaignSid'
    | 'a2pApprovedAt'
    | 'a2pFailureReason'
  >
) {
  if (business.managedTwilioStatus === ManagedTwilioStatus.PAUSED_NONCOMPLIANT) {
    return ManagedTwilioStatus.PAUSED_NONCOMPLIANT;
  }

  if (business.a2pFailureReason || business.managedTwilioStatus === ManagedTwilioStatus.FAILED_REVIEW) {
    return ManagedTwilioStatus.FAILED_REVIEW;
  }

  if (business.a2pApprovedAt || business.managedTwilioStatus === ManagedTwilioStatus.COMPLIANT_LIVE) {
    return ManagedTwilioStatus.COMPLIANT_LIVE;
  }

  if (business.a2pCampaignSid) {
    return ManagedTwilioStatus.CAMPAIGN_SUBMITTED;
  }

  if (business.a2pBrandSid || business.a2pCustomerProfileSid) {
    return ManagedTwilioStatus.BRAND_SUBMITTED;
  }

  if (business.twilioMessagingServiceSid && hasManagedTwilioNumber(business)) {
    return ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION;
  }

  if (business.twilioSubaccountSid || business.twilioMessagingServiceSid || hasManagedTwilioNumber(business)) {
    return ManagedTwilioStatus.PROVISIONING;
  }

  return ManagedTwilioStatus.DRAFT;
}

function resolveMessagingComplianceType(
  business: Pick<
    Business,
    | 'messagingComplianceType'
    | 'a2pCustomerProfileSid'
    | 'a2pBrandSid'
    | 'a2pCampaignSid'
    | 'a2pFailureReason'
    | 'a2pApprovedAt'
    | 'tollFreeVerificationSid'
    | 'tollFreeVerificationNote'
  >
) {
  if (business.messagingComplianceType && business.messagingComplianceType !== MessagingComplianceType.UNKNOWN) {
    return business.messagingComplianceType;
  }

  if (
    business.a2pCustomerProfileSid ||
    business.a2pBrandSid ||
    business.a2pCampaignSid ||
    business.a2pFailureReason ||
    business.a2pApprovedAt
  ) {
    return MessagingComplianceType.LOCAL_A2P;
  }

  if (business.tollFreeVerificationSid || business.tollFreeVerificationNote) {
    return MessagingComplianceType.TOLL_FREE;
  }

  return MessagingComplianceType.UNKNOWN;
}

function resolveTollFreeVerificationStatus(
  business: Pick<Business, 'tollFreeVerificationStatus' | 'tollFreeVerificationSid'>
) {
  if (business.tollFreeVerificationStatus === TollFreeVerificationStatus.NEEDS_UPDATE) {
    return TollFreeVerificationStatus.NEEDS_UPDATE;
  }

  if (business.tollFreeVerificationStatus === TollFreeVerificationStatus.REJECTED) {
    return TollFreeVerificationStatus.REJECTED;
  }

  if (business.tollFreeVerificationStatus === TollFreeVerificationStatus.APPROVED) {
    return TollFreeVerificationStatus.APPROVED;
  }

  if (business.tollFreeVerificationStatus === TollFreeVerificationStatus.PENDING || business.tollFreeVerificationSid) {
    return TollFreeVerificationStatus.PENDING;
  }

  return TollFreeVerificationStatus.NOT_STARTED;
}

export function getManagedTwilioStatusSummary(
  business: Pick<
    Business,
    | 'managedTwilioStatus'
    | 'twilioAccountMode'
    | 'twilioSubaccountSid'
    | 'twilioPrimaryPhoneNumber'
    | 'twilioPhoneNumber'
    | 'twilioPrimaryNumberSid'
    | 'twilioPhoneNumberSid'
    | 'twilioMessagingServiceSid'
    | 'twilioWebhookSyncedAt'
    | 'messagingComplianceType'
    | 'a2pFailureReason'
    | 'a2pApprovedAt'
    | 'a2pCampaignSid'
    | 'a2pBrandSid'
    | 'a2pCustomerProfileSid'
    | 'tollFreeVerificationStatus'
    | 'tollFreeVerificationSid'
    | 'tollFreeVerificationNote'
  >
): ManagedTwilioSummary {
  const accountMode = business.twilioAccountMode || TwilioAccountMode.BUSINESS_SUBACCOUNT;
  const requiresSubaccount = accountMode === TwilioAccountMode.BUSINESS_SUBACCOUNT;
  const subaccountReady = Boolean(business.twilioSubaccountSid);
  const accountReady = requiresSubaccount ? subaccountReady : true;
  const numberAssigned = hasManagedTwilioNumber(business);
  const messagingServiceReady = Boolean(business.twilioMessagingServiceSid);
  const webhooksSynced = Boolean(business.twilioWebhookSyncedAt);
  const complianceType = resolveMessagingComplianceType(business);
  const complianceTypeUnknown = complianceType === MessagingComplianceType.UNKNOWN;
  const blockers: ManagedTwilioSummary['blockers'] = [];

  if (!accountReady) {
    blockers.push({
      key: 'subaccount',
      label: requiresSubaccount ? 'Create Twilio subaccount' : 'Confirm Twilio account mode',
      detail: requiresSubaccount
        ? 'Create or reconnect the managed Twilio subaccount for this business.'
        : 'This business is using the parent Twilio account directly, so the parent-account mapping needs to stay accurate.',
    });
  }

  if (!numberAssigned) {
    blockers.push({
      key: 'number',
      label: 'Assign a business number',
      detail: 'Provision a new Twilio local number or attach an approved existing number through the admin workflow.',
    });
  }

  if (!messagingServiceReady) {
    blockers.push({
      key: 'messaging_service',
      label: 'Create Messaging Service',
      detail: 'The approved sending number still needs to be attached to a Twilio Messaging Service.',
    });
  }

  if (numberAssigned && !webhooksSynced) {
    blockers.push({
      key: 'webhooks',
      label: 'Refresh Twilio webhooks',
      detail: 'The assigned number still needs its voice, SMS, and status webhooks synced to the current app URL.',
    });
  }

  let label = 'Needs update';
  let description = 'Choose number type before messaging compliance can be evaluated.';
  let complianceReady = false;
  let complianceStarted = false;
  let compliancePendingReview = false;
  let attentionRequired = false;
  let approvedAt: Date | null | undefined = null;

  if (complianceTypeUnknown) {
    blockers.push({
      key: 'compliance_type',
      label: 'Choose number type',
      detail: 'Choose whether this business uses a local 10DLC/A2P number or a toll-free number before messaging readiness can be evaluated.',
    });
  } else if (complianceType === MessagingComplianceType.LOCAL_A2P) {
    const managedTwilioStatus = resolveManagedTwilioStatus(business);
    label = managedTwilioStatusLabels[managedTwilioStatus];
    description =
      business.a2pFailureReason && managedTwilioStatus === ManagedTwilioStatus.FAILED_REVIEW
        ? business.a2pFailureReason
        : managedTwilioStatusDescriptions[managedTwilioStatus];
    complianceReady = managedTwilioStatus === ManagedTwilioStatus.COMPLIANT_LIVE;
    complianceStarted = Boolean(
      business.a2pCustomerProfileSid ||
        business.a2pBrandSid ||
        business.a2pCampaignSid ||
        business.a2pApprovedAt ||
        managedTwilioStatus !== ManagedTwilioStatus.DRAFT
    );
    compliancePendingReview =
      managedTwilioStatus === ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION ||
      managedTwilioStatus === ManagedTwilioStatus.BRAND_SUBMITTED ||
      managedTwilioStatus === ManagedTwilioStatus.CAMPAIGN_SUBMITTED;
    attentionRequired =
      managedTwilioStatus === ManagedTwilioStatus.PAUSED_NONCOMPLIANT || managedTwilioStatus === ManagedTwilioStatus.FAILED_REVIEW;
    approvedAt = business.a2pApprovedAt;

    if (managedTwilioStatus === ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION) {
      blockers.push({
        key: 'a2p_details',
        label: 'Complete A2P business details',
        detail: 'Submit the business verification details needed before A2P brand and campaign registration can move forward.',
      });
    }

    if (managedTwilioStatus === ManagedTwilioStatus.BRAND_SUBMITTED) {
      blockers.push({
        key: 'brand_review',
        label: 'Finish brand registration',
        detail: 'Brand registration is underway, but the A2P campaign is not approved yet.',
      });
    }

    if (managedTwilioStatus === ManagedTwilioStatus.CAMPAIGN_SUBMITTED) {
      blockers.push({
        key: 'campaign_review',
        label: 'Wait for campaign approval',
        detail: 'The A2P campaign is pending Twilio or carrier review. Keep the business in onboarding until approval lands.',
      });
    }

    if (managedTwilioStatus === ManagedTwilioStatus.PAUSED_NONCOMPLIANT) {
      blockers.push({
        key: 'compliance_paused',
        label: 'Resolve compliance pause',
        detail: business.a2pFailureReason || 'Messaging is paused until the compliance issue is resolved.',
      });
    }

    if (managedTwilioStatus === ManagedTwilioStatus.FAILED_REVIEW) {
      blockers.push({
        key: 'compliance_rejected',
        label: 'Fix rejected registration',
        detail: business.a2pFailureReason || 'The current A2P registration failed review and must be corrected before messaging resumes.',
      });
    }
  } else {
    const tollFreeStatus = resolveTollFreeVerificationStatus(business);
    label = tollFreeVerificationStatusLabels[tollFreeStatus];
    description =
      business.tollFreeVerificationNote &&
      (tollFreeStatus === TollFreeVerificationStatus.NEEDS_UPDATE ||
        tollFreeStatus === TollFreeVerificationStatus.REJECTED)
        ? business.tollFreeVerificationNote
        : tollFreeVerificationStatusDescriptions[tollFreeStatus];
    complianceReady = tollFreeStatus === TollFreeVerificationStatus.APPROVED;
    complianceStarted = Boolean(
      business.tollFreeVerificationSid ||
        business.tollFreeVerificationNote ||
        tollFreeStatus !== TollFreeVerificationStatus.NOT_STARTED
    );
    compliancePendingReview = tollFreeStatus === TollFreeVerificationStatus.PENDING;
    attentionRequired =
      tollFreeStatus === TollFreeVerificationStatus.NEEDS_UPDATE ||
      tollFreeStatus === TollFreeVerificationStatus.REJECTED;

    if (tollFreeStatus === TollFreeVerificationStatus.NOT_STARTED) {
      blockers.push({
        key: 'toll_free_details',
        label: 'Record toll-free verification',
        detail: 'Record the toll-free verification status before messaging goes live.',
      });
    }

    if (tollFreeStatus === TollFreeVerificationStatus.PENDING) {
      blockers.push({
        key: 'toll_free_review',
        label: 'Wait for toll-free verification',
        detail: 'Toll-free verification is pending Twilio review. Keep the business in onboarding until verification completes.',
      });
    }

    if (tollFreeStatus === TollFreeVerificationStatus.NEEDS_UPDATE) {
      blockers.push({
        key: 'compliance_paused',
        label: 'Resolve compliance pause',
        detail: business.tollFreeVerificationNote || 'Messaging is paused until the toll-free verification issue is resolved.',
      });
    }

    if (tollFreeStatus === TollFreeVerificationStatus.REJECTED) {
      blockers.push({
        key: 'compliance_rejected',
        label: 'Fix rejected verification',
        detail:
          business.tollFreeVerificationNote ||
          'The current toll-free verification failed review and must be corrected before messaging resumes.',
      });
    }
  }

  const onboardingReady = accountReady && numberAssigned && messagingServiceReady && webhooksSynced;
  const messagingReady = onboardingReady && complianceReady;

  return {
    label,
    description,
    accountMode,
    accountReady,
    subaccountReady,
    numberAssigned,
    messagingServiceReady,
    webhooksSynced,
    complianceType,
    complianceTypeLabel: getMessagingComplianceTypeLabel(complianceType),
    complianceReady,
    complianceStarted,
    compliancePendingReview,
    complianceTypeUnknown,
    attentionRequired,
    onboardingReady,
    messagingReady,
    approvedAt,
    blockers,
    nextStep: blockers[0]?.detail || description,
  };
}
