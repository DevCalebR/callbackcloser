import Link from 'next/link';

import { SetupChecklist } from '@/components/setup-checklist';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { getBusinessNotificationSettingsForBusiness } from '@/lib/business-access';
import { getBusinessRoutingNumber, getPublicBusinessPhone } from '@/lib/business-phone-setup';
import { db } from '@/lib/db';
import { formatPhoneForDisplay } from '@/lib/phone';
import { isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getCustomerSystemStatus } from '@/lib/system-status';

function formatMaybePhone(value: string | null | undefined, fallback: string) {
  return value ? formatPhoneForDisplay(value) : fallback;
}

export default async function CallFlowPage() {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const [notificationSettings, successfulLeadCount] = demoMode
    ? [null, 1]
    : await Promise.all([
        getBusinessNotificationSettingsForBusiness(business.id),
        db.lead.count({
          where: {
            businessId: business.id,
            OR: [{ ownerNotifiedAt: { not: null } }, { notifiedAt: { not: null } }],
          },
        }),
      ]);

  const customerFacingNumber = getPublicBusinessPhone(business) || getBusinessRoutingNumber(business);
  const forwardingNumber = business.forwardingNumber;
  const ownerAlertDestination = notificationSettings?.ownerPhone || business.notifyPhone || notificationSettings?.ownerEmail || null;
  const systemStatus = getCustomerSystemStatus(business, successfulLeadCount);
  const textRepliesReady = systemStatus.key === 'live';

  const setupItems = [
    {
      key: 'customer-number',
      label: 'Customer calling number',
      detail: customerFacingNumber
        ? `Customers can call ${formatPhoneForDisplay(customerFacingNumber)}.`
        : 'CallbackCloser is finishing the number customers should call.',
      complete: Boolean(customerFacingNumber),
    },
    {
      key: 'answer-number',
      label: 'Team answer number',
      detail: forwardingNumber
        ? `Live calls ring ${formatPhoneForDisplay(forwardingNumber)}.`
        : 'Add the owner or staff number your team answers.',
      complete: Boolean(forwardingNumber),
    },
    {
      key: 'text-replies',
      label: 'Missed-call text replies',
      detail: textRepliesReady
        ? 'Missed callers can receive the follow-up text automatically.'
        : 'CallbackCloser is finishing this before automatic text replies go fully live.',
      complete: textRepliesReady,
    },
    {
      key: 'owner-alerts',
      label: 'Owner alerts',
      detail: ownerAlertDestination
        ? `Lead summaries go to ${ownerAlertDestination.startsWith('+') ? formatPhoneForDisplay(ownerAlertDestination) : ownerAlertDestination}.`
        : 'Add the phone or email that should receive lead summaries.',
      complete: Boolean(ownerAlertDestination),
    },
  ];

  const flowSteps = [
    {
      title: 'A customer calls',
      detail: customerFacingNumber
        ? `They call ${formatPhoneForDisplay(customerFacingNumber)}, the number connected to missed-call recovery.`
        : 'CallbackCloser will show the connected customer number here once setup is finished.',
    },
    {
      title: 'Your team gets the live call',
      detail: forwardingNumber
        ? `The call rings ${formatPhoneForDisplay(forwardingNumber)} so your team can answer normally.`
        : 'Add the phone your team answers so live calls reach the right person.',
    },
    {
      title: 'Missed callers get a quick text',
      detail: 'If the call is missed, CallbackCloser asks what they need, how urgent it is, where they are, and when you should call back.',
    },
    {
      title: 'You get a lead summary',
      detail: ownerAlertDestination
        ? `CallbackCloser sends the summary to ${ownerAlertDestination.startsWith('+') ? formatPhoneForDisplay(ownerAlertDestination) : ownerAlertDestination}.`
        : 'Add an owner alert destination so qualified lead summaries reach you.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="outline">How it works</Badge>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">How missed calls are handled</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              A simple view of what callers experience, where live calls ring, and where lead summaries are sent.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/settings">
              Edit settings
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/leads">
              Open leads
            </Link>
          </div>
        </div>
      </div>

      <SetupChecklist
        title="Missed-call setup"
        description="The essentials owners need to know: what number callers use, where calls ring, whether texts are active, and where lead summaries go."
        items={setupItems}
      />

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Caller experience</CardTitle>
            <CardDescription>From incoming call to ready-to-call lead summary.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {flowSteps.map((step, index) => (
              <div key={step.title} className="rounded-xl border bg-background/80 p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Current numbers</CardTitle>
            <CardDescription>Use these to confirm the owner-facing call path.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Number customers call</p>
              <p className="mt-2 text-muted-foreground">{formatMaybePhone(customerFacingNumber, 'Setup in progress')}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Number your team answers</p>
              <p className="mt-2 text-muted-foreground">{formatMaybePhone(forwardingNumber, 'Not saved yet')}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Lead summary destination</p>
              <p className="mt-2 text-muted-foreground">
                {ownerAlertDestination
                  ? ownerAlertDestination.startsWith('+')
                    ? formatPhoneForDisplay(ownerAlertDestination)
                    : ownerAlertDestination
                  : 'Not saved yet'}
              </p>
            </div>
            <div className="grid gap-3">
              {customerFacingNumber ? (
                <Link className={buttonVariants()} href={`tel:${customerFacingNumber}`}>
                  Place a test call
                </Link>
              ) : null}
              <Link className={buttonVariants({ variant: 'outline' })} href="/app/settings">
                Update business settings
              </Link>
              <Link className={buttonVariants({ variant: 'outline' })} href="/app/billing">
                Open billing
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
