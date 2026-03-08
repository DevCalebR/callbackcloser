import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getCorrelationIdFromRequest, reportApplicationError, withCorrelationIdHeader } from '@/lib/observability';
import { getStripe } from '@/lib/stripe';
import { absoluteUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const correlationId = getCorrelationIdFromRequest(request);
  const withCorrelation = (response: NextResponse) => withCorrelationIdHeader(response, correlationId);
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
