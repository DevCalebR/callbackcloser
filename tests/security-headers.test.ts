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
  const headers = getSecurityHeaders({
    NODE_ENV: 'production',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_Y2xlcmsuY2FsbGJhY2tjbG9zZXIuY29tJA',
  });

  assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains; preload');
  assert.match(headers['Content-Security-Policy'] || '', /default-src 'self'/);
  assert.match(headers['Content-Security-Policy'] || '', /https:\/\/clerk\.callbackcloser\.com/);
  assert.match(headers['Content-Security-Policy'] || '', /https:\/\/challenges\.cloudflare\.com/);
  assert.match(headers['Content-Security-Policy'] || '', /img-src 'self' data: blob: https: https:\/\/img\.clerk\.com/);
  assert.match(headers['Content-Security-Policy'] || '', /worker-src 'self' blob:/);
  assert.match(headers['Content-Security-Policy'] || '', /frame-ancestors 'none'/);
  assert.match(headers['Content-Security-Policy'] || '', /upgrade-insecure-requests/);
});
