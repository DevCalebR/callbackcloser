import Link from 'next/link';

import {
  createAdminBusinessAction,
  createDemoBusinessAction,
  provisionBusinessAction,
  resyncBusinessWebhooksAction,
  restoreBusinessAction,
  setBusinessProvisioningStatusAction,
} from '@/app/admin/actions';
import {
  adminBoardFilterOptions,
  buildAdminNextStep,
  getBusinessLifecycleLabel,
  isBusinessArchived,
  matchesAdminBoardFilter,
  type AdminBoardFilter,
} from '@/lib/admin-dashboard';
import { requireAdmin } from '@/lib/admin';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  adminProvisioningStatusLabels,
  getAdminProvisioningStatusVariant,
  isPendingOwnerClerkId,
} from '@/lib/admin-provisioning';
import { searchBusinessesForAdmin } from '@/lib/business';
import { db } from '@/lib/db';
import { formatDateTime, formatRelativeTime } from '@/lib/lead-presenters';
import { getManagedTextingNumber, getManagedTwilioStatusSummary } from '@/lib/managed-twilio';
import { formatPhoneForDisplay } from '@/lib/phone';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function getQueryValue(searchParams: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = searchParams?.[key];
  return typeof value === 'string' ? value : null;
}

function maxDate(...values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function getNextStepBadgeVariant(tone: 'healthy' | 'pending' | 'attention' | 'paused') {
  if (tone === 'healthy') return 'success' as const;
  if (tone === 'attention') return 'destructive' as const;
  if (tone === 'paused') return 'outline' as const;
  return 'secondary' as const;
}

export default async function AdminPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const admin = await requireAdmin();
  const createdDemo = getQueryValue(searchParams, 'createdDemo') === '1';
  const createdBusinessId = getQueryValue(searchParams, 'businessId');
  const deleted = getQueryValue(searchParams, 'deleted') === '1';
  const error = getQueryValue(searchParams, 'error');
  const query = getQueryValue(searchParams, 'q')?.trim() || '';
  const view = (getQueryValue(searchParams, 'view') as AdminBoardFilter | null) || 'all';
  const adminBusiness = await db.business.findUnique({ where: { ownerClerkId: admin.userId } });

  const [businesses, leadCounts, leadActivity, callActivity, messageActivity, notificationFailures] = await Promise.all([
    query
      ? searchBusinessesForAdmin(query)
      : db.business.findMany({
          orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
          include: {
            notificationSettings: true,
          },
        }),
    db.lead.groupBy({
      by: ['businessId'],
      _count: { _all: true },
      _max: { lastInteractionAt: true, createdAt: true },
    }),
    db.lead.groupBy({
      by: ['businessId'],
      _max: { lastInteractionAt: true, createdAt: true },
    }),
    db.call.groupBy({
      by: ['businessId'],
      _max: { createdAt: true },
    }),
    db.message.groupBy({
      by: ['businessId'],
      _max: { createdAt: true },
    }),
    db.ownerNotification.findMany({
      where: {
        status: { in: ['FAILED', 'SKIPPED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        businessId: true,
        status: true,
        error: true,
        createdAt: true,
      },
      take: 200,
    }),
  ]);

  const leadCountMap = new Map(leadCounts.map((item) => [item.businessId, item._count._all]));
  const leadActivityMap = new Map(
    leadActivity.map((item) => [item.businessId, maxDate(item._max.lastInteractionAt, item._max.createdAt)])
  );
  const callActivityMap = new Map(callActivity.map((item) => [item.businessId, item._max.createdAt]));
  const messageActivityMap = new Map(messageActivity.map((item) => [item.businessId, item._max.createdAt]));
  const notificationFailureMap = new Map<string, { status: string; error: string | null; createdAt: Date }>();

  for (const failure of notificationFailures) {
    if (!notificationFailureMap.has(failure.businessId)) {
      notificationFailureMap.set(failure.businessId, failure);
    }
  }

  const businessRows = businesses.map((business) => {
    const managedSummary = getManagedTwilioStatusSummary(business);
    const ownerPending = isPendingOwnerClerkId(business.ownerClerkId);
    const ownerConnected = !ownerPending;
    const nextStep = buildAdminNextStep({
      business,
      notificationSettings: business.notificationSettings,
      ownerConnected,
    });
    const lastActivityAt = maxDate(
      business.updatedAt,
      leadActivityMap.get(business.id),
      callActivityMap.get(business.id),
      messageActivityMap.get(business.id)
    );
    const latestFailure = notificationFailureMap.get(business.id);

    return {
      business,
      ownerPending,
      ownerConnected,
      managedSummary,
      nextStep,
      leadCount: leadCountMap.get(business.id) ?? 0,
      assignedNumber: getManagedTextingNumber(business),
      lastActivityAt,
      latestFailure,
    };
  });

  const filterCounts = new Map(
    adminBoardFilterOptions.map((option) => [
      option.key,
      businessRows.filter((item) =>
        matchesAdminBoardFilter(item.business, item.business.notificationSettings, item.ownerConnected, option.key)
      ).length,
    ])
  );

  const visibleRows = businessRows.filter((item) =>
    matchesAdminBoardFilter(item.business, item.business.notificationSettings, item.ownerConnected, view)
  );

  const summaryStats = [
    { label: 'Needs attention', value: filterCounts.get('needs_attention') ?? 0 },
    { label: 'Live', value: filterCounts.get('live') ?? 0 },
    { label: 'Pending A2P', value: filterCounts.get('pending_a2p') ?? 0 },
    { label: 'Archived', value: filterCounts.get('archived') ?? 0 },
  ];

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-3">
        <Badge variant="outline">Internal Admin</Badge>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Operator triage board</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Open admin and immediately see which businesses are healthy, which ones need help, and the next safe action to take.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {summaryStats.map((item) => (
              <Card key={item.label} className="bg-card/90">
                <CardHeader className="pb-2">
                  <CardDescription>{item.label}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {deleted ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Archived test business deleted.</div> : null}
      {createdDemo && createdBusinessId ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Demo business ready. Use <code className="rounded bg-background px-1 py-0.5">{createdBusinessId}</code> as `SIMULATOR_BUSINESS_ID`, or open the
          support workspace below.
        </div>
      ) : null}

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Find any business fast</CardTitle>
          <CardDescription>Search by business name, owner email, business ID, Twilio number, or Twilio SID.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <Input
              aria-label="Search businesses"
              defaultValue={query}
              name="q"
              placeholder="Search name, owner email, +18777480449, PN..., or business ID"
            />
            <input type="hidden" name="view" value={view} />
            <Button type="submit" variant="outline">
              Search
            </Button>
            {query ? (
              <Link className={buttonVariants({ variant: 'ghost' })} href={`/admin?view=${encodeURIComponent(view)}`}>
                Clear
              </Link>
            ) : null}
          </form>
          <div className="flex flex-wrap gap-2">
            {adminBoardFilterOptions.map((option) => {
              const href = query
                ? `/admin?view=${encodeURIComponent(option.key)}&q=${encodeURIComponent(query)}`
                : `/admin?view=${encodeURIComponent(option.key)}`;
              return (
                <Link
                  key={option.key}
                  className={cn(
                    buttonVariants({ variant: option.key === view ? 'default' : 'outline', size: 'sm' }),
                    option.key === view && 'pointer-events-none'
                  )}
                  href={href}
                >
                  {option.label} ({filterCounts.get(option.key) ?? 0})
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Create customer business</CardTitle>
            <CardDescription>
              Save the business workspace, owner details, test flag, and default routing in one pass so provisioning can start immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createAdminBusinessAction} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Business name</Label>
                <Input id="name" name="name" placeholder="Acme Plumbing" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner name</Label>
                <Input id="ownerName" name="ownerName" placeholder="Casey Owner" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner email</Label>
                <Input id="ownerEmail" name="ownerEmail" type="email" placeholder="owner@business.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerPhone">Owner alert phone</Label>
                <Input id="ownerPhone" name="ownerPhone" type="tel" placeholder="+1 555 123 4567" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forwardingNumber">Forwarding number</Label>
                <Input id="forwardingNumber" name="forwardingNumber" type="tel" placeholder="+1 555 111 0000" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" name="timezone" defaultValue="America/New_York" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="missedCallSeconds">Missed-call timeout</Label>
                <Input id="missedCallSeconds" name="missedCallSeconds" type="number" min={5} max={90} defaultValue={20} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceLabel1">Primary service label</Label>
                <Input id="serviceLabel1" name="serviceLabel1" defaultValue="Repair" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceLabel2">Secondary service label</Label>
                <Input id="serviceLabel2" name="serviceLabel2" defaultValue="Install" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceLabel3">Tertiary service label</Label>
                <Input id="serviceLabel3" name="serviceLabel3" defaultValue="Maintenance" />
              </div>
              <label className="md:col-span-2 flex items-start gap-2 rounded-xl border bg-background/80 p-3 text-sm">
                <input name="isTestBusiness" type="checkbox" value="true" />
                <span>Mark this as a test/demo business so it can be safely archived and deleted later.</span>
              </label>
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <Button type="submit">Create business workspace</Button>
                <p className="text-sm text-muted-foreground">If the owner already exists in Clerk, CallbackCloser will connect that account automatically.</p>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Create dedicated simulator workspace</CardTitle>
            <CardDescription>Keep simulator traffic isolated from real customers while still using the real operator controls.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createDemoBusinessAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="demoOwnerPhone">Owner phone for previews</Label>
                <Input
                  id="demoOwnerPhone"
                  name="ownerPhone"
                  type="tel"
                  defaultValue={adminBusiness?.notifyPhone || ''}
                  placeholder="+1 555 123 4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demoOwnerEmail">Owner email for previews</Label>
                <Input
                  id="demoOwnerEmail"
                  name="ownerEmail"
                  type="email"
                  defaultValue={admin.email || ''}
                  placeholder="owner@callbackcloser.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demoForwardingNumber">Forwarding number</Label>
                <Input
                  id="demoForwardingNumber"
                  name="forwardingNumber"
                  type="tel"
                  defaultValue={adminBusiness?.forwardingNumber || ''}
                  placeholder="+1 555 000 0001"
                />
              </div>
              <Button type="submit">Create demo workspace</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Businesses</h2>
            <p className="text-sm text-muted-foreground">
              {query ? `Showing ${visibleRows.length} result${visibleRows.length === 1 ? '' : 's'} for ${query}.` : 'Use this board as the founder control center.'}
            </p>
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <Card className="bg-card/90">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No businesses matched this view. Try a different filter or search for the exact business ID, owner email, or Twilio number.
            </CardContent>
          </Card>
        ) : (
          visibleRows.map(({ business, ownerPending, managedSummary, nextStep, leadCount, assignedNumber, lastActivityAt, latestFailure }) => (
            <Card key={business.id} className="bg-card/90">
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="text-lg font-semibold hover:underline" href={`/admin/${business.id}`}>
                        {business.name}
                      </Link>
                      {business.isTestBusiness ? <Badge variant="outline">Test</Badge> : null}
                      {isBusinessArchived(business) ? <Badge variant="outline">Archived</Badge> : null}
                      <Badge variant={getNextStepBadgeVariant(nextStep.tone)}>{nextStep.title}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{business.id}</span>
                      <span>Owner: {business.ownerName || 'Missing owner name'}</span>
                      <span>{business.notificationSettings?.ownerEmail || 'Missing owner email'}</span>
                      {ownerPending ? <span>Owner invite pending</span> : <span>Owner linked</span>}
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">{nextStep.detail}</p>
                    {latestFailure ? (
                      <p className="text-sm text-destructive">
                        Latest attention item: {latestFailure.error || `${latestFailure.status.toLowerCase()} owner notification`} on{' '}
                        {formatDateTime(latestFailure.createdAt)}.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link className={buttonVariants({ variant: 'default' })} href={`/admin/${business.id}`}>
                      Open operator page
                    </Link>
                    <Link className={buttonVariants({ variant: 'outline' })} href={`/admin/${business.id}/workspace`}>
                      Open support workspace
                    </Link>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border bg-background/80 p-4 text-sm">
                    <p className="font-medium text-foreground">Lifecycle</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={getAdminProvisioningStatusVariant(business.provisioningStatus)}>
                        {adminProvisioningStatusLabels[business.provisioningStatus]}
                      </Badge>
                      <Badge variant={managedSummary.messagingReady ? 'success' : managedSummary.attentionRequired ? 'destructive' : 'secondary'}>
                        {managedSummary.messagingReady ? 'Healthy' : managedSummary.attentionRequired ? 'Needs attention' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{getBusinessLifecycleLabel(business)}</p>
                  </div>

                  <div className="rounded-xl border bg-background/80 p-4 text-sm">
                    <p className="font-medium text-foreground">Twilio readiness</p>
                    <p className="mt-2">{managedSummary.label}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {assignedNumber ? `Number ${formatPhoneForDisplay(assignedNumber)}` : 'No number assigned yet'}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-background/80 p-4 text-sm">
                    <p className="font-medium text-foreground">A2P + webhooks</p>
                    <p className="mt-2">
                      {managedSummary.complianceReady ? 'Approved' : managedSummary.complianceStarted ? 'Pending review' : 'Not started'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {business.twilioWebhookSyncedAt ? `Webhook sync ${formatRelativeTime(business.twilioWebhookSyncedAt)}` : 'Webhook sync still needed'}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-background/80 p-4 text-sm">
                    <p className="font-medium text-foreground">Activity</p>
                    <p className="mt-2">{leadCount} lead{leadCount === 1 ? '' : 's'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {lastActivityAt ? `Last activity ${formatRelativeTime(lastActivityAt)}` : 'No activity yet'}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-background/80 p-4 text-sm">
                    <p className="font-medium text-foreground">Quick recovery</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {isBusinessArchived(business) ? (
                        <form action={restoreBusinessAction}>
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="confirmationName" value={business.name} />
                          <Button size="sm" type="submit" variant="outline">
                            Restore
                          </Button>
                        </form>
                      ) : !assignedNumber ? (
                        <form action={provisionBusinessAction}>
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="mode" value="NEW_NUMBER" />
                          <Button size="sm" type="submit">
                            Provision
                          </Button>
                        </form>
                      ) : (
                        <form action={resyncBusinessWebhooksAction}>
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="target" value="ALL" />
                          <Button size="sm" type="submit" variant="outline">
                            Re-sync webhooks
                          </Button>
                        </form>
                      )}

                      <form action={setBusinessProvisioningStatusAction}>
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="status" value={business.provisioningStatus === 'PAUSED' ? 'ONBOARDING' : 'PAUSED'} />
                        <Button size="sm" type="submit" variant="ghost">
                          {business.provisioningStatus === 'PAUSED' ? 'Resume' : 'Pause'}
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
