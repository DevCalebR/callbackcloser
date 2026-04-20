import Link from 'next/link';

import {
  archiveBusinessAction,
  createAdminBusinessAction,
  createDemoBusinessAction,
  deleteTestBusinessAction,
  provisionBusinessAction,
  resyncBusinessWebhooksAction,
  restoreBusinessAction,
  sendBusinessTestSmsAction,
} from '@/app/admin/actions';
import {
  adminBoardFilterOptions,
  buildAdminBusinessPickerLabel,
  buildAdminNextStep,
  canDeleteTestBusiness,
  getDeleteTestBusinessBlockedReason,
  isBusinessArchived,
  matchesAdminBoardFilter,
  type AdminBoardFilter,
} from '@/lib/admin-dashboard';
import { AdminBusinessPicker } from '@/components/admin-business-picker';
import { requireAdmin } from '@/lib/admin';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isPendingOwnerClerkId } from '@/lib/admin-provisioning';
import { searchBusinessesForAdmin } from '@/lib/business';
import { db } from '@/lib/db';
import { formatDateTime, formatRelativeTime } from '@/lib/lead-presenters';
import { getManagedTextingNumber, getManagedTwilioStatusSummary } from '@/lib/managed-twilio-status';
import { OperatorEventStatus } from '@prisma/client';
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

function getOverallStatus(params: {
  archived: boolean;
  paused: boolean;
  live: boolean;
  needsAttention: boolean;
}) {
  if (params.archived) return { label: 'Archived', variant: 'outline' as const };
  if (params.paused) return { label: 'Paused', variant: 'outline' as const };
  if (params.needsAttention) return { label: 'Needs attention', variant: 'destructive' as const };
  if (params.live) return { label: 'Live', variant: 'success' as const };
  return { label: 'Pending', variant: 'secondary' as const };
}

function getA2pStateLabel(params: { complianceReady: boolean; attentionRequired: boolean; complianceStarted: boolean }) {
  if (params.complianceReady) return { label: 'Approved', variant: 'success' as const };
  if (params.attentionRequired) return { label: 'Needs attention', variant: 'destructive' as const };
  if (params.complianceStarted) return { label: 'Pending', variant: 'secondary' as const };
  return { label: 'Not started', variant: 'outline' as const };
}

