import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { AppNav } from '@/components/app-nav';
import { db } from '@/lib/db';
import { getPortfolioDemoBusiness, isPortfolioDemoMode } from '@/lib/portfolio-demo';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (isPortfolioDemoMode()) {
    return (
      <div className="min-h-screen">
        <AppNav business={getPortfolioDemoBusiness()} demoMode />
        <main className="container py-8">{children}</main>
      </div>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });

  return (
    <div className="min-h-screen">
      <AppNav business={business} />
      <main className="container py-8">{children}</main>
    </div>
  );
}
