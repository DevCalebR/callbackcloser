import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPreviewReviewCookieFromHeader,
  getPreviewReviewCookieValue,
  hasValidPreviewReviewCookieValue,
  isPreviewReviewCookieHeaderValid,
  isPreviewReviewModeEnabled,
  isVercelPreviewEnvironment,
} from '../lib/review-mode.ts';

const baseEnv = {
  ENABLE_PREVIEW_REVIEW_MODE: 'true',
  PREVIEW_REVIEW_TOKEN: 'preview-secret',
  VERCEL_ENV: 'preview',
};

test('preview review mode only enables on Vercel preview with a token', () => {
  assert.equal(isVercelPreviewEnvironment(baseEnv), true);
  assert.equal(isPreviewReviewModeEnabled(baseEnv), true);
  assert.equal(
    isPreviewReviewModeEnabled({
      ...baseEnv,
      VERCEL_ENV: 'production',
    }),
    false
  );
  assert.equal(
    isPreviewReviewModeEnabled({
      ...baseEnv,
      PREVIEW_REVIEW_TOKEN: '',
    }),
    false
  );
});

test('preview review cookie value is validated against the configured token', () => {
  const cookieValue = getPreviewReviewCookieValue(baseEnv);
  assert.ok(cookieValue);
  assert.equal(hasValidPreviewReviewCookieValue(cookieValue, baseEnv), true);
  assert.equal(hasValidPreviewReviewCookieValue('invalid-cookie-value', baseEnv), false);
});

test('preview review cookie can be read and validated from the request header', () => {
  const cookieValue = getPreviewReviewCookieValue(baseEnv);
  assert.ok(cookieValue);
  const cookieHeader = `other=value; callbackcloser_preview_review=${cookieValue}; another=1`;

  assert.equal(getPreviewReviewCookieFromHeader(cookieHeader), cookieValue);
  assert.equal(isPreviewReviewCookieHeaderValid(cookieHeader, baseEnv), true);
  assert.equal(isPreviewReviewCookieHeaderValid('callbackcloser_preview_review=wrong', baseEnv), false);
});
