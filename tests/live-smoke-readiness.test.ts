import assert from 'node:assert/strict';
import test from 'node:test';

import { getLiveSmokeReadiness } from '../lib/live-smoke-readiness.ts';

test('live smoke readiness passes when all blockers are satisfied', () => {
  const readiness = getLiveSmokeReadiness({
    demoModeEnabled: false,
    hasForwardingNumber: true,
    hasNotifyPhone: true,
    ownerNotifyPhoneOptedOut: false,
    hasActiveSubscription: true,
    conversationLimitReached: false,
    usageSummary: 'starter 1/200 used (199 remaining)',
    hasTwilioNumber: true,
    hasTwilioNumberSid: true,
    hasWebhookConfig: true,
    hasWebhookSync: true,
    hasTwilioAccountAccess: true,
    canVerifyAssignedTwilioNumber: true,
    hasAssignedTwilioNumberInAccount: true,
    webhookAppBaseUrl: 'https://callbackcloser.com',
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.blockers.length, 0);
  assert.equal(readiness.checks.every((check) => check.ready), true);
});

test('live smoke readiness blocks when billing is inactive', () => {
  const readiness = getLiveSmokeReadiness({
    demoModeEnabled: false,
    hasForwardingNumber: true,
    hasNotifyPhone: true,
    ownerNotifyPhoneOptedOut: false,
    hasActiveSubscription: false,
    hasTwilioNumber: true,
    hasTwilioNumberSid: true,
    hasWebhookConfig: true,
    hasWebhookSync: true,
    hasTwilioAccountAccess: true,
    canVerifyAssignedTwilioNumber: true,
    hasAssignedTwilioNumberInAccount: true,
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockers.some((check) => check.key === 'billing'), true);
  assert.match(readiness.blockers.find((check) => check.key === 'billing')?.detail || '', /billing_required/);
});

test('live smoke readiness blocks when assigned Twilio number cannot be verified in the account', () => {
  const readiness = getLiveSmokeReadiness({
    demoModeEnabled: false,
    hasForwardingNumber: true,
    hasNotifyPhone: true,
    ownerNotifyPhoneOptedOut: false,
    hasActiveSubscription: true,
    conversationLimitReached: false,
    hasTwilioNumber: true,
    hasTwilioNumberSid: true,
    hasWebhookConfig: true,
    hasWebhookSync: true,
    hasTwilioAccountAccess: true,
    canVerifyAssignedTwilioNumber: true,
    hasAssignedTwilioNumberInAccount: false,
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockers.some((check) => check.key === 'twilio_number'), true);
  assert.match(readiness.blockers.find((check) => check.key === 'twilio_number')?.detail || '', /not found in the current Twilio account list/);
});

test('live smoke readiness blocks when demo mode is enabled', () => {
  const readiness = getLiveSmokeReadiness({
    demoModeEnabled: true,
    hasForwardingNumber: true,
    hasNotifyPhone: true,
    ownerNotifyPhoneOptedOut: false,
    hasActiveSubscription: true,
    conversationLimitReached: false,
    hasTwilioNumber: true,
    hasTwilioNumberSid: true,
    hasWebhookConfig: true,
    hasWebhookSync: true,
    hasTwilioAccountAccess: true,
    canVerifyAssignedTwilioNumber: true,
    hasAssignedTwilioNumberInAccount: true,
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockers.some((check) => check.key === 'demo_mode'), true);
  assert.match(readiness.blockers.find((check) => check.key === 'demo_mode')?.detail || '', /demo mode is enabled/i);
});

test('live smoke readiness blocks when owner notify phone has opted out or capacity is exhausted', () => {
  const readiness = getLiveSmokeReadiness({
    demoModeEnabled: false,
    hasForwardingNumber: true,
    hasNotifyPhone: true,
    ownerNotifyPhoneOptedOut: true,
    hasActiveSubscription: true,
    conversationLimitReached: true,
    usageSummary: 'starter 200/200 used (0 remaining)',
    hasTwilioNumber: true,
    hasTwilioNumberSid: true,
    hasWebhookConfig: true,
    hasWebhookSync: true,
    hasTwilioAccountAccess: true,
    canVerifyAssignedTwilioNumber: true,
    hasAssignedTwilioNumberInAccount: true,
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockers.some((check) => check.key === 'owner_notify_phone'), true);
  assert.equal(readiness.blockers.some((check) => check.key === 'conversation_capacity'), true);
  assert.match(readiness.blockers.find((check) => check.key === 'owner_notify_phone')?.detail || '', /Reply START/);
  assert.match(readiness.blockers.find((check) => check.key === 'conversation_capacity')?.detail || '', /monthly conversation limit has been reached/i);
});
