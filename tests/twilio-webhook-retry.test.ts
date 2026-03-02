import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTwilioRetryableErrorResponse } from '../lib/twilio-webhook-retry.ts';

test('status webhook retry responses are stable across replay attempts', async () => {
  const first = buildTwilioRetryableErrorResponse('status');
  const replay = buildTwilioRetryableErrorResponse('status');

  assert.equal(first.status, 503);
  assert.equal(replay.status, 503);

  assert.deepEqual(await first.json(), {
    error: 'Temporary webhook processing failure',
    retryable: true,
    route: 'status',
  });
  assert.deepEqual(await replay.json(), {
    error: 'Temporary webhook processing failure',
    retryable: true,
    route: 'status',
  });
});

test('sms webhook retry responses are stable across replay attempts', async () => {
  const first = buildTwilioRetryableErrorResponse('sms');
  const replay = buildTwilioRetryableErrorResponse('sms');

  assert.equal(first.status, 503);
  assert.equal(replay.status, 503);

  assert.deepEqual(await first.json(), {
    error: 'Temporary webhook processing failure',
    retryable: true,
    route: 'sms',
  });
  assert.deepEqual(await replay.json(), {
    error: 'Temporary webhook processing failure',
    retryable: true,
    route: 'sms',
  });
});
