import { SignIn } from '@clerk/nextjs';

import { DEFAULT_CLERK_AFTER_AUTH_URL, getClerkAuthUrls } from '@/lib/clerk-config';

export default function SignInPage() {
  const { signInUrl, signUpUrl } = getClerkAuthUrls();

  return (
    <main className="container flex min-h-screen items-center justify-center py-16">
      <SignIn path={signInUrl} routing="path" signUpUrl={signUpUrl} fallbackRedirectUrl={DEFAULT_CLERK_AFTER_AUTH_URL} />
    </main>
  );
}
