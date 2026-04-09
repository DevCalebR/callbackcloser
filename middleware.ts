import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

import { hasRequiredValidClerkEnv } from '@/lib/clerk-config';
import {
  getPortfolioDemoGuardrailErrorMessage,
  isPortfolioDemoModeBlockedInProduction,
  isPortfolioDemoModeEnabled,
  isProductionDemoModeOverrideEnabled,
} from '@/lib/portfolio-demo-guardrail';
import { RATE_LIMIT_PROTECTED_API_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';
import { withSecurityHeaders } from '@/lib/security-headers';

const isProtectedRoute = createRouteMatcher(['/app(.*)', '/admin(.*)', '/api/stripe/checkout(.*)', '/api/stripe/portal(.*)']);
const isProtectedApiMutationRoute = createRouteMatcher(['/api/stripe/checkout', '/api/stripe/portal']);
let productionDemoGuardrailLogged = false;
let productionDemoOverrideLogged = false;
let missingClerkEnvLogged = false;

type EnvMap = Readonly<Record<string, string | undefined>>;

function hasRequiredClerkMiddlewareEnv(env: EnvMap = process.env) {
  return hasRequiredValidClerkEnv(env);
}

function buildAuthUnavailableResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication is temporarily unavailable.' }, { status: 503 });
  }

  return new NextResponse('Authentication is temporarily unavailable.', { status: 503 });
}

const protectedMiddleware = clerkMiddleware(async (auth, req) => {
  await auth.protect();

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

  return NextResponse.next();
});

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  if (isPortfolioDemoModeBlockedInProduction(process.env)) {
    if (!productionDemoGuardrailLogged) {
      productionDemoGuardrailLogged = true;
      console.error(getPortfolioDemoGuardrailErrorMessage(), {
        nodeEnv: process.env.NODE_ENV ?? null,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      });
    }
    return withSecurityHeaders(NextResponse.json({ error: getPortfolioDemoGuardrailErrorMessage() }, { status: 503 }));
  }

  if (isPortfolioDemoModeEnabled(process.env)) {
    if (isProductionDemoModeOverrideEnabled(process.env) && !productionDemoOverrideLogged) {
      productionDemoOverrideLogged = true;
      console.warn('Production demo mode override is enabled (break-glass).', {
        nodeEnv: process.env.NODE_ENV ?? null,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      });
    }
    return withSecurityHeaders(NextResponse.next());
  }

  if (!isProtectedRoute(req)) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!hasRequiredClerkMiddlewareEnv(process.env)) {
    if (!missingClerkEnvLogged) {
      missingClerkEnvLogged = true;
      console.error('Clerk middleware env is incomplete; protected routes will return 503 until keys are configured.', {
        clerkSecretKeyPresent: Boolean(process.env.CLERK_SECRET_KEY?.trim()),
        clerkPublishableKeyPresent: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()),
        clerkKeysLookValid: hasRequiredValidClerkEnv(process.env),
        nodeEnv: process.env.NODE_ENV ?? null,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      });
    }

    return withSecurityHeaders(buildAuthUnavailableResponse(req));
  }

  try {
    const response = await protectedMiddleware(req, event);
    return withSecurityHeaders(response ?? NextResponse.next());
  } catch (error) {
    console.error('Protected middleware invocation failed.', {
      path: req.nextUrl.pathname,
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return withSecurityHeaders(buildAuthUnavailableResponse(req));
  }
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
