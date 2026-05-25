import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeLogFields, sanitizeLogValue } from '../lib/log-sanitization.ts';

test('sanitizeLogFields redacts secrets, bodies, phones, and SIDs', () => {
  const sanitized = sanitizeLogFields({
    authToken: 'super-secret-token',
    body: 'Customer said their AC is out and needs help now.',
    fromPhone: '+15551234567',
    messageSid: 'SM1234567890abcdef1234567890abcdef',
    safeFlag: true,
  });

  assert.deepEqual(sanitized, {
    authToken: '[redacted]',
    body: '[redacted:49 chars]',
    fromPhone: '+1***4567',
    messageSid: 'SM12...cdef',
    safeFlag: true,
  });
});

test('sanitizeLogValue redacts embedded credentials and truncates deep payloads safely', () => {
  const sanitizedUrl = sanitizeLogValue(
    'Bearer supersecrettoken https://example.com/api/twilio/status?webhook_token=abc123',
    'details'
  );
  const nested = sanitizeLogValue({
    level1: {
      level2: {
        level3: {
          level4: 'too deep',
        },
      },
    },
  });

  assert.equal(sanitizedUrl, 'Bearer [redacted] https://example.com/api/twilio/status?webhook_token=[redacted]');
  assert.deepEqual(nested, {
    level1: {
      level2: {
        level3: '[truncated]',
      },
    },
  });
});
