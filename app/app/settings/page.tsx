import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requireBusiness } from '@/lib/auth';
import { averageJobValueCentsToDollars } from '@/lib/business-settings';
import { getBusinessNotificationSettingsForBusiness } from '@/lib/business-access';
import { getBusinessRoutingNumber, getPublicBusinessPhone } from '@/lib/business-phone-setup';
import { db } from '@/lib/db';
import { formatPhoneForDisplay } from '@/lib/phone';
import { isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getCustomerSystemStatus } from '@/lib/system-status';

import { saveBusinessSettingsAction } from './actions';

type StatusTone = 'success' | 'secondary' | 'outline';

function getStatusBadge(complete: boolean, pendingLabel = 'Needs attention') {
  return {
    label: complete ? 'Ready' : pendingLabel,
    variant: complete ? ('success' as const) : ('outline' as const),
  };
}

function getTextingStatus(systemStatus: ReturnType<typeof getCustomerSystemStatus>) {
  if (systemStatus.key === 'live') {
    return {
      label: 'Text replies active',
      detail: 'Missed callers can receive the follow-up text automatically.',
      variant: 'success' as StatusTone,
    };
  }

  if (systemStatus.key === 'activating') {
    return {
      label: 'Text replies being finished',
      detail: 'CallbackCloser is still finishing the behind-the-scenes setup before automatic texting is fully live.',
      variant: 'secondary' as StatusTone,
    };
  }

  return {
    label: 'Text replies not live yet',
    detail: 'CallbackCloser will notify you when missed-call texting is ready to test.',
    variant: 'outline' as StatusTone,
  };
}

