import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';

type PlanParam = 'starter' | 'pro';

function parsePlan(searchParams?: Record<string, string | string[] | undefined>): PlanParam | null {
  const raw = searchParams?.plan;
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'starter' || value === 'pro') return value;
  return null;
}

function buildBuyPath(plan: PlanParam | null) {
  if (!plan) return '/buy';
  return `/buy?plan=${encodeURIComponent(plan)}`;
}

function buildBillingPath(plan: PlanParam | null) {
  if (!plan) return '/app/billing';
  return `/app/billing?plan=${encodeURIComponent(plan)}`;
}

export default async function BuyPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const plan = parsePlan(searchParams);
  const buyPath = buildBuyPath(plan);
  const billingPath = buildBillingPath(plan);
  const { userId } = await auth();

  if (!userId) {
    redirect(`/sign-up?redirect_url=${encodeURIComponent(buyPath)}`);
  }

  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business) {
    redirect(`/app/onboarding?next=${encodeURIComponent(billingPath)}`);
  }

  redirect(billingPath);
}
