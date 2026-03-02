import assert from 'node:assert/strict';
import test from 'node:test';

import { getSecurityHeaders } from '../lib/security-headers.ts';

test('getSecurityHeaders includes baseline headers', () => {
  const headers = getSecurityHeaders({ NODE_ENV: 'development' });

  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
});

test('getSecurityHeaders includes HSTS in production', () => {
  const headers = getSecurityHeaders({ NODE_ENV: 'production' });

  assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains; preload');
});
