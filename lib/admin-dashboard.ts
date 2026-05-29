import {
  BusinessProvisioningStatus,
  ManagedTwilioStatus,
  MessagingComplianceType,
  OperatorEventStatus,
  OwnerNotificationStatus,
  type Business,
  type BusinessNotificationSettings,
  type Call,
  type Lead,
  type Message,
  type OwnerNotification,
} from '@prisma/client';

import type { TwilioWebhookSnapshot } from '@/lib/admin-provisioning-presenters';
import { DEMO_OWNER_CLERK_ID, isTestDemoBusiness } from '@/lib/admin-test-data-reset';
import type { AdminMissedCallValidationTruth } from '@/lib/admin-operator-proof';
import type { AdminBusinessIssue, AdminTestSmsTruth } from '@/lib/admin-operator-visibility';
import { getBusinessPhoneSetupGate, getPublicBusinessPhone } from '@/lib/business-phone-setup';
import { getManagedTextingNumber, getManagedTwilioStatusSummary, type ManagedTwilioSummary } from '@/lib/managed-twilio-status';
import { formatMessageStatus, isMessageDeliveryIssueStatus } from '@/lib/lead-presenters';
import type { TwilioSetupStepKey } from '@/lib/twilio-setup';

type DashboardBusiness = Pick<
  Business,
  | 'id'
  | 'name'
  | 'ownerClerkId'
  | 'ownerName'
  | 'ownerInviteSentAt'
  | 'isTestBusiness'
  | 'archivedAt'
  | 'provisioningStatus'
  | 'provisioningError'
  | 'provisioningLastRunAt'
  | 'forwardingNumber'
  | 'notifyPhone'
  | 'twilioAccountMode'
  | 'messagingSetupMode'
  | 'twilioNumberSetupMode'
  | 'twilioSubaccountSid'
  | 'twilioMessagingServiceSid'
  | 'twilioPrimaryNumberSid'
  | 'twilioPhoneNumberSid'
  | 'twilioPrimaryPhoneNumber'
  | 'twilioPhoneNumber'
  | 'twilioWebhookSyncedAt'
  | 'managedTwilioStatus'
  | 'messagingComplianceType'
  | 'a2pCustomerProfileSid'
  | 'a2pBrandSid'
  | 'a2pCampaignSid'
  | 'a2pFailureReason'
  | 'a2pApprovedAt'
  | 'tollFreeVerificationStatus'
  | 'tollFreeVerificationSid'
  | 'tollFreeVerificationNote'
  | 'subscriptionStatus'
  | 'stripePriceId'
  | 'updatedAt'
> &
  Partial<
    Pick<
      Business,
      | 'publicBusinessPhone'
      | 'phoneSetupPath'
      | 'forwardingVerificationStatus'
      | 'forwardingVerifiedAt'
      | 'forwardingVerificationNote'
      | 'portingStatus'
      | 'portingNotes'
      | 'portingCompletedAt'
    >
  >;

type DashboardNotificationSettings = Pick<
  BusinessNotificationSettings,
  'ownerPhone' | 'ownerEmail' | 'notifySms' | 'notifyEmail' | 'notifyInApp' | 'urgentOnly'
>;

type EventMessage = Pick<Message, 'id' | 'leadId' | 'participant' | 'direction' | 'status' | 'body' | 'createdAt'>;
type EventOwnerNotification = Pick<OwnerNotification, 'id' | 'channel' | 'status' | 'error' | 'createdAt' | 'destination'>;
type EventLead = Pick<Lead, 'id' | 'status' | 'readiness' | 'billingRequired' | 'smsState' | 'summary' | 'createdAt' | 'lastInteractionAt'>;
type EventCall = Pick<Call, 'id' | 'status' | 'missed' | 'answered' | 'dialCallStatus' | 'createdAt'>;

export type AdminBoardFilter =
  | 'all'
  | 'pending_setup'
  | 'in_setup'
  | 'needs_attention'
  | 'pending_a2p'
  | 'live'
  | 'paused'
  | 'archived';

export type AdminBoardFilterOption = {
  key: AdminBoardFilter;
  label: string;
};

export type AdminNextStep = {
  title: string;
  detail: string;
  tone: 'healthy' | 'pending' | 'attention' | 'paused';
  actionLabel: string;
};

export type AdminBusinessEvent = {
  id: string;
  at: Date;
  severity: 'info' | 'warning' | 'error';
  label: string;
  summary: string;
  detail: string;
};

export type OnboardingConfidenceState =
  | 'draft'
  | 'in_setup'
  | 'needs_attention'
  | 'waiting_on_a2p'
  | 'ready_for_test'
  | 'ready_to_go_live'
  | 'live'
  | 'live_with_warnings'
  | 'archived';

export type OnboardingConfidenceMilestone = {
  key:
    | 'business_profile'
    | 'owner_connected'
    | 'owner_alerts'
    | 'twilio_setup'
    | 'texting_number'
    | 'business_number_path'
    | 'messaging_service'
    | 'webhooks'
    | 'a2p'
    | 'test_sms'
    | 'missed_call_validation'
    | 'live_gate';
  label: string;
  complete: boolean;
  variant: 'success' | 'warning' | 'pending';
  detail: string;
};

export type AdminOnboardingConfidence = {
  state: OnboardingConfidenceState;
  stateLabel: string;
  stateVariant: 'success' | 'secondary' | 'outline' | 'destructive';
  readinessLabel: 'Not ready' | 'Ready for test' | 'Ready for live' | 'Live with warnings' | 'Waiting on external approval';
  readinessVariant: 'success' | 'secondary' | 'outline' | 'destructive';
  nextAction: string;
  summary: string;
  blockers: Array<{ level: 'warning' | 'error'; message: string }>;
  milestones: OnboardingConfidenceMilestone[];
  readyForTest: boolean;
  readyForLive: boolean;
  canSafelyMarkLive: boolean;
  hasRecentFailures: boolean;
};

export type AdminBusinessPrimaryState =
  | 'archived'
  | 'paused'
  | 'provisioning_failed'
  | 'owner_blocked'
  | 'compliance_pending'
  | 'needs_attention'
  | 'ready_for_test'
  | 'ready_for_live'
  | 'live_with_warnings'
  | 'live'
  | 'draft'
  | 'in_setup';

export type AdminBusinessCardBadge = {
  key: string;
  label: string;
  variant: 'success' | 'secondary' | 'outline' | 'destructive';
};

