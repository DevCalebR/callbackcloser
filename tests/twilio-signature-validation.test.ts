import assert from 'node:assert/strict';
import test from 'node:test';
import twilio from 'twilio';

import { hasValidTwilioWebhookRequest } from '../lib/twilio-webhook.ts';

async function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T> | T) {
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
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('accepts valid X-Twilio-Signature when signature validation is enabled', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: undefined,
    },
    async () => {
      const url = 'https://example.com/api/twilio/status';
      const params = {
        CallSid: 'CA123',
        DialCallStatus: 'completed',
        From: '+15551230000',
        To: '+15557654321',
      };
      const signature = twilio.getExpectedTwilioSignature('twilio-auth-token', url, params);
      const request = new Request(url, { headers: { 'x-twilio-signature': signature } });
      assert.equal(await hasValidTwilioWebhookRequest(request, params), true);
    }
  );
});

test('rejects invalid X-Twilio-Signature when signature validation is enabled', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: 'shared-fallback-token',
    },
    async () => {
      const url = 'https://example.com/api/twilio/voice?webhook_token=shared-fallback-token';
      const params = { CallSid: 'CA999', From: '+15550000000', To: '+15551111111' };
      const request = new Request(url, { headers: { 'x-twilio-signature': 'bad-signature' } });
      assert.equal(await hasValidTwilioWebhookRequest(request, params), false);
    }
  );
});

test('falls back to shared token in non-production when signature validation is enabled', async () => {
  await withEnv(
    {
      NODE_ENV: 'development',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: 'dev-shared-token',
    },
    async () => {
      const params = { MessageSid: 'SM123', From: '+15551230000', To: '+15557654321' };
      const request = new Request('https://example.com/api/twilio/sms?webhook_token=dev-shared-token');
      assert.equal(await hasValidTwilioWebhookRequest(request, params), true);
    }
  );
});

test('rejects shared-token auth mode in production when signature validation is disabled', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'false',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: 'prod-token',
    },
    async () => {
      const params = { MessageSid: 'SM321', From: '+15551230000', To: '+15557654321' };
      const request = new Request('https://example.com/api/twilio/sms?webhook_token=prod-token');
      assert.equal(await hasValidTwilioWebhookRequest(request, params), false);
    }
  );
});

test('does not allow shared-token fallback in production when signature is missing', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_AUTH_TOKEN: 'twilio-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: 'prod-token',
    },
    async () => {
      const params = { CallSid: 'CA555', From: '+15550000000', To: '+15551111111' };
      const request = new Request('https://example.com/api/twilio/voice?webhook_token=prod-token');
      assert.equal(await hasValidTwilioWebhookRequest(request, params), false);
    }
  );
});

test('rejects the old shared-token fallback path for subaccount webhooks in production', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_ACCOUNT_SID: 'AC11111111111111111111111111111111',
      TWILIO_AUTH_TOKEN: 'parent-auth-token',
      TWILIO_WEBHOOK_AUTH_TOKEN: 'prod-token',
    },
    async () => {
      const params = {
        AccountSid: 'AC22222222222222222222222222222222',
        CallSid: 'CA555',
        From: '+15550000000',
        To: '+15551111111',
      };
      const request = new Request('https://example.com/api/twilio/voice?webhook_token=prod-token');
      assert.equal(await hasValidTwilioWebhookRequest(request, params, {
        resolveSubaccountAuthToken: async () => null,
      }), false);
    }
  );
});

test('accepts valid subaccount X-Twilio-Signature in production with subaccount auth token resolution', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_ACCOUNT_SID: 'AC11111111111111111111111111111111',
      TWILIO_AUTH_TOKEN: 'parent-auth-token',
    },
    async () => {
      const url = 'https://example.com/api/twilio/status';
      const params = {
        AccountSid: 'AC22222222222222222222222222222222',
        CallSid: 'CA555',
        DialCallStatus: 'no-answer',
        From: '+15550000000',
        To: '+15551111111',
      };
      const signature = twilio.getExpectedTwilioSignature('subaccount-auth-token', url, params);
      const request = new Request(url, { headers: { 'x-twilio-signature': signature } });

      assert.equal(await hasValidTwilioWebhookRequest(request, params, {
        resolveSubaccountAuthToken: async (accountSid) => {
          assert.equal(accountSid, params.AccountSid);
          return 'subaccount-auth-token';
        },
      }), true);
    }
  );
});
