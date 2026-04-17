import {
  BusinessProvisioningStatus,
  ManagedTwilioStatus,
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