export type AdminBusinessCardState = {
  primaryState: AdminBusinessPrimaryState;
  primaryLabel: string;
  primaryVariant: 'success' | 'secondary' | 'outline' | 'destructive';
  primaryReason: string;
  nextActionLabel: string;
  nextActionStepKey: TwilioSetupStepKey | null;
  badges: AdminBusinessCardBadge[];
  shouldAppearInNeedsAttention: boolean;
  shouldAppearInPendingCompliance: boolean;
  isArchived: boolean;
  isLive: boolean;
  isLiveWithWarnings: boolean;
  isReadyForTest: boolean;
  isReadyForLive: boolean;
  isDraft: boolean;
  isInSetup: boolean;
  isPaused: boolean;
};

export type AdminTestSmsConfidenceState = 'not_started' | 'pending_delivery' | 'delivered' | 'failed';

export const adminBoardFilterOptions: AdminBoardFilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'pending_setup', label: 'Pending setup' },
  { key: 'in_setup', label: 'In setup' },
  { key: 'needs_attention', label: 'Needs attention' },
  { key: 'pending_a2p', label: 'Pending compliance' },
  { key: 'live', label: 'Live' },
  { key: 'paused', label: 'Paused' },
  { key: 'archived', label: 'Archived' },
];

export function isBusinessArchived(business: Pick<DashboardBusiness, 'archivedAt'>) {
  return Boolean(business.archivedAt);
}

export function isBusinessAutomationPaused(
  business: Pick<DashboardBusiness, 'provisioningStatus' | 'archivedAt'>
) {
  return business.provisioningStatus === BusinessProvisioningStatus.PAUSED || isBusinessArchived(business);
}

export function canDeleteTestBusiness(
  business: Pick<DashboardBusiness, 'isTestBusiness' | 'ownerClerkId' | 'archivedAt'>
) {
  return isBusinessArchived(business) && isTestDemoBusiness(business);
}

export function getDeleteTestBusinessBlockedReason(
  business: Pick<DashboardBusiness, 'isTestBusiness' | 'ownerClerkId' | 'archivedAt'>
) {
  if (!business.isTestBusiness && business.ownerClerkId !== DEMO_OWNER_CLERK_ID) {
    return 'Only demo/test businesses can be deleted. Archive this business instead.';
  }

  if (!isBusinessArchived(business)) {
    return 'Archive this business instead. Permanent delete only unlocks after archive.';
  }

  return null;
}

export function buildAdminBusinessPickerLabel(params: {
  business: Pick<
    DashboardBusiness,
    'id' | 'name' | 'isTestBusiness' | 'archivedAt' | 'twilioPrimaryPhoneNumber' | 'twilioPhoneNumber'
  >;
  notificationSettings: Pick<DashboardNotificationSettings, 'ownerEmail'> | null;
}) {
  const secondaryLabel =
    params.notificationSettings?.ownerEmail?.trim() || getManagedTextingNumber(params.business) || `ID ${params.business.id.slice(-6)}`;
  const stateLabels = [params.business.isTestBusiness ? 'test' : null, isBusinessArchived(params.business) ? 'archived' : null].filter(Boolean);

  return stateLabels.length > 0
    ? `${params.business.name} - ${secondaryLabel} (${stateLabels.join(', ')})`
    : `${params.business.name} - ${secondaryLabel}`;
}

export function getBusinessLifecycleLabel(
  business: Pick<DashboardBusiness, 'archivedAt' | 'provisioningStatus'>
) {
  if (isBusinessArchived(business)) return 'Archived';
  if (business.provisioningStatus === BusinessProvisioningStatus.PAUSED) return 'Paused';
  if (business.provisioningStatus === BusinessProvisioningStatus.LIVE) return 'Live';
  return 'Active';
}

export function getBusinessCommercialPlanLabel(
  business: Pick<DashboardBusiness, 'stripePriceId' | 'subscriptionStatus'>
) {
  if (business.stripePriceId) {
    const compact = business.stripePriceId.replace(/^price_/, '');
    return compact.length > 18 ? `${compact.slice(0, 18)}…` : compact;
  }

  return business.subscriptionStatus.toLowerCase();
}

