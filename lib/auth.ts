import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db';

export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }
  return { userId };
}

export async function getCurrentBusiness() {
  const { userId } = await auth();
  if (!userId) return null;

  return db.business.findUnique({
    where: { ownerClerkId: userId },
  });
}

export async function requireBusiness() {
  const { userId } = await requireAuth();
  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!business) {
    redirect('/app/onboarding');
  }
  return business;
}
