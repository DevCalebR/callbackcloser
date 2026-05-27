import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { AppNav } from '@/components/app-nav';
import { CustomerSetupWaitingPage } from '@/components/customer-setup-waiting-page';
import { Badge } from '@/components/ui/badge';
import { getAdminSession } from '@/lib/admin';
import { getAdminCustomerActingContext } from '@/lib/admin-customer-context';
import { buildAdminCustomerExitHref } from '@/lib/admin-customer-paths';
import { ensurePendingBusinessForOwner } from '@/lib/customer-setup-handoff';
import { getCustomerWorkspaceNotice, shouldShowCustomerSetupWaitingPage } from '@/lib/customer-setup';
import { db } from '@/lib/db';
import { getPortfolioDemoBusiness, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getCustomerSystemStatus } from '@/lib/system-status';

export const dynamic = 'force-dynamic';

function getDashboardStatusPresentation(status: ReturnType<typeof getCustomerSystemStatus>) {
  if (status.key === 'live') {
    return {
      label: 'Live: recovering missed calls',
      badgeVariant: 'success' as const,
    };
  }

  return {
    label: 'Setup in progress',
    badgeVariant: 'secondary' as const,
  };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (isPortfolioDemoMode()) {
    const demoBusiness = getPortfolioDemoBusiness();
    const demoSystemStatus = getCustomerSystemStatus(demoBusiness, 1);
    const dashboardStatus = getDashboardStatusPresentation(demoSystemStatus);
    return (
      <div className="min-h-screen">
        <AppNav
          business={demoBusiness}
          demoMode
          systemStatusLabel={dashboardStatus.label}
          systemStatusVariant={dashboardStatus.badgeVariant}
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

  const adminSession = await getAdminSession();

  const existingBusiness = adminCustomerContext
    ? adminCustomerContext.business
    : await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (!adminCustomerContext && adminSession?.isAdmin && !existingBusiness) {
    redirect('/admin?intent=new-business-pilot');
  }
  const business =
    existingBusiness ||
    (adminCustomerContext
      ? null
      : await (async () => {
          const user = await currentUser();
          const ownerEmail =
            (user?.primaryEmailAddressId
              ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
              : user?.emailAddresses[0]?.emailAddress) || null;

          return ensurePendingBusinessForOwner(userId, {
            businessName: typeof user?.publicMetadata?.businessName === 'string' ? user.publicMetadata.businessName : null,
            ownerEmail,
            ownerName: user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null,
          });
        })());
  const successfulLeadCount = business
    ? await db.lead.count({ where: { businessId: business.id, OR: [{ ownerNotifiedAt: { not: null } }, { notifiedAt: { not: null } }] } })
    : 0;
  const systemStatus = business ? getCustomerSystemStatus(business, successfulLeadCount) : null;
  const dashboardStatus = systemStatus ? getDashboardStatusPresentation(systemStatus) : null;
  const workspaceNotice = business ? getCustomerWorkspaceNotice(business.provisioningStatus) : null;
  const showWaitingPage = business ? shouldShowCustomerSetupWaitingPage(business.provisioningStatus) : false;

  return (
    <div className="min-h-screen">
      <AppNav
        business={business}
        systemStatusLabel={dashboardStatus?.label ?? 'Setup in progress'}
        systemStatusVariant={dashboardStatus?.badgeVariant ?? 'outline'}
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
      <main className="container py-8">
        {showWaitingPage && business ? (
          <CustomerSetupWaitingPage businessName={business.name} status={business.provisioningStatus} />
        ) : (
          <>
            {workspaceNotice ? (
              <div className="mb-6 rounded-2xl border bg-background/80 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={workspaceNotice.variant}>{workspaceNotice.title}</Badge>
                  <p className="text-sm text-muted-foreground">{workspaceNotice.detail}</p>
                </div>
              </div>
            ) : null}
            {children}
          </>
        )}
      </main>
    </div>
  );
}
