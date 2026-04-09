import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { AppNav } from '@/components/app-nav';
import { db } from '@/lib/db';
import { getPortfolioDemoBusiness, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getCustomerSystemStatus } from '@/lib/system-status';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (isPortfolioDemoMode()) {
    const demoBusiness = getPortfolioDemoBusiness();
    const demoSystemStatus = getCustomerSystemStatus(demoBusiness, 1);
    return (
      <div className="min-h-screen">
        <AppNav
          business={demoBusiness}
          demoMode
          systemStatusLabel={demoSystemStatus.label}
          systemStatusVariant={demoSystemStatus.badgeVariant}
        />
        <main className="container py-8">{children}</main>
      </div>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const business = await db.business.findUnique({ where: { ownerClerkId: userId } });
  const successfulLeadCount = business
    ? await db.lead.count({ where: { businessId: business.id, ownerNotifiedAt: { not: null } } })
    : 0;
  const systemStatus = business ? getCustomerSystemStatus(business, successfulLeadCount) : null;

  return (
    <div className="min-h-screen">
      <AppNav
        business={business}
        systemStatusLabel={systemStatus?.label ?? 'Not live yet'}
        systemStatusVariant={systemStatus?.badgeVariant ?? 'outline'}
      />
      <main className="container py-8">{children}</main>
    </div>
  );
}
