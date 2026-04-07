import { NextRequest, NextResponse } from 'next/server';

import { PREVIEW_REVIEW_COOKIE_NAME, getPreviewReviewCookieValue, isPreviewReviewModeEnabled } from '@/lib/review-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary preview-only access path for sanitized demo review. Disable by setting
// ENABLE_PREVIEW_REVIEW_MODE=false or unsetting PREVIEW_REVIEW_TOKEN.
export async function GET(request: NextRequest) {
  if (!isPreviewReviewModeEnabled(process.env)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const token = request.nextUrl.searchParams.get('token')?.trim();
  const expectedToken = process.env.PREVIEW_REVIEW_TOKEN?.trim();
  if (!token || !expectedToken || token !== expectedToken) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const cookieValue = getPreviewReviewCookieValue(process.env);
  if (!cookieValue) {
    return new NextResponse('Review mode is not configured.', { status: 503 });
  }

  const response = NextResponse.redirect(new URL('/app/leads', request.url), { status: 303 });
  response.cookies.set(PREVIEW_REVIEW_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    path: '/',
    secure: true,
    sameSite: 'lax',
  });
  return response;
}
