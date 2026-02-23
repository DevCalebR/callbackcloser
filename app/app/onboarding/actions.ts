'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { upsertBusinessForOwner } from '@/lib/business';
import { onboardingSchema } from '@/lib/validators';

export async function saveOnboardingAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/onboarding?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid form data')}`);
  }

  await upsertBusinessForOwner(userId, parsed.data);
  revalidatePath('/app');
  redirect('/app/leads');
}
