import { auth } from '@clerk/nextjs/server';
import { SignUp } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

import { getAdminSession } from '@/lib/admin';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import {
  DEFAULT_CLERK_AFTER_AUTH_URL,
  DEFAULT_CLERK_SIGN_IN_URL,
  DEFAULT_CLERK_SIGN_UP_URL,
  hasRequiredValidClerkEnv,
} from '@/lib/clerk-config';
import { resolveSignedInAppDestination } from '@/lib/public-auth-routing';

function getIntentCopy(intent: string | undefined) {
  if (intent === 'pilot') {
    return {
      label: 'Start 14-day pilot',
      title: 'Create your account and start your 14-day pilot',
      detail:
        'This path is for a business owner creating a new CallbackCloser account. If you are already signed in, CallbackCloser will send you to onboarding, your dashboard, or the admin new-business flow based on your role.',
    };
  }

  return {
    label: 'Create account',
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
  if (!hasRequiredValidClerkEnv()) {
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
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
            <p className="font-medium">Authentication is temporarily unavailable.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              CallbackCloser sign-up is unavailable until Clerk production configuration is restored. Please try again shortly or contact support.
            </p>
          </div>
        </div>
      </main>
    );
  }

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
        <SignUp
          path={DEFAULT_CLERK_SIGN_UP_URL}
          routing="path"
          signInUrl={DEFAULT_CLERK_SIGN_IN_URL}
          fallbackRedirectUrl={DEFAULT_CLERK_AFTER_AUTH_URL}
        />
      </div>
    </main>
  );
}
