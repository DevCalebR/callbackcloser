import Link from 'next/link';
import { type BusinessProvisioningStatus } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  customerSetupStatusLabels,
  getCustomerSetupStatusDetail,
  isGenericManagedSetupBusinessName,
} from '@/lib/customer-setup';

export function CustomerSetupWaitingPage({
  businessName,
  status,
}: {
  businessName: string | null;
  status: BusinessProvisioningStatus;
}) {
  const showBusinessName = businessName && !isGenericManagedSetupBusinessName(businessName);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <section className="space-y-4">
        <Badge variant="outline">Setup in progress</Badge>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Your missed-call recovery system is being set up
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            We&apos;re preparing CallbackCloser for your business. You do not need to configure anything right now. We&apos;ll
            notify you as soon as your account is ready.
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>What happens next</CardTitle>
            <CardDescription>We keep the launch handled for you, then unlock the full workspace when it is ready.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border bg-background/85 p-4">
              <p className="font-medium text-foreground">1. We review your account</p>
              <p className="mt-1">We confirm the owner details and queue your business for setup.</p>
            </div>
            <div className="rounded-2xl border bg-background/85 p-4">
              <p className="font-medium text-foreground">2. We prepare the missed-call recovery flow</p>
              <p className="mt-1">We handle the setup work, test the first handoff, and keep the status honest.</p>
            </div>
            <div className="rounded-2xl border bg-background/85 p-4">
              <p className="font-medium text-foreground">3. You get the ready notice</p>
              <p className="mt-1">As soon as the workspace is ready, we email you and unlock the Lead Recovery Command Center.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Account status</CardTitle>
            <CardDescription>Everything here stays customer-facing and non-technical.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {showBusinessName ? (
              <div className="rounded-2xl border bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Business</p>
                <p className="mt-2 font-medium text-foreground">{businessName}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border bg-background/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Setup status</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{customerSetupStatusLabels[status]}</Badge>
                <span className="text-muted-foreground">{getCustomerSetupStatusDetail(status)}</span>
              </div>
            </div>
            <div className="rounded-2xl border bg-background/80 p-4 text-muted-foreground">
              Need help or want to show a teammate how it works? Email{' '}
              <a className="font-medium text-foreground underline underline-offset-4" href="mailto:support@callbackcloser.com">
                support@callbackcloser.com
              </a>
              .
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className={buttonVariants()} href="/simulator">
                Try the missed-call simulator
              </Link>
              <Link className={buttonVariants({ variant: 'outline' })} href="/contact">
                Contact support
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
