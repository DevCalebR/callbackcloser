import { NextRequest, NextResponse } from 'next/server';

import { PREVIEW_REVIEW_COOKIE_NAME } from '@/lib/review-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.cookies.set(PREVIEW_REVIEW_COOKIE_NAME, '', {
    expires: new Date(0),
    httpOnly: true,
    path: '/',
    secure: true,
    sameSite: 'lax',
  });
  return response;
}
