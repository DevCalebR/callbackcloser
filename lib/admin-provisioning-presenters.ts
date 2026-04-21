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
  | 'twilioAccountMode'
  | 'twilioNumberSetupMode'
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

export type AdminOwnerState = {
  status:
    | 'missing'
    | 'invite_ready'
    | 'invitation_pending'
    | 'accepted_needs_connection'
    | 'connected'
    | 'connection_broken';
  statusLabel: string;
  detail: string;
  badgeVariant: 'success' | 'secondary' | 'outline' | 'destructive';
  connected: boolean;
  pending: boolean;
  invitedAt: Date | null;
  clerkUserId: string | null;
  name: string | null;
  email: string | null;
  invitationId: string | null;
  invitationStatus: 'pending' | 'accepted' | 'revoked' | 'expired' | null;
  matchedUserId: string | null;
};

export type OwnerInvitationSnapshot = {
  id: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: Date;
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

export function deriveAdminOwnerState(input: {
  ownerClerkId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerInviteSentAt: Date | null;
  linkedUserId?: string | null;
  linkedUserName?: string | null;
  linkedUserEmail?: string | null;
  existingUserIdByEmail?: string | null;
  invitation?: OwnerInvitationSnapshot | null;
}): AdminOwnerState {
  const ownerEmail = input.ownerEmail?.trim().toLowerCase() || null;
  const ownerName = input.ownerName?.trim() || null;
  const pendingOwner = isPendingOwnerClerkId(input.ownerClerkId);
  const linkedUserId = input.linkedUserId || null;
  const linkedUserName = input.linkedUserName?.trim() || ownerName;
  const linkedUserEmail = input.linkedUserEmail?.trim().toLowerCase() || ownerEmail;
  const invitation = input.invitation || null;
  const existingUserIdByEmail = input.existingUserIdByEmail || null;

  if (linkedUserId) {
    return {
      status: 'connected',
      statusLabel: 'Owner connected',
      detail: 'A real CallbackCloser account is attached to this business.',
      badgeVariant: 'success',
      connected: true,
      pending: false,
      invitedAt: null,
      clerkUserId: linkedUserId,
      name: linkedUserName,
      email: linkedUserEmail,
      invitationId: invitation?.id || null,
      invitationStatus: invitation?.status || null,
      matchedUserId: linkedUserId,
    };
  }

  if (pendingOwner && existingUserIdByEmail) {
    return {
      status: 'accepted_needs_connection',
      statusLabel: 'Owner account ready to connect',
      detail: 'The owner now appears to have a CallbackCloser account. Finish by using Connect existing owner.',
      badgeVariant: 'secondary',
      connected: false,
      pending: true,
      invitedAt: input.ownerInviteSentAt,
      clerkUserId: null,
      name: ownerName,
      email: ownerEmail,
      invitationId: invitation?.id || null,
      invitationStatus: invitation?.status || null,
      matchedUserId: existingUserIdByEmail,
    };
  }

  if ((pendingOwner && (input.ownerInviteSentAt || invitation)) || invitation?.status === 'pending') {
    return {
      status: 'invitation_pending',
      statusLabel: 'Waiting for acceptance',
      detail:
        invitation?.status === 'expired'
          ? 'The last owner invitation expired. Send a fresh invite from admin.'
          : invitation?.status === 'revoked'
            ? 'The last owner invitation was revoked. Send a fresh invite from admin.'
            : 'An invitation has been sent. Wait for the owner to accept it, or resend if they need a fresh email.',
      badgeVariant: 'outline',
      connected: false,
      pending: true,
      invitedAt: input.ownerInviteSentAt || invitation?.createdAt || null,
      clerkUserId: null,
      name: ownerName,
      email: ownerEmail,
      invitationId: invitation?.id || null,
      invitationStatus: invitation?.status || null,
      matchedUserId: null,
    };
  }

  if (input.ownerClerkId && !pendingOwner) {
    return {
      status: 'connection_broken',
      statusLabel: 'Owner link needs repair',
      detail: 'This business has a stored owner ID, but Clerk did not return a valid user. Reconnect the owner account from admin.',
      badgeVariant: 'destructive',
      connected: false,
      pending: false,
      invitedAt: input.ownerInviteSentAt,
      clerkUserId: input.ownerClerkId,
      name: ownerName,
      email: ownerEmail,
      invitationId: invitation?.id || null,
      invitationStatus: invitation?.status || null,
      matchedUserId: existingUserIdByEmail,
    };
  }

  if (existingUserIdByEmail) {
    return {
      status: 'invite_ready',
      statusLabel: 'Existing owner available',
      detail: 'This email already has a CallbackCloser account. Use Connect existing owner instead of sending a new invite.',
      badgeVariant: 'secondary',
      connected: false,
      pending: false,
      invitedAt: input.ownerInviteSentAt,
      clerkUserId: null,
      name: ownerName,
      email: ownerEmail,
      invitationId: invitation?.id || null,
      invitationStatus: invitation?.status || null,
      matchedUserId: existingUserIdByEmail,
    };
  }

  if (ownerEmail) {
    return {
      status: 'invite_ready',
      statusLabel: 'Invite ready to send',
      detail: 'Owner contact info is saved, but no CallbackCloser account is attached yet.',
      badgeVariant: 'secondary',
      connected: false,
      pending: false,
      invitedAt: input.ownerInviteSentAt,
      clerkUserId: null,
      name: ownerName,
      email: ownerEmail,
      invitationId: invitation?.id || null,
      invitationStatus: invitation?.status || null,
      matchedUserId: null,
    };
  }

  return {
    status: 'missing',
    statusLabel: 'No owner connected',
    detail: 'Add the owner email, then either invite them or connect their existing CallbackCloser account.',
    badgeVariant: 'destructive',
    connected: false,
    pending: false,
    invitedAt: input.ownerInviteSentAt,
    clerkUserId: null,
    name: ownerName,
    email: null,
    invitationId: invitation?.id || null,
    invitationStatus: invitation?.status || null,
    matchedUserId: null,
  };
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
          ? 'Owner setup is still incomplete. Send the invite or connect the existing CallbackCloser account.'
          : 'Add an owner email, then choose Invite owner by email or Connect existing owner.',
    },
    {
      key: 'owner_alerts',
      label: 'Owner alert destination',
      complete: Boolean(ownerPhone || ownerEmail),
      detail: ownerPhone || ownerEmail ? 'Owner alert phone or email is saved.' : 'Add an owner alert phone or email address.',
    },
    {
      key: 'twilio_subaccount',
      label: business.twilioAccountMode === 'MAIN_ACCOUNT' ? 'Twilio account mode' : 'Twilio subaccount',
      complete: managedSummary.accountReady,
      detail:
        business.twilioAccountMode === 'MAIN_ACCOUNT'
          ? 'This business uses the parent Twilio account directly.'
          : business.twilioSubaccountSid
            ? 'Managed Twilio subaccount is attached.'
            : 'Create the business Twilio subaccount.',
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
