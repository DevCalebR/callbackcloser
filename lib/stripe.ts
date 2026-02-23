import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (stripeClient) return stripeClient;

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('Missing STRIPE_SECRET_KEY');
  }

  stripeClient = new Stripe(apiKey, {
    apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
  });

  return stripeClient;
}
