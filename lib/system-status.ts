import { type Business, type SubscriptionStatus } from '@prisma/client';

import { getBusinessPhoneSetupGate } from '@/lib/business-phone-setup';
import { getManagedTwilioStatusSummary } from '@/lib/managed-twilio-status';

type StatusBusiness = Pick<
  Business,
  | 'managedTwilioStatus'
  | 'messagingSetupMode'
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
  | 'subscriptionStatus'
  | 'forwardingNumber'
  | 'notifyPhone'
> &
  Partial<
    Pick<
      Business,
      | 'phoneSetupPath'
      | 'publicBusinessPhone'
      | 'forwardingVerificationStatus'
      | 'forwardingVerifiedAt'
      | 'forwardingVerificationNote'
      | 'portingStatus'
      | 'portingNotes'
      | 'portingCompletedAt'
    >
  >;

export type CustomerSystemStatusKey = 'not_live_yet' | 'activating' | 'live';
export type AdminBusinessStatusKey = 'blocked' | 'activating' | 'live';

export function getCustomerSystemStatus(business: StatusBusiness, successfulLeadCount: number) {
  const managedSummary = getManagedTwilioStatusSummary(business);
  const phoneSetupGate = getBusinessPhoneSetupGate(business);
  const hasSuccessfulTestLead = successfulLeadCount > 0;

  if (managedSummary.messagingReady && phoneSetupGate.complete && hasSuccessfulTestLead) {
    return {
      key: 'live' as const,
      label: 'Live',
      badgeVariant: 'success' as const,
      description: 'Missed-call recovery is live and ready for another test call.',
    };
  }

  if (managedSummary.onboardingReady || managedSummary.complianceStarted || phoneSetupGate.complete || hasSuccessfulTestLead) {
    return {
      key: 'activating' as const,
      label: 'Setup pending',
      badgeVariant: 'secondary' as const,
      description: 'CallbackCloser is finishing the remaining setup before missed-call recovery goes live.',
    };
  }

  return {
    key: 'not_live_yet' as const,
    label: 'Not live yet',
    badgeVariant: 'outline' as const,
    description: 'Finish setup and run your first test call to bring the system live.',
  };
}

export function getAdminBusinessStatus(business: StatusBusiness, successfulLeadCount: number) {
  const managedSummary = getManagedTwilioStatusSummary(business);

  if (managedSummary.attentionRequired) {
    return {
      key: 'blocked' as const,
      label: 'Blocked',
      badgeVariant: 'destructive' as const,
    };
  }

  const customerStatus = getCustomerSystemStatus(business, successfulLeadCount);
  if (customerStatus.key === 'live') {
    return {
      key: 'live' as const,
      label: 'Live',
      badgeVariant: 'success' as const,
    };
  }

  return {
    key: 'activating' as const,
    label: 'Activating',
    badgeVariant: 'secondary' as const,
  };
}

export function getBillingDisplayLabel(subscriptionStatus: SubscriptionStatus, billingActive: boolean) {
  if (billingActive) return 'active';
  return subscriptionStatus.toLowerCase();
}
