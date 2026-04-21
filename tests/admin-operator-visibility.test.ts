import assert from 'node:assert/strict';
import test from 'node:test';

import { OperatorEventCategory, OperatorEventStatus } from '@prisma/client';

import {
  buildAdminBusinessIssue,
  buildAdminTestSmsTruth,
  buildTwilioSetupUpdateEventMetadata,
} from '../lib/admin-operator-visibility.ts';

test('admin test SMS truth stays explicit across not-run, pending, delivered, and failed states', () => {
  assert.equal(buildAdminTestSmsTruth([]).state, 'not_run');

  assert.equal(
    buildAdminTestSmsTruth([
      {
        type: 'admin.test_sms_accepted',
        status: OperatorEventStatus.SUCCESS,
        summary: 'Test SMS accepted by Twilio',
        detailsJson: null,
        createdAt: new Date('2026-04-20T12:00:00.000Z'),
      },
    ]).state,
    'pending'
  );

  assert.equal(
    buildAdminTestSmsTruth([
      {
        type: 'admin.test_sms_delivered',
        status: OperatorEventStatus.SUCCESS,
        summary: 'Test SMS delivered',
        detailsJson: { messageStatus: 'delivered' },
        createdAt: new Date('2026-04-20T12:01:00.000Z'),
      },
    ]).state,
    'delivered'
  );

  const failed = buildAdminTestSmsTruth([
    {
      type: 'admin.test_sms_delivery_failed',
      status: OperatorEventStatus.FAILED,
      summary: 'Test SMS delivery failed',
      detailsJson: { errorMessage: 'Carrier rejected the destination.' },
      createdAt: new Date('2026-04-20T12:02:00.000Z'),
    },
  ]);

  assert.equal(failed.state, 'failed');
  assert.match(failed.detail, /Carrier rejected the destination/i);
});

test('admin business issue prefers the latest recorded issue and falls back to the current blocker', () => {
  const eventIssue = buildAdminBusinessIssue({
    events: [
      {
        type: 'webhooks.sync_failed',
        category: OperatorEventCategory.WEBHOOKS,
        status: OperatorEventStatus.FAILED,
        summary: 'Webhook sync failed',
        detailsJson: { error: 'Callback URL mismatch.' },
        createdAt: new Date('2026-04-20T12:02:00.000Z'),
      },
    ],
    currentStep: {
      stepKey: 'messaging_service_ready',
      title: 'Messaging Service missing',
      detail: 'Save or create a Messaging Service before sending live SMS.',
      tone: 'attention',
    },
  });

  assert.equal(eventIssue.summary, 'Webhook sync failed');
  assert.equal(eventIssue.eventType, 'webhooks.sync_failed');
  assert.equal(eventIssue.remediationStepKey, 'voice_webhook_synced');

  const statusIssue = buildAdminBusinessIssue({
    events: [
      {
        type: 'webhooks.sync_failed',
        category: OperatorEventCategory.WEBHOOKS,
        status: OperatorEventStatus.FAILED,
        summary: 'Webhook sync failed',
        detailsJson: { target: 'STATUS', error: 'Callback URL mismatch.' },
        createdAt: new Date('2026-04-20T12:03:00.000Z'),
      },
    ],
    currentStep: {
      stepKey: 'messaging_service_ready',
      title: 'Messaging Service missing',
      detail: 'Save or create a Messaging Service before sending live SMS.',
      tone: 'attention',
    },
  });

  assert.equal(statusIssue.remediationStepKey, 'status_callback_synced');

  const fallbackIssue = buildAdminBusinessIssue({
    events: [],
    currentStep: {
      stepKey: 'messaging_service_ready',
      title: 'Messaging Service missing',
      detail: 'Save or create a Messaging Service before sending live SMS.',
      tone: 'attention',
    },
  });

  assert.equal(fallbackIssue.summary, 'Messaging Service missing');
  assert.equal(fallbackIssue.remediationStepKey, 'messaging_service_ready');
});

test('twilio setup update metadata stays specific enough for future remediation panels', () => {
  const messagingServiceUpdate = buildTwilioSetupUpdateEventMetadata([
    { key: 'twilioMessagingServiceSid', label: 'Messaging Service SID' },
  ]);
  assert.equal(messagingServiceUpdate.primaryStepKey, 'messaging_service_ready');
  assert.equal(messagingServiceUpdate.summary, 'Messaging Service details updated');

  const mixedUpdate = buildTwilioSetupUpdateEventMetadata([
    { key: 'twilioAccountMode', label: 'Twilio account mode' },
    { key: 'twilioPhoneNumber', label: 'Twilio number' },
  ]);
  assert.deepEqual(mixedUpdate.stepKeys, ['account_mode', 'number_assigned']);
});
