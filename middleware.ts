import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

import { RATE_LIMIT_PROTECTED_API_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';

const isProtectedRoute = createRouteMatcher(['/app(.*)', '/api/stripe/checkout(.*)', '/api/stripe/portal(.*)']);
const isProtectedApiMutationRoute = createRouteMatcher(['/api/stripe/checkout', '/api/stripe/portal']);

export default clerkMiddleware(async (auth, req) => {
  if (process.env.PORTFOLIO_DEMO_MODE === '1') {
    return;
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  if (req.method === 'POST' && isProtectedApiMutationRoute(req)) {
    const clientIp = getClientIpAddress(req);
    const rateLimit = consumeRateLimit({
      key: `middleware:protected-api:${clientIp}`,
      limit: RATE_LIMIT_PROTECTED_API_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: buildRateLimitHeaders(rateLimit) }
      );
    }
  }
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
