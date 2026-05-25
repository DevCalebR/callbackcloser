import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  routeCanRenderClerkFallback,
  routeCanRenderWithoutClerk,
  routeNeedsClerkContext,
  routeNeedsProtectedMutationRateLimit,
  routeNeedsProtection,
} from '../lib/middleware-access.ts';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('public auth routes get Clerk context without becoming protected', () => {
  assert.equal(routeNeedsClerkContext('/sign-up'), true);
  assert.equal(routeNeedsClerkContext('/sign-in'), true);
  assert.equal(routeNeedsClerkContext('/start-free-pilot'), true);
  assert.equal(routeNeedsClerkContext('/buy'), true);

  assert.equal(routeNeedsProtection('/sign-up'), false);
  assert.equal(routeNeedsProtection('/sign-in'), false);
  assert.equal(routeNeedsProtection('/start-free-pilot'), false);
  assert.equal(routeNeedsProtection('/buy'), false);
});

test('marketing pages remain public when Clerk is unavailable', () => {
  assert.equal(routeCanRenderWithoutClerk('/'), true);
  assert.equal(routeCanRenderWithoutClerk('/pricing'), true);
  assert.equal(routeCanRenderWithoutClerk('/demo'), true);
  assert.equal(routeCanRenderWithoutClerk('/contact'), true);
  assert.equal(routeCanRenderClerkFallback('/sign-up'), true);
  assert.equal(routeCanRenderClerkFallback('/sign-in'), true);
});

test('protected owner and admin routes still require auth', () => {
  assert.equal(routeNeedsProtection('/app'), true);
  assert.equal(routeNeedsProtection('/app/leads'), true);
  assert.equal(routeNeedsProtection('/admin'), true);
  assert.equal(routeNeedsProtection('/admin/abc123'), true);
});

test('protected API mutation routes remain rate limited', () => {
  assert.equal(routeNeedsProtection('/api/stripe/checkout'), true);
  assert.equal(routeNeedsProtection('/api/stripe/portal'), true);
  assert.equal(routeNeedsProtection('/api/twilio/provision-number'), true);

  assert.equal(routeNeedsProtectedMutationRateLimit('/api/stripe/checkout'), true);
  assert.equal(routeNeedsProtectedMutationRateLimit('/api/stripe/portal'), true);
  assert.equal(routeNeedsProtectedMutationRateLimit('/api/twilio/provision-number'), true);
  assert.equal(routeNeedsProtectedMutationRateLimit('/app'), false);
});

test('middleware uses one clerkMiddleware path and only protects the protected subset', () => {
  const middleware = read('middleware.ts');
  const signInPage = read('app/(auth)/sign-in/[[...sign-in]]/page.tsx');
  const signUpPage = read('app/(auth)/sign-up/[[...sign-up]]/page.tsx');

  assert.match(middleware, /const appMiddleware = clerkMiddleware\(async \(auth, req\) =>/);
  assert.match(middleware, /if \(routeNeedsProtection\(pathname\)\) {\s*await auth\.protect\(\);/s);
  assert.match(middleware, /if \(req\.method === 'POST' && routeNeedsProtectedMutationRateLimit\(pathname\)\)/);
  assert.match(middleware, /const needsClerkContext = routeNeedsClerkContext\(pathname\)/);
  assert.match(middleware, /routeCanRenderClerkFallback\(pathname\)/);
  assert.doesNotMatch(middleware, /if \(!isProtectedRoute\(req\)\)/);
  assert.doesNotMatch(middleware, /const protectedMiddleware = clerkMiddleware/);
  assert.match(signInPage, /const \{ userId \} = await auth\(\);/);
  assert.match(signUpPage, /const \{ userId \} = await auth\(\);/);
});