function compactCopy(value: string, maxLength = 110) {
  const trimmed = value.trim();
  if (!trimmed) return 'No issues recorded.';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function buildAdminBoardReturnPath(params: {
  view: AdminBoardFilter;
  selectedBusinessId?: string | null;
  query?: string | null;
}) {
  const search = new URLSearchParams();

  if (params.view && params.view !== 'all') {
    search.set('view', params.view);
  }

  if (params.query) {
    search.set('q', params.query);
  }

  if (params.selectedBusinessId) {
    search.set('businessId', params.selectedBusinessId);
  }

  const query = search.toString();
  return query ? `/admin?${query}` : '/admin';
}

export default async function AdminPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const admin = await requireAdmin();
  const createdDemo = getQueryValue(searchParams, 'createdDemo') === '1';
  const createdBusinessId = getQueryValue(searchParams, 'createdBusinessId');
  const selectedBusinessId = getQueryValue(searchParams, 'businessId');
  const archived = getQueryValue(searchParams, 'archived') === '1';
  const deleted = getQueryValue(searchParams, 'deleted') === '1';
  const error = getQueryValue(searchParams, 'error');
  const query = getQueryValue(searchParams, 'q')?.trim() || '';
  const restored = getQueryValue(searchParams, 'restored') === '1';
  const view = (getQueryValue(searchParams, 'view') as AdminBoardFilter | null) || 'all';
  const adminBusiness = await db.business.findUnique({ where: { ownerClerkId: admin.userId } });

  const [businesses, businessPickerOptions, leadCounts, leadActivity, callActivity, messageActivity, notificationFailures, operatorSignals] = await Promise.all([
    query
      ? searchBusinessesForAdmin(query)
      : db.business.findMany({
          orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
          include: {
            notificationSettings: true,
          },
        }),
    db.business.findMany({
      orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        isTestBusiness: true,
        archivedAt: true,
        twilioPrimaryPhoneNumber: true,
        twilioPhoneNumber: true,
        notificationSettings: {
          select: {
            ownerEmail: true,
          },
        },
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
    db.businessOperatorEvent.findMany({
      where: {
        status: { in: [OperatorEventStatus.FAILED, OperatorEventStatus.WARNING] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        businessId: true,
        status: true,
      },
      take: 600,
    }),
  ]);

  const leadCountMap = new Map(leadCounts.map((item) => [item.businessId, item._count._all]));
  const leadActivityMap = new Map(
    leadActivity.map((item) => [item.businessId, maxDate(item._max.lastInteractionAt, item._max.createdAt)])
  );
  const callActivityMap = new Map(callActivity.map((item) => [item.businessId, item._max.createdAt]));
  const messageActivityMap = new Map(messageActivity.map((item) => [item.businessId, item._max.createdAt]));
  const notificationFailureMap = new Map<string, { status: string; error: string | null; createdAt: Date }>();
  const operatorSignalMap = new Map<string, { failed: number; warning: number }>();

  for (const failure of notificationFailures) {
    if (!notificationFailureMap.has(failure.businessId)) {
      notificationFailureMap.set(failure.businessId, failure);
    }
  }

  for (const signal of operatorSignals) {
    const entry = operatorSignalMap.get(signal.businessId) || { failed: 0, warning: 0 };
    if (signal.status === OperatorEventStatus.FAILED) {
      entry.failed += 1;
    } else {
      entry.warning += 1;
    }
    operatorSignalMap.set(signal.businessId, entry);
  }

  const businessRows = businesses.map((business) => {
    const managedSummary = getManagedTwilioStatusSummary(business);
    const ownerPending = isPendingOwnerClerkId(business.ownerClerkId);
    const ownerConnected = !ownerPending;
    const ownerStatusLabel = !business.notificationSettings?.ownerEmail
      ? 'Owner email missing'
      : ownerPending
        ? business.ownerInviteSentAt
          ? 'Invite sent'
          : 'Invite ready'
        : 'Connected';
    const ownerStatusVariant = !business.notificationSettings?.ownerEmail
      ? ('destructive' as const)
      : ownerPending
        ? business.ownerInviteSentAt
          ? ('outline' as const)
          : ('secondary' as const)
        : ('success' as const);
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
    const assignedNumber = getManagedTextingNumber(business);
    const archived = isBusinessArchived(business);
    const paused = !archived && business.provisioningStatus === 'PAUSED';
    const overallStatus = getOverallStatus({
      archived,
      paused,
      live: business.provisioningStatus === 'LIVE' && managedSummary.messagingReady,
      needsAttention: nextStep.tone === 'attention' || managedSummary.attentionRequired,
    });
    const a2pState = getA2pStateLabel({
      complianceReady: managedSummary.complianceReady,
      attentionRequired: managedSummary.attentionRequired,
      complianceStarted: managedSummary.complianceStarted,
    });
    const attentionSignal = latestFailure
      ? compactCopy(`${latestFailure.error || `${latestFailure.status.toLowerCase()} owner notification`} on ${formatDateTime(latestFailure.createdAt)}.`)
      : nextStep.tone === 'healthy'
        ? 'Healthy. No immediate operator action needed.'
        : compactCopy(`${nextStep.title}. ${nextStep.detail}`);
    const operatorSignals = operatorSignalMap.get(business.id) || { failed: 0, warning: 0 };

    return {
      business,
      ownerConnected,
      ownerStatusLabel,
      ownerStatusVariant,
      managedSummary,
      nextStep,
      leadCount: leadCountMap.get(business.id) ?? 0,
      assignedNumber,
      lastActivityAt,
      latestFailure,
      overallStatus,
      a2pState,
      attentionSignal,
      operatorSignals,
      canSendTestSms: Boolean(assignedNumber && (business.notificationSettings?.ownerPhone || business.notifyPhone)),
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
    selectedBusinessId
      ? item.business.id === selectedBusinessId
      : matchesAdminBoardFilter(item.business, item.business.notificationSettings, item.ownerConnected, view)
  );
  const pickerOptions = businessPickerOptions.map((business) => ({
    id: business.id,
    label: buildAdminBusinessPickerLabel({
      business,
      notificationSettings: business.notificationSettings,
    }),
  }));
  const selectedBusinessRow = selectedBusinessId ? businessRows.find((item) => item.business.id === selectedBusinessId) || null : null;
  const selectedBusinessDeleteBlockedReason = selectedBusinessRow
    ? getDeleteTestBusinessBlockedReason(selectedBusinessRow.business)
    : null;
  const boardReturnTo = buildAdminBoardReturnPath({
    view,
    selectedBusinessId,
    query: selectedBusinessId ? null : query,
  });

  const summaryStats = [
    { label: 'Needs attention', value: filterCounts.get('needs_attention') ?? 0 },
    { label: 'Not fully provisioned', value: filterCounts.get('not_fully_provisioned') ?? 0 },
    { label: 'Live', value: filterCounts.get('live') ?? 0 },
    { label: 'Archived', value: filterCounts.get('archived') ?? 0 },
  ];

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-3">
        <Badge variant="outline">Internal Admin</Badge>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Operator control panel</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Compact business list, fast onboarding entry, and one-click recovery actions so the founder can scan, decide, and move without
              hunting through long pages.
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
      {archived ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business archived. Permanent delete stays locked until the workspace is clearly demo/test.</div> : null}
      {restored ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business restored to active triage.</div> : null}
      {deleted ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Demo/test business deleted permanently.</div> : null}
      {createdDemo && createdBusinessId ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Demo business ready. Use <code className="rounded bg-background px-1 py-0.5">{createdBusinessId}</code> as `SIMULATOR_BUSINESS_ID`, or open the
          support workspace below.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Fast onboard</CardTitle>
            <CardDescription>
              Create the workspace, save owner contact info, and start the managed new-number Twilio path immediately. Owner invite and existing-owner connect stay explicit on the business page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createAdminBusinessAction} className="grid gap-4 md:grid-cols-2">
              <input type="hidden" name="missedCallSeconds" value="20" />
              <input type="hidden" name="serviceLabel1" value="Repair" />
              <input type="hidden" name="serviceLabel2" value="Install" />
              <input type="hidden" name="serviceLabel3" value="Maintenance" />

              <div className="space-y-2">
                <Label htmlFor="name">Business name</Label>
                <Input id="name" name="name" placeholder="Acme Plumbing" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner email</Label>
                <Input id="ownerEmail" name="ownerEmail" type="email" placeholder="owner@business.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner name</Label>
                <Input id="ownerName" name="ownerName" placeholder="Casey Owner" />
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
                <Label htmlFor="areaCode">Preferred area code</Label>
                <Input id="areaCode" name="areaCode" maxLength={3} placeholder="512" />
              </div>

              <label className="md:col-span-2 flex items-start gap-2 rounded-xl border bg-background/80 p-3 text-sm">
                <input name="isTestBusiness" type="checkbox" value="true" />
                <span>Mark as a test/demo business so archive and delete stay safely separated from real customers.</span>
              </label>

              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <Button type="submit">Create workspace and start provisioning</Button>
                <p className="text-sm text-muted-foreground">This saves owner contact info and immediately starts managed Twilio provisioning. Owner invite and existing-owner connect are handled separately inside the business panel.</p>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Demo / support tools</CardTitle>
            <CardDescription>Keep demo traffic and founder troubleshooting inside the same operator flow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form action={createDemoBusinessAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
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
              <Button type="submit" variant="outline">
                Create demo workspace
              </Button>
            </form>

            <div className="rounded-xl border bg-background/80 p-4 text-sm">
              <p className="font-medium text-foreground">What this board should answer immediately</p>
              <ul className="mt-3 space-y-2 text-muted-foreground">
                <li>Which businesses are healthy</li>
                <li>Which ones need intervention</li>
                <li>What the next likely operator action is</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Business triage board</CardTitle>
          <CardDescription>Compact rows with status, readiness, one clear attention signal, and the fastest next actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border bg-background/80 p-4">
              <AdminBusinessPicker options={pickerOptions} query={query || null} selectedBusinessId={selectedBusinessId} view={view} />
            </div>
            <form className="space-y-3 rounded-xl border border-dashed bg-background/80 p-4">
              <div className="space-y-2">
                <Label htmlFor="businessSearch">Search fallback</Label>
                <Input
                  aria-label="Search businesses"
                  defaultValue={query}
                  id="businessSearch"
                  name="q"
                  placeholder="Search business, owner email, business ID, Twilio number, or Twilio SID"
                />
              </div>
              <input type="hidden" name="view" value={view} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="outline">
                  Search
                </Button>
                {query ? (
                  <Link className={buttonVariants({ variant: 'ghost' })} href={buildAdminBoardReturnPath({ view })}>
                    Clear search
                  </Link>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">Use search only when you need an exact email, ID, Twilio number, or SID lookup.</p>
            </form>
          </div>

          <div className="flex flex-wrap gap-2">
            {adminBoardFilterOptions.map((option) => {
              const href = buildAdminBoardReturnPath({
                view: option.key,
                query: selectedBusinessId ? null : query,
                selectedBusinessId,
              });
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

          {selectedBusinessRow ? (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="gap-2">
                <CardTitle className="text-xl">Selected business actions</CardTitle>
                <CardDescription>
                  Focused from the business picker. Archive stays the normal lifecycle action. Permanent delete only unlocks for archived demo/test
                  workspaces.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-4 rounded-xl border bg-background/80 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold">{selectedBusinessRow.business.name}</p>
                    <Badge variant={selectedBusinessRow.overallStatus.variant}>{selectedBusinessRow.overallStatus.label}</Badge>
                    {selectedBusinessRow.business.isTestBusiness ? <Badge variant="outline">Test</Badge> : null}
                    {isBusinessArchived(selectedBusinessRow.business) ? <Badge variant="outline">Archived</Badge> : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="font-medium">Owner</p>
                      <p className="mt-1 text-muted-foreground">
                        {selectedBusinessRow.business.notificationSettings?.ownerEmail || selectedBusinessRow.business.ownerName || 'Owner details missing'}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Assigned number</p>
                      <p className="mt-1 text-muted-foreground">
                        {selectedBusinessRow.assignedNumber ? formatPhoneForDisplay(selectedBusinessRow.assignedNumber) : 'Not assigned yet'}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Latest attention signal</p>
                      <p className="mt-1 text-muted-foreground">{selectedBusinessRow.attentionSignal}</p>
                    </div>
                    <div>
                      <p className="font-medium">Current next step</p>
                      <p className="mt-1 text-muted-foreground">{selectedBusinessRow.nextStep.actionLabel}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link className={buttonVariants({ size: 'sm' })} href={`/admin/${selectedBusinessRow.business.id}`}>
                      Open business
                    </Link>
                    <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/admin/${selectedBusinessRow.business.id}/workspace`}>
                      Open workspace
                    </Link>
                    <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={`/admin/${selectedBusinessRow.business.id}#advanced`}>
                      Open full advanced controls
                    </Link>
                  </div>
                </div>

                <div className="space-y-4">
                  {isBusinessArchived(selectedBusinessRow.business) ? (
                    <form action={restoreBusinessAction} className="rounded-xl border bg-background/80 p-4 text-sm">
                      <input type="hidden" name="businessId" value={selectedBusinessRow.business.id} />
                      <input type="hidden" name="returnTo" value={boardReturnTo} />
                      <div className="space-y-2">
                        <Label htmlFor="restoreBusinessName">Type business name to restore</Label>
                        <Input id="restoreBusinessName" name="confirmationName" placeholder={selectedBusinessRow.business.name} />
                      </div>
                      <Button className="mt-3" type="submit">
                        Restore business
                      </Button>
                    </form>
                  ) : (
                    <form action={archiveBusinessAction} className="rounded-xl border bg-background/80 p-4 text-sm">
                      <input type="hidden" name="businessId" value={selectedBusinessRow.business.id} />
                      <input type="hidden" name="returnTo" value={boardReturnTo} />
                      <div className="space-y-2">
                        <Label htmlFor="archiveBusinessName">Type business name to archive</Label>
                        <Input id="archiveBusinessName" name="confirmationName" placeholder={selectedBusinessRow.business.name} />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Archive is the normal lifecycle control for real customer businesses and the first safety step for demo/test cleanup.</p>
                      <Button className="mt-3" type="submit" variant="outline">
                        Archive business safely
                      </Button>
                    </form>
                  )}

                  {canDeleteTestBusiness(selectedBusinessRow.business) ? (
                    <form action={deleteTestBusinessAction} className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                      <input type="hidden" name="businessId" value={selectedBusinessRow.business.id} />
                      <input type="hidden" name="returnTo" value={boardReturnTo} />
                      <div className="space-y-2">
                        <Label htmlFor="deleteBusinessName">Type business name to permanently delete</Label>
                        <Input id="deleteBusinessName" name="confirmationName" placeholder={selectedBusinessRow.business.name} />
                      </div>
                      <p className="mt-2 text-xs text-destructive">
                        Permanent delete removes the business plus its leads, calls, messages, notification settings, owner notifications, operator
                        events, simulator runs, and SMS consent records.
                      </p>
                      <Button className="mt-3" type="submit" variant="destructive">
                        Delete demo/test business permanently
                      </Button>
                    </form>
                  ) : (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                      {selectedBusinessDeleteBlockedReason || 'Delete stays unavailable for this business.'}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {visibleRows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              {selectedBusinessId
                ? 'That business is no longer available on the board. Clear the selection and pick another workspace.'
                : 'No businesses matched this view. Try a different filter or search for the exact business ID, owner email, or Twilio number.'}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              {visibleRows.map(
                ({
                  business,
                  ownerStatusLabel,
                  ownerStatusVariant,
                  managedSummary,
                  nextStep,
                  leadCount,
                  assignedNumber,
                  lastActivityAt,
                  latestFailure,
                  overallStatus,
                  a2pState,
                  attentionSignal,
                  operatorSignals,
                  canSendTestSms,
                }) => (
                  <div key={business.id} className="grid gap-4 border-t bg-background/80 px-5 py-4 first:border-t-0 xl:grid-cols-[1.7fr_1fr_1.15fr_0.95fr_1.3fr]">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="text-base font-semibold hover:underline" href={`/admin/${business.id}`}>
                          {business.name}
                        </Link>
                        <Badge variant={overallStatus.variant}>{overallStatus.label}</Badge>
                        {business.isTestBusiness ? <Badge variant="outline">Test</Badge> : null}
                        {isBusinessArchived(business) ? <Badge variant="outline">Archived</Badge> : null}
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="font-medium">Needs attention signal</p>
                        <p className={cn('text-muted-foreground', latestFailure ? 'text-destructive' : '')}>{attentionSignal}</p>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{business.id}</span>
                        <span>{leadCount} lead{leadCount === 1 ? '' : 's'}</span>
                        <span>{lastActivityAt ? `Last activity ${formatRelativeTime(lastActivityAt)}` : 'No activity yet'}</span>
                        {operatorSignals.failed > 0 ? <span>{operatorSignals.failed} error{operatorSignals.failed === 1 ? '' : 's'}</span> : null}
                        {operatorSignals.warning > 0 ? <span>{operatorSignals.warning} warning{operatorSignals.warning === 1 ? '' : 's'}</span> : null}
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <p className="font-medium">Owner</p>
                      <p>{business.ownerName || 'Owner name missing'}</p>
                      <p className="text-muted-foreground">{business.notificationSettings?.ownerEmail || 'Owner email missing'}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={ownerStatusVariant}>{ownerStatusLabel}</Badge>
                        {business.notificationSettings?.ownerPhone || business.notifyPhone ? (
                          <Badge variant="outline">{formatPhoneForDisplay(business.notificationSettings?.ownerPhone || business.notifyPhone)}</Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-1">
                      <div>
                        <p className="font-medium">Provisioning</p>
                        <p className="mt-1">{managedSummary.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{managedSummary.nextStep}</p>
                      </div>
                      <div>
                        <p className="font-medium">A2P</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge variant={a2pState.variant}>{a2pState.label}</Badge>
                        </div>
                      </div>
                      <div>
                        <p className="font-medium">Assigned number</p>
                        <p className="mt-1 text-muted-foreground">{assignedNumber ? formatPhoneForDisplay(assignedNumber) : 'Not assigned yet'}</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <p className="font-medium">Next action</p>
                      <p>{nextStep.actionLabel}</p>
                      <p className="text-muted-foreground">{nextStep.title}</p>
                      {business.twilioWebhookSyncedAt ? (
                        <p className="text-xs text-muted-foreground">Webhook sync {formatRelativeTime(business.twilioWebhookSyncedAt)}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Webhook sync still needed</p>
                      )}
                      {latestFailure ? <p className="text-xs text-destructive">Latest issue recorded {formatRelativeTime(latestFailure.createdAt)}</p> : null}
                    </div>

                    <div className="flex flex-wrap content-start gap-2">
                      <Link className={buttonVariants({ size: 'sm' })} href={`/admin/${business.id}`}>
                        Open business
                      </Link>
                      <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/admin/${business.id}/workspace`}>
                        Open workspace
                      </Link>
                      <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/admin/${business.id}/workspace#recent-leads`}>
                        Open customer leads
                      </Link>
                      {!isBusinessArchived(business) ? (
                        <form action={provisionBusinessAction}>
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="mode" value="NEW_NUMBER" />
                          <Button size="sm" type="submit" variant="outline">
                            {assignedNumber ? 'Continue setup' : 'Provision business'}
                          </Button>
                        </form>
                      ) : null}
                      {assignedNumber ? (
                        <form action={resyncBusinessWebhooksAction}>
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="target" value="ALL" />
                          <Button size="sm" type="submit" variant="outline">
                            Re-sync webhooks
                          </Button>
                        </form>
                      ) : null}
                      {canSendTestSms ? (
                        <form action={sendBusinessTestSmsAction}>
                          <input type="hidden" name="businessId" value={business.id} />
                          <input type="hidden" name="destinationPhone" value={business.notificationSettings?.ownerPhone || business.notifyPhone || ''} />
                          <Button size="sm" type="submit" variant="ghost">
                            Send test SMS
                          </Button>
                        </form>
                      ) : null}
                      <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} href={`/admin/${business.id}#advanced`}>
                        {isBusinessArchived(business) ? 'Restore / manage' : 'Archive / manage'}
                      </Link>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
