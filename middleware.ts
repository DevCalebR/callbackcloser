import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';

import { hasRequiredValidClerkEnv } from '@/lib/clerk-config';
import {
  routeCanRenderClerkFallback,
  routeCanRenderWithoutClerk,
  routeNeedsClerkContext,
  routeNeedsProtectedMutationRateLimit,
  routeNeedsProtection,
} from '@/lib/middleware-access';
import {
  getPortfolioDemoGuardrailErrorMessage,
  isPortfolioDemoModeBlockedInProduction,
  isPortfolioDemoModeEnabled,
  isProductionDemoModeOverrideEnabled,
} from '@/lib/portfolio-demo-guardrail';
import { RATE_LIMIT_PROTECTED_API_MAX, RATE_LIMIT_WINDOW_MS } from '@/lib/rate-limit-config';
import { buildRateLimitHeaders, consumeRateLimit, getClientIpAddress } from '@/lib/rate-limit';
import { withSecurityHeaders } from '@/lib/security-headers';

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

const appMiddleware = clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;

  if (routeNeedsProtection(pathname)) {
    await auth.protect();

    if (req.method === 'POST' && routeNeedsProtectedMutationRateLimit(pathname)) {
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

  const pathname = req.nextUrl.pathname;
  const needsClerkContext = routeNeedsClerkContext(pathname);

  if (!hasRequiredClerkMiddlewareEnv(process.env)) {
    if (!missingClerkEnvLogged) {
      missingClerkEnvLogged = true;
      console.error('Clerk middleware env is incomplete; Clerk-backed routes will return 503 until keys are configured.', {
        clerkSecretKeyPresent: Boolean(process.env.CLERK_SECRET_KEY?.trim()),
        clerkPublishableKeyPresent: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()),
        clerkKeysLookValid: hasRequiredValidClerkEnv(process.env),
        nodeEnv: process.env.NODE_ENV ?? null,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      });
    }

    return withSecurityHeaders(
      !needsClerkContext || routeCanRenderClerkFallback(pathname)
        ? NextResponse.next()
        : buildAuthUnavailableResponse(req)
    );
  }

  try {
    const response = await appMiddleware(req, event);
    return withSecurityHeaders(response ?? NextResponse.next());
  } catch (error) {
    console.error('Clerk middleware invocation failed.', {
      path: req.nextUrl.pathname,
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return withSecurityHeaders(
      routeCanRenderWithoutClerk(pathname) || routeCanRenderClerkFallback(pathname)
        ? NextResponse.next()
        : buildAuthUnavailableResponse(req)
    );
  }
}

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)', '/(api|trpc)(.*)'],
};
