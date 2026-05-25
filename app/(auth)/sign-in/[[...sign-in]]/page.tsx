import { auth } from '@clerk/nextjs/server';
import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

import { getAdminSession } from '@/lib/admin';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import { DEFAULT_CLERK_AFTER_AUTH_URL, getClerkAuthUrls } from '@/lib/clerk-config';
import { resolveSignedInAppDestination } from '@/lib/public-auth-routing';

export default async function SignInPage() {
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

  return (
    <main className="container grid min-h-screen gap-8 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <section className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">Existing users</p>
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to your CallbackCloser workspace</h1>
        <p className="text-muted-foreground">
          Sign in is for existing owners and operators. If you need a new business workspace, create an account or start a free pilot from the public site instead.
        </p>
      </section>
      <div className="flex justify-center lg:justify-end">
        <SignIn path={signInUrl} routing="path" signUpUrl={signUpUrl} fallbackRedirectUrl={DEFAULT_CLERK_AFTER_AUTH_URL} />
      </div>
    </main>
  );
}
