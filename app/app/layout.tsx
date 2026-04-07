import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { AppNav } from '@/components/app-nav';
import { ReviewModeBanner } from '@/components/review-mode-banner';
import { db } from '@/lib/db';
import { getPortfolioDemoBusiness } from '@/lib/portfolio-demo';
import { getDemoWorkspaceMode } from '@/lib/review-mode';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const demoWorkspaceMode = await getDemoWorkspaceMode();

  if (demoWorkspaceMode) {
    const isPreviewReviewMode = demoWorkspaceMode === 'preview_review';
    return (
      <div className="min-h-screen">
        <AppNav business={getPortfolioDemoBusiness()} demoMode demoLabel={isPreviewReviewMode ? 'Review Workspace' : 'Demo Workspace'} />
        {isPreviewReviewMode ? <ReviewModeBanner /> : null}
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
