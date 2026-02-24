import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { isPortfolioDemoMode } from '@/lib/portfolio-demo';

export default async function AppIndexPage() {
  if (isPortfolioDemoMode()) {
    redirect('/app/leads');
  }

  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business) {
    redirect('/app/onboarding');
  }

  redirect('/app/leads');
}
