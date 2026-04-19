import {
  BusinessProvisioningStatus,
  ManagedTwilioStatus,
  OperatorEventStatus,
  OwnerNotificationStatus,
  type Business,
  type BusinessNotificationSettings,
  type Call,
  type Lead,
  type Message,
  type OwnerNotification,
} from '@prisma/client';

import { getManagedTextingNumber, getManagedTwilioStatusSummary } from '@/lib/managed-twilio-status';
import { formatMessageStatus, isMessageDeliveryIssueStatus } from '@/lib/lead-presenters';

type DashboardBusiness = Pick<
  Business,
  | 'id'
  | 'name'
  | 'ownerClerkId'
  | 'ownerName'
  | 'isTestBusiness'
  | 'archivedAt'
  | 'provisioningStatus'
  | 'provisioningError'
  | 'provisioningLastRunAt'
  | 'forwardingNumber'
  | 'notifyPhone'
  | 'twilioSubaccountSid'
  | 'twilioMessagingServiceSid'
  | 'twilioPrimaryNumberSid'
  | 'twilioPhoneNumberSid'
  | 'twilioPrimaryPhoneNumber'
  | 'twilioPhoneNumber'
  | 'twilioWebhookSyncedAt'
  | 'managedTwilioStatus'
  | 'a2pCustomerProfileSid'
  | 'a2pBrandSid'
  | 'a2pCampaignSid'
  | 'a2pFailureReason'
  | 'a2pApprovedAt'
  | 'subscriptionStatus'
  | 'stripePriceId'
  | 'updatedAt'
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
  | 'needs_attention'
  | 'pending_a2p'
  | 'not_fully_provisioned'
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

export const adminBoardFilterOptions: AdminBoardFilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_attention', label: 'Needs attention' },
  { key: 'pending_a2p', label: 'Pending A2P' },
  { key: 'not_fully_provisioned', label: 'Not fully provisioned' },
  { key: 'live', label: 'Live' },
  { key: 'paused', label: 'Paused' },
  { key: 'archived', label: 'Archived' },
];

