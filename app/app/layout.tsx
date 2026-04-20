import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { AppNav } from '@/components/app-nav';
import { getAdminCustomerActingContext } from '@/lib/admin-customer-context';
import { buildAdminCustomerExitHref } from '@/lib/admin-customer-paths';
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

  const adminCustomerContext = await getAdminCustomerActingContext();
  const { userId } = await auth();
  if (!userId) {
    redirect('/sign-in');
  }

  const business = adminCustomerContext
    ? adminCustomerContext.business
    : await db.business.findUnique({ where: { ownerClerkId: userId } });
  const successfulLeadCount = business
    ? await db.lead.count({ where: { businessId: business.id, OR: [{ ownerNotifiedAt: { not: null } }, { notifiedAt: { not: null } }] } })
    : 0;
  const systemStatus = business ? getCustomerSystemStatus(business, successfulLeadCount) : null;

  return (
      <div className="min-h-screen">
        <AppNav
          business={business}
          systemStatusLabel={systemStatus?.label ?? 'Not live yet'}
          systemStatusVariant={systemStatus?.badgeVariant ?? 'outline'}
        />
        {adminCustomerContext && business ? (
          <div className="border-b bg-primary/5">
            <div className="container flex flex-col gap-3 py-3 text-sm lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-medium">Admin customer mode</p>
                <p className="text-muted-foreground">
                  You are using the real customer pages for <span className="font-medium text-foreground">{business.name}</span>.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-background" href={`/admin/${business.id}`}>
                  Back to operator controls
                </Link>
                <Link className="rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-background" href={buildAdminCustomerExitHref(business.id)}>
                  Exit customer mode
                </Link>
              </div>
            </div>
          </div>
        ) : null}
        <main className="container py-8">{children}</main>
      </div>
    );
}
