import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { autoLinkPendingBusinessOwner, getClerkUserDisplayName, getClerkUserEmailAddresses } from '@/lib/business-owner-link';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import { getPortfolioDemoAuth, getPortfolioDemoBusiness, isPortfolioDemoMode } from '@/lib/portfolio-demo';

async function resolveBusinessForAuthenticatedOwner(userId: string) {
  const existingBusiness = await getBusinessForOwnerClerkId(userId);
  if (existingBusiness) {
    return {
      business: existingBusiness,
      ownerLinkStatus: 'connected' as const,
    };
  }

  const user = await currentUser();
  const result = await autoLinkPendingBusinessOwner({
    clerkUserId: userId,
    emailAddresses: getClerkUserEmailAddresses(user),
    ownerName: getClerkUserDisplayName(user),
  });

  if (result.status === 'connected') {
    const business = await getBusinessForOwnerClerkId(userId);
    return {
      business,
      ownerLinkStatus: 'connected' as const,
    };
  }

  return {
    business: null,
    ownerLinkStatus: result.status,
  };
}

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

  const { userId } = await auth();
  if (!userId) return null;

  const { business } = await resolveBusinessForAuthenticatedOwner(userId);
  return business;
}

export async function requireBusiness() {
  if (isPortfolioDemoMode()) {
    return getPortfolioDemoBusiness();
  }

  const { userId } = await requireAuth();
  const { business, ownerLinkStatus } = await resolveBusinessForAuthenticatedOwner(userId);
  if (!business) {
    if (ownerLinkStatus === 'needs_repair') {
      redirect('/app/onboarding?ownerState=needs_repair');
    }

    redirect('/app/onboarding');
  }
  return business;
}
