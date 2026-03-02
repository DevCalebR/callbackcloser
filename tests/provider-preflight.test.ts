import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runClerkPreflight,
  runDatabasePreflight,
  runProviderPreflight,
  runStripePreflight,
  runTwilioPreflight,
} from '../lib/provider-preflight.ts';

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NEXT_PUBLIC_APP_URL: 'https://callbackcloser.example.com',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_abc123',
    CLERK_SECRET_KEY: 'sk_test_abc123',
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: '/sign-in',
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: '/sign-up',
    STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
    TWILIO_WEBHOOK_AUTH_TOKEN: 'token_abc123',
    NODE_ENV: 'development',
    ...overrides,
  };
}

test('runClerkPreflight passes for same-origin auth URLs', () => {
  const check = runClerkPreflight(baseEnv());
  assert.equal(check.status, 'PASS');
});

test('runClerkPreflight fails when sign-in URL origin mismatches app URL', () => {
  const check = runClerkPreflight(
    baseEnv({
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: 'https://other.example.com/sign-in',
    })
  );

  assert.equal(check.status, 'FAIL');
  assert.ok(check.details.some((detail) => detail.includes('NEXT_PUBLIC_CLERK_SIGN_IN_URL')));
});

test('runStripePreflight fails when webhook secret is missing', () => {
  const check = runStripePreflight(
    baseEnv({
      STRIPE_WEBHOOK_SECRET: '',
    })
  );

  assert.equal(check.status, 'FAIL');
  assert.ok(check.details.some((detail) => detail.includes('STRIPE_WEBHOOK_SECRET is missing')));
});

test('runTwilioPreflight fails when explicit configured URLs drift from NEXT_PUBLIC_APP_URL', () => {
  const check = runTwilioPreflight(
    baseEnv({
      TWILIO_WEBHOOK_VOICE_URL: 'https://mismatch.example.com/api/twilio/voice?webhook_token=token_abc123',
      TWILIO_WEBHOOK_SMS_URL: 'https://mismatch.example.com/api/twilio/sms?webhook_token=token_abc123',
      TWILIO_WEBHOOK_STATUS_URL: 'https://mismatch.example.com/api/twilio/status?webhook_token=token_abc123',
    })
  );

  assert.equal(check.status, 'FAIL');
  assert.ok(check.details.some((detail) => detail.includes('TWILIO_WEBHOOK_VOICE_URL does not match')));
});

test('runDatabasePreflight reports pass and fail outcomes', async () => {
  const passCheck = await runDatabasePreflight(async () => undefined);
  assert.equal(passCheck.status, 'PASS');

  const failCheck = await runDatabasePreflight(async () => {
    throw new Error('db down');
  });
  assert.equal(failCheck.status, 'FAIL');
  assert.ok(failCheck.details.some((detail) => detail.includes('db down')));
});

test('runProviderPreflight aggregates provider checks and exposes fail count', async () => {
  const report = await runProviderPreflight(async () => undefined, baseEnv());
  assert.equal(report.passed, true);
  assert.equal(report.failedCount, 0);

  const failedReport = await runProviderPreflight(
    async () => {
      throw new Error('db down');
    },
    baseEnv({
      STRIPE_WEBHOOK_SECRET: '',
    })
  );

  assert.equal(failedReport.passed, false);
  assert.equal(failedReport.failedCount, 2);
});
