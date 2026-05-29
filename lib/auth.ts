import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getAdminCustomerActingContext } from '@/lib/admin-customer-context';
import { getAdminSession } from '@/lib/admin';
import { getOwnedBusinessForClerkUser, getOrCreateOwnedBusinessForClerkUser } from '@/lib/owner-linking';
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

  const user = await currentUser();
  if (!user) return null;

  return getOwnedBusinessForClerkUser(user);
}

export async function requireBusiness() {
  if (isPortfolioDemoMode()) {
    return getPortfolioDemoBusiness();
  }

  const adminCustomerContext = await getAdminCustomerActingContext();
  if (adminCustomerContext) {
    return adminCustomerContext.business;
  }

  await requireAuth();
  const adminSession = await getAdminSession();
  if (adminSession?.isAdmin) {
    redirect('/admin?intent=new-business-pilot');
  }

  const user = await currentUser();
  if (!user) {
    redirect('/sign-in');
  }

  const business = await getOrCreateOwnedBusinessForClerkUser(user);
  return business;
}
