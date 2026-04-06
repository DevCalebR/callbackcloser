import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const invalidNestedButtonPattern = /<Link[^>]*>\s*<Button/;

test('public CTA links do not nest button elements inside next/link anchors', () => {
  const files = [
    'components/public-site-nav.tsx',
    'components/upgrade-banner.tsx',
    'app/page.tsx',
    'app/pricing/page.tsx',
    'app/contact/page.tsx',
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

  assert.match(layout, /signInFallbackRedirectUrl=\{DEFAULT_CLERK_AFTER_AUTH_URL\}/);
  assert.match(layout, /signUpFallbackRedirectUrl=\{DEFAULT_CLERK_AFTER_AUTH_URL\}/);
  assert.match(signInPage, /routing="path"/);
  assert.match(signInPage, /fallbackRedirectUrl=\{DEFAULT_CLERK_AFTER_AUTH_URL\}/);
  assert.match(signUpPage, /routing="path"/);
  assert.match(signUpPage, /fallbackRedirectUrl=\{DEFAULT_CLERK_AFTER_AUTH_URL\}/);
});
