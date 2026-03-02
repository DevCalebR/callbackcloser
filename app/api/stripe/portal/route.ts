import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { logAuditEvent } from '@/lib/audit-log';
import { db } from '@/lib/db';
import { getConfiguredAppBaseUrl } from '@/lib/env.server';
import { getCorrelationIdFromRequest, reportApplicationError, withCorrelationIdHeader } from '@/lib/observability';
import { isAllowedRequestOrigin } from '@/lib/request-origin';
import { getStripe } from '@/lib/stripe';
import { absoluteUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const withCorrelation = (response: NextResponse) => withCorrelationIdHeader(response, correlationId);

  if (process.env.NODE_ENV === 'production' && !isAllowedRequestOrigin(request, getConfiguredAppBaseUrl())) {
    return withCorrelation(NextResponse.json({ error: 'Invalid request origin' }, { status: 403 }));
  }

  const { userId } = await auth();
  if (!userId) {
    return withCorrelation(NextResponse.redirect(absoluteUrl('/sign-in'), { status: 303 }));
  }

  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business?.stripeCustomerId) {
    return withCorrelation(
      NextResponse.redirect(absoluteUrl('/app/billing?error=No%20Stripe%20customer%20for%20this%20business'), { status: 303 })
    );
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: absoluteUrl('/app/billing'),
    });

    logAuditEvent({
      event: 'billing.portal_session_created',
      actorType: 'user',
      actorId: userId,
      businessId: business.id,
      targetType: 'stripe_portal_session',
      targetId: business.stripeCustomerId,
      correlationId,
      metadata: {
        returnUrl: absoluteUrl('/app/billing'),
      },
    });

    return withCorrelation(NextResponse.redirect(session.url, { status: 303 }));
  } catch (error) {
    reportApplicationError({
      source: 'stripe.portal',
      event: 'route_error',
      correlationId,
      error,
      metadata: {
        userId,
        businessId: business.id,
      },
      alert: false,
    });
    const message = error instanceof Error ? error.message : 'Failed to open billing portal';
    return withCorrelation(NextResponse.redirect(absoluteUrl(`/app/billing?error=${encodeURIComponent(message)}`), { status: 303 }));
  }
}
