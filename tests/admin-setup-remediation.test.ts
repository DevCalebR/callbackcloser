import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BusinessProvisioningStatus,
  ManagedTwilioStatus,
  MessagingComplianceType,
  MessagingSetupMode,
  OperatorEventStatus,
  SubscriptionStatus,
  TollFreeVerificationStatus,
  TwilioAccountMode,
  TwilioNumberSetupMode,
} from '@prisma/client';

import { buildAdminOnboardingConfidence } from '../lib/admin-dashboard.ts';
import { buildAdminMissedCallValidationTruth, buildAdminOperationalProofs } from '../lib/admin-operator-proof.ts';
import { buildAdminNextStepGuide, buildAdminSetupPanels } from '../lib/admin-setup-remediation.ts';
import { buildAdminTestSmsTruth } from '../lib/admin-operator-visibility.ts';
import { buildTwilioSetupFlow } from '../lib/twilio-setup.ts';

function buildSetupFlow(overrides: Partial<Parameters<typeof buildTwilioSetupFlow>[0]['business']> = {}) {
  return buildTwilioSetupFlow({
    business: {
      name: 'Acme Plumbing',
      notifyPhone: '+15551230000',
      forwardingNumber: '+15557654321',
      provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
      twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
      messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
      twilioNumberSetupMode: TwilioNumberSetupMode.NEW_NUMBER,
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: null,
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumber: null,
      twilioWebhookSyncedAt: null,
      messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pFailureReason: null,
      a2pApprovedAt: null,
      tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_STARTED,
      tollFreeVerificationSid: null,
      tollFreeVerificationNote: null,
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
  const testSmsTruth = {
    state: 'failed',
    label: 'Failed',
    tone: 'attention',
    summary: 'Test SMS failed',
    detail: 'Carrier rejected the destination.',
    reason: 'Carrier rejected the destination.',
    lastAttemptAt: new Date('2026-04-21T12:00:00.000Z'),
    eventType: 'admin.test_sms_failed',
  } as const;
  const missedCallValidation = buildAdminMissedCallValidationTruth({
    events: [
      {
        type: 'messaging.missed_call_sms_suppressed',
        status: OperatorEventStatus.FAILED,
        summary: 'Recovery SMS suppressed',
        detailsJson: { error: 'No valid destination' },
        createdAt: new Date('2026-04-21T12:02:00.000Z'),
        relatedEntityType: 'lead',
        relatedEntityId: 'lead_123',
      },
    ],
    successfulLeadCount: 0,
  });
  const onboardingConfidence = buildAdminOnboardingConfidence({
    business: {
      id: 'biz_123',
      name: 'Acme Plumbing',
      ownerClerkId: 'user_123',
      ownerName: 'Casey Owner',
      ownerInviteSentAt: null,
      isTestBusiness: false,
      archivedAt: null,
      forwardingNumber: '+15557654321',
      notifyPhone: '+15551230000',
      provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
      provisioningError: null,
      provisioningLastRunAt: new Date('2026-04-21T12:00:00.000Z'),
      twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
      messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
      twilioNumberSetupMode: TwilioNumberSetupMode.NEW_NUMBER,
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: null,
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumber: null,
      twilioWebhookSyncedAt: null,
      messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pFailureReason: null,
      a2pApprovedAt: null,
      tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_STARTED,
      tollFreeVerificationSid: null,
      tollFreeVerificationNote: null,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      stripePriceId: null,
      updatedAt: new Date('2026-04-21T12:00:00.000Z'),
    },
    notificationSettings: {
      ownerPhone: '+15551230000',
      ownerEmail: 'owner@acme.com',
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
    ownerConnected: false,
    successfulLeadCount: 0,
    operatorEvents: [],
    missedCallValidation,
  });
  const proofBundle = buildAdminOperationalProofs({
    ownerConnected: false,
    ownerEmail: 'owner@acme.com',
    ownerPhone: '+15551230000',
    messagingServiceReady: false,
    numberAssigned: false,
    testSmsTruth,
    missedCallValidation,
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
    provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
    canSafelyMarkLive: false,
    blockers: onboardingConfidence.blockers.map((blocker) => blocker.message),
    events: [],
  });
  const panels = buildAdminSetupPanels({
    business: {
      name: 'Acme Plumbing',
      forwardingNumber: '+15557654321',
      notifyPhone: '+15551230000',
      twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
      messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumber: null,
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      twilioWebhookSyncedAt: null,
      messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pFailureReason: null,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      a2pApprovedAt: null,
      tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_STARTED,
      tollFreeVerificationSid: null,
      tollFreeVerificationNote: null,
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
    testSmsTruth,
    onboardingConfidence,
    missedCallValidation,
    goLiveDecision: proofBundle.goLiveDecision,
    proofs: proofBundle.proofs,
  });

  const subaccountPanel = panels.find((panel) => panel.key === 'account_ready')!;
  assert.equal(subaccountPanel.automaticActionLabel, 'Create subaccount automatically');
  assert.equal(subaccountPanel.manualFields[0]?.key, 'twilioSubaccountSid');

  const statusWebhookPanel = panels.find((panel) => panel.key === 'status_callback_synced')!;
  assert.match(statusWebhookPanel.instructions.join(' '), /api\/twilio\/message-status/);
  assert.equal(statusWebhookPanel.automaticActionLabel, 'Re-sync status callback');
  assert.match(statusWebhookPanel.latestEvidence.join(' '), /Expected CallbackCloser value/i);

  const testSmsPanel = panels.find((panel) => panel.key === 'test_sms_delivered')!;
  assert.match(testSmsPanel.currentState, /Failed/i);
  assert.equal(testSmsPanel.automaticActionLabel, 'Retry test SMS');
  assert.equal(testSmsPanel.warnings.length > 0, true);
});

test('setup remediation panels stay truthful for main-account mode and next-step guide prefers the issue step', () => {
  const setupFlow = buildSetupFlow({
    twilioAccountMode: TwilioAccountMode.MAIN_ACCOUNT,
    twilioNumberSetupMode: TwilioNumberSetupMode.EXISTING_NUMBER,
    twilioMessagingServiceSid: 'MG1234567890abcdef1234567890abcd',
    twilioPrimaryPhoneNumber: '+15551230000',
    twilioPrimaryNumberSid: 'PN1234567890abcdef1234567890abcd',
    a2pApprovedAt: new Date('2026-04-21T12:00:00.000Z'),
  });
  const testSmsTruth = buildAdminTestSmsTruth([
    {
      type: 'admin.test_sms_delivered',
      status: OperatorEventStatus.SUCCESS,
      summary: 'Test SMS delivered',
      detailsJson: { messageStatus: 'delivered' },
      createdAt: new Date('2026-04-21T12:05:00.000Z'),
    },
  ]);
  const missedCallValidation = buildAdminMissedCallValidationTruth({
    events: [
      {
        type: 'admin.missed_call_validation_confirmed',
        status: OperatorEventStatus.SUCCESS,
        summary: 'Missed-call flow manually confirmed',
        detailsJson: { note: 'Validated end-to-end after test call.' },
        createdAt: new Date('2026-04-21T12:10:00.000Z'),
        relatedEntityType: null,
        relatedEntityId: null,
      },
    ],
    successfulLeadCount: 2,
  });
  const onboardingConfidence = buildAdminOnboardingConfidence({
    business: {
      id: 'biz_123',
      name: 'Acme Plumbing',
      ownerClerkId: 'user_123',
      ownerName: 'Casey Owner',
      ownerInviteSentAt: null,
      isTestBusiness: false,
      archivedAt: null,
      forwardingNumber: '+15557654321',
      notifyPhone: '+15551230000',
      provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
      provisioningError: null,
      provisioningLastRunAt: new Date('2026-04-21T12:00:00.000Z'),
      twilioAccountMode: TwilioAccountMode.MAIN_ACCOUNT,
      messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
      twilioNumberSetupMode: TwilioNumberSetupMode.EXISTING_NUMBER,
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: 'MG1234567890abcdef1234567890abcd',
      twilioPrimaryNumberSid: 'PN1234567890abcdef1234567890abcd',
      twilioPhoneNumberSid: 'PN1234567890abcdef1234567890abcd',
      twilioPrimaryPhoneNumber: '+15551230000',
      twilioPhoneNumber: '+15551230000',
      twilioWebhookSyncedAt: new Date('2026-04-21T12:00:00.000Z'),
      messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pFailureReason: null,
      a2pApprovedAt: new Date('2026-04-21T12:00:00.000Z'),
      tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_STARTED,
      tollFreeVerificationSid: null,
      tollFreeVerificationNote: null,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      stripePriceId: null,
      updatedAt: new Date('2026-04-21T12:00:00.000Z'),
    },
    notificationSettings: {
      ownerPhone: '+15551230000',
      ownerEmail: 'owner@acme.com',
      notifySms: true,
      notifyEmail: true,
      notifyInApp: true,
      urgentOnly: false,
    },
    ownerConnected: true,
    successfulLeadCount: 2,
    operatorEvents: [
      {
        type: 'admin.test_sms_delivered',
        status: OperatorEventStatus.SUCCESS,
        createdAt: new Date('2026-04-21T12:05:00.000Z'),
      },
    ],
    missedCallValidation,
  });
  const proofBundle = buildAdminOperationalProofs({
    ownerConnected: true,
    ownerEmail: 'owner@acme.com',
    ownerPhone: '+15551230000',
    messagingServiceReady: true,
    numberAssigned: true,
    testSmsTruth,
    missedCallValidation,
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
    provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
    canSafelyMarkLive: true,
    blockers: [],
    events: [],
  });

  const panels = buildAdminSetupPanels({
    business: {
      name: 'Acme Plumbing',
      forwardingNumber: '+15557654321',
      notifyPhone: '+15551230000',
      twilioAccountMode: TwilioAccountMode.MAIN_ACCOUNT,
      messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: 'MG1234567890abcdef1234567890abcd',
      twilioPrimaryPhoneNumber: '+15551230000',
      twilioPhoneNumber: '+15551230000',
      twilioPrimaryNumberSid: 'PN1234567890abcdef1234567890abcd',
      twilioPhoneNumberSid: 'PN1234567890abcdef1234567890abcd',
      twilioWebhookSyncedAt: new Date('2026-04-21T12:00:00.000Z'),
      messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pFailureReason: null,
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      a2pApprovedAt: new Date('2026-04-21T12:00:00.000Z'),
      tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_STARTED,
      tollFreeVerificationSid: null,
      tollFreeVerificationNote: null,
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
    testSmsTruth,
    onboardingConfidence,
    missedCallValidation,
    goLiveDecision: proofBundle.goLiveDecision,
    proofs: proofBundle.proofs,
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
