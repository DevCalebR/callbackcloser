import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_CLERK_SIGN_IN_URL,
  DEFAULT_CLERK_SIGN_UP_URL,
  getClerkAuthUrls,
  getClerkFrontendApiOrigin,
} from '../lib/clerk-config.ts';

test('getClerkAuthUrls normalizes env routes to stable base paths for Clerk path routing', () => {
  const urls = getClerkAuthUrls({
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: 'https://callbackcloser.com/sign-in?redirect_url=%2Fapp',
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: '/sign-up?intent=pilot',
  });

  assert.deepEqual(urls, {
    signInUrl: DEFAULT_CLERK_SIGN_IN_URL,
    signUpUrl: DEFAULT_CLERK_SIGN_UP_URL,
  });
});

test('getClerkFrontendApiOrigin decodes the frontend API host from the publishable key', () => {
  const origin = getClerkFrontendApiOrigin({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_Y2xlcmsuY2FsbGJhY2tjbG9zZXIuY29tJA',
  });

  assert.equal(origin, 'https://clerk.callbackcloser.com');
});

test('getClerkFrontendApiOrigin returns null for invalid publishable keys', () => {
  assert.equal(
    getClerkFrontendApiOrigin({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'not-a-real-key',
    }),
    null
  );
});
