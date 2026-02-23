import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Manrope } from 'next/font/google';

import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'CallbackCloser',
  description: 'Missed Call -> Booked Job SMS follow-up',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${manrope.variable} min-h-screen font-sans`}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