export function buildAdminNextStep(params: {
  business: DashboardBusiness;
  notificationSettings: DashboardNotificationSettings | null;
  ownerConnected: boolean;
}): AdminNextStep {
  const { business, notificationSettings, ownerConnected } = params;
  const managedSummary = getManagedTwilioStatusSummary(business);
  const ownerEmail = notificationSettings?.ownerEmail?.trim() || null;
  const ownerPhone = notificationSettings?.ownerPhone?.trim() || business.notifyPhone || null;
  const hasTextingNumber = Boolean(getManagedTextingNumber(business) && (business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid));

  if (isBusinessArchived(business)) {
    return {
      title: 'Business archived',
      detail: 'Automation is off and the workspace is hidden from normal triage. Restore it only if this customer should become active again.',
      tone: 'paused',
      actionLabel: 'Restore business',
    };
  }

  if (business.provisioningStatus === BusinessProvisioningStatus.PAUSED) {
    return {
      title: 'Automation is paused',
      detail: 'New missed calls are preserved, but automation should stay off until you resume this business.',
      tone: 'paused',
      actionLabel: 'Resume automation',
    };
  }

  if (business.provisioningError) {
    return {
      title: 'Provisioning needs attention',
      detail: business.provisioningError,
      tone: 'attention',
      actionLabel: 'Fix provisioning',
    };
  }

  if (!ownerEmail && !ownerPhone) {
    return {
      title: 'Owner contact info is missing',
      detail: 'Add the owner email or alert phone so CallbackCloser can route invites and alerts without manual digging.',
      tone: 'attention',
      actionLabel: 'Save owner contact info',
    };
  }

  if (!ownerConnected) {
    return {
      title: business.ownerInviteSentAt ? 'Owner invitation is still pending' : 'Owner account still needs setup',
      detail: ownerEmail
        ? business.ownerInviteSentAt
          ? 'The invite has been sent, but the owner account is not attached yet. CallbackCloser should auto-connect the owner after acceptance, or this panel will expose Connect existing owner as the fallback.'
          : 'The business is saved, but the owner account still needs a deliberate admin action. Use Invite owner by email or Connect existing owner.'
        : 'Add the owner email first, then choose Invite owner by email or Connect existing owner.',
      tone: 'attention',
      actionLabel: 'Invite or connect owner',
    };
  }

  if (!managedSummary.accountReady) {
    return {
      title: business.twilioAccountMode === 'MAIN_ACCOUNT' ? 'Main Twilio account still needs review' : 'Twilio subaccount is missing',
      detail:
        business.twilioAccountMode === 'MAIN_ACCOUNT'
          ? 'This business is set to use the main Twilio account directly. Confirm the parent-account mapping before continuing.'
          : 'Managed provisioning cannot finish until the business has a Twilio subaccount attached.',
      tone: 'attention',
      actionLabel: 'Fix provisioning',
    };
  }

  if (!hasTextingNumber) {
    return {
      title: 'No texting number is assigned',
      detail: 'Provision a new number or attach the approved existing number so missed-call SMS can start.',
      tone: 'attention',
      actionLabel: 'Fix provisioning',
    };
  }

  if (!business.twilioMessagingServiceSid) {
    return {
      title: 'Messaging service is missing',
      detail: 'The business has a number, but Twilio messaging still needs a Messaging Service for compliant delivery.',
      tone: 'attention',
      actionLabel: 'Fix provisioning',
    };
  }

  if (!business.twilioWebhookSyncedAt) {
    return {
      title: 'Webhook sync is missing',
      detail: 'The assigned number still needs the current voice, SMS, and status callback URLs synced from admin.',
      tone: 'attention',
      actionLabel: 'Re-sync webhooks',
    };
  }

  if (managedSummary.complianceTypeUnknown) {
    return {
      title: 'Number type still needs selection',
      detail: 'Messaging is wired up, but the business still needs a number type selected before compliance readiness can be evaluated.',
      tone: 'pending',
      actionLabel: 'Choose number type',
    };
  }

  if (managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION && !managedSummary.complianceStarted) {
    return {
      title: 'Toll-free verification still needs recording',
      detail: 'Messaging is wired up, but toll-free verification still needs to be recorded before compliant live texting can launch.',
      tone: 'pending',
      actionLabel: 'Open toll-free verification',
    };
  }

  if (managedSummary.complianceType === MessagingComplianceType.LOCAL_A2P && business.managedTwilioStatus === ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION) {
    return {
      title: 'Business verification still needed',
      detail: 'Messaging is wired up, but the A2P business details still need to be completed before compliant live texting can launch.',
      tone: 'pending',
      actionLabel: 'Open A2P readiness',
    };
  }

  if (managedSummary.complianceType === MessagingComplianceType.LOCAL_A2P && business.managedTwilioStatus === ManagedTwilioStatus.BRAND_SUBMITTED) {
    return {
      title: 'A2P brand submitted',
      detail: 'Brand review is in progress. No action is needed unless Twilio requests changes.',
      tone: 'pending',
      actionLabel: 'Watch for review updates',
    };
  }

  if (managedSummary.complianceType === MessagingComplianceType.LOCAL_A2P && business.managedTwilioStatus === ManagedTwilioStatus.CAMPAIGN_SUBMITTED) {
    return {
      title: 'A2P campaign still pending',
      detail: 'The campaign is waiting on Twilio or carrier review. No action is needed yet.',
      tone: 'pending',
      actionLabel: 'Wait for approval',
    };
  }

  if (managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION && managedSummary.compliancePendingReview) {
    return {
      title: 'Toll-free verification still pending',
      detail: 'Toll-free verification is waiting on Twilio review. No action is needed unless Twilio requests changes.',
      tone: 'pending',
      actionLabel: 'Wait for verification',
    };
  }

  if (managedSummary.attentionRequired) {
    return {
      title: 'Compliance review needs attention',
      detail: business.a2pFailureReason || business.tollFreeVerificationNote || managedSummary.nextStep,
      tone: 'attention',
      actionLabel: managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION ? 'Open toll-free verification' : 'Fix compliance',
    };
  }

  if (managedSummary.messagingReady && business.provisioningStatus !== BusinessProvisioningStatus.LIVE) {
    return {
      title: 'Ready to go live',
      detail: 'Infrastructure and compliance look ready. Mark the business live when you want automation active.',
      tone: 'pending',
      actionLabel: 'Mark business live',
    };
  }

  if (managedSummary.messagingReady && business.provisioningStatus === BusinessProvisioningStatus.LIVE) {
    return {
      title: 'Business is live',
      detail: 'Core Twilio, webhook, alert, and rollout setup is active. Use the proof and issue signals to decide whether any follow-up is still needed.',
      tone: 'healthy',
      actionLabel: 'No action needed',
    };
  }

  return {
    title: 'Finish onboarding',
    detail: managedSummary.nextStep,
    tone: 'pending',
    actionLabel: 'Review provisioning health',
  };
}

function milestoneVariant(params: { complete: boolean; blocking?: boolean }) {
  if (params.complete) return 'success' as const;
  if (params.blocking) return 'warning' as const;
  return 'pending' as const;
}

export function getAdminTestSmsConfidenceState(
  operatorEvents: Array<{ type: string; status: OperatorEventStatus; createdAt: Date }>
): AdminTestSmsConfidenceState {
  const latest = operatorEvents
    .filter((event) => event.type.startsWith('admin.test_sms_'))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

  if (!latest) {
    return 'not_started';
  }

  if (latest.type === 'admin.test_sms_delivered') {
    return 'delivered';
  }

  if (
    latest.type === 'admin.test_sms_failed' ||
    latest.type === 'admin.test_sms_suppressed' ||
    latest.type === 'admin.test_sms_delivery_failed'
  ) {
    return 'failed';
  }

  return 'pending_delivery';
}

