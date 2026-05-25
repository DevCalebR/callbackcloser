import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

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

async function loadTwilioRoutes() {
  const require = createRequire(import.meta.url);
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as NodeJS.Module;

  return Promise.all([
    import('../app/api/twilio/voice/route.ts'),
    import('../app/api/twilio/status/route.ts'),
    import('../app/api/twilio/sms/route.ts'),
    import('../app/api/twilio/message-status/route.ts'),
  ]);
}

test('twilio webhook routes reject unsigned requests in production', async () => {
  await withEnv(
    {
      NODE_ENV: 'production',
      TWILIO_VALIDATE_SIGNATURE: 'true',
      TWILIO_AUTH_TOKEN: 'twilio_auth_token_fixture',
      TWILIO_WEBHOOK_AUTH_TOKEN: undefined,
    },
    async () => {
      const [
        { POST: voicePost },
        { POST: statusPost },
        { POST: smsPost },
        { POST: messageStatusPost },
      ] = await loadTwilioRoutes();

      const requests = [
        voicePost(
          new Request('https://app.callbackcloser.com/api/twilio/voice', {
            method: 'POST',
            body: new FormData(),
          })
        ),
        statusPost(
          new Request('https://app.callbackcloser.com/api/twilio/status', {
            method: 'POST',
            body: new FormData(),
          })
        ),
        smsPost(
          new Request('https://app.callbackcloser.com/api/twilio/sms', {
            method: 'POST',
            body: new FormData(),
          })
        ),
        messageStatusPost(
          new Request('https://app.callbackcloser.com/api/twilio/message-status', {
            method: 'POST',
            body: new FormData(),
          })
        ),
      ];

      const responses = await Promise.all(requests);
      for (const response of responses) {
        assert.equal(response.status, 401);
      }
    }
  );
});

test('stripe webhook rejects missing configuration and invalid signatures', async () => {
  const { POST } = await import('../app/api/stripe/webhook/route.ts');

  await withEnv(
    {
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
    },
    async () => {
      const response = await POST(
        new Request('https://app.callbackcloser.com/api/stripe/webhook', {
          method: 'POST',
          body: '{}',
        })
      );

      assert.equal(response.status, 400);
      assert.match(await response.text(), /Missing Stripe webhook configuration/);
    }
  );

  await withEnv(
    {
      STRIPE_SECRET_KEY: 'sk_test_fixture_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_fixture_123',
    },
    async () => {
      const response = await POST(
        new Request('https://app.callbackcloser.com/api/stripe/webhook', {
          method: 'POST',
          body: JSON.stringify({ id: 'evt_test' }),
          headers: {
            'content-type': 'application/json',
            'stripe-signature': 'bad-signature',
          },
        })
      );

      assert.equal(response.status, 400);
      assert.match(await response.text(), /Invalid webhook signature|No signatures found matching the expected signature|Unable to extract timestamp and signatures from header/i);
    }
  );
});
