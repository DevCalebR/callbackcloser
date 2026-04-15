import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTwilioIncomingPhoneNumberWebhookUpdate } from '../lib/twilio-webhook-update.ts';

const webhookConfig = {
  appBaseUrl: 'https://callbackcloser.com',
  voiceUrl: 'https://callbackcloser.com/api/twilio/voice?webhook_token=secret',
  smsUrl: 'https://callbackcloser.com/api/twilio/sms?webhook_token=secret',
  statusUrl: 'https://callbackcloser.com/api/twilio/status?webhook_token=secret',
};

test('webhook update builder syncs all webhook targets by default', () => {
  const update = buildTwilioIncomingPhoneNumberWebhookUpdate(webhookConfig);

  assert.equal(update.voiceUrl, webhookConfig.voiceUrl);
  assert.equal(update.smsUrl, webhookConfig.smsUrl);
  assert.equal(update.statusCallback, webhookConfig.statusUrl);
});

test('webhook update builder can sync only voice or only sms/status targets', () => {
  const voiceOnly = buildTwilioIncomingPhoneNumberWebhookUpdate(webhookConfig, {
    voice: true,
    sms: false,
    status: false,
  });
  const smsOnly = buildTwilioIncomingPhoneNumberWebhookUpdate(webhookConfig, {
    voice: false,
    sms: true,
    status: false,
  });

  assert.equal(voiceOnly.voiceUrl, webhookConfig.voiceUrl);
  assert.equal('smsUrl' in voiceOnly, false);
  assert.equal('statusCallback' in voiceOnly, false);

  assert.equal('voiceUrl' in smsOnly, false);
  assert.equal(smsOnly.smsUrl, webhookConfig.smsUrl);
  assert.equal('statusCallback' in smsOnly, false);
});