export function buildAdminOnboardingConfidence(params: {
  business: DashboardBusiness;
  notificationSettings: DashboardNotificationSettings | null;
  ownerConnected: boolean;
  successfulLeadCount: number;
  operatorEvents: Array<{ type: string; status: OperatorEventStatus; createdAt: Date }>;
  webhookSnapshot?: TwilioWebhookSnapshot | null;
  missedCallValidation?: Pick<AdminMissedCallValidationTruth, 'countsAsLaunchProof' | 'detail'> | null;
}) {
  const { business, notificationSettings, ownerConnected, successfulLeadCount, operatorEvents, webhookSnapshot, missedCallValidation } = params;
  const managedSummary = getManagedTwilioStatusSummary(business);
  const nextStep = buildAdminNextStep({ business, notificationSettings, ownerConnected });
  const ownerEmail = notificationSettings?.ownerEmail?.trim() || null;
  const ownerPhone = notificationSettings?.ownerPhone?.trim() || business.notifyPhone || null;
  const phoneSetupGate = getBusinessPhoneSetupGate(business);
  const publicBusinessPhone = getPublicBusinessPhone(business);
  const hasProfile = Boolean(
    business.name.trim() &&
      business.forwardingNumber.trim() &&
      (publicBusinessPhone || phoneSetupGate.path === 'NEW_TWILIO_NUMBER')
  );
  const ownerAlertsReady = Boolean(ownerPhone || ownerEmail);
  const twilioSetupReady = managedSummary.accountReady;
  const numberReady = Boolean(getManagedTextingNumber(business) && (business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid));
  const messagingServiceReady = Boolean(business.twilioMessagingServiceSid);
  const webhooksReady =
    webhookSnapshot && !webhookSnapshot.error
      ? webhookSnapshot.voiceSynced && webhookSnapshot.smsSynced && webhookSnapshot.statusSynced
      : Boolean(business.twilioWebhookSyncedAt);
  const compliancePending = managedSummary.onboardingReady && managedSummary.compliancePendingReview;
  const latestTestSmsState = getAdminTestSmsConfidenceState(operatorEvents);
  const hasTestSmsSuccess = latestTestSmsState === 'delivered';
  const hasPendingTestSmsDelivery = latestTestSmsState === 'pending_delivery';
  const hasTestSmsFailure = latestTestSmsState === 'failed';
  const hasRecentFailures = operatorEvents.some(
    (event) => event.status === OperatorEventStatus.FAILED || event.status === OperatorEventStatus.WARNING
  );
  const missedCallValidated = missedCallValidation?.countsAsLaunchProof ?? successfulLeadCount > 0;
  const readyForTest =
    ownerConnected &&
    ownerAlertsReady &&
    twilioSetupReady &&
    numberReady &&
    phoneSetupGate.complete &&
    messagingServiceReady &&
    webhooksReady &&
    managedSummary.complianceReady;
  const readyForLive = readyForTest && hasTestSmsSuccess && missedCallValidated;
  const canSafelyMarkLive = readyForLive;

  const blockers: AdminOnboardingConfidence['blockers'] = [];
  if (nextStep.tone === 'attention') {
    blockers.push({ level: 'error', message: nextStep.detail });
  }
  if (managedSummary.attentionRequired && (business.a2pFailureReason || business.tollFreeVerificationNote)) {
    blockers.push({ level: 'error', message: business.a2pFailureReason || business.tollFreeVerificationNote || managedSummary.nextStep });
  }
  if (compliancePending) {
    blockers.push({
      level: 'warning',
      message:
        managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? 'Toll-free verification is still pending. No operator action is needed unless Twilio asks for changes.'
          : 'A2P review is still pending. No operator action is needed unless Twilio asks for changes.',
    });
  }
  if (readyForTest && latestTestSmsState === 'not_started') {
    blockers.push({ level: 'warning', message: 'Run an admin test SMS from the business line before treating this onboarding as launch-ready.' });
  }
  if (readyForTest && hasPendingTestSmsDelivery) {
    blockers.push({
      level: 'warning',
      message: 'The latest admin test SMS was accepted by Twilio, but delivery has not been confirmed yet. Wait for delivery or inspect recent activity before you go live.',
    });
  }
  if (readyForTest && hasTestSmsFailure) {
    blockers.push({ level: 'error', message: 'The latest admin test SMS did not complete cleanly. Fix that before you go live.' });
  }
  if (readyForTest && !missedCallValidated) {
    blockers.push({
      level: 'warning',
      message:
        missedCallValidation?.detail ||
        'Run one real missed-call test and confirm the lead reaches the owner before marking this business live.',
    });
  }

  const hasActiveGoLiveWarnings = blockers.length > 0;

  let state: OnboardingConfidenceState = 'in_setup';
  if (isBusinessArchived(business)) {
    state = 'archived';
  } else if (business.provisioningStatus === BusinessProvisioningStatus.LIVE && hasActiveGoLiveWarnings) {
    state = 'live_with_warnings';
  } else if (business.provisioningStatus === BusinessProvisioningStatus.LIVE && !hasActiveGoLiveWarnings) {
    state = 'live';
  } else if (
    nextStep.tone === 'attention' ||
    managedSummary.attentionRequired ||
    business.provisioningStatus === BusinessProvisioningStatus.NEEDS_ATTENTION ||
    hasTestSmsFailure
  ) {
    state = 'needs_attention';
  } else if (compliancePending) {
    state = 'waiting_on_a2p';
  } else if (readyForLive) {
    state = 'ready_to_go_live';
  } else if (readyForTest) {
    state = 'ready_for_test';
  } else if (!twilioSetupReady && !numberReady && !messagingServiceReady && !webhooksReady && !ownerConnected) {
    state = 'draft';
  }

  const milestones: OnboardingConfidenceMilestone[] = [
    {
      key: 'business_profile',
      label: 'Business info complete',
      complete: hasProfile,
      variant: milestoneVariant({ complete: hasProfile, blocking: true }),
      detail: hasProfile
        ? 'Business name, public number, and owner answer number are saved.'
        : 'Add the business name, public business number, and owner answer number first.',
    },
    {
      key: 'owner_connected',
      label: 'Owner connected',
      complete: ownerConnected,
      variant: milestoneVariant({ complete: ownerConnected, blocking: true }),
      detail: ownerConnected
        ? 'A CallbackCloser owner account is linked to this business.'
        : ownerEmail
          ? business.ownerInviteSentAt
            ? 'The owner invite is still pending, or CallbackCloser still needs a safe owner-link confirmation.'
            : 'Choose Invite owner by email or Connect existing owner.'
          : 'Add the owner email and then choose the correct owner setup action.',
    },
    {
      key: 'owner_alerts',
      label: 'Owner alert route',
      complete: ownerAlertsReady,
      variant: milestoneVariant({ complete: ownerAlertsReady, blocking: true }),
      detail: ownerAlertsReady ? 'Owner phone or email is saved for alerts.' : 'Save an owner phone or email before you rely on alerts.',
    },
    {
      key: 'twilio_setup',
      label: 'Twilio subaccount ready',
      complete: twilioSetupReady,
      variant: milestoneVariant({ complete: twilioSetupReady, blocking: true }),
      detail: twilioSetupReady ? 'Managed Twilio subaccount is attached.' : 'Provisioning still needs to create or reconnect the subaccount.',
    },
    {
      key: 'texting_number',
      label: 'Number assigned',
      complete: numberReady,
      variant: milestoneVariant({ complete: numberReady, blocking: true }),
      detail: numberReady ? 'The CallbackCloser routing number is attached.' : 'Assign the CallbackCloser routing number.',
    },
    {
      key: 'business_number_path',
      label:
        phoneSetupGate.path === 'CURRENT_NUMBER_FORWARDING'
          ? 'Forwarding verified'
          : phoneSetupGate.path === 'PORT_EXISTING_NUMBER'
            ? 'Porting completed'
            : 'Business number connected',
      complete: phoneSetupGate.complete,
      variant: milestoneVariant({ complete: phoneSetupGate.complete, blocking: true }),
      detail: phoneSetupGate.detail,
    },
    {
      key: 'messaging_service',
      label: 'Messaging Service ready',
      complete: messagingServiceReady,
      variant: milestoneVariant({ complete: messagingServiceReady, blocking: true }),
      detail: messagingServiceReady ? 'Twilio Messaging Service is attached.' : 'Provisioning still needs to create or repair the Messaging Service.',
    },
    {
      key: 'webhooks',
      label: 'Webhooks synced',
      complete: webhooksReady,
      variant: milestoneVariant({ complete: webhooksReady, blocking: true }),
      detail: webhooksReady ? 'Voice, SMS, and status callbacks have been synced.' : 'Run Re-sync webhooks before testing.',
    },
    {
      key: 'a2p',
      label: 'Messaging compliance acknowledged',
      complete: managedSummary.complianceReady,
      variant: milestoneVariant({ complete: managedSummary.complianceReady, blocking: managedSummary.attentionRequired }),
      detail: managedSummary.complianceReady
        ? managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? 'Toll-free verification is recorded as verified.'
          : 'A2P approval is recorded.'
        : managedSummary.nextStep,
    },
    {
      key: 'test_sms',
      label: 'Test SMS passed',
      complete: hasTestSmsSuccess,
      variant: milestoneVariant({ complete: hasTestSmsSuccess, blocking: readyForTest }),
      detail: hasTestSmsSuccess
        ? 'The latest admin test SMS was delivered from the business line.'
        : hasPendingTestSmsDelivery
          ? 'The latest admin test SMS was accepted by Twilio, but delivery is still pending confirmation.'
          : hasTestSmsFailure
            ? 'The latest admin test SMS failed or was suppressed. Fix messaging before you go live.'
            : 'Run the admin test SMS once the business is ready for messaging.',
    },
    {
      key: 'missed_call_validation',
      label: 'Missed-call flow validated',
      complete: missedCallValidated,
      variant: milestoneVariant({ complete: missedCallValidated, blocking: readyForTest }),
      detail:
        missedCallValidation?.detail ||
        (missedCallValidated
          ? 'At least one missed-call lead reached the owner flow for this business.'
          : 'Run one real missed-call test from start to finish before going live.'),
    },
    {
      key: 'live_gate',
      label: 'Safe to mark live',
      complete: canSafelyMarkLive,
      variant: milestoneVariant({ complete: canSafelyMarkLive, blocking: business.provisioningStatus === BusinessProvisioningStatus.LIVE || readyForTest }),
      detail: canSafelyMarkLive
        ? 'This business has passed the key operator checks for launch.'
        : 'Keep the business in onboarding until the phone path, test SMS, and a real missed-call validation are complete.',
    },
  ];

  const stateMeta: Record<OnboardingConfidenceState, Pick<AdminOnboardingConfidence, 'stateLabel' | 'stateVariant' | 'readinessLabel' | 'readinessVariant' | 'nextAction' | 'summary'>> = {
    draft: {
      stateLabel: 'Draft',
      stateVariant: 'outline',
      readinessLabel: 'Not ready',
      readinessVariant: 'outline',
      nextAction: nextStep.actionLabel,
      summary: 'Core onboarding details are still missing. Start with owner connection and Twilio setup.',
    },
    in_setup: {
      stateLabel: 'In setup',
      stateVariant: 'secondary',
      readinessLabel: 'Not ready',
      readinessVariant: 'outline',
      nextAction: nextStep.actionLabel,
      summary: 'Onboarding is in progress, but at least one blocking setup step still needs attention.',
    },
    needs_attention: {
      stateLabel: 'Needs attention',
      stateVariant: 'destructive',
      readinessLabel: 'Not ready',
      readinessVariant: 'destructive',
      nextAction: nextStep.actionLabel,
      summary: 'Something is broken or incomplete enough that the founder should stop and repair it before testing.',
    },
    waiting_on_a2p: {
      stateLabel: 'Waiting on compliance',
      stateVariant: 'secondary',
      readinessLabel: 'Waiting on external approval',
      readinessVariant: 'secondary',
      nextAction: managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION ? 'Wait for toll-free verification' : 'Wait for Twilio approval',
      summary:
        managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? 'Infrastructure is in place, but compliant messaging is still waiting on toll-free verification.'
          : 'Infrastructure is in place, but compliant messaging is still waiting on Twilio or carrier review.',
    },
    ready_for_test: {
      stateLabel: 'Ready for test',
      stateVariant: 'secondary',
      readinessLabel: 'Ready for test',
      readinessVariant: 'secondary',
      nextAction: hasTestSmsSuccess
        ? 'Run a real missed-call test'
        : hasPendingTestSmsDelivery
          ? 'Send test SMS'
          : 'Send a test SMS',
      summary: 'The business looks ready for operator-led validation. Run the checks before you mark it live.',
    },
    ready_to_go_live: {
      stateLabel: 'Ready to go live',
      stateVariant: 'success',
      readinessLabel: 'Ready for live',
      readinessVariant: 'success',
      nextAction: 'Mark business live',
      summary: 'Setup, compliance, and operator validation checks are in place for a clean launch decision.',
    },
    live: {
      stateLabel: 'Live',
      stateVariant: 'success',
      readinessLabel: 'Ready for live',
      readinessVariant: 'success',
      nextAction: 'No action needed',
      summary: 'This business is live and the operator confidence checks are green.',
    },
    live_with_warnings: {
      stateLabel: 'Live with warnings',
      stateVariant: 'destructive',
      readinessLabel: 'Live with warnings',
      readinessVariant: 'destructive',
      nextAction: nextStep.actionLabel,
      summary: 'The business is live, but recent failures or missing validations mean the founder should review it closely.',
    },
    archived: {
      stateLabel: 'Archived',
      stateVariant: 'outline',
      readinessLabel: 'Not ready',
      readinessVariant: 'outline',
      nextAction: 'Restore business if work should resume',
      summary: 'Automation is paused because this business is archived.',
    },
  };

  return {
    state,
    ...stateMeta[state],
    blockers,
    milestones,
    readyForTest,
    readyForLive,
    canSafelyMarkLive,
    hasRecentFailures,
  } satisfies AdminOnboardingConfidence;
}

