import assert from 'node:assert/strict';
import test from 'node:test';

import { MessagingComplianceType } from '@prisma/client';

import {
  getMessagingComplianceSidValidationError,
  getOptionalTwilioSidError,
  normalizeOptionalSid,
} from '../lib/twilio-compliance.ts';

test('toll-free compliance accepts BU verification SIDs without A2P identifiers', () => {
  const error = getMessagingComplianceSidValidationError({
    messagingComplianceType: MessagingComplianceType.TOLL_FREE,
    a2pCustomerProfileSid: null,
    a2pBrandSid: null,
    a2pCampaignSid: null,
    tollFreeVerificationSid: 'BUd2b9b67869f08c15f570d9f81d920dad',
  });

  assert.equal(error, null);
});

test('toll-free compliance ignores missing brand and campaign SIDs', () => {
  const error = getMessagingComplianceSidValidationError({
    messagingComplianceType: MessagingComplianceType.TOLL_FREE,
    a2pCustomerProfileSid: null,
    a2pBrandSid: null,
    a2pCampaignSid: null,
    tollFreeVerificationSid: null,
  });

  assert.equal(error, null);
});

test('invalid toll-free verification SIDs return a friendly validation error', () => {
  const error = getMessagingComplianceSidValidationError({
    messagingComplianceType: MessagingComplianceType.TOLL_FREE,
    a2pCustomerProfileSid: null,
    a2pBrandSid: null,
    a2pCampaignSid: null,
    tollFreeVerificationSid: 'QE-not-a-toll-free-sid',
  });

  assert.equal(error, 'Toll-free verification SID must be a valid Twilio SID starting with BU.');
});

test('local A2P compliance still validates the expected SID families', () => {
  const error = getMessagingComplianceSidValidationError({
    messagingComplianceType: MessagingComplianceType.LOCAL_A2P,
    a2pCustomerProfileSid: 'BUd2b9b67869f08c15f570d9f81d920dad',
    a2pBrandSid: 'not-a-brand-sid',
    a2pCampaignSid: null,
    tollFreeVerificationSid: null,
  });

  assert.equal(error, 'A2P brand SID must be a valid Twilio SID starting with BN.');
});

test('shared helpers keep generic Twilio SID validation strict', () => {
  assert.equal(getOptionalTwilioSidError('PN123', 'PN', 'Twilio number SID'), 'Twilio number SID must be a valid Twilio SID starting with PN.');
  assert.equal(getOptionalTwilioSidError('PNd2b9b67869f08c15f570d9f81d920dad', 'PN', 'Twilio number SID'), null);
  assert.equal(normalizeOptionalSid('   '), null);
});
