'use server';

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { upsertBusinessForOwner } from '@/lib/business';
import { logTwilioError } from '@/lib/twilio-logging';
import { getTwilioProvisioningBlockReason, provisionPhoneNumber } from '@/lib/twilio-provision';
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

  const business = await upsertBusinessForOwner(userId, parsed.data);
  const provisioningBlockReason = getTwilioProvisioningBlockReason(business);

  if (!provisioningBlockReason) {
    const correlationId = `onboarding_${business.id}`;

    try {
      await provisionPhoneNumber({
        businessId: business.id,
        businessName: business.name,
        correlationId,
      });
    } catch (error) {
      logTwilioError(
        'provisioning',
        'onboarding_auto_provision_failed',
        {
          correlationId,
          businessId: business.id,
          ownerClerkId: userId,
          decision: 'onboarding_completed_without_twilio_number',
        },
        error
      );
    }
  }

  revalidatePath('/app');
  revalidatePath('/app/settings');
  redirect(postOnboardingRedirect);
}
