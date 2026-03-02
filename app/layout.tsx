import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Manrope } from 'next/font/google';

import { validateServerEnv } from '@/lib/env.server';

import './globals.css';

const CLERK_PREVIEW_FALLBACK_KEY = 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'CallbackCloser',
  description: 'Missed Call -> Booked Job SMS follow-up',
};

function isLikelyValidClerkPublishableKey(value: string) {
  return /^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(value);
}

function resolveClerkPublishableKey() {
  const configured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? '';
  if (configured && isLikelyValidClerkPublishableKey(configured)) {
    return configured;
  }

  const allowPreviewFallback = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview';
  if (allowPreviewFallback) {
    return CLERK_PREVIEW_FALLBACK_KEY;
  }

  return configured;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  validateServerEnv();
  const clerkPublishableKey = resolveClerkPublishableKey();

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <html lang="en">
        <body className={`${manrope.variable} min-h-screen font-sans`}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
