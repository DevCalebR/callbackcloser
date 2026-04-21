import { ManagedTwilioStatus, TwilioAccountMode, type Business } from '@prisma/client';

type ManagedTwilioBlockerKey =
  | 'subaccount'
  | 'number'
  | 'messaging_service'
  | 'webhooks'
  | 'a2p_details'
  | 'brand_review'
  | 'campaign_review'
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
  complianceReady: boolean;
  complianceStarted: boolean;
  attentionRequired: boolean;
  onboardingReady: boolean;
  messagingReady: boolean;
  approvedAt: Date | null | undefined;
  blockers: Array<{ key: ManagedTwilioBlockerKey; label: string; detail: string }>;
  nextStep: string;
};

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
    | 'a2pFailureReason'
    | 'a2pApprovedAt'
    | 'a2pCampaignSid'
    | 'a2pBrandSid'
    | 'a2pCustomerProfileSid'
  >
): ManagedTwilioSummary {
  const managedTwilioStatus = resolveManagedTwilioStatus(business);
  const label = managedTwilioStatusLabels[managedTwilioStatus];
  const description =
    business.a2pFailureReason && managedTwilioStatus === ManagedTwilioStatus.FAILED_REVIEW
      ? business.a2pFailureReason
      : managedTwilioStatusDescriptions[managedTwilioStatus];
  const accountMode = business.twilioAccountMode || TwilioAccountMode.BUSINESS_SUBACCOUNT;
  const requiresSubaccount = accountMode === TwilioAccountMode.BUSINESS_SUBACCOUNT;
  const subaccountReady = Boolean(business.twilioSubaccountSid);
  const accountReady = requiresSubaccount ? subaccountReady : true;
  const numberAssigned = hasManagedTwilioNumber(business);
  const messagingServiceReady = Boolean(business.twilioMessagingServiceSid);
  const webhooksSynced = Boolean(business.twilioWebhookSyncedAt);
  const complianceReady = managedTwilioStatus === ManagedTwilioStatus.COMPLIANT_LIVE;
  const complianceStarted = Boolean(
    business.a2pCustomerProfileSid || business.a2pBrandSid || business.a2pCampaignSid || business.a2pApprovedAt
  );
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

  const onboardingReady = accountReady && numberAssigned && messagingServiceReady && webhooksSynced;
  const messagingReady = onboardingReady && complianceReady;
  const attentionRequired =
    managedTwilioStatus === ManagedTwilioStatus.PAUSED_NONCOMPLIANT || managedTwilioStatus === ManagedTwilioStatus.FAILED_REVIEW;

  return {
    label,
    description,
    accountMode,
    accountReady,
    subaccountReady,
    numberAssigned,
    messagingServiceReady,
    webhooksSynced,
    complianceReady,
    complianceStarted,
    attentionRequired,
    onboardingReady,
    messagingReady,
    approvedAt: business.a2pApprovedAt,
    blockers,
    nextStep: blockers[0]?.detail || managedTwilioStatusDescriptions[managedTwilioStatus],
  };
}
