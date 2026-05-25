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

import {
  buildAdminBusinessPickerLabel,
  buildAdminOnboardingConfidence,
  buildAdminBusinessEvents,
  buildAdminNextStep,
  canDeleteTestBusiness,
  getAdminTestSmsConfidenceState,
  getDeleteTestBusinessBlockedReason,
  matchesAdminBoardFilter,
} from '../lib/admin-dashboard.ts';

function createBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: 'biz_123',
    name: 'Acme Plumbing',
    ownerClerkId: 'user_123',
    ownerName: 'Casey Owner',
    ownerInviteSentAt: null,
    isTestBusiness: false,
    archivedAt: null,
    forwardingNumber: '+15557654321',
    notifyPhone: '+15551234567',
    provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
    provisioningLastRunAt: new Date('2026-04-15T00:00:00.000Z'),
    provisioningError: null,
    twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
    messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
    twilioNumberSetupMode: TwilioNumberSetupMode.NEW_NUMBER,
    twilioSubaccountSid: 'AC_TEST_SUBACCOUNT',
    twilioMessagingServiceSid: 'MG_TEST_SERVICE',
    twilioPrimaryNumberSid: 'PN_TEST_PRIMARY',
    twilioPhoneNumberSid: 'PN_TEST_PRIMARY',
    twilioPrimaryPhoneNumber: '+15550001111',
    twilioPhoneNumber: '+15550001111',
    twilioWebhookSyncedAt: new Date('2026-04-15T00:00:00.000Z'),
    messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
    managedTwilioStatus: ManagedTwilioStatus.CAMPAIGN_SUBMITTED,
    a2pCustomerProfileSid: 'BU_TEST_PROFILE',
    a2pBrandSid: 'BN_TEST_BRAND',
    a2pCampaignSid: 'QE_TEST_CAMPAIGN',
    a2pFailureReason: null,
    a2pApprovedAt: null,
    tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_STARTED,
    tollFreeVerificationSid: null,
    tollFreeVerificationNote: null,
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    stripePriceId: 'price_callbackcloser_pro',
    updatedAt: new Date('2026-04-15T00:00:00.000Z'),
    ...overrides,
  };
}

function createNotificationSettings(overrides: Record<string, unknown> = {}) {
  return {
    ownerPhone: '+15551234567',
    ownerEmail: 'owner@example.com',
    notifySms: true,
    notifyEmail: true,
    notifyInApp: true,
    urgentOnly: false,
    ...overrides,
  };
}

