import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Manrope } from 'next/font/google';

import {
  DEFAULT_CLERK_AFTER_AUTH_URL,
  DEFAULT_CLERK_AFTER_SIGN_OUT_URL,
  getClerkAuthUrls,
  resolveClerkPublishableKey,
} from '@/lib/clerk-config';
import { validateServerEnv } from '@/lib/env.server';

import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'CallbackCloser',
  description: 'Missed-call recovery with SMS follow-up, lead qualification, and owner alerts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  validateServerEnv();
  const clerkPublishableKey = resolveClerkPublishableKey();
  const { signInUrl, signUpUrl } = getClerkAuthUrls();

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      signInFallbackRedirectUrl={DEFAULT_CLERK_AFTER_AUTH_URL}
      signUpFallbackRedirectUrl={DEFAULT_CLERK_AFTER_AUTH_URL}
      afterSignOutUrl={DEFAULT_CLERK_AFTER_SIGN_OUT_URL}
    >
      <html lang="en">
        <body className={`${manrope.variable} min-h-screen font-sans`}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
