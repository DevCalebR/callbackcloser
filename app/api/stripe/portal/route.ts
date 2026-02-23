import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { absoluteUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(absoluteUrl('/sign-in'), { status: 303 });
  }

  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business?.stripeCustomerId) {
    return NextResponse.redirect(absoluteUrl('/app/billing?error=No%20Stripe%20customer%20for%20this%20business'), { status: 303 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: absoluteUrl('/app/billing'),
    });

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open billing portal';
    return NextResponse.redirect(absoluteUrl(`/app/billing?error=${encodeURIComponent(message)}`), { status: 303 });
  }
}
