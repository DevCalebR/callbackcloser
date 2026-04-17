import assert from 'node:assert/strict';
import test from 'node:test';

import { BusinessProvisioningStatus, ManagedTwilioStatus, SubscriptionStatus } from '@prisma/client';

import {
  buildAdminBusinessEvents,
  buildAdminNextStep,
  canDeleteTestBusiness,
  matchesAdminBoardFilter,
} from '../lib/admin-dashboard.ts';

function createBusiness(overrides: Record<string, unknown> = {}) {
  return {
    id: 'biz_123',
    name: 'Acme Plumbing',
    ownerClerkId: 'user_123',
    ownerName: 'Casey Owner',
    isTestBusiness: false,
    archivedAt: null,
    forwardingNumber: '+15557654321',
    notifyPhone: '+15551234567',
    provisioningStatus: BusinessProvisioningStatus.ONBOARDING,
    provisioningLastRunAt: new Date('2026-04-15T00:00:00.000Z'),
    provisioningError: null,
    twilioSubaccountSid: 'AC_TEST_SUBACCOUNT',
    twilioMessagingServiceSid: 'MG_TEST_SERVICE',
    twilioPrimaryNumberSid: 'PN_TEST_PRIMARY',
    twilioPhoneNumberSid: 'PN_TEST_PRIMARY',
    twilioPrimaryPhoneNumber: '+15550001111',
    twilioPhoneNumber: '+15550001111',
    twilioWebhookSyncedAt: new Date('2026-04-15T00:00:00.000Z'),
    managedTwilioStatus: ManagedTwilioStatus.CAMPAIGN_SUBMITTED,
    a2pCustomerProfileSid: 'BU_TEST_PROFILE',
    a2pBrandSid: 'BN_TEST_BRAND',
    a2pCampaignSid: 'QE_TEST_CAMPAIGN',
    a2pFailureReason: null,
    a2pApprovedAt: null,
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
