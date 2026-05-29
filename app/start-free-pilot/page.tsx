import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getAdminSession } from '@/lib/admin';
import { getOwnedBusinessForClerkUser } from '@/lib/owner-linking';
import { resolvePublicPilotDestination } from '@/lib/public-auth-routing';

export default async function StartFreePilotPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect(resolvePublicPilotDestination({ isAuthenticated: false, isAdmin: false, hasBusiness: false }));
  }

  const [adminSession, business] = await Promise.all([
    getAdminSession(),
    getOwnedBusinessForClerkUser(await currentUser()),
  ]);

  redirect(
    resolvePublicPilotDestination({
      isAuthenticated: true,
      isAdmin: Boolean(adminSession?.isAdmin),
      hasBusiness: Boolean(business),
    })
  );
}