function buildSecondaryBadge(
  key: string,
  label: string,
  variant: AdminBusinessCardBadge['variant']
) {
  return { key, label, variant } satisfies AdminBusinessCardBadge;
}

function dedupeAdminBusinessCardBadges(badges: AdminBusinessCardBadge[], limit = 3) {
  const seen = new Set<string>();
  const deduped: AdminBusinessCardBadge[] = [];

  for (const badge of badges) {
    const signature = `${badge.key}:${badge.label}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(badge);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

function getTestSmsBadge(testSmsTruth: AdminTestSmsTruth) {
  if (testSmsTruth.state === 'delivered') {
    return buildSecondaryBadge('test_sms', 'Test SMS Delivered', 'success');
  }

  if (testSmsTruth.state === 'failed') {
    return buildSecondaryBadge('test_sms', 'Test SMS Failed', 'destructive');
  }

  if (testSmsTruth.state === 'pending') {
    return buildSecondaryBadge('test_sms', 'Test SMS Pending', 'outline');
  }

  return buildSecondaryBadge('test_sms', 'Test SMS Not Run', 'outline');
}

function getComplianceBadge(params: {
  managedSummary: ManagedTwilioSummary;
  business: Pick<DashboardBusiness, 'managedTwilioStatus'>;
}) {
  if (params.managedSummary.complianceTypeUnknown) {
    return buildSecondaryBadge('compliance', 'Compliance Not Selected', 'outline');
  }

  if (params.managedSummary.attentionRequired) {
    return buildSecondaryBadge('compliance', 'Compliance Needs Attention', 'destructive');
  }

  if (
    params.managedSummary.compliancePendingReview ||
    (params.managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION && !params.managedSummary.complianceStarted) ||
    (params.managedSummary.complianceType === MessagingComplianceType.LOCAL_A2P &&
      params.business.managedTwilioStatus === ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION)
  ) {
    return buildSecondaryBadge('compliance', 'Compliance Pending', 'outline');
  }

  return null;
}

function getProvisioningRepairStepKey(
  business: DashboardBusiness,
  managedSummary: ManagedTwilioSummary
): TwilioSetupStepKey {
  if (!managedSummary.accountReady) return 'account_ready';
  if (!getManagedTextingNumber(business) || !(business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid)) return 'number_assigned';
  if (!business.twilioMessagingServiceSid) return 'messaging_service_ready';
  if (!business.twilioWebhookSyncedAt) return 'voice_webhook_synced';
  return 'account_ready';
}

function getAttentionReasonAndStep(params: {
  business: DashboardBusiness;
  managedSummary: ManagedTwilioSummary;
  nextStep: AdminNextStep;
  onboardingConfidence: AdminOnboardingConfidence;
  lastIssue: AdminBusinessIssue;
  testSmsTruth: AdminTestSmsTruth;
  missedCallValidation: AdminMissedCallValidationTruth;
}) {
  const { business, managedSummary, nextStep, onboardingConfidence, lastIssue, testSmsTruth, missedCallValidation } = params;
  const hasAssignedNumber = Boolean(getManagedTextingNumber(business) && (business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid));

  if (lastIssue.eventType === 'webhooks.sync_failed' || (hasAssignedNumber && !business.twilioWebhookSyncedAt)) {
    return {
      primaryState: 'needs_attention' as const,
      primaryLabel: 'Needs attention',
      primaryVariant: 'destructive' as const,
      primaryReason: 'Twilio webhooks are not synced to the current CallbackCloser URLs.',
      nextActionLabel: 'Re-sync webhooks',
      nextActionStepKey: 'voice_webhook_synced' as const,
    };
  }

  if (testSmsTruth.state === 'failed') {
    return {
      primaryState: 'needs_attention' as const,
      primaryLabel: 'Needs attention',
      primaryVariant: 'destructive' as const,
      primaryReason: 'The latest test SMS did not complete cleanly.',
      nextActionLabel: 'Send test SMS',
      nextActionStepKey: 'test_sms_delivered' as const,
    };
  }

  if (onboardingConfidence.readyForTest && testSmsTruth.state !== 'delivered') {
    return {
      primaryState: 'ready_for_test' as const,
      primaryLabel: 'Ready for test',
      primaryVariant: 'secondary' as const,
      primaryReason:
        testSmsTruth.state === 'pending'
          ? 'The latest test SMS is still waiting on delivery confirmation.'
          : 'A delivered test SMS is still missing.',
      nextActionLabel: 'Send test SMS',
      nextActionStepKey: 'test_sms_delivered' as const,
    };
  }

  if (onboardingConfidence.readyForTest && !missedCallValidation.countsAsLaunchProof) {
    return {
      primaryState: 'ready_for_test' as const,
      primaryLabel: 'Ready for test',
      primaryVariant: 'secondary' as const,
      primaryReason: 'The missed-call flow has not been fully validated yet.',
      nextActionLabel: 'Validate missed-call flow',
      nextActionStepKey: 'missed_call_validated' as const,
    };
  }

  return {
    primaryState: nextStep.tone === 'attention' ? ('needs_attention' as const) : ('in_setup' as const),
    primaryLabel: nextStep.tone === 'attention' ? 'Needs attention' : 'In setup',
    primaryVariant: nextStep.tone === 'attention' ? ('destructive' as const) : ('secondary' as const),
    primaryReason: nextStep.detail,
    nextActionLabel: nextStep.actionLabel || 'Open blocker step',
    nextActionStepKey: lastIssue.remediationStepKey,
  };
}

export function buildAdminBusinessCardState(params: {
  business: DashboardBusiness;
  notificationSettings: DashboardNotificationSettings | null;
  ownerConnected: boolean;
  nextStep: AdminNextStep;
  managedSummary: ManagedTwilioSummary;
  onboardingConfidence: AdminOnboardingConfidence;
  lastIssue: AdminBusinessIssue;
  testSmsTruth: AdminTestSmsTruth;
  missedCallValidation: AdminMissedCallValidationTruth;
}) {
  const { business, notificationSettings, ownerConnected, nextStep, managedSummary, onboardingConfidence, lastIssue, testSmsTruth, missedCallValidation } =
    params;
  const archived = isBusinessArchived(business);
  const paused = !archived && business.provisioningStatus === BusinessProvisioningStatus.PAUSED;
  const ownerEmail = notificationSettings?.ownerEmail?.trim() || null;
  const ownerPhone = notificationSettings?.ownerPhone?.trim() || business.notifyPhone || null;
  const missingOwnerContact = !ownerEmail && !ownerPhone;
  const needsOwnerConnection = !ownerConnected;
  const complianceNeedsOperatorAction =
    managedSummary.attentionRequired ||
    managedSummary.complianceTypeUnknown ||
    (managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION && !managedSummary.complianceStarted) ||
    (managedSummary.complianceType === MessagingComplianceType.LOCAL_A2P &&
      business.managedTwilioStatus === ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION);
  const compliancePendingReview = managedSummary.compliancePendingReview;

  let state: Pick<
    AdminBusinessCardState,
    'primaryState' | 'primaryLabel' | 'primaryVariant' | 'primaryReason' | 'nextActionLabel' | 'nextActionStepKey'
  >;

  if (archived) {
    state = {
      primaryState: 'archived',
      primaryLabel: 'Archived',
      primaryVariant: 'outline',
      primaryReason: 'Automation is paused because this business is archived.',
      nextActionLabel: 'Restore business',
      nextActionStepKey: null,
    };
  } else if (paused) {
    state = {
      primaryState: 'paused',
      primaryLabel: 'Paused',
      primaryVariant: 'outline',
      primaryReason: 'Automation is paused until you intentionally resume this business.',
      nextActionLabel: 'Resume automation',
      nextActionStepKey: 'safe_to_mark_live',
    };
  } else if (business.provisioningError || business.provisioningStatus === BusinessProvisioningStatus.NEEDS_ATTENTION) {
    state = {
      primaryState: 'provisioning_failed',
      primaryLabel: 'Provisioning failed',
      primaryVariant: 'destructive',
      primaryReason: business.provisioningError || 'The latest provisioning run needs operator repair before this business can move forward.',
      nextActionLabel: 'Fix provisioning',
      nextActionStepKey: getProvisioningRepairStepKey(business, managedSummary),
    };
  } else if (missingOwnerContact) {
    state = {
      primaryState: 'owner_blocked',
      primaryLabel: 'Owner blocked',
      primaryVariant: 'destructive',
      primaryReason: 'Owner contact information is missing, so invites and alerts cannot be trusted yet.',
      nextActionLabel: 'Save owner contact info',
      nextActionStepKey: 'owner_connected',
    };
  } else if (needsOwnerConnection) {
    state = {
      primaryState: 'owner_blocked',
      primaryLabel: 'Owner blocked',
      primaryVariant: 'destructive',
      primaryReason: business.ownerInviteSentAt
        ? 'The owner account is still not connected even though an invite was already sent.'
        : 'The owner account still needs to be connected before this business can be trusted.',
      nextActionLabel: 'Invite or connect owner',
      nextActionStepKey: 'owner_connected',
    };
  } else if (business.provisioningStatus === BusinessProvisioningStatus.LIVE && onboardingConfidence.blockers.length > 0) {
    state = testSmsTruth.state !== 'delivered'
      ? {
          primaryState: 'live_with_warnings',
          primaryLabel: 'Live with warnings',
          primaryVariant: 'destructive',
          primaryReason:
            testSmsTruth.state === 'pending'
              ? 'The latest test SMS is still waiting on delivery confirmation.'
              : 'The latest test SMS is not fully proven.',
          nextActionLabel: 'Send test SMS',
          nextActionStepKey: 'test_sms_delivered',
        }
      : !missedCallValidation.countsAsLaunchProof
        ? {
            primaryState: 'live_with_warnings',
            primaryLabel: 'Live with warnings',
            primaryVariant: 'destructive',
            primaryReason: 'Missed-call flow has not been fully validated.',
            nextActionLabel: 'Validate missed-call flow',
            nextActionStepKey: 'missed_call_validated',
          }
        : {
            primaryState: 'live_with_warnings',
            primaryLabel: 'Live with warnings',
            primaryVariant: 'destructive',
            primaryReason: onboardingConfidence.blockers[0]?.message || 'This live business still has unresolved operator warnings.',
            nextActionLabel: nextStep.actionLabel || 'Open blocker step',
            nextActionStepKey: lastIssue.remediationStepKey,
          };
  } else if (business.provisioningStatus === BusinessProvisioningStatus.LIVE) {
    state = {
      primaryState: 'live',
      primaryLabel: 'Live',
      primaryVariant: 'success',
      primaryReason: 'No active warnings are recorded for this live business.',
      nextActionLabel: 'No action needed',
      nextActionStepKey: null,
    };
  } else if (complianceNeedsOperatorAction || compliancePendingReview) {
    state = {
      primaryState: 'compliance_pending',
      primaryLabel: managedSummary.attentionRequired ? 'Compliance blocked' : 'Pending compliance',
      primaryVariant: managedSummary.attentionRequired ? 'destructive' : 'outline',
      primaryReason: managedSummary.attentionRequired
        ? business.a2pFailureReason || business.tollFreeVerificationNote || managedSummary.nextStep
        : managedSummary.complianceTypeUnknown
          ? 'Messaging compliance type has not been selected yet.'
          : managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION && !managedSummary.complianceStarted
            ? 'Toll-free verification has not been recorded yet.'
            : managedSummary.nextStep,
      nextActionLabel: managedSummary.complianceTypeUnknown
        ? 'Choose number type'
        : managedSummary.complianceType === MessagingComplianceType.TOLL_FREE_VERIFICATION
          ? 'Open toll-free verification'
          : managedSummary.attentionRequired
            ? 'Fix compliance'
            : 'Wait for approval',
      nextActionStepKey: 'a2p_status_recorded',
    };
  } else if (onboardingConfidence.readyForLive) {
    state = {
      primaryState: 'ready_for_live',
      primaryLabel: 'Ready for live',
      primaryVariant: 'success',
      primaryReason: 'Launch proof is in place and automation can go live safely.',
      nextActionLabel: 'Mark business live',
      nextActionStepKey: 'safe_to_mark_live',
    };
  } else if (onboardingConfidence.readyForTest) {
    state = getAttentionReasonAndStep({
      business,
      managedSummary,
      nextStep,
      onboardingConfidence,
      lastIssue,
      testSmsTruth,
      missedCallValidation,
    });
  } else if (onboardingConfidence.state === 'draft') {
    state = {
      primaryState: 'draft',
      primaryLabel: 'Draft',
      primaryVariant: 'outline',
      primaryReason: onboardingConfidence.summary,
      nextActionLabel: nextStep.actionLabel,
      nextActionStepKey: lastIssue.remediationStepKey,
    };
  } else {
    state = getAttentionReasonAndStep({
      business,
      managedSummary,
      nextStep,
      onboardingConfidence,
      lastIssue,
      testSmsTruth,
      missedCallValidation,
    });
  }

  const badges: AdminBusinessCardBadge[] = [];
  badges.push(buildSecondaryBadge('customer_type', business.isTestBusiness ? 'Test' : 'Real customer', 'outline'));

  if (!archived) {
    if (
      state.primaryState === 'ready_for_test' ||
      state.primaryState === 'ready_for_live' ||
      state.primaryState === 'live_with_warnings' ||
      state.primaryState === 'live' ||
      state.primaryState === 'needs_attention'
    ) {
      badges.push(getTestSmsBadge(testSmsTruth));
    }

    const complianceBadge = getComplianceBadge({ managedSummary, business });
    if (complianceBadge) {
      badges.push(complianceBadge);
    }

    if (
      !missedCallValidation.countsAsLaunchProof &&
      (state.primaryState === 'ready_for_test' ||
        state.primaryState === 'ready_for_live' ||
        state.primaryState === 'live_with_warnings' ||
        state.primaryState === 'live')
    ) {
      badges.push(buildSecondaryBadge('missed_call_proof', 'Missed-call proof missing', 'outline'));
    }
  }

  return {
    ...state,
    badges: dedupeAdminBusinessCardBadges(badges),
    shouldAppearInNeedsAttention:
      !archived &&
      (state.primaryState === 'provisioning_failed' ||
        state.primaryState === 'owner_blocked' ||
        state.primaryState === 'needs_attention' ||
        state.primaryState === 'live_with_warnings'),
    shouldAppearInPendingCompliance: !archived && state.primaryState === 'compliance_pending',
    isArchived: archived,
    isLive: state.primaryState === 'live',
    isLiveWithWarnings: state.primaryState === 'live_with_warnings',
    isReadyForTest: state.primaryState === 'ready_for_test',
    isReadyForLive: state.primaryState === 'ready_for_live',
    isDraft: state.primaryState === 'draft',
    isInSetup:
      state.primaryState === 'draft' ||
      state.primaryState === 'in_setup' ||
      state.primaryState === 'ready_for_test' ||
      state.primaryState === 'ready_for_live',
    isPaused: state.primaryState === 'paused',
  } satisfies AdminBusinessCardState;
}

export function matchesAdminBoardFilterState(state: AdminBusinessCardState, filter: AdminBoardFilter) {
  if (filter === 'all') return true;
  if (filter === 'archived') return state.isArchived;
  if (state.isArchived) return false;

  if (filter === 'paused') return state.isPaused;
  if (filter === 'live') return state.isLive;
  if (filter === 'pending_a2p') return state.shouldAppearInPendingCompliance;
  if (filter === 'pending_setup') return state.isDraft;
  if (filter === 'in_setup') return state.isInSetup;
  if (filter === 'needs_attention') return state.shouldAppearInNeedsAttention;

  return true;
}

export function matchesAdminBoardFilter(
  business: DashboardBusiness,
  notificationSettings: DashboardNotificationSettings | null,
  ownerConnected: boolean,
  filter: AdminBoardFilter
) {
  const managedSummary = getManagedTwilioStatusSummary(business);
  const nextStep = buildAdminNextStep({ business, notificationSettings, ownerConnected });
  const onboardingConfidence = buildAdminOnboardingConfidence({
    business,
    notificationSettings,
    ownerConnected,
    successfulLeadCount: 0,
    operatorEvents: [],
  });
  const state = buildAdminBusinessCardState({
    business,
    notificationSettings,
    ownerConnected,
    nextStep,
    managedSummary,
    onboardingConfidence,
    lastIssue: {
      state: 'healthy',
      tone: 'neutral',
      summary: 'No open issues recorded',
      detail: 'Recent business events do not show an unresolved failure or blocker right now.',
      createdAt: null,
      categoryLabel: null,
      statusLabel: null,
      eventType: null,
      remediationStepKey: null,
    },
    testSmsTruth: {
      state: 'not_run',
      label: 'Not run',
      tone: 'neutral',
      summary: 'No admin test SMS recorded',
      detail: 'Run a test SMS from this page before treating delivery as proven.',
      reason: null,
      lastAttemptAt: null,
      eventType: null,
    },
    missedCallValidation: {
      state: 'not_run',
      label: 'Not run',
      tone: 'neutral',
      summary: 'Missed-call flow not validated yet',
      detail: 'Run one real missed call from start to finish, or record a manual confirmation note if you validated it outside this console.',
      verifiedAt: null,
      sourceLabel: null,
      evidenceSummary: null,
      relatedLeadId: null,
      latestRelatedEventAt: null,
      countsAsLaunchProof: false,
    },
  });

  return matchesAdminBoardFilterState(state, filter);
}

function compactBody(value: string, maxLength = 120) {
  const trimmed = value.trim();
  if (!trimmed) return 'No extra detail recorded.';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function buildAdminBusinessEvents(params: {
  business: DashboardBusiness;
  messages: EventMessage[];
  ownerNotifications: EventOwnerNotification[];
  leads: EventLead[];
  calls: EventCall[];
}) {
  const events: AdminBusinessEvent[] = [];

  if (params.business.provisioningLastRunAt) {
    events.push({
      id: 'provisioning-run',
      at: params.business.provisioningLastRunAt,
      severity: params.business.provisioningError ? 'error' : 'info',
      label: 'Provisioning',
      summary: params.business.provisioningError ? 'Latest provisioning run failed' : 'Latest provisioning run completed',
      detail: params.business.provisioningError || 'The most recent admin provisioning run completed without a stored error.',
    });
  }

  if (getManagedTextingNumber(params.business) && !params.business.twilioWebhookSyncedAt) {
    events.push({
      id: 'webhook-sync-missing',
      at: params.business.updatedAt,
      severity: 'warning',
      label: 'Webhook sync',
      summary: 'Assigned number still needs webhook sync',
      detail: 'The business has a number assigned, but admin has not recorded a webhook sync yet.',
    });
  }

  for (const notification of params.ownerNotifications) {
    const severity =
      notification.status === OwnerNotificationStatus.FAILED
        ? 'error'
        : notification.status === OwnerNotificationStatus.SKIPPED
          ? 'warning'
          : 'info';
    events.push({
      id: `notification-${notification.id}`,
      at: notification.createdAt,
      severity,
      label: `Owner ${notification.channel.toLowerCase()} alert`,
      summary:
        notification.status === OwnerNotificationStatus.FAILED
          ? 'Owner alert failed'
          : notification.status === OwnerNotificationStatus.SKIPPED
            ? 'Owner alert skipped'
            : 'Owner alert sent',
      detail: notification.error || notification.destination || 'Owner notification recorded.',
    });
  }

  for (const message of params.messages) {
    const issue = isMessageDeliveryIssueStatus(message.status);
    events.push({
      id: `message-${message.id}`,
      at: message.createdAt,
      severity: issue ? 'error' : 'info',
      label: message.participant === 'OWNER' ? 'Owner SMS' : 'Lead SMS',
      summary: `${message.direction === 'OUTBOUND' ? 'Outbound' : 'Inbound'} message${message.status ? ` · ${formatMessageStatus(message.status)}` : ''}`,
      detail: compactBody(message.body),
    });
  }

  for (const lead of params.leads) {
    events.push({
      id: `lead-${lead.id}`,
      at: lead.lastInteractionAt || lead.createdAt,
      severity: lead.billingRequired ? 'warning' : 'info',
      label: 'Lead activity',
      summary: `${lead.status.toLowerCase()} lead · ${lead.readiness.toLowerCase()}`,
      detail: lead.summary || `SMS state: ${lead.smsState.toLowerCase().replace(/_/g, ' ')}.`,
    });
  }

  for (const call of params.calls) {
    events.push({
      id: `call-${call.id}`,
      at: call.createdAt,
      severity: call.missed ? 'warning' : 'info',
      label: 'Call event',
      summary: call.missed ? 'Missed call captured' : call.answered ? 'Answered call recorded' : 'Call status recorded',
      detail: call.dialCallStatus || call.status,
    });
  }

  return events.sort((left, right) => right.at.getTime() - left.at.getTime());
}
