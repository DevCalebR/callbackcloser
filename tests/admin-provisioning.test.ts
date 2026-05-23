import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BusinessProvisioningStatus,
  ManagedTwilioStatus,
  MessagingComplianceType,
  SubscriptionStatus,
  TollFreeVerificationStatus,
  TwilioAccountMode,
  TwilioNumberSetupMode,
} from '@prisma/client';

import {
  buildAdminProvisioningChecklist,
  buildPendingOwnerClerkId,
  getAdminProvisioningStatusVariant,
  isPendingOwnerClerkId,
} from '../lib/admin-provisioning-presenters.ts';

function createBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: 'biz_123',
    name: 'Acme Plumbing',
    ownerName: 'Casey Owner',
    ownerClerkId: 'user_123',
    notifyPhone: '+15551234567',
    forwardingNumber: '+15557654321',
    timezone: 'America/New_York',
    serviceLabel1: 'Repair',
    serviceLabel2: 'Install',
    serviceLabel3: 'Maintenance',
    missedCallSeconds: 20,
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
    twilioNumberSetupMode: TwilioNumberSetupMode.NEW_NUMBER,
    managedTwilioStatus: ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION,
    managedTwilioStatusUpdatedAt: new Date('2026-04-15T00:00:00.000Z'),
    twilioSubaccountSid: 'AC_TEST_SUBACCOUNT',
    twilioPhoneNumber: '+15550001111',
    twilioPhoneNumberSid: 'PN_TEST_PRIMARY',
    twilioPrimaryPhoneNumber: '+15550001111',
    twilioPrimaryNumberSid: 'PN_TEST_PRIMARY',
    twilioMessagingServiceSid: 'MG_TEST_SERVICE',
    twilioWebhookSyncedAt: new Date('2026-04-15T00:00:00.000Z'),
    provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
    provisioningLastRunAt: new Date('2026-04-15T00:00:00.000Z'),
    provisioningError: null,
    ownerInviteSentAt: null,
    internalNotes: null,
    updatedAt: new Date('2026-04-15T00:00:00.000Z'),
    messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
    a2pFailureReason: null,
    a2pApprovedAt: null,
    a2pCampaignSid: null,
    a2pBrandSid: null,
    a2pCustomerProfileSid: null,
    tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_STARTED,
    tollFreeVerificationSid: null,
    tollFreeVerificationNote: null,
    ...overrides,
  };
}

test('pending owner helper generates recognizable placeholder ids', () => {
  const pendingId = buildPendingOwnerClerkId();

  assert.equal(isPendingOwnerClerkId(pendingId), true);
  assert.equal(isPendingOwnerClerkId('user_123'), false);
});

test('admin provisioning checklist surfaces incomplete rollout steps clearly', () => {
  const checklist = buildAdminProvisioningChecklist({
    business: createBusiness({
      twilioSubaccountSid: null,
      twilioPrimaryNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumberSid: null,
      twilioPhoneNumber: null,
      twilioMessagingServiceSid: null,
    }),
    notificationSettings: {
      ownerPhone: null,
      ownerEmail: '',
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
    ownerConnected: false,
    webhookSnapshot: null,
  });

  const ownerStep = checklist.find((item) => item.key === 'owner_account');
  const numberStep = checklist.find((item) => item.key === 'texting_number');
  const voiceStep = checklist.find((item) => item.key === 'voice_webhook');
  const a2pStep = checklist.find((item) => item.key === 'a2p_registration');

  assert.equal(ownerStep?.complete, false);
  assert.match(ownerStep?.detail || '', /Connect the Clerk user|Add an owner email/);
  assert.equal(numberStep?.complete, false);
  assert.equal(voiceStep?.complete, false);
  assert.equal(a2pStep?.complete, false);
});

test('admin provisioning checklist shows completed rollout when owner, messaging, and webhooks are ready', () => {
  const checklist = buildAdminProvisioningChecklist({
    business: createBusiness({
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      a2pApprovedAt: new Date('2026-04-15T00:00:00.000Z'),
    }),
    notificationSettings: {
      ownerPhone: '+15551234567',
      ownerEmail: 'owner@example.com',
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
    ownerConnected: true,
    webhookSnapshot: {
      voiceSynced: true,
      smsSynced: true,
      statusSynced: true,
      currentVoiceUrl: 'https://callbackcloser.com/api/twilio/voice',
      currentSmsUrl: 'https://callbackcloser.com/api/twilio/sms',
      currentStatusUrl: 'https://callbackcloser.com/api/twilio/status',
      expectedVoiceUrl: 'https://callbackcloser.com/api/twilio/voice',
      expectedSmsUrl: 'https://callbackcloser.com/api/twilio/sms',
      expectedStatusUrl: 'https://callbackcloser.com/api/twilio/status',
      error: null,
    },
  });

  assert.equal(checklist.every((item) => item.complete), true);
  assert.equal(getAdminProvisioningStatusVariant(BusinessProvisioningStatus.LIVE), 'success');
  assert.equal(getAdminProvisioningStatusVariant(BusinessProvisioningStatus.NEEDS_ATTENTION), 'destructive');
});
