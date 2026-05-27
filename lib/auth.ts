import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getAdminCustomerActingContext } from '@/lib/admin-customer-context';
import { getAdminSession } from '@/lib/admin';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import { ensurePendingBusinessForOwner } from '@/lib/customer-setup-handoff';
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
  const adminSession = await getAdminSession();
  if (adminSession?.isAdmin) {
    redirect('/admin?intent=new-business-pilot');
  }

  let business = await getBusinessForOwnerClerkId(userId);
  if (!business) {
    const user = await currentUser();
    const ownerEmail =
      (user?.primaryEmailAddressId
        ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
        : user?.emailAddresses[0]?.emailAddress) || null;

    business = await ensurePendingBusinessForOwner(userId, {
      businessName: typeof user?.publicMetadata?.businessName === 'string' ? user.publicMetadata.businessName : null,
      ownerEmail,
      ownerName: user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null,
    });
  }
  return business;
}
