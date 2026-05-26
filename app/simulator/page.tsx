import type { Metadata } from 'next';

import { PublicSimulatorExperience } from '@/components/demo/public-simulator-experience';
import { PublicSiteFooter } from '@/components/public-site-footer';
import { PublicSiteNav } from '@/components/public-site-nav';

export const metadata: Metadata = {
  title: 'Missed-Call Simulator | CallbackCloser',
  description: 'Interactive preview mode for the public CallbackCloser missed-call simulator with a safe, on-page lead recovery demo.',
};

export default function SimulatorPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteNav />

      <main className="container py-12">
        <PublicSimulatorExperience />
      </main>

      <PublicSiteFooter />
    </div>
  );
}