export default async function SettingsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const averageJobValue = averageJobValueCentsToDollars(business.averageJobValueCents);
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const saved = searchParams?.saved === '1';

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

  const publicBusinessPhone = getPublicBusinessPhone(business);
  const connectedNumber = getBusinessRoutingNumber(business);
  const ownerAlertPhone = notificationSettings?.ownerPhone || business.notifyPhone || null;
  const ownerAlertEmail = notificationSettings?.ownerEmail || null;
  const systemStatus = getCustomerSystemStatus(business, successfulLeadCount);
  const textingStatus = getTextingStatus(systemStatus);
  const businessNumberStatus = getStatusBadge(Boolean(publicBusinessPhone || connectedNumber), 'Not connected yet');
  const ownerAlertStatus = getStatusBadge(Boolean(ownerAlertPhone || ownerAlertEmail), 'Add destination');

  const statusCards = [
    {
      key: 'business-number',
      title: 'Business number',
      badge: businessNumberStatus,
      detail: publicBusinessPhone
        ? `Customers can keep calling ${formatPhoneForDisplay(publicBusinessPhone)}.`
        : connectedNumber
          ? `Use ${formatPhoneForDisplay(connectedNumber)} for missed-call coverage.`
          : 'CallbackCloser is still finishing the number setup for this account.',
    },
    {
      key: 'text-replies',
      title: 'Text replies',
      badge: {
        label: textingStatus.variant === 'success' ? 'Ready' : textingStatus.variant === 'secondary' ? 'In progress' : 'Not live yet',
        variant: textingStatus.variant,
      },
      detail: textingStatus.detail,
    },
    {
      key: 'owner-alerts',
      title: 'Owner alerts',
      badge: ownerAlertStatus,
      detail: ownerAlertPhone
        ? `Lead summaries go to ${formatPhoneForDisplay(ownerAlertPhone)}.`
        : ownerAlertEmail
          ? `Lead summaries go to ${ownerAlertEmail}.`
          : 'Add the phone or email that should receive lead summaries.',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Badge variant="outline">Settings</Badge>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Business settings</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Keep the business details and owner alert destinations current. CallbackCloser handles the phone and messaging setup in the background.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/call-flow">
              How missed calls work
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/leads">
              Open leads
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business settings saved.</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        {statusCards.map((item) => (
          <Card key={item.key} className="bg-card/90">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{item.title}</CardTitle>
                <Badge variant={item.badge.variant}>{item.badge.label}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>These details shape lead summaries, revenue estimates, and owner notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveBusinessSettingsAction} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="phoneSetupPath" value={business.phoneSetupPath} />
            <input type="hidden" name="forwardedCallAnswerMode" value={business.forwardedCallAnswerMode} />
            <input type="hidden" name="messagingSetupMode" value={business.messagingSetupMode} />
            <div className="md:col-span-2">
              <Label htmlFor="settingsBusinessName">Business name</Label>
              <Input id="settingsBusinessName" name="name" defaultValue={business.name} required />
            </div>
            <div>
              <Label htmlFor="settingsPublicBusinessPhone">Public business number</Label>
              <Input id="settingsPublicBusinessPhone" name="publicBusinessPhone" defaultValue={business.publicBusinessPhone || ''} />
            </div>
            <div>
              <Label htmlFor="settingsForwardingNumber">Number your team answers</Label>
              <Input id="settingsForwardingNumber" name="forwardingNumber" defaultValue={business.forwardingNumber} required />
            </div>
            <div>
              <Label htmlFor="settingsNotifyPhone">Owner alert phone</Label>
              <Input id="settingsNotifyPhone" name="notifyPhone" defaultValue={ownerAlertPhone || ''} />
            </div>
            <div>
              <Label htmlFor="settingsOwnerEmail">Owner alert email</Label>
              <Input id="settingsOwnerEmail" name="ownerEmail" defaultValue={ownerAlertEmail || ''} placeholder="owner@business.com" />
            </div>
            <div>
              <Label htmlFor="settingsTimezone">Timezone</Label>
              <Input id="settingsTimezone" name="timezone" defaultValue={business.timezone} required />
            </div>
            <div>
              <Label htmlFor="settingsMissedCallSeconds">Missed-call wait time (seconds)</Label>
              <Input id="settingsMissedCallSeconds" name="missedCallSeconds" type="number" min={5} max={90} defaultValue={business.missedCallSeconds} required />
            </div>
            <div>
              <Label htmlFor="settingsAverageJobValue">Average job value</Label>
              <Input
                id="settingsAverageJobValue"
                name="averageJobValue"
                type="number"
                min={1}
                max={100000}
                step={1}
                defaultValue={averageJobValue ?? ''}
                placeholder="500"
              />
              <p className="mt-2 text-xs text-muted-foreground">Used to estimate recovered revenue on your dashboard.</p>
            </div>
            <div>
              <Label htmlFor="settingsServiceLabel1">Service option 1</Label>
              <Input id="settingsServiceLabel1" name="serviceLabel1" defaultValue={business.serviceLabel1} required />
            </div>
            <div>
              <Label htmlFor="settingsServiceLabel2">Service option 2</Label>
              <Input id="settingsServiceLabel2" name="serviceLabel2" defaultValue={business.serviceLabel2} required />
            </div>
            <div>
              <Label htmlFor="settingsServiceLabel3">Service option 3</Label>
              <Input id="settingsServiceLabel3" name="serviceLabel3" defaultValue={business.serviceLabel3} required />
            </div>
            <label className="rounded-xl border bg-background/80 p-4 text-sm">
              <div className="flex items-start gap-3">
                <input defaultChecked={notificationSettings?.notifySms ?? true} name="notifySms" type="checkbox" value="true" />
                <span>Send owner text alerts</span>
              </div>
            </label>
            <label className="rounded-xl border bg-background/80 p-4 text-sm">
              <div className="flex items-start gap-3">
                <input defaultChecked={notificationSettings?.notifyEmail ?? true} name="notifyEmail" type="checkbox" value="true" />
                <span>Send owner email alerts</span>
              </div>
            </label>
            <label className="rounded-xl border bg-background/80 p-4 text-sm">
              <div className="flex items-start gap-3">
                <input defaultChecked={notificationSettings?.notifyInApp ?? true} name="notifyInApp" type="checkbox" value="true" />
                <span>Show alerts in the dashboard</span>
              </div>
            </label>
            <label className="rounded-xl border bg-background/80 p-4 text-sm">
              <div className="flex items-start gap-3">
                <input defaultChecked={notificationSettings?.urgentOnly ?? false} name="urgentOnly" type="checkbox" value="true" />
                <span>Only alert me for urgent leads</span>
              </div>
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Save settings</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Need setup help?</CardTitle>
          <CardDescription>Phone changes and messaging approvals are handled by CallbackCloser support.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <p className="w-full max-w-3xl">
            If your business number, forwarding destination, or owner alert destination changes, update the fields above. CallbackCloser will handle any background setup needed to keep missed-call recovery working.
          </p>
          <Link className={buttonVariants({ variant: 'outline' })} href="/contact">
            Contact support
          </Link>
          <Link className={buttonVariants({ variant: 'ghost' })} href="/sms-consent">
            SMS consent
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
