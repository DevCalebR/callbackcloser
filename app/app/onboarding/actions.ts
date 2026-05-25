'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { deriveTwilioNumberSetupModeFromPhoneSetupPath } from '@/lib/business-phone-setup';
import { upsertBusinessForOwner } from '@/lib/business';
import { onboardingSchema } from '@/lib/validators';

const DEFAULT_POST_ONBOARDING_REDIRECT = '/app/settings';

function resolveSafePostOnboardingRedirectPath(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return DEFAULT_POST_ONBOARDING_REDIRECT;

  const nextPath = value.trim();
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return DEFAULT_POST_ONBOARDING_REDIRECT;
  }

  if (nextPath === '/app') return DEFAULT_POST_ONBOARDING_REDIRECT;
  if (!nextPath.startsWith('/app/')) return DEFAULT_POST_ONBOARDING_REDIRECT;

  return nextPath;
}

export async function saveOnboardingAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const postOnboardingRedirect = resolveSafePostOnboardingRedirectPath(formData.get('next'));

  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/app/onboarding?error=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid form data')}`);
  }

  const user = await currentUser();
  const ownerEmail =
    (user?.primaryEmailAddressId
      ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
      : user?.emailAddresses[0]?.emailAddress) || null;
  const data = parsed.data;

  await upsertBusinessForOwner(userId, {
    name: data.name,
    publicBusinessPhone: data.publicBusinessPhone,
    forwardingNumber: data.forwardingNumber,
    notifyPhone: data.notifyPhone,
    twilioAccountMode: data.twilioAccountMode,
    phoneSetupPath: data.phoneSetupPath,
    forwardedCallAnswerMode: data.forwardedCallAnswerMode,
    messagingSetupMode: data.messagingSetupMode,
    twilioNumberSetupMode: deriveTwilioNumberSetupModeFromPhoneSetupPath(data.phoneSetupPath),
    missedCallSeconds: data.missedCallSeconds,
    serviceLabel1: data.serviceLabel1,
    serviceLabel2: data.serviceLabel2,
    serviceLabel3: data.serviceLabel3,
    timezone: data.timezone,
    ownerEmail,
  });

  revalidatePath('/app');
  revalidatePath('/app/settings');
  revalidatePath('/app/onboarding');
  redirect(postOnboardingRedirect);
}
