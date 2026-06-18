'use client';

import { SignUp } from '@clerk/nextjs';

import { DEFAULT_CLERK_AFTER_AUTH_URL, DEFAULT_CLERK_SIGN_IN_URL, DEFAULT_CLERK_SIGN_UP_URL } from '@/lib/clerk-config';

export function ClerkSignUpCard() {
  return (
    <SignUp
      path={DEFAULT_CLERK_SIGN_UP_URL}
      routing="path"
      signInUrl={DEFAULT_CLERK_SIGN_IN_URL}
      fallbackRedirectUrl={DEFAULT_CLERK_AFTER_AUTH_URL}
    />
  );
}
