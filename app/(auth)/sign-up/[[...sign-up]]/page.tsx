import { auth } from '@clerk/nextjs/server';
import { SignUp } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

import { getAdminSession } from '@/lib/admin';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import { DEFAULT_CLERK_AFTER_AUTH_URL, getClerkAuthUrls } from '@/lib/clerk-config';
import { resolveSignedInAppDestination } from '@/lib/public-auth-routing';

function getIntentCopy(intent: string | undefined) {
  if (intent === 'pilot') {
    return {
      label: 'Start Free Pilot',
      title: 'Create your account and start pilot onboarding',
      detail:
        'This path is for a business owner creating a new CallbackCloser account. If you are already signed in, CallbackCloser will send you to onboarding, your dashboard, or the admin new-business flow based on your role.',
    };
  }

  return {
    label: 'Create Account',
    title: 'Create your CallbackCloser account',
    detail:
      'Create a new owner account here. Founder-operated customer pilot setup is separate and stays inside the admin new-business flow.',
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { userId } = await auth();
  if (userId) {
    const [adminSession, business] = await Promise.all([
      getAdminSession(),
      getBusinessForOwnerClerkId(userId),
    ]);

    redirect(
      resolveSignedInAppDestination({
        isAdmin: Boolean(adminSession?.isAdmin),
        hasBusiness: Boolean(business),
      })
    );
  }

  const { signInUrl, signUpUrl } = getClerkAuthUrls();
  const intent = typeof searchParams?.intent === 'string' ? searchParams.intent : undefined;
  const copy = getIntentCopy(intent);

  return (
    <main className="container grid min-h-screen gap-8 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <section className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">{copy.label}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-muted-foreground">{copy.detail}</p>
        <p className="text-sm text-muted-foreground">
          Existing users should sign in. CallbackCloser operators setting up a customer pilot should use the admin new-business flow, not public signup.
        </p>
      </section>
      <div className="flex justify-center lg:justify-end">
        <SignUp path={signUpUrl} routing="path" signInUrl={signInUrl} fallbackRedirectUrl={DEFAULT_CLERK_AFTER_AUTH_URL} />
      </div>
    </main>
  );
}