test('next-step guidance calls out webhook recovery and live health clearly', () => {
  const webhookMissing = buildAdminNextStep({
    business: createBusiness({ twilioWebhookSyncedAt: null, managedTwilioStatus: ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
  });

  assert.equal(webhookMissing.title, 'Webhook sync is missing');
  assert.match(webhookMissing.detail, /status callback URLs/i);

  const healthy = buildAdminNextStep({
    business: createBusiness({
      provisioningStatus: BusinessProvisioningStatus.LIVE,
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      a2pApprovedAt: new Date('2026-04-15T00:00:00.000Z'),
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
  });

  assert.equal(healthy.title, 'Business is live and healthy');
  assert.equal(healthy.tone, 'healthy');
});

test('next-step guidance stays explicit for owner setup and pending A2P review', () => {
  const missingOwnerContact = buildAdminNextStep({
    business: createBusiness({
      notifyPhone: null,
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: null,
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumber: null,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
    }),
    notificationSettings: createNotificationSettings({
      ownerPhone: null,
      ownerEmail: '',
    }),
    ownerConnected: false,
  });

  assert.equal(missingOwnerContact.title, 'Owner contact info is missing');
  assert.equal(missingOwnerContact.actionLabel, 'Save owner contact info');

  const invitedOwner = buildAdminNextStep({
    business: createBusiness({
      ownerInviteSentAt: new Date('2026-04-16T00:00:00.000Z'),
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: null,
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumber: null,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: false,
  });

  assert.equal(invitedOwner.title, 'Owner invitation is still pending');
  assert.equal(invitedOwner.actionLabel, 'Review owner setup');

  const pendingA2p = buildAdminNextStep({
    business: createBusiness({
      managedTwilioStatus: ManagedTwilioStatus.CAMPAIGN_SUBMITTED,
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
  });

  assert.equal(pendingA2p.title, 'A2P campaign still pending');
  assert.equal(pendingA2p.tone, 'pending');
});

test('next-step guidance supports toll-free verification and unknown number type', () => {
  const unknownType = buildAdminNextStep({
    business: createBusiness({
      messagingComplianceType: MessagingComplianceType.UNKNOWN,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
  });

  assert.equal(unknownType.title, 'Number type still needs selection');

  const pendingTollFree = buildAdminNextStep({
    business: createBusiness({
      twilioAccountMode: TwilioAccountMode.MAIN_ACCOUNT,
      twilioSubaccountSid: null,
      messagingComplianceType: MessagingComplianceType.TOLL_FREE_VERIFICATION,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      tollFreeVerificationStatus: TollFreeVerificationStatus.PENDING,
      tollFreeVerificationSid: 'BUd2b9b67869f08c15f570d9f81d920dad',
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
  });

  assert.equal(pendingTollFree.title, 'Toll-free verification still pending');
  assert.equal(pendingTollFree.tone, 'pending');
});

test('board filters and delete guard stay conservative', () => {
  const pausedTestBusiness = createBusiness({
    isTestBusiness: true,
    archivedAt: new Date('2026-04-16T00:00:00.000Z'),
    provisioningStatus: BusinessProvisioningStatus.PAUSED,
  });

  assert.equal(canDeleteTestBusiness(pausedTestBusiness), true);
  assert.equal(
    matchesAdminBoardFilter(pausedTestBusiness, createNotificationSettings(), true, 'archived'),
    true
  );
  assert.equal(
    matchesAdminBoardFilter(createBusiness(), createNotificationSettings(), true, 'pending_a2p'),
    true
  );
  assert.equal(
    canDeleteTestBusiness(createBusiness({ isTestBusiness: false, archivedAt: new Date('2026-04-16T00:00:00.000Z') })),
    false
  );
  assert.equal(
    getDeleteTestBusinessBlockedReason(createBusiness({ isTestBusiness: false, archivedAt: new Date('2026-04-16T00:00:00.000Z') })),
    'Only demo/test businesses can be deleted. Archive this business instead.'
  );
  assert.equal(
    getDeleteTestBusinessBlockedReason(createBusiness({ isTestBusiness: true })),
    'Archive this business instead. Permanent delete only unlocks after archive.'
  );
});

test('business picker labels keep the name primary and add a fast secondary identifier', () => {
  const labelWithEmail = buildAdminBusinessPickerLabel({
    business: createBusiness({
      name: 'Search HVAC',
    }),
    notificationSettings: createNotificationSettings({
      ownerEmail: 'owner@example.com',
    }),
  });

  const labelWithFallbackId = buildAdminBusinessPickerLabel({
    business: createBusiness({
      id: 'biz_picker_123456',
      name: 'Fallback Electric',
      twilioPhoneNumber: null,
      twilioPrimaryPhoneNumber: null,
      isTestBusiness: true,
      archivedAt: new Date('2026-04-16T00:00:00.000Z'),
    }),
    notificationSettings: createNotificationSettings({
      ownerEmail: '',
    }),
  });

  assert.equal(labelWithEmail, 'Search HVAC - owner@example.com');
  assert.equal(labelWithFallbackId, 'Fallback Electric - ID 123456 (test, archived)');
});

test('recent event synthesis prioritizes provisioning failures and owner alert failures', () => {
  const events = buildAdminBusinessEvents({
    business: createBusiness({
      provisioningError: 'Messaging service missing after attach.',
      provisioningLastRunAt: new Date('2026-04-17T10:00:00.000Z'),
      twilioWebhookSyncedAt: null,
    }),
    messages: [
      {
        id: 'msg_1',
        leadId: 'lead_1',
        participant: 'LEAD',
        direction: 'OUTBOUND',
        status: 'failed',
        body: 'CallbackCloser: We missed your call.',
        createdAt: new Date('2026-04-17T09:58:00.000Z'),
      },
    ],
    ownerNotifications: [
      {
        id: 'notify_1',
        channel: 'SMS',
        status: 'FAILED',
        error: 'Owner SMS failed',
        createdAt: new Date('2026-04-17T09:59:00.000Z'),
        destination: '+15551234567',
      },
    ],
    leads: [],
    calls: [],
  });

  assert.equal(events[0]?.label, 'Provisioning');
  assert.equal(events.some((event) => event.label === 'Owner sms alert' && event.severity === 'error'), true);
  assert.equal(events.some((event) => event.label === 'Lead SMS' && event.severity === 'error'), true);
});

test('onboarding confidence distinguishes ready-for-test from ready-for-live', () => {
  const readyForTest = buildAdminOnboardingConfidence({
    business: createBusiness({
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      a2pApprovedAt: new Date('2026-04-17T00:00:00.000Z'),
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 0,
    operatorEvents: [],
  });

  assert.equal(readyForTest.state, 'ready_for_test');
  assert.equal(readyForTest.readyForTest, true);
  assert.equal(readyForTest.canSafelyMarkLive, false);
  assert.match(readyForTest.nextAction, /test/i);

  const readyForLive = buildAdminOnboardingConfidence({
    business: createBusiness({
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      a2pApprovedAt: new Date('2026-04-17T00:00:00.000Z'),
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 1,
    operatorEvents: [
      {
        type: 'admin.test_sms_delivered',
        status: OperatorEventStatus.SUCCESS,
        createdAt: new Date('2026-04-17T12:00:00.000Z'),
      },
    ],
    missedCallValidation: {
      countsAsLaunchProof: true,
      detail: 'Recent event sequence proves the missed-call flow reached the owner alert path.',
    },
  });

  assert.equal(readyForLive.state, 'ready_to_go_live');
  assert.equal(readyForLive.canSafelyMarkLive, true);
  assert.equal(readyForLive.readinessLabel, 'Ready for live');
});

test('onboarding confidence does not overstate webhook or missed-call proof when explicit truth is missing', () => {
  const confidence = buildAdminOnboardingConfidence({
    business: createBusiness({
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      a2pApprovedAt: new Date('2026-04-17T00:00:00.000Z'),
      twilioWebhookSyncedAt: new Date('2026-04-17T00:00:00.000Z'),
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 4,
    operatorEvents: [
      {
        type: 'admin.test_sms_delivered',
        status: OperatorEventStatus.SUCCESS,
        createdAt: new Date('2026-04-17T12:00:00.000Z'),
      },
    ],
    webhookSnapshot: {
      currentVoiceUrl: 'https://wrong.example.com/voice',
      currentSmsUrl: 'https://app.callbackcloser.com/api/twilio/sms',
      currentStatusUrl: 'https://app.callbackcloser.com/api/twilio/message-status',
      expectedVoiceUrl: 'https://app.callbackcloser.com/api/twilio/voice',
      expectedSmsUrl: 'https://app.callbackcloser.com/api/twilio/sms',
      expectedStatusUrl: 'https://app.callbackcloser.com/api/twilio/message-status',
      voiceSynced: false,
      smsSynced: true,
      statusSynced: true,
      error: null,
    },
    missedCallValidation: {
      countsAsLaunchProof: false,
      detail: 'Historical lead activity exists, but explicit missed-call proof is still missing.',
    },
  });

  assert.equal(confidence.readyForTest, false);
  assert.equal(confidence.canSafelyMarkLive, false);
  assert.equal(confidence.state, 'in_setup');
  assert.match(confidence.milestones.find((item) => item.key === 'webhooks')?.detail || '', /re-sync/i);
  assert.match(confidence.milestones.find((item) => item.key === 'missed_call_validation')?.detail || '', /explicit/i);
});

test('admin test SMS confidence waits for delivery confirmation', () => {
  assert.equal(
    getAdminTestSmsConfidenceState([
      {
        type: 'admin.test_sms_accepted',
        status: OperatorEventStatus.SUCCESS,
        createdAt: new Date('2026-04-17T12:00:00.000Z'),
      },
    ]),
    'pending_delivery'
  );

  assert.equal(
    getAdminTestSmsConfidenceState([
      {
        type: 'admin.test_sms_accepted',
        status: OperatorEventStatus.SUCCESS,
        createdAt: new Date('2026-04-17T12:00:00.000Z'),
      },
      {
        type: 'admin.test_sms_delivered',
        status: OperatorEventStatus.SUCCESS,
        createdAt: new Date('2026-04-17T12:01:00.000Z'),
      },
    ]),
    'delivered'
  );

  assert.equal(
    getAdminTestSmsConfidenceState([
      {
        type: 'admin.test_sms_delivered',
        status: OperatorEventStatus.SUCCESS,
        createdAt: new Date('2026-04-17T12:00:00.000Z'),
      },
      {
        type: 'admin.test_sms_delivery_failed',
        status: OperatorEventStatus.FAILED,
        createdAt: new Date('2026-04-17T12:02:00.000Z'),
      },
    ]),
    'failed'
  );
});

test('onboarding confidence stays honest when A2P is pending or live has warnings', () => {
  const waitingOnA2p = buildAdminOnboardingConfidence({
    business: createBusiness({
      managedTwilioStatus: ManagedTwilioStatus.CAMPAIGN_SUBMITTED,
      a2pApprovedAt: null,
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 0,
    operatorEvents: [],
  });

  assert.equal(waitingOnA2p.state, 'waiting_on_a2p');
  assert.equal(waitingOnA2p.readinessLabel, 'Waiting on external approval');

  const liveWithWarnings = buildAdminOnboardingConfidence({
    business: createBusiness({
      provisioningStatus: BusinessProvisioningStatus.LIVE,
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      a2pApprovedAt: new Date('2026-04-17T00:00:00.000Z'),
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 0,
    operatorEvents: [
      {
        type: 'admin.test_sms_failed',
        status: OperatorEventStatus.FAILED,
        createdAt: new Date('2026-04-17T12:00:00.000Z'),
      },
    ],
  });

  assert.equal(liveWithWarnings.state, 'live_with_warnings');
  assert.equal(liveWithWarnings.canSafelyMarkLive, false);
  assert.equal(liveWithWarnings.readinessLabel, 'Live with warnings');
});

test('toll-free businesses can reach ready-for-live without A2P metadata', () => {
  const confidence = buildAdminOnboardingConfidence({
    business: createBusiness({
      twilioAccountMode: TwilioAccountMode.MAIN_ACCOUNT,
      twilioSubaccountSid: null,
      messagingComplianceType: MessagingComplianceType.TOLL_FREE_VERIFICATION,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pApprovedAt: null,
      tollFreeVerificationStatus: TollFreeVerificationStatus.APPROVED,
      tollFreeVerificationSid: 'BUd2b9b67869f08c15f570d9f81d920dad',
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 1,
    operatorEvents: [
      {
        type: 'admin.test_sms_delivered',
        status: OperatorEventStatus.SUCCESS,
        createdAt: new Date('2026-04-17T12:00:00.000Z'),
      },
    ],
    missedCallValidation: {
      countsAsLaunchProof: true,
      detail: 'Recent event sequence proves the missed-call flow reached the owner alert path.',
    },
  });

  assert.equal(confidence.state, 'ready_to_go_live');
  assert.equal(confidence.canSafelyMarkLive, true);
});

test('historical warning events do not keep a clean live business in live-with-warnings', () => {
  const cleanLive = buildAdminOnboardingConfidence({
    business: createBusiness({
      provisioningStatus: BusinessProvisioningStatus.LIVE,
      managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
      a2pApprovedAt: new Date('2026-04-17T00:00:00.000Z'),
    }),
    notificationSettings: createNotificationSettings(),
    ownerConnected: true,
    successfulLeadCount: 2,
    operatorEvents: [
      {
        type: 'owner_alert.email_skipped',
        status: OperatorEventStatus.WARNING,
        createdAt: new Date('2026-04-15T12:00:00.000Z'),
      },
      {
        type: 'admin.test_sms_delivered',
        status: OperatorEventStatus.SUCCESS,
        createdAt: new Date('2026-04-17T12:00:00.000Z'),
      },
    ],
    missedCallValidation: {
      countsAsLaunchProof: true,
      detail: 'Recent event sequence proves the missed-call flow reached the owner alert path.',
    },
  });

  assert.equal(cleanLive.state, 'live');
  assert.equal(cleanLive.blockers.length, 0);
});
