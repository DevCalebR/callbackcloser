import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consumeRateLimit,
  getClientIpAddress,
  getRateLimitNumber,
  resetRateLimitStore,
} from '../lib/rate-limit.ts';

test('consumeRateLimit blocks once limit is exceeded and resets after window', () => {
  resetRateLimitStore();

  const first = consumeRateLimit({
    key: 'twilio:test:127.0.0.1',
    limit: 2,
    windowMs: 10_000,
    nowMs: 1_000,
  });
  const second = consumeRateLimit({
    key: 'twilio:test:127.0.0.1',
    limit: 2,
    windowMs: 10_000,
    nowMs: 1_100,
  });
  const blocked = consumeRateLimit({
    key: 'twilio:test:127.0.0.1',
    limit: 2,
    windowMs: 10_000,
    nowMs: 1_200,
  });
  const afterWindow = consumeRateLimit({
    key: 'twilio:test:127.0.0.1',
    limit: 2,
    windowMs: 10_000,
    nowMs: 11_500,
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds > 0, true);
  assert.equal(afterWindow.allowed, true);
});

test('getClientIpAddress prefers x-forwarded-for first value', () => {
  const request = new Request('https://example.com', {
    headers: {
      'x-forwarded-for': '203.0.113.1, 198.51.100.2',
      'x-real-ip': '198.51.100.20',
    },
  });

  assert.equal(getClientIpAddress(request), '203.0.113.1');
});

test('getRateLimitNumber uses fallback for invalid env input', () => {
  const env = {
    RATE_LIMIT_TWILIO_AUTH_MAX: 'bad',
  };

  assert.equal(
    getRateLimitNumber('RATE_LIMIT_TWILIO_AUTH_MAX', 240, { env }),
    240
  );
});
