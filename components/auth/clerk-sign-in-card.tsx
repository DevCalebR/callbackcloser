'use client';

import { SignIn } from '@clerk/nextjs';

import { DEFAULT_CLERK_AFTER_AUTH_URL, DEFAULT_CLERK_SIGN_IN_URL, DEFAULT_CLERK_SIGN_UP_URL } from '@/lib/clerk-config';

export function ClerkSignInCard() {
  return (
    <SignIn
      path={DEFAULT_CLERK_SIGN_IN_URL}
      routing="path"
      signUpUrl={DEFAULT_CLERK_SIGN_UP_URL}
      fallbackRedirectUrl={DEFAULT_CLERK_AFTER_AUTH_URL}
    />
  );
}
