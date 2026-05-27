import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';
import { PublicSimulatorExperience } from '@/components/simulator/public-simulator-experience';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { PUBLIC_START_FREE_PILOT_PATH } from '@/lib/public-auth-routing';

export const metadata: Metadata = {
  title: 'Missed-Call Simulator | CallbackCloser',
  description: 'Run the self-contained CallbackCloser missed-call simulator and show the full qualification flow from missed call to owner alert preview.',
};

export default function SimulatorPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main>
        <section className="border-b bg-gradient-to-b from-background via-background to-muted/30">
          <div className="container space-y-4 py-14">
            <Badge variant="outline">Public interactive demo</Badge>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Public simulator</h1>
                <p className="text-lg text-muted-foreground">
                  Walk through the exact missed-call qualification flow in one browser tab. No login, no backend setup, and no real customer messaging required.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className={buttonVariants()} href={PUBLIC_START_FREE_PILOT_PATH}>
                  Start 14-day pilot
                </Link>
                <Link className={buttonVariants({ variant: 'outline' })} href="/demo">
                  View product demo
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="container py-12">
          <PublicSimulatorExperience />
        </section>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
