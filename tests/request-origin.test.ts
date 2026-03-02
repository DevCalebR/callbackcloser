import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedRequestOrigin } from '../lib/request-origin.ts';

function requestWithHeaders(values: Record<string, string>) {
  return {
    headers: new Headers(values),
  };
}

test('allows same-origin requests via Origin header', () => {
  const allowed = isAllowedRequestOrigin(
    requestWithHeaders({ origin: 'https://app.example.com' }),
    'https://app.example.com'
  );
  assert.equal(allowed, true);
});

test('rejects mismatched Origin header', () => {
  const allowed = isAllowedRequestOrigin(
    requestWithHeaders({ origin: 'https://attacker.example.com' }),
    'https://app.example.com'
  );
  assert.equal(allowed, false);
});

test('allows same-origin referrer when Origin header is missing', () => {
  const allowed = isAllowedRequestOrigin(
    requestWithHeaders({ referer: 'https://app.example.com/app/billing' }),
    'https://app.example.com'
  );
  assert.equal(allowed, true);
});

test('allows requests with no Origin/Referrer (non-browser clients)', () => {
  const allowed = isAllowedRequestOrigin(requestWithHeaders({}), 'https://app.example.com');
  assert.equal(allowed, true);
});
