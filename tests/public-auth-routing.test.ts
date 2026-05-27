import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  ADMIN_NEW_BUSINESS_PILOT_PATH,
  OWNER_DASHBOARD_PATH,
  OWNER_ONBOARDING_PATH,
  resolvePublicPilotDestination,
  resolveSignedInAppDestination,
} from '../lib/public-auth-routing.ts';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const invalidNestedButtonPattern = /<Link[^>]*>\s*<Button/;

test('public CTA links do not nest button elements inside next/link anchors', () => {
  const files = [
    'components/public-site-nav.tsx',
    'components/public-site-footer.tsx',
    'components/upgrade-banner.tsx',
    'app/page.tsx',
    'app/pricing/page.tsx',
    'app/contact/page.tsx',
    'app/demo/page.tsx',
    'app/simulator/page.tsx',
    'app/app/billing/page.tsx',
  ];

  for (const file of files) {
    assert.doesNotMatch(read(file), invalidNestedButtonPattern, `${file} still nests <Button> inside <Link>.`);
  }
});

test('clerk auth surfaces use explicit path routing and fallback redirects', () => {
  const layout = read('app/layout.tsx');
  const signInPage = read('app/(auth)/sign-in/[[...sign-in]]/page.tsx');
  const signUpPage = read('app/(auth)/sign-up/[[...sign-up]]/page.tsx');
  const pilotEntryPage = read('app/start-free-pilot/page.tsx');

  assert.match(layout, /signInFallbackRedirectUrl=\{DEFAULT_CLERK_AFTER_AUTH_URL\}/);
  assert.match(layout, /signUpFallbackRedirectUrl=\{DEFAULT_CLERK_AFTER_AUTH_URL\}/);
  assert.match(signInPage, /routing="path"/);
  assert.match(signInPage, /fallbackRedirectUrl=\{DEFAULT_CLERK_AFTER_AUTH_URL\}/);
  assert.match(signInPage, /<SignIn/);
  assert.match(signInPage, /Sign in to your CallbackCloser workspace/);
  assert.match(signInPage, /path=\{DEFAULT_CLERK_SIGN_IN_URL\}/);
  assert.match(signInPage, /signUpUrl=\{DEFAULT_CLERK_SIGN_UP_URL\}/);
  assert.match(signInPage, /hasRequiredValidClerkEnv/);
  assert.match(signInPage, /Authentication is temporarily unavailable\./);
  assert.match(signInPage, /resolveSignedInAppDestination/);
  assert.match(signUpPage, /routing="path"/);
  assert.match(signUpPage, /fallbackRedirectUrl=\{DEFAULT_CLERK_AFTER_AUTH_URL\}/);
  assert.match(signUpPage, /<SignUp/);
  assert.match(signUpPage, /Create your account and start your 14-day pilot/);
  assert.match(signUpPage, /path=\{DEFAULT_CLERK_SIGN_UP_URL\}/);
  assert.match(signUpPage, /signInUrl=\{DEFAULT_CLERK_SIGN_IN_URL\}/);
  assert.match(signUpPage, /hasRequiredValidClerkEnv/);
  assert.match(signUpPage, /Authentication is temporarily unavailable\./);
  assert.match(signUpPage, /resolveSignedInAppDestination/);
  assert.match(signUpPage, /Start 14-day pilot/);
  assert.match(signUpPage, /Founder-operated customer pilot setup is separate/i);
  assert.match(pilotEntryPage, /resolvePublicPilotDestination/);
});

test('public pilot routing keeps logged-out, owner, and admin flows separate', () => {
  assert.equal(
    resolvePublicPilotDestination({
      isAuthenticated: false,
      isAdmin: false,
      hasBusiness: false,
    }),
    '/sign-up?intent=pilot'
  );

  assert.equal(
    resolvePublicPilotDestination({
      isAuthenticated: true,
      isAdmin: false,
      hasBusiness: false,
    }),
    OWNER_ONBOARDING_PATH
  );

  assert.equal(
    resolvePublicPilotDestination({
      isAuthenticated: true,
      isAdmin: false,
      hasBusiness: true,
    }),
    OWNER_DASHBOARD_PATH
  );

  assert.equal(
    resolvePublicPilotDestination({
      isAuthenticated: true,
      isAdmin: true,
      hasBusiness: true,
    }),
    ADMIN_NEW_BUSINESS_PILOT_PATH
  );

  assert.equal(
    resolveSignedInAppDestination({
      isAdmin: true,
      hasBusiness: false,
    }),
    ADMIN_NEW_BUSINESS_PILOT_PATH
  );
});
