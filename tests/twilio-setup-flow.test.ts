import assert from 'node:assert/strict';
import test from 'node:test';

import { BusinessProvisioningStatus, ManagedTwilioStatus, TwilioAccountMode, TwilioNumberSetupMode } from '@prisma/client';

import { buildTwilioSetupFlow } from '../lib/twilio-setup.ts';

function createBusiness(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Acme Plumbing',
    notifyPhone: '+15551234567',
    forwardingNumber: '+15557654321',
    provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
    twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
    twilioNumberSetupMode: TwilioNumberSetupMode.NEW_NUMBER,
    twilioSubaccountSid: 'AC_TEST_SUBACCOUNT',
    twilioMessagingServiceSid: 'MG_TEST_SERVICE',
    twilioPrimaryNumberSid: 'PN_TEST_PRIMARY',
    twilioPhoneNumberSid: 'PN_TEST_PRIMARY',
    twilioPrimaryPhoneNumber: '+15550001111',
    twilioPhoneNumber: '+15550001111',
    twilioWebhookSyncedAt: new Date('2026-04-20T00:00:00.000Z'),
    managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
    a2pCustomerProfileSid: 'BU_TEST_PROFILE',
    a2pBrandSid: 'BN_TEST_BRAND',
    a2pCampaignSid: 'QE_TEST_CAMPAIGN',
    a2pFailureReason: null,
    a2pApprovedAt: new Date('2026-04-20T00:00:00.000Z'),
    ...overrides,
  };
}

function createNotificationSettings(overrides: Record<string, unknown> = {}) {
  return {
    ownerPhone: '+15551234567',
    ownerEmail: 'owner@example.com',
    ...overrides,
  };
}

function createWebhookSnapshot(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

test('main account mode removes the subaccount blocker but keeps the mode explicit', () => {
  const flow = buildTwilioSetupFlow({
    business: createBusiness({
      twilioAccountMode: 'MAIN_ACCOUNT',
      twilioSubaccountSid: null,
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 0,
    testSmsState: 'not_started',
    webhookSnapshot: createWebhookSnapshot(),
  });

  const accountStep = flow.steps.find((step) => step.key === 'account_ready');
  assert.equal(flow.accountModeLabel, 'Main account');
  assert.equal(accountStep?.complete, true);
  assert.match(accountStep?.detail || '', /parent Twilio account directly/i);
});

test('safe-to-go-live stays blocked until test SMS and missed-call validation both pass', () => {
  const blocked = buildTwilioSetupFlow({
    business: createBusiness(),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 0,
    testSmsState: 'pending_delivery',
    webhookSnapshot: createWebhookSnapshot(),
  });

  assert.equal(blocked.safeToMarkLive, false);
  assert.match(blocked.liveGateDetail, /deliver a test SMS/i);
  assert.match(blocked.liveGateDetail, /validate the missed-call flow/i);

  const ready = buildTwilioSetupFlow({
    business: createBusiness(),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 1,
    testSmsState: 'delivered',
    webhookSnapshot: createWebhookSnapshot(),
  });

  assert.equal(ready.safeToMarkLive, true);
  assert.match(ready.liveGateDetail, /safe to mark live/i);
});

test('existing-number path messaging stays truthful about admin assistance', () => {
  const flow = buildTwilioSetupFlow({
    business: createBusiness({
      twilioNumberSetupMode: 'EXISTING_NUMBER',
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumber: null,
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 0,
    testSmsState: 'not_started',
    webhookSnapshot: createWebhookSnapshot({
      voiceSynced: false,
      smsSynced: false,
      statusSynced: false,
    }),
  });

  const numberPathStep = flow.steps.find((step) => step.key === 'number_path');
  assert.match(numberPathStep?.detail || '', /admin-assisted/i);
  assert.match(numberPathStep?.detail || '', /selected Twilio account context/i);
});