const DEMO_OWNER_CLERK_ID = 'simulator_demo_callbackcloser';

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
  return isBusinessArchived(business) && (business.isTestBusiness || business.ownerClerkId === DEMO_OWNER_CLERK_ID);
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
      actionLabel: hasTextingNumber ? 'Re-run provisioning' : 'Finish provisioning',
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
      title: 'Owner account still needs connection',
      detail: ownerEmail
        ? 'The business is saved, but the Clerk owner is not attached yet. Re-run the owner connection flow from admin.'
        : 'Add the owner email first, then connect or invite the owner.',
      tone: 'attention',
      actionLabel: 'Connect owner',
    };
  }

  if (!business.twilioSubaccountSid) {
    return {
      title: 'Twilio subaccount is missing',
      detail: 'Managed provisioning cannot finish until the business has a Twilio subaccount attached.',
      tone: 'attention',
      actionLabel: 'Re-run provisioning',
    };
  }

  if (!hasTextingNumber) {
    return {
      title: 'No texting number is assigned',
      detail: 'Provision a new number or attach the approved existing number so missed-call SMS can start.',
      tone: 'attention',
      actionLabel: 'Provision number',
    };
  }

  if (!business.twilioMessagingServiceSid) {
    return {
      title: 'Messaging service is missing',
      detail: 'The business has a number, but Twilio messaging still needs a Messaging Service for compliant delivery.',
      tone: 'attention',
      actionLabel: 'Re-run provisioning',
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

  if (business.managedTwilioStatus === ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION) {
    return {
      title: 'Business verification still needed',
      detail: 'Messaging is wired up, but the A2P business details still need to be completed before compliant live texting can launch.',
      tone: 'pending',
      actionLabel: 'Review A2P readiness',
    };
  }

  if (business.managedTwilioStatus === ManagedTwilioStatus.BRAND_SUBMITTED) {
    return {
      title: 'A2P brand submitted',
      detail: 'Brand review is in progress. No action is needed unless Twilio requests changes.',
      tone: 'pending',
      actionLabel: 'Watch for review updates',
    };
  }

  if (business.managedTwilioStatus === ManagedTwilioStatus.CAMPAIGN_SUBMITTED) {
    return {
      title: 'A2P campaign still pending',
      detail: 'The campaign is waiting on Twilio or carrier review. No action is needed yet.',
      tone: 'pending',
      actionLabel: 'Wait for approval',
    };
  }

  if (managedSummary.attentionRequired) {
    return {
      title: 'Compliance review needs attention',
      detail: business.a2pFailureReason || managedSummary.nextStep,
      tone: 'attention',
      actionLabel: 'Review compliance notes',
    };
  }

  if (managedSummary.messagingReady && business.provisioningStatus !== BusinessProvisioningStatus.LIVE) {
    return {
      title: 'Ready to go live',
      detail: 'Infrastructure and compliance look ready. Mark the business live when you want automation active.',
      tone: 'pending',
      actionLabel: 'Mark live',
    };
  }

  if (managedSummary.messagingReady && business.provisioningStatus === BusinessProvisioningStatus.LIVE) {
    return {
      title: 'Business is live and healthy',
      detail: 'Twilio, webhooks, alerts, and rollout status all look ready for normal operator monitoring.',
      tone: 'healthy',
      actionLabel: 'Open support workspace',
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

export function buildAdminOnboardingConfidence(params: {
  business: DashboardBusiness;
  notificationSettings: DashboardNotificationSettings | null;
  ownerConnected: boolean;
  successfulLeadCount: number;
  operatorEvents: Array<{ type: string; status: OperatorEventStatus; createdAt: Date }>;
}) {
  const { business, notificationSettings, ownerConnected, successfulLeadCount, operatorEvents } = params;
  const managedSummary = getManagedTwilioStatusSummary(business);
  const nextStep = buildAdminNextStep({ business, notificationSettings, ownerConnected });
  const ownerEmail = notificationSettings?.ownerEmail?.trim() || null;
  const ownerPhone = notificationSettings?.ownerPhone?.trim() || business.notifyPhone || null;
  const hasProfile = Boolean(business.name.trim() && business.forwardingNumber.trim());
  const ownerAlertsReady = Boolean(ownerPhone || ownerEmail);
  const twilioSetupReady = Boolean(business.twilioSubaccountSid);
  const numberReady = Boolean(getManagedTextingNumber(business) && (business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid));
  const messagingServiceReady = Boolean(business.twilioMessagingServiceSid);
  const webhooksReady = Boolean(business.twilioWebhookSyncedAt);
  const compliancePending =
    managedSummary.onboardingReady && !managedSummary.complianceReady && !managedSummary.attentionRequired;
  const hasTestSmsSuccess = operatorEvents.some(
    (event) => event.type === 'admin.test_sms_accepted' && event.status === OperatorEventStatus.SUCCESS
  );
  const hasTestSmsFailure = operatorEvents.some(
    (event) => event.type === 'admin.test_sms_failed' || event.type === 'admin.test_sms_suppressed'
  );
  const hasRecentFailures = operatorEvents.some(
    (event) => event.status === OperatorEventStatus.FAILED || event.status === OperatorEventStatus.WARNING
  );
  const missedCallValidated = successfulLeadCount > 0;
  const readyForTest = ownerConnected && ownerAlertsReady && twilioSetupReady && numberReady && messagingServiceReady && webhooksReady && managedSummary.complianceReady;
  const readyForLive = readyForTest && hasTestSmsSuccess && missedCallValidated;
  const canSafelyMarkLive = readyForLive;

  let state: OnboardingConfidenceState = 'in_setup';
  if (isBusinessArchived(business)) {
    state = 'archived';
  } else if (business.provisioningStatus === BusinessProvisioningStatus.LIVE && (!canSafelyMarkLive || hasRecentFailures || managedSummary.attentionRequired)) {
    state = 'live_with_warnings';
  } else if (business.provisioningStatus === BusinessProvisioningStatus.LIVE && canSafelyMarkLive) {
    state = 'live';
  } else if (nextStep.tone === 'attention' || managedSummary.attentionRequired || business.provisioningStatus === BusinessProvisioningStatus.NEEDS_ATTENTION) {
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

  const blockers: AdminOnboardingConfidence['blockers'] = [];
  if (nextStep.tone === 'attention') {
    blockers.push({ level: 'error', message: nextStep.detail });
  }
  if (managedSummary.attentionRequired && business.a2pFailureReason) {
    blockers.push({ level: 'error', message: business.a2pFailureReason });
  }
  if (compliancePending) {
    blockers.push({ level: 'warning', message: 'A2P review is still pending. No operator action is needed unless Twilio asks for changes.' });
  }
  if (readyForTest && !hasTestSmsSuccess) {
    blockers.push({ level: 'warning', message: 'Run an admin test SMS from the business line before treating this onboarding as launch-ready.' });
  }
  if (readyForTest && hasTestSmsFailure) {
    blockers.push({ level: 'error', message: 'The latest admin test SMS did not complete cleanly. Fix that before you go live.' });
  }
  if (readyForTest && !missedCallValidated) {
    blockers.push({ level: 'warning', message: 'Run one real missed-call test and confirm the lead reaches the owner before marking this business live.' });
  }

  const milestones: OnboardingConfidenceMilestone[] = [
    {
      key: 'business_profile',
      label: 'Business info complete',
      complete: hasProfile,
      variant: milestoneVariant({ complete: hasProfile, blocking: true }),
      detail: hasProfile ? 'Business name and call-forwarding details are saved.' : 'Add the business name and forwarding number first.',
    },
    {
      key: 'owner_connected',
      label: 'Owner connected',
      complete: ownerConnected,
      variant: milestoneVariant({ complete: ownerConnected, blocking: true }),
      detail: ownerConnected ? 'A Clerk owner is linked to this business.' : ownerEmail ? 'Owner invite or attachment still needs to finish.' : 'Add the owner email and connect the owner account.',
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
      detail: numberReady ? 'The business texting number is attached.' : 'Assign a new number or attach the approved existing number.',
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
      label: 'A2P / readiness acknowledged',
      complete: managedSummary.complianceReady,
      variant: milestoneVariant({ complete: managedSummary.complianceReady, blocking: managedSummary.attentionRequired }),
      detail: managedSummary.complianceReady ? 'A2P approval is recorded.' : managedSummary.nextStep,
    },
    {
      key: 'test_sms',
      label: 'Test SMS run',
      complete: hasTestSmsSuccess,
      variant: milestoneVariant({ complete: hasTestSmsSuccess, blocking: readyForTest }),
      detail: hasTestSmsSuccess ? 'Admin test SMS was accepted by Twilio from the business line.' : 'Run the admin test SMS once the business is ready for messaging.',
    },
    {
      key: 'missed_call_validation',
      label: 'Missed-call flow validated',
      complete: missedCallValidated,
      variant: milestoneVariant({ complete: missedCallValidated, blocking: readyForTest }),
      detail: missedCallValidated ? 'At least one missed-call lead reached the owner flow for this business.' : 'Run one real missed-call test from start to finish before going live.',
    },
    {
      key: 'live_gate',
      label: 'Safe to mark live',
      complete: canSafelyMarkLive,
      variant: milestoneVariant({ complete: canSafelyMarkLive, blocking: business.provisioningStatus === BusinessProvisioningStatus.LIVE || readyForTest }),
      detail: canSafelyMarkLive ? 'This business has passed the key operator checks for launch.' : 'Keep the business in onboarding until test SMS and a real missed-call validation are complete.',
    },
  ];

  const stateMeta: Record<OnboardingConfidenceState, Pick<AdminOnboardingConfidence, 'stateLabel' | 'stateVariant' | 'readinessLabel' | 'readinessVariant' | 'nextAction' | 'summary'>> = {
    draft: {
      stateLabel: 'Draft',
      stateVariant: 'outline',
      readinessLabel: 'Not ready',
      readinessVariant: 'outline',
      nextAction: nextStep.title,
      summary: 'Core onboarding details are still missing. Start with owner connection and Twilio setup.',
    },
    in_setup: {
      stateLabel: 'In setup',
      stateVariant: 'secondary',
      readinessLabel: 'Not ready',
      readinessVariant: 'outline',
      nextAction: nextStep.title,
      summary: 'Onboarding is in progress, but at least one blocking setup step still needs attention.',
    },
    needs_attention: {
      stateLabel: 'Needs attention',
      stateVariant: 'destructive',
      readinessLabel: 'Not ready',
      readinessVariant: 'destructive',
      nextAction: nextStep.title,
      summary: 'Something is broken or incomplete enough that the founder should stop and repair it before testing.',
    },
    waiting_on_a2p: {
      stateLabel: 'Waiting on A2P',
      stateVariant: 'secondary',
      readinessLabel: 'Waiting on external approval',
      readinessVariant: 'secondary',
      nextAction: 'Wait for Twilio approval',
      summary: 'Infrastructure is in place, but compliant messaging is still waiting on Twilio or carrier review.',
    },
    ready_for_test: {
      stateLabel: 'Ready for test',
      stateVariant: 'secondary',
      readinessLabel: 'Ready for test',
      readinessVariant: 'secondary',
      nextAction: hasTestSmsSuccess ? 'Run a real missed-call test' : 'Send a test SMS',
      summary: 'The business looks ready for operator-led validation. Run the checks before you mark it live.',
    },
    ready_to_go_live: {
      stateLabel: 'Ready to go live',
      stateVariant: 'success',
      readinessLabel: 'Ready for live',
      readinessVariant: 'success',
      nextAction: 'Mark this business live',
      summary: 'Setup, compliance, and operator validation checks are in place for a clean launch decision.',
    },
    live: {
      stateLabel: 'Live',
      stateVariant: 'success',
      readinessLabel: 'Ready for live',
      readinessVariant: 'success',
      nextAction: 'Monitor normal activity',
      summary: 'This business is live and the operator confidence checks are green.',
    },
    live_with_warnings: {
      stateLabel: 'Live with warnings',
      stateVariant: 'destructive',
      readinessLabel: 'Live with warnings',
      readinessVariant: 'destructive',
      nextAction: nextStep.title,
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

export function matchesAdminBoardFilter(
  business: DashboardBusiness,
  notificationSettings: DashboardNotificationSettings | null,
  ownerConnected: boolean,
  filter: AdminBoardFilter
) {
  if (filter === 'all') return true;

  const managedSummary = getManagedTwilioStatusSummary(business);
  const nextStep = buildAdminNextStep({ business, notificationSettings, ownerConnected });
  const archived = isBusinessArchived(business);
  const paused = isBusinessAutomationPaused(business) && !archived;

  if (filter === 'archived') return archived;
  if (archived) return false;

  if (filter === 'paused') {
    return paused || business.managedTwilioStatus === ManagedTwilioStatus.PAUSED_NONCOMPLIANT;
  }

  if (filter === 'live') {
    return business.provisioningStatus === BusinessProvisioningStatus.LIVE && managedSummary.messagingReady;
  }

  if (filter === 'pending_a2p') {
    return (
      business.managedTwilioStatus === ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION ||
      business.managedTwilioStatus === ManagedTwilioStatus.BRAND_SUBMITTED ||
      business.managedTwilioStatus === ManagedTwilioStatus.CAMPAIGN_SUBMITTED
    );
  }

  if (filter === 'not_fully_provisioned') {
    return !managedSummary.onboardingReady || !ownerConnected;
  }

  if (filter === 'needs_attention') {
    return nextStep.tone === 'attention';
  }

  return true;
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
