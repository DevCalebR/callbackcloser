import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConfiguredAppBaseUrl } from '../lib/app-url';

test('falls back to VERCEL_URL when NEXT_PUBLIC_APP_URL is missing', () => {
  const resolution = resolveConfiguredAppBaseUrl({
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'callbackcloser-git-feature-abc.vercel.app',
  });

  assert.equal(resolution.appUrlResolved, 'https://callbackcloser-git-feature-abc.vercel.app');
  assert.equal(resolution.sourceUsed, 'VERCEL_URL');
  assert.equal(resolution.usedFallback, true);
  assert.equal(resolution.nextPublicAppUrlState, 'missing');
});

test('falls back to VERCEL_URL when NEXT_PUBLIC_APP_URL is invalid', () => {
  const resolution = resolveConfiguredAppBaseUrl({
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    NEXT_PUBLIC_APP_URL: 'not-a-url',
    VERCEL_URL: 'callbackcloser-preview.vercel.app',
  });

  assert.equal(resolution.appUrlResolved, 'https://callbackcloser-preview.vercel.app');
  assert.equal(resolution.sourceUsed, 'VERCEL_URL');
  assert.equal(resolution.usedFallback, true);
  assert.equal(resolution.nextPublicAppUrlState, 'invalid');
});

test('prefers valid NEXT_PUBLIC_APP_URL over Vercel fallback', () => {
  const resolution = resolveConfiguredAppBaseUrl({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://callbackcloser.com/',
    VERCEL_PROJECT_PRODUCTION_URL: 'callbackcloser.vercel.app',
  });

  assert.equal(resolution.appUrlResolved, 'https://callbackcloser.com');
  assert.equal(resolution.sourceUsed, 'NEXT_PUBLIC_APP_URL');
  assert.equal(resolution.usedFallback, false);
  assert.equal(resolution.nextPublicAppUrlState, 'valid');
});
