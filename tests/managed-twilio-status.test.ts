import assert from 'node:assert/strict';
import test from 'node:test';

import { ManagedTwilioStatus, SubscriptionStatus } from '@prisma/client';

import { getManagedTwilioStatusSummary, resolveManagedTwilioStatus } from '../lib/managed-twilio-status.ts';
import { getCustomerSystemStatus } from '../lib/system-status.ts';

function createManagedBusiness(
  overrides: Record<string, unknown> = {}
) {
  return {
    managedTwilioStatus: ManagedTwilioStatus.DRAFT,
    twilioSubaccountSid: null,
    twilioPrimaryPhoneNumber: null,
    twilioPhoneNumber: null,
    twilioPrimaryNumberSid: null,
    twilioPhoneNumberSid: null,
    twilioMessagingServiceSid: null,
    twilioWebhookSyncedAt: null,
    a2pFailureReason: null,
    a2pApprovedAt: null,
    a2pCampaignSid: null,
    a2pBrandSid: null,
    a2pCustomerProfileSid: null,
    subscriptionStatus: SubscriptionStatus.ACTIVE,
    forwardingNumber: '+15557654321',
    notifyPhone: '+15551234567',
    ...overrides,
  };
}

test('managed Twilio summary stays pending until A2P approval is complete', () => {
  const summary = getManagedTwilioStatusSummary(
    createManagedBusiness({
      managedTwilioStatus: ManagedTwilioStatus.AWAITING_BUSINESS_VERIFICATION,
      twilioSubaccountSid: 'AC123',
      twilioPrimaryPhoneNumber: '+15550001111',
      twilioPhoneNumber: '+15550001111',
      twilioPrimaryNumberSid: 'PN123',
      twilioPhoneNumberSid: 'PN123',
      twilioMessagingServiceSid: 'MG123',
      twilioWebhookSyncedAt: new Date('2026-04-16T12:00:00.000Z'),
    })
  );

  assert.equal(summary.onboardingReady, true);
  assert.equal(summary.complianceReady, false);
  assert.equal(summary.messagingReady, false);
  assert.match(summary.nextStep, /A2P|business details|brand/i);
});

test('approved status still does not read live when webhook sync is missing', () => {
  const business = createManagedBusiness({
    managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
    twilioSubaccountSid: 'AC123',
    twilioPrimaryPhoneNumber: '+15550001111',
    twilioPhoneNumber: '+15550001111',
    twilioPrimaryNumberSid: 'PN123',
    twilioPhoneNumberSid: 'PN123',
    twilioMessagingServiceSid: 'MG123',
    a2pApprovedAt: new Date('2026-04-16T12:00:00.000Z'),
    twilioWebhookSyncedAt: null,
  });

  const summary = getManagedTwilioStatusSummary(business);
  const customerStatus = getCustomerSystemStatus(business, 1);

  assert.equal(summary.complianceReady, true);
  assert.equal(summary.onboardingReady, false);
  assert.equal(summary.messagingReady, false);
  assert.equal(customerStatus.key, 'activating');
});

test('approved, synced setup becomes live once a successful lead exists', () => {
  const business = createManagedBusiness({
    managedTwilioStatus: ManagedTwilioStatus.COMPLIANT_LIVE,
    twilioSubaccountSid: 'AC123',
    twilioPrimaryPhoneNumber: '+15550001111',
    twilioPhoneNumber: '+15550001111',
    twilioPrimaryNumberSid: 'PN123',
    twilioPhoneNumberSid: 'PN123',
    twilioMessagingServiceSid: 'MG123',
    twilioWebhookSyncedAt: new Date('2026-04-16T12:00:00.000Z'),
    a2pApprovedAt: new Date('2026-04-16T12:00:00.000Z'),
  });

  const summary = getManagedTwilioStatusSummary(business);
  const customerStatus = getCustomerSystemStatus(business, 1);

  assert.equal(summary.messagingReady, true);
  assert.equal(customerStatus.key, 'live');
});

test('resolveManagedTwilioStatus maps brand and campaign milestones explicitly', () => {
  assert.equal(
    resolveManagedTwilioStatus(
      createManagedBusiness({
        twilioSubaccountSid: 'AC123',
        twilioPrimaryPhoneNumber: '+15550001111',
        twilioPhoneNumber: '+15550001111',
        twilioPrimaryNumberSid: 'PN123',
        twilioPhoneNumberSid: 'PN123',
        twilioMessagingServiceSid: 'MG123',
        a2pBrandSid: 'BN123',
      })
    ),
    ManagedTwilioStatus.BRAND_SUBMITTED
  );

  assert.equal(
    resolveManagedTwilioStatus(
      createManagedBusiness({
        twilioSubaccountSid: 'AC123',
        twilioPrimaryPhoneNumber: '+15550001111',
        twilioPhoneNumber: '+15550001111',
        twilioPrimaryNumberSid: 'PN123',
        twilioPhoneNumberSid: 'PN123',
        twilioMessagingServiceSid: 'MG123',
        a2pCampaignSid: 'QE123',
      })
    ),
    ManagedTwilioStatus.CAMPAIGN_SUBMITTED
  );
});

test('failed review produces an attention-required summary', () => {
  const summary = getManagedTwilioStatusSummary(
    createManagedBusiness({
      managedTwilioStatus: ManagedTwilioStatus.FAILED_REVIEW,
      a2pFailureReason: 'Campaign rejected because the website does not match the submitted business profile.',
    })
  );

  assert.equal(summary.attentionRequired, true);
  assert.equal(summary.blockers.some((blocker) => blocker.key === 'compliance_rejected'), true);
  assert.match(summary.description, /rejected|website/i);
});
