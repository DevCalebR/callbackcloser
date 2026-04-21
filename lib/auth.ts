import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getAdminCustomerActingContext } from '@/lib/admin-customer-context';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import { getPortfolioDemoAuth, getPortfolioDemoBusiness, isPortfolioDemoMode } from '@/lib/portfolio-demo';

export async function requireAuth() {
  if (isPortfolioDemoMode()) {
    return getPortfolioDemoAuth();
  }

  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }
  return { userId };
}

export async function getCurrentBusiness() {
  if (isPortfolioDemoMode()) {
    return getPortfolioDemoBusiness();
  }

  const adminCustomerContext = await getAdminCustomerActingContext();
  if (adminCustomerContext) {
    return adminCustomerContext.business;
  }

  const { userId } = await auth();
  if (!userId) return null;

  return getBusinessForOwnerClerkId(userId);
}

export async function requireBusiness() {
  if (isPortfolioDemoMode()) {
    return getPortfolioDemoBusiness();
  }

  const adminCustomerContext = await getAdminCustomerActingContext();
  if (adminCustomerContext) {
    return adminCustomerContext.business;
  }

  const { userId } = await requireAuth();
  const business = await getBusinessForOwnerClerkId(userId);
  if (!business) {
    redirect('/app/onboarding');
  }
  return business;
}
