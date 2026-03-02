import assert from 'node:assert/strict';
import test from 'node:test';

import { getCorrelationIdFromRequest, reportApplicationError, withCorrelationIdHeader } from '../lib/observability.ts';

test('getCorrelationIdFromRequest prefers explicit x-correlation-id header', () => {
  const request = new Request('https://example.com', {
    headers: {
      'x-correlation-id': 'corr-explicit-123',
      'x-request-id': 'req-fallback-456',
    },
  });

  assert.equal(getCorrelationIdFromRequest(request), 'corr-explicit-123');
});

test('getCorrelationIdFromRequest falls back to x-request-id when needed', () => {
  const request = new Request('https://example.com', {
    headers: {
      'x-request-id': 'req-fallback-456',
    },
  });

  assert.equal(getCorrelationIdFromRequest(request), 'req-fallback-456');
});

test('withCorrelationIdHeader sets response header', () => {
  const response = withCorrelationIdHeader(new Response('ok'), 'corr-abc');
  assert.equal(response.headers.get('x-correlation-id'), 'corr-abc');
});

test('reportApplicationError is safe when alerts are disabled', () => {
  reportApplicationError({
    source: 'test.route',
    event: 'synthetic_error',
    correlationId: 'corr-test',
    error: new Error('boom'),
    alert: false,
  });

  assert.equal(true, true);
});
