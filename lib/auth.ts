import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { getPortfolioDemoAuth, getPortfolioDemoBusiness, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getDemoWorkspaceMode } from '@/lib/review-mode';

export async function requireAuth() {
  if (isPortfolioDemoMode() || (await getDemoWorkspaceMode()) === 'preview_review') {
    return getPortfolioDemoAuth();
  }

  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }
  return { userId };
}

export async function getCurrentBusiness() {
  if (isPortfolioDemoMode() || (await getDemoWorkspaceMode()) === 'preview_review') {
    return getPortfolioDemoBusiness();
  }

  const { userId } = await auth();
  if (!userId) return null;

  return db.business.findUnique({
    where: { ownerClerkId: userId },
  });
}

export async function requireBusiness() {
  if (isPortfolioDemoMode() || (await getDemoWorkspaceMode()) === 'preview_review') {
    return getPortfolioDemoBusiness();
  }

  const { userId } = await requireAuth();
  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business) {
    redirect('/app/onboarding');
  }
  return business;
}
