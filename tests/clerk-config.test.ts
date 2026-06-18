import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canUseClerkClientComponents,
  DEFAULT_CLERK_SIGN_IN_URL,
  DEFAULT_CLERK_SIGN_UP_URL,
  getClerkAuthUrls,
  getClerkFrontendApiOrigin,
  resolveClerkPublishableKey,
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

test('canUseClerkClientComponents disables broken localhost live-key widgets during local development', () => {
  assert.equal(
    canUseClerkClientComponents({
      NODE_ENV: 'development',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_Y2xlcmsuY2FsbGJhY2tjbG9zZXIuY29tJA',
    }),
    false
  );

  assert.equal(
    canUseClerkClientComponents({
      NODE_ENV: 'development',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_Y3VyaW91cy1yaGluby00NS5jbGVyay5hY2NvdW50cy5kZXYk',
    }),
    true
  );
});

test('resolveClerkPublishableKey falls back to the preview key for local development with live Clerk keys', () => {
  assert.equal(
    resolveClerkPublishableKey({
      NODE_ENV: 'development',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_Y2xlcmsuY2FsbGJhY2tjbG9zZXIuY29tJA',
    }),
    'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k'
  );
});
