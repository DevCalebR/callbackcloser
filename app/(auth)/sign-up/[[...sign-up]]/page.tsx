import { SignUp } from '@clerk/nextjs';

import { DEFAULT_CLERK_AFTER_AUTH_URL, getClerkAuthUrls } from '@/lib/clerk-config';

export default function SignUpPage() {
  const { signInUrl, signUpUrl } = getClerkAuthUrls();

  return (
    <main className="container flex min-h-screen items-center justify-center py-16">
      <SignUp path={signUpUrl} routing="path" signInUrl={signInUrl} fallbackRedirectUrl={DEFAULT_CLERK_AFTER_AUTH_URL} />
    </main>
  );
}
