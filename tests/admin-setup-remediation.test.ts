import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BusinessProvisioningStatus,
  ManagedTwilioStatus,
  TwilioAccountMode,
  TwilioNumberSetupMode,
} from '@prisma/client';

import { buildAdminNextStepGuide, buildAdminSetupPanels } from '../lib/admin-setup-remediation.ts';
import { buildTwilioSetupFlow } from '../lib/twilio-setup.ts';

function buildSetupFlow(overrides: Partial<Parameters<typeof buildTwilioSetupFlow>[0]['business']> = {}) {
  return buildTwilioSetupFlow({
    business: {
      name: 'Acme Plumbing',
      notifyPhone: '+15551230000',
      forwardingNumber: '+15557654321',
      provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
      twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
      twilioNumberSetupMode: TwilioNumberSetupMode.NEW_NUMBER,
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: null,
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumber: null,
      twilioWebhookSyncedAt: null,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pFailureReason: null,
      a2pApprovedAt: null,
      ...overrides,
    },
    notificationSettings: {
      ownerEmail: 'owner@acme.com',
      ownerPhone: '+15551230000',
    },
    ownerConnected: false,
    successfulLeadCount: 0,
    testSmsState: 'not_started',
    webhookSnapshot: {
      currentVoiceUrl: 'https://wrong.example.com/voice',
      currentSmsUrl: 'https://wrong.example.com/sms',
      currentStatusUrl: 'https://wrong.example.com/status',
      expectedVoiceUrl: 'https://app.callbackcloser.com/api/twilio/voice',
      expectedSmsUrl: 'https://app.callbackcloser.com/api/twilio/sms',
      expectedStatusUrl: 'https://app.callbackcloser.com/api/twilio/message-status',
      voiceSynced: false,
      smsSynced: false,
      statusSynced: false,
      error: null,
    },
  });
}

test('setup remediation panels expose actionable manual fallback for subaccount and webhook steps', () => {
  const setupFlow = buildSetupFlow();
  const panels = buildAdminSetupPanels({
    business: {
      name: 'Acme Plumbing',
      forwardingNumber: '+15557654321',
      notifyPhone: '+15551230000',
      twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumber: null,
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pFailureReason: null,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
    },
    setupFlow,
    ownerState: {
      connected: false,
      status: 'accepted_needs_connection',
      statusLabel: 'Owner account ready to connect',
      detail: 'Owner still needs to be connected.',
      badgeVariant: 'secondary',
      email: 'owner@acme.com',
      pending: true,
      invitedAt: null,
      clerkUserId: null,
      name: 'Casey Owner',
      invitationId: null,
      invitationStatus: null,
      matchedUserId: 'user_123',
    },
    webhookSnapshot: {
      currentVoiceUrl: 'https://wrong.example.com/voice',
      currentSmsUrl: 'https://wrong.example.com/sms',
      currentStatusUrl: 'https://wrong.example.com/status',
      expectedVoiceUrl: 'https://app.callbackcloser.com/api/twilio/voice',
      expectedSmsUrl: 'https://app.callbackcloser.com/api/twilio/sms',
      expectedStatusUrl: 'https://app.callbackcloser.com/api/twilio/message-status',
      voiceSynced: false,
      smsSynced: false,
      statusSynced: false,
      error: null,
    },
    testSmsTruth: {
      state: 'failed',
      label: 'Failed',
      tone: 'attention',
      summary: 'Test SMS failed',
      detail: 'Carrier rejected the destination.',
      reason: 'Carrier rejected the destination.',
      lastAttemptAt: new Date('2026-04-21T12:00:00.000Z'),
      eventType: 'admin.test_sms_failed',
    },
    successfulLeadCount: 0,
  });

  const subaccountPanel = panels.find((panel) => panel.key === 'account_ready')!;
  assert.equal(subaccountPanel.automaticActionLabel, 'Create subaccount automatically');
  assert.equal(subaccountPanel.manualFields[0]?.key, 'twilioSubaccountSid');

  const statusWebhookPanel = panels.find((panel) => panel.key === 'status_callback_synced')!;
  assert.match(statusWebhookPanel.instructions.join(' '), /api\/twilio\/message-status/);
  assert.equal(statusWebhookPanel.automaticActionLabel, 'Re-sync status callback');

  const testSmsPanel = panels.find((panel) => panel.key === 'test_sms_delivered')!;
  assert.match(testSmsPanel.currentState, /Failed/i);
  assert.equal(testSmsPanel.automaticActionLabel, 'Retry test SMS');
});

