import { cookies } from 'next/headers';

import { isPortfolioDemoMode } from '@/lib/portfolio-demo';

type EnvMap = Readonly<Record<string, string | undefined>>;

export const PREVIEW_REVIEW_COOKIE_NAME = 'callbackcloser_preview_review';

function parseBooleanFlag(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isVercelPreviewEnvironment(env: EnvMap = process.env) {
  return env.VERCEL_ENV?.trim().toLowerCase() === 'preview';
}

export function isPreviewReviewModeEnabled(env: EnvMap = process.env) {
  return parseBooleanFlag(env.ENABLE_PREVIEW_REVIEW_MODE) && isVercelPreviewEnvironment(env) && Boolean(env.PREVIEW_REVIEW_TOKEN?.trim());
}

export function hashPreviewReviewToken(token: string) {
  return token.trim();
}

export function getPreviewReviewCookieValue(env: EnvMap = process.env) {
  const token = env.PREVIEW_REVIEW_TOKEN?.trim();
  if (!token) return null;
  return hashPreviewReviewToken(token);
}

function safeEquals(left: string, right: string) {
  return left === right;
}

export function hasValidPreviewReviewCookieValue(value: string | null | undefined, env: EnvMap = process.env) {
  if (!value || !isPreviewReviewModeEnabled(env)) return false;
  const expected = getPreviewReviewCookieValue(env);
  if (!expected) return false;
  return safeEquals(value, expected);
}

export async function isPreviewReviewSessionActive() {
  const cookieStore = await cookies();
  const value = cookieStore.get(PREVIEW_REVIEW_COOKIE_NAME)?.value;
  return hasValidPreviewReviewCookieValue(value);
}

export async function getDemoWorkspaceMode() {
  if (isPortfolioDemoMode()) {
    return 'portfolio_demo' as const;
  }

  if (await isPreviewReviewSessionActive()) {
    return 'preview_review' as const;
  }

  return null;
}

export async function isDemoWorkspaceActive() {
  return (await getDemoWorkspaceMode()) !== null;
}

export function getPreviewReviewCookieFromHeader(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PREVIEW_REVIEW_COOKIE_NAME}=`));

  if (!match) return null;
  return decodeURIComponent(match.slice(PREVIEW_REVIEW_COOKIE_NAME.length + 1));
}

export function isPreviewReviewCookieHeaderValid(cookieHeader: string | null | undefined, env: EnvMap = process.env) {
  return hasValidPreviewReviewCookieValue(getPreviewReviewCookieFromHeader(cookieHeader), env);
}
