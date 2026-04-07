import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';
import { isDemoWorkspaceActive } from '@/lib/review-mode';

export default async function AppIndexPage() {
  if (await isDemoWorkspaceActive()) {
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