test('setup remediation panels stay truthful for main-account mode and next-step guide prefers the issue step', () => {
  const setupFlow = buildSetupFlow({
    twilioAccountMode: TwilioAccountMode.MAIN_ACCOUNT,
    twilioNumberSetupMode: TwilioNumberSetupMode.EXISTING_NUMBER,
    twilioMessagingServiceSid: 'MG1234567890abcdef1234567890abcd',
    twilioPrimaryPhoneNumber: '+15551230000',
    twilioPrimaryNumberSid: 'PN1234567890abcdef1234567890abcd',
  });

  const panels = buildAdminSetupPanels({
    business: {
      name: 'Acme Plumbing',
      forwardingNumber: '+15557654321',
      notifyPhone: '+15551230000',
      twilioAccountMode: TwilioAccountMode.MAIN_ACCOUNT,
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: 'MG1234567890abcdef1234567890abcd',
      twilioPrimaryPhoneNumber: '+15551230000',
      twilioPhoneNumber: '+15551230000',
      twilioPrimaryNumberSid: 'PN1234567890abcdef1234567890abcd',
      twilioPhoneNumberSid: 'PN1234567890abcdef1234567890abcd',
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pFailureReason: null,
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
    },
    setupFlow,
    ownerState: {
      connected: true,
      status: 'connected',
      statusLabel: 'Connected',
      detail: 'Owner account is connected.',
      badgeVariant: 'success',
      email: 'owner@acme.com',
      pending: false,
      invitedAt: null,
      clerkUserId: 'user_123',
      name: 'Casey Owner',
      invitationId: null,
      invitationStatus: null,
      matchedUserId: null,
    },
    webhookSnapshot: {
      currentVoiceUrl: 'https://app.callbackcloser.com/api/twilio/voice',
      currentSmsUrl: 'https://app.callbackcloser.com/api/twilio/sms',
      currentStatusUrl: 'https://app.callbackcloser.com/api/twilio/message-status',
      expectedVoiceUrl: 'https://app.callbackcloser.com/api/twilio/voice',
      expectedSmsUrl: 'https://app.callbackcloser.com/api/twilio/sms',
      expectedStatusUrl: 'https://app.callbackcloser.com/api/twilio/message-status',
      voiceSynced: true,
      smsSynced: true,
      statusSynced: true,
      error: null,
    },
    testSmsTruth: {
      state: 'delivered',
      label: 'Delivered',
      tone: 'success',
      summary: 'Test SMS delivered',
      detail: 'Delivery confirmed.',
      reason: null,
      lastAttemptAt: new Date('2026-04-21T12:05:00.000Z'),
      eventType: 'admin.test_sms_delivered',
    },
    successfulLeadCount: 2,
  });

  const accountReadyPanel = panels.find((panel) => panel.key === 'account_ready')!;
  assert.equal(accountReadyPanel.manualFields.length, 0);
  assert.equal(accountReadyPanel.automaticActionLabel, null);

  const nextStep = buildAdminNextStepGuide({
    setupFlow,
    lastIssueStepKey: 'test_sms_delivered',
    panels,
  });
  assert.equal(nextStep.key, 'test_sms_delivered');
  assert.equal(nextStep.ctaLabel, 'Open setup step');
});
