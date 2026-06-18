import { auth } from '@clerk/nextjs/server';
import dynamic from 'next/dynamic';
import { redirect } from 'next/navigation';

import { getAdminSession } from '@/lib/admin';
import { getBusinessForOwnerClerkId } from '@/lib/business-access';
import {
  canUseClerkClientComponents,
} from '@/lib/clerk-config';
import { resolveSignedInAppDestination } from '@/lib/public-auth-routing';

const ClerkSignInCard = dynamic(
  () => import('@/components/auth/clerk-sign-in-card').then((module) => module.ClerkSignInCard),
  { ssr: false }
);

export default async function SignInPage() {
  if (!canUseClerkClientComponents()) {
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
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
            <p className="font-medium">Authentication is temporarily unavailable.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              CallbackCloser sign-in is unavailable until Clerk production configuration is restored. Please try again shortly or contact support.
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
        <ClerkSignInCard />
      </div>
    </main>
  );
}
