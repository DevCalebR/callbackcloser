import assert from 'node:assert/strict';
import test from 'node:test';
import twilio from 'twilio';

import { hasValidTwilioWebhookRequest } from '../lib/twilio-webhook.ts';

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('accepts valid X-Twilio-Signature when signature validation is enabled', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: undefined,
    },
    () => {
      const url = 'https://example.com/api/twilio/status';
      const params = {
        CallSid: 'CA123',
        DialCallStatus: 'completed',
        From: '+15551230000',
        To: '+15557654321',
      };
      const signature = twilio.getExpectedTwilioSignature('twilio-auth-token', url, params);
      const request = new Request(url, { headers: { 'x-twilio-signature': signature } });
      assert.equal(hasValidTwilioWebhookRequest(request, params), true);
    }
  );
});

test('rejects invalid X-Twilio-Signature when signature validation is enabled', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: 'shared-fallback-token',
    },
    () => {
      const url = 'https://example.com/api/twilio/voice?webhook_token=shared-fallback-token';
      const params = { CallSid: 'CA999', From: '+15550000000', To: '+15551111111' };
      const request = new Request(url, { headers: { 'x-twilio-signature': 'bad-signature' } });
      assert.equal(hasValidTwilioWebhookRequest(request, params), false);
    }
  );
});

test('falls back to shared token in non-production when signature validation is enabled', () => {
  withEnv(
    {
      NODE_ENV: 'development',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: 'dev-shared-token',
    },
    () => {
      const params = { MessageSid: 'SM123', From: '+15551230000', To: '+15557654321' };
      const request = new Request('https://example.com/api/twilio/sms?webhook_token=dev-shared-token');
      assert.equal(hasValidTwilioWebhookRequest(request, params), true);
    }
  );
});

test('rejects shared-token auth mode in production when signature validation is disabled', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'false',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: 'prod-token',
    },
    () => {
      const params = { MessageSid: 'SM321', From: '+15551230000', To: '+15557654321' };
      const request = new Request('https://example.com/api/twilio/sms?webhook_token=prod-token');
      assert.equal(hasValidTwilioWebhookRequest(request, params), false);
    }
  );
});

test('does not allow shared-token fallback in production when signature is missing', () => {
  withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: 'prod-token',
    },
    () => {
      const params = { CallSid: 'CA555', From: '+15550000000', To: '+15551111111' };
      const request = new Request('https://example.com/api/twilio/voice?webhook_token=prod-token');
      assert.equal(hasValidTwilioWebhookRequest(request, params), false);
    }
  );
});
