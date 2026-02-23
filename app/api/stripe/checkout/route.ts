import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { absoluteUrl } from '@/lib/url';
import { checkoutSchema } from '@/lib/validators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorRedirect(message: string) {
  return NextResponse.redirect(absoluteUrl(`/app/billing?error=${encodeURIComponent(message)}`), { status: 303 });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(absoluteUrl('/sign-in'), { status: 303 });
  }

  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business) {
    return NextResponse.redirect(absoluteUrl('/app/onboarding'), { status: 303 });
  }

  const formData = await request.formData();
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return errorRedirect('Invalid Stripe price selection');
  }

  const allowedPrices = [process.env.STRIPE_PRICE_STARTER, process.env.STRIPE_PRICE_PRO].filter(Boolean);
  if (!allowedPrices.includes(parsed.data.priceId)) {
    return errorRedirect('Price ID is not allowed');
  }

  try {
    const stripe = getStripe();
    let customerId = business.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: business.name,
        phone: business.notifyPhone || undefined,
        metadata: {
          businessId: business.id,
          ownerClerkId: business.ownerClerkId,
        },
      });
      customerId = customer.id;
      await db.business.update({ where: { id: business.id }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: business.id,
      success_url: absoluteUrl('/app/billing?checkout=success'),
      cancel_url: absoluteUrl('/app/billing?checkout=canceled'),
      line_items: [{ price: parsed.data.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      metadata: { businessId: business.id },
      subscription_data: { metadata: { businessId: business.id } },
    });

    if (!session.url) {
      return errorRedirect('Stripe did not return a checkout URL');
    }

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create Stripe checkout session';
    return errorRedirect(message);
  }
}
