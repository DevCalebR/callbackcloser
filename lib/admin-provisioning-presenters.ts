import { randomUUID } from 'node:crypto';

import { BusinessProvisioningStatus, type Business, type BusinessNotificationSettings } from '@prisma/client';

import { getManagedTwilioStatusSummary } from '@/lib/managed-twilio-status';
import { normalizePhoneNumber } from '@/lib/phone';

export const PENDING_OWNER_PREFIX = 'pending_owner_';

type AdminBusinessSummary = Pick<
  Business,
  | 'name'
  | 'ownerName'
  | 'ownerClerkId'
  | 'notifyPhone'
  | 'forwardingNumber'
  | 'twilioSubaccountSid'
  | 'twilioPhoneNumber'
  | 'twilioPhoneNumberSid'
    | 'twilioPrimaryPhoneNumber'
    | 'twilioPrimaryNumberSid'
    | 'twilioMessagingServiceSid'
    | 'twilioWebhookSyncedAt'
    | 'managedTwilioStatus'
    | 'a2pCustomerProfileSid'
    | 'a2pBrandSid'
    | 'a2pCampaignSid'
    | 'a2pFailureReason'
    | 'a2pApprovedAt'
>;

type NotificationSettingsSummary = Pick<
  BusinessNotificationSettings,
  'ownerPhone' | 'ownerEmail' | 'notifySms' | 'notifyEmail' | 'notifyInApp' | 'urgentOnly'
>;

export type AdminProvisioningChecklistItem = {
  key:
    | 'business_profile'
    | 'owner_account'
    | 'owner_alerts'
    | 'twilio_subaccount'
    | 'texting_number'
    | 'messaging_service'
    | 'voice_webhook'
    | 'sms_webhook'
    | 'a2p_registration';
  label: string;
  complete: boolean;
  detail: string;
};

export type TwilioWebhookSnapshot = {
  voiceSynced: boolean;
  smsSynced: boolean;
  statusSynced: boolean;
  currentVoiceUrl: string | null;
  currentSmsUrl: string | null;
  currentStatusUrl: string | null;
  expectedVoiceUrl: string;
  expectedSmsUrl: string;
  expectedStatusUrl: string;
  error: string | null;
};

type ProvisioningChecklistInput = {
  business: AdminBusinessSummary;
  notificationSettings: NotificationSettingsSummary | null;
  ownerConnected: boolean;
  webhookSnapshot: TwilioWebhookSnapshot | null;
};

export const adminProvisioningStatusLabels: Record<BusinessProvisioningStatus, string> = {
  DRAFT: 'Draft',
  ONBOARDING: 'Onboarding',
  NEEDS_ATTENTION: 'Needs attention',
  LIVE: 'Live',
  PAUSED: 'Paused',
};

export function buildPendingOwnerClerkId() {
  return `${PENDING_OWNER_PREFIX}${randomUUID().replace(/-/g, '')}`;
}

export function isPendingOwnerClerkId(ownerClerkId: string | null | undefined) {
  return Boolean(ownerClerkId?.startsWith(PENDING_OWNER_PREFIX));
}

export function getAdminProvisioningStatusVariant(status: BusinessProvisioningStatus) {
  switch (status) {
    case BusinessProvisioningStatus.LIVE:
      return 'success' as const;
    case BusinessProvisioningStatus.NEEDS_ATTENTION:
      return 'destructive' as const;
    case BusinessProvisioningStatus.ONBOARDING:
      return 'secondary' as const;
    case BusinessProvisioningStatus.PAUSED:
      return 'outline' as const;
    case BusinessProvisioningStatus.DRAFT:
    default:
      return 'outline' as const;
  }
}

export function buildAdminProvisioningChecklist({
  business,
  notificationSettings,
  ownerConnected,
  webhookSnapshot,
}: ProvisioningChecklistInput): AdminProvisioningChecklistItem[] {
  const ownerEmail = notificationSettings?.ownerEmail?.trim() || null;
  const ownerPhone = normalizePhoneNumber(notificationSettings?.ownerPhone || business.notifyPhone || '') || null;
  const messagingServiceReady = Boolean(business.twilioMessagingServiceSid);
  const managedSummary = getManagedTwilioStatusSummary(business);

  return [
    {
      key: 'business_profile',
      label: 'Business profile saved',
      complete: Boolean(business.name.trim() && business.forwardingNumber.trim()),
      detail: business.forwardingNumber ? 'Business name and routing number are saved.' : 'Add the business name and forwarding number.',
    },
    {
      key: 'owner_account',
      label: 'Owner account connected',
      complete: ownerConnected,
      detail: ownerConnected
        ? 'A Clerk user is linked to this business.'
        : ownerEmail
          ? 'Owner account is still pending. Connect the Clerk user or resend the invite.'
          : 'Add an owner email and connect or invite the owner.',
    },
    {
      key: 'owner_alerts',
      label: 'Owner alert destination',
      complete: Boolean(ownerPhone || ownerEmail),
      detail: ownerPhone || ownerEmail ? 'Owner alert phone or email is saved.' : 'Add an owner alert phone or email address.',
    },
    {
      key: 'twilio_subaccount',
      label: 'Twilio subaccount',
      complete: Boolean(business.twilioSubaccountSid),
      detail: business.twilioSubaccountSid ? 'Managed Twilio subaccount is attached.' : 'Create the business Twilio subaccount.',
    },
    {
      key: 'texting_number',
      label: 'Texting number assigned',
      complete: Boolean(business.twilioPrimaryNumberSid && business.twilioPrimaryPhoneNumber),
      detail: business.twilioPrimaryPhoneNumber
        ? `Primary texting line ${business.twilioPrimaryPhoneNumber} is saved.`
        : 'Provision a new number or attach an existing number.',
    },
    {
      key: 'messaging_service',
      label: 'Messaging service active',
      complete: messagingServiceReady,
      detail: messagingServiceReady
        ? 'Messaging Service SID is attached to the business.'
        : 'Create or attach the Twilio Messaging Service.',
    },
    {
      key: 'a2p_registration',
      label: 'A2P registration ready',
      complete: managedSummary.complianceReady,
      detail: managedSummary.complianceReady ? managedSummary.description : managedSummary.nextStep,
    },
    {
      key: 'voice_webhook',
      label: 'Voice webhook synced',
      complete: Boolean(webhookSnapshot?.voiceSynced),
      detail: webhookSnapshot?.error
        ? webhookSnapshot.error
        : webhookSnapshot?.voiceSynced
          ? 'Voice webhook matches the current app URL.'
          : 'Re-sync the voice webhook on the assigned number.',
    },
    {
      key: 'sms_webhook',
      label: 'SMS webhook synced',
      complete: Boolean(webhookSnapshot?.smsSynced),
      detail: webhookSnapshot?.error
        ? webhookSnapshot.error
        : webhookSnapshot?.smsSynced
          ? 'SMS webhook matches the current app URL.'
          : 'Re-sync the SMS webhook on the assigned number.',
    },
  ];
}
