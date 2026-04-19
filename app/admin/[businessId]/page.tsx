import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  archiveBusinessAction,
  connectBusinessOwnerAction,
  deleteTestBusinessAction,
  provisionBusinessAction,
  resyncBusinessWebhooksAction,
  restoreBusinessAction,
  saveAdminBusinessProfileAction,
  sendBusinessTestSmsAction,
  setBusinessProvisioningStatusAction,
} from '@/app/admin/actions';
import {
  buildAdminOnboardingConfidence,
  canDeleteTestBusiness,
  isBusinessArchived,
} from '@/lib/admin-dashboard';
import { CopyValueButton } from '@/components/copy-value-button';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { requireAdmin } from '@/lib/admin';
import {
  adminProvisioningStatusLabels,
  buildAdminProvisioningChecklist,
  getAdminOwnerState,
  getAdminProvisioningStatusVariant,
  getTwilioWebhookSnapshot,
  listAdminTwilioNumbers,
} from '@/lib/admin-provisioning';
import { db } from '@/lib/db';
import {
  formatDateTime,
  formatMessageStatus,
  formatRelativeTime,
  getLeadCallbackState,
  getLeadStatusBadgeVariant,
  leadReadinessLabels,
  leadStatusLabels,
} from '@/lib/lead-presenters';
import { getManagedTextingNumber, getManagedTwilioStatusSummary, managedTwilioStatusLabels } from '@/lib/managed-twilio-status';
import {
  businessTimelineFilterOptions,
  countTimelineFilters,
  matchesTimelineFilter,
  operatorEventCategoryLabels,
  operatorEventStatusLabels,
  type BusinessTimelineFilter,
} from '@/lib/operator-events';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getAdminBusinessStatus, getCustomerSystemStatus } from '@/lib/system-status';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const changedFieldLabels: Record<string, string> = {
  ownerPhone: 'owner alert phone',
  twilioPhoneNumber: 'Twilio number',
  twilioPhoneNumberSid: 'Twilio number SID',
  twilioMessagingServiceSid: 'messaging service SID',
  a2pCustomerProfileSid: 'A2P customer profile SID',
  a2pBrandSid: 'A2P brand SID',
  a2pCampaignSid: 'A2P campaign SID',
  a2pFailureReason: 'A2P failure reason',
  managedTwilioStatus: 'managed Twilio status',
  isTestBusiness: 'test business flag',
};

type AdminBusinessFormDefaults = {
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  isTestBusiness: boolean;
  forwardingNumber: string;
  timezone: string;
  missedCallSeconds: string;
  serviceLabel1: string;
  serviceLabel2: string;
  serviceLabel3: string;
  internalNotes: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
  twilioMessagingServiceSid: string;
  a2pCustomerProfileSid: string;
  a2pBrandSid: string;
  a2pCampaignSid: string;
  a2pFailureReason: string;
  managedTwilioStatus: string;
  notifySms: boolean;
  notifyEmail: boolean;
  notifyInApp: boolean;
  urgentOnly: boolean;
};

type AdminBusinessWithSettings = {
  name: string;
  ownerName: string | null;
  notifyPhone: string | null;
  isTestBusiness: boolean;
  forwardingNumber: string;
  timezone: string;
  missedCallSeconds: number;
  serviceLabel1: string;
  serviceLabel2: string;
  serviceLabel3: string;
  internalNotes: string | null;
  twilioPrimaryPhoneNumber: string | null;
  twilioPhoneNumber: string | null;
  twilioPrimaryNumberSid: string | null;
  twilioPhoneNumberSid: string | null;
  twilioMessagingServiceSid: string | null;
  a2pCustomerProfileSid: string | null;
  a2pBrandSid: string | null;
  a2pCampaignSid: string | null;
  a2pFailureReason: string | null;
  managedTwilioStatus: string;
  notificationSettings: {
    ownerEmail: string | null;
    ownerPhone: string | null;
    notifySms: boolean;
    notifyEmail: boolean;
    notifyInApp: boolean;
    urgentOnly: boolean;
  } | null;
};

function getQueryValue(searchParams: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = searchParams?.[key];
  return typeof value === 'string' ? value : null;
}

function getTimelineFilter(searchParams: Record<string, string | string[] | undefined> | undefined): BusinessTimelineFilter {
  const value = getQueryValue(searchParams, 'activity');
  return businessTimelineFilterOptions.some((option) => option.key === value) ? (value as BusinessTimelineFilter) : 'all';
}

function getOperatorEventBadgeVariant(status: keyof typeof operatorEventStatusLabels) {
  if (status === 'FAILED') return 'destructive' as const;
  if (status === 'WARNING') return 'outline' as const;
  if (status === 'SUCCESS') return 'success' as const;
  return 'secondary' as const;
}

function getConfidenceMilestoneBadgeVariant(variant: 'success' | 'warning' | 'pending') {
  if (variant === 'success') return 'success' as const;
  if (variant === 'warning') return 'outline' as const;
  return 'secondary' as const;
}

function formatOperatorEventDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => formatOperatorEventDetailValue(item)).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${key}: ${formatOperatorEventDetailValue(nested)}`)
      .join(' | ');
  }
  return String(value);
}

function getOperatorEventDetails(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, detail]) => ({
    key,
    label: key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' '),
    value: formatOperatorEventDetailValue(detail),
  }));
}

function buildOperatorEventRelatedHref(businessId: string, relatedEntityType: string | null, relatedEntityId: string | null) {
  if (!relatedEntityType || !relatedEntityId) return null;
  if (relatedEntityType === 'lead') return `/admin/${businessId}/workspace#recent-leads`;
  if (relatedEntityType === 'message') return `/admin/${businessId}/workspace#recent-activity`;
  if (relatedEntityType === 'call') return `/admin/${businessId}/workspace#call-flow-snapshot`;
  return null;
}

function HiddenAdminBusinessFields({
  defaults,
  exclude = [],
}: {
  defaults: AdminBusinessFormDefaults;
  exclude?: Array<keyof AdminBusinessFormDefaults>;
}) {
  return (
    <>
      {Object.entries(defaults).map(([name, value]) => {
        if (exclude.includes(name as keyof AdminBusinessFormDefaults)) return null;

        if (typeof value === 'boolean') {
          if (!value) return null;
          return <input key={name} name={name} type="hidden" value="true" />;
        }

        return <input key={name} name={name} type="hidden" value={value} />;
      })}
    </>
  );
}

function StatusButton({
  businessId,
  status,
  label,
  variant = 'outline',
}: {
  businessId: string;
  status: 'DRAFT' | 'ONBOARDING' | 'NEEDS_ATTENTION' | 'LIVE' | 'PAUSED';
  label: string;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
}) {
  return (
    <form action={setBusinessProvisioningStatusAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="status" value={status} />
      <Button size="sm" type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

function WebhookResyncButton({
  businessId,
  target,
  label,
  variant = 'outline',
}: {
  businessId: string;
  target: 'VOICE' | 'SMS' | 'ALL';
  label: string;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
}) {
  return (
    <form action={resyncBusinessWebhooksAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="target" value={target} />
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

function buildAdminFormDefaults(business: AdminBusinessWithSettings) {
  return {
    name: business.name,
    ownerName: business.ownerName || '',
    ownerEmail: business.notificationSettings?.ownerEmail || '',
    ownerPhone: business.notificationSettings?.ownerPhone || business.notifyPhone || '',
    isTestBusiness: business.isTestBusiness,
    forwardingNumber: business.forwardingNumber,
    timezone: business.timezone,
    missedCallSeconds: String(business.missedCallSeconds),
    serviceLabel1: business.serviceLabel1,
    serviceLabel2: business.serviceLabel2,
    serviceLabel3: business.serviceLabel3,
    internalNotes: business.internalNotes || '',
    twilioPhoneNumber: business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || '',
    twilioPhoneNumberSid: business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || '',
    twilioMessagingServiceSid: business.twilioMessagingServiceSid || '',
    a2pCustomerProfileSid: business.a2pCustomerProfileSid || '',
    a2pBrandSid: business.a2pBrandSid || '',
    a2pCampaignSid: business.a2pCampaignSid || '',
    a2pFailureReason: business.a2pFailureReason || '',
    managedTwilioStatus: business.managedTwilioStatus,
    notifySms: business.notificationSettings?.notifySms ?? true,
    notifyEmail: business.notificationSettings?.notifyEmail ?? true,
    notifyInApp: business.notificationSettings?.notifyInApp ?? true,
    urgentOnly: business.notificationSettings?.urgentOnly ?? false,
  } satisfies AdminBusinessFormDefaults;
}

export default async function AdminBusinessDetailPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdmin();
  const activityFilter = getTimelineFilter(searchParams);

  const [business, successfulLeadCount, leadCount, callCount, messageCount, recentLeads, recentCalls, recentMessages, recentOwnerNotifications, operatorEvents] =
    await Promise.all([
      db.business.findUnique({
        where: { id: params.businessId },
        include: {
          notificationSettings: true,
        },
      }),
      db.lead.count({
        where: {
          businessId: params.businessId,
          OR: [{ ownerNotifiedAt: { not: null } }, { notifiedAt: { not: null } }],
        },
      }),
      db.lead.count({ where: { businessId: params.businessId } }),
      db.call.count({ where: { businessId: params.businessId } }),
      db.message.count({ where: { businessId: params.businessId } }),
      db.lead.findMany({
        where: { businessId: params.businessId },
        orderBy: [{ lastInteractionAt: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        select: {
          id: true,
          status: true,
          readiness: true,
          billingRequired: true,
          smsState: true,
          summary: true,
          notifiedAt: true,
          ownerNotifiedAt: true,
          createdAt: true,
          lastInteractionAt: true,
        },
      }),
      db.call.findMany({
        where: { businessId: params.businessId },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          status: true,
          missed: true,
          answered: true,
          dialCallStatus: true,
          createdAt: true,
        },
      }),
      db.message.findMany({
        where: { businessId: params.businessId, direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          leadId: true,
          participant: true,
          direction: true,
          status: true,
          body: true,
          createdAt: true,
        },
      }),
      db.ownerNotification.findMany({
        where: { businessId: params.businessId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          channel: true,
          status: true,
          error: true,
          createdAt: true,
          destination: true,
        },
      }),
      db.businessOperatorEvent.findMany({
        where: { businessId: params.businessId },
        orderBy: { createdAt: 'desc' },
        take: 120,
        select: {
          id: true,
          type: true,
          category: true,
          status: true,
          summary: true,
          detailsJson: true,
          relatedEntityType: true,
          relatedEntityId: true,
          createdAt: true,
        },
      }),
    ]);

  if (!business) notFound();

  const [ownerState, webhookSnapshot, availableNumbers] = await Promise.all([
    getAdminOwnerState(business, business.notificationSettings),
    getTwilioWebhookSnapshot(business),
    listAdminTwilioNumbers(business),
  ]);

  const rolloutStatus = getAdminBusinessStatus(business, successfulLeadCount);
  const customerStatus = getCustomerSystemStatus(business, successfulLeadCount);
  const managedSummary = getManagedTwilioStatusSummary(business);
  const billingAccess = getBusinessBillingAccessState(business);
  const checklist = buildAdminProvisioningChecklist({
    business,
    notificationSettings: business.notificationSettings,
    ownerConnected: ownerState.connected,
    webhookSnapshot,
  });
  const onboardingConfidence = buildAdminOnboardingConfidence({
    business,
    notificationSettings: business.notificationSettings,
    ownerConnected: ownerState.connected,
    successfulLeadCount,
    operatorEvents: operatorEvents.map((event) => ({
      type: event.type,
      status: event.status,
      createdAt: event.createdAt,
    })),
  });
  const timelineFilterCounts = countTimelineFilters(operatorEvents);
  const visibleTimelineEvents = operatorEvents.filter((event) => {
    return matchesTimelineFilter(event, activityFilter);
  });
  const assignedNumber = getManagedTextingNumber(business);
  const defaults = buildAdminFormDefaults(business);
  const webhooksNeedAttention = Boolean(
    assignedNumber &&
      (!business.twilioWebhookSyncedAt ||
        webhookSnapshot?.voiceSynced === false ||
        webhookSnapshot?.smsSynced === false ||
        webhookSnapshot?.statusSynced === false)
  );
  const brandStatusLabel = business.a2pBrandSid
    ? managedSummary.complianceReady
      ? 'Approved'
      : managedSummary.attentionRequired
        ? 'Needs attention'
        : 'Submitted'
    : 'Not started';
  const campaignStatusLabel = business.a2pCampaignSid
    ? managedSummary.complianceReady
      ? 'Approved'
      : managedSummary.attentionRequired
        ? 'Needs attention'
        : 'Pending'
    : 'Not started';
  const latestProvisioningEvent = operatorEvents.find((event) => event.category === 'PROVISIONING') || null;
  const latestWebhookEvent =
    operatorEvents.find((event) => event.category === 'WEBHOOKS') ||
    (webhooksNeedAttention
      ? {
          id: 'webhook-attention',
          createdAt: business.updatedAt,
          status: 'WARNING' as const,
          category: 'WEBHOOKS' as const,
          summary: 'Webhook mismatch detected',
          detailsJson: {
            detail: webhookSnapshot?.error || 'Voice, SMS, or status callback sync still needs attention.',
          },
          relatedEntityType: null,
          relatedEntityId: null,
          type: 'webhooks.mismatch_detected',
        }
      : null);
  const latestOutboundSms = recentMessages[0] || null;
  const latestOwnerAlert = recentOwnerNotifications[0] || null;

  const created = getQueryValue(searchParams, 'created') === '1';
  const saved = getQueryValue(searchParams, 'saved') === '1';
  const ownerStateMessage = getQueryValue(searchParams, 'ownerState');
  const provisioned = getQueryValue(searchParams, 'provisioned') === '1';
  const synced = getQueryValue(searchParams, 'synced');
  const statusSaved = getQueryValue(searchParams, 'statusSaved');
  const testSms = getQueryValue(searchParams, 'testSms') === '1';
  const archived = getQueryValue(searchParams, 'archived') === '1';
  const restored = getQueryValue(searchParams, 'restored') === '1';
  const error = getQueryValue(searchParams, 'error');
  const changed = (getQueryValue(searchParams, 'changed') || '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => changedFieldLabels[field] || field);

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-2">
        <Link className="text-sm text-muted-foreground underline underline-offset-4" href="/admin">
          Back to operator board
        </Link>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{business.name} business control panel</h1>
              {business.isTestBusiness ? <Badge variant="outline">Test</Badge> : null}
              {isBusinessArchived(business) ? <Badge variant="outline">Archived</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Compact owner-first workspace for onboarding, fast edits, support shortcuts, and the most common repair actions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants({ variant: 'default' })} href={`/admin/${business.id}/workspace`}>
              Open customer workspace
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href={`/admin/${business.id}/workspace#recent-leads`}>
              Open customer leads
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/admin">
              Back to board
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={getAdminProvisioningStatusVariant(business.provisioningStatus)}>
            {adminProvisioningStatusLabels[business.provisioningStatus]}
          </Badge>
          <Badge variant={rolloutStatus.badgeVariant}>{rolloutStatus.label}</Badge>
          <Badge variant={customerStatus.badgeVariant}>{customerStatus.label}</Badge>
          <Badge variant={onboardingConfidence.stateVariant}>{onboardingConfidence.stateLabel}</Badge>
          <Badge variant={onboardingConfidence.readinessVariant}>{onboardingConfidence.readinessLabel}</Badge>
        </div>
      </div>

      {created ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business workspace created and ready for provisioning.</div> : null}
      {saved ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Business details saved{changed.length > 0 ? `: ${changed.join(', ')}.` : '.'}
        </div>
      ) : null}
      {ownerStateMessage ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          {ownerStateMessage === 'connected'
            ? 'Owner account connected.'
            : ownerStateMessage === 'invited'
              ? 'Owner invite sent. Re-run owner connection after the invite is accepted.'
              : 'Owner state updated.'}
        </div>
      ) : null}
      {provisioned ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Provisioning finished. Review the health cards below.</div> : null}
      {synced ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Webhook sync complete for {synced.toLowerCase()}.</div> : null}
      {statusSaved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business status updated to {statusSaved.replace(/_/g, ' ')}.</div> : null}
      {testSms ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Admin test SMS sent.</div> : null}
      {archived ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business archived safely. Automation is paused.</div> : null}
      {restored ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business restored and ready for review.</div> : null}
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Onboarding confidence</CardTitle>
            <CardDescription>Current state, blockers, next action, and the exact gate between setup, testing, and launch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-background/80 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold">{onboardingConfidence.stateLabel}</p>
                    <Badge variant={onboardingConfidence.stateVariant}>{onboardingConfidence.readinessLabel}</Badge>
                  </div>
                  <p className="max-w-3xl text-sm text-muted-foreground">{onboardingConfidence.summary}</p>
                  <p className="text-sm font-medium">Next action: {onboardingConfidence.nextAction}</p>
                  <p className="text-xs text-muted-foreground">
                    Confidence checklist: {onboardingConfidence.milestones.filter((item) => item.complete).length} /{' '}
                    {onboardingConfidence.milestones.length} signals complete
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {isBusinessArchived(business) ? (
                    <Link className={buttonVariants({ size: 'sm' })} href="#advanced">
                      Restore business
                    </Link>
                  ) : business.provisioningStatus === 'PAUSED' ? (
                    <Link className={buttonVariants({ size: 'sm' })} href="#advanced">
                      Resume automation
                    </Link>
                  ) : !ownerState.connected ? (
                    <Link className={buttonVariants({ size: 'sm' })} href="#business-info">
                      Connect owner
                    </Link>
                  ) : !(business.notificationSettings?.ownerPhone || business.notifyPhone) ? (
                    <Link className={buttonVariants({ size: 'sm' })} href="#automation-settings">
                      Add owner alert phone
                    </Link>
                  ) : !managedSummary.subaccountReady || !managedSummary.numberAssigned || !managedSummary.messagingServiceReady ? (
                    <form action={provisionBusinessAction}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="mode" value="NEW_NUMBER" />
                      <Button size="sm" type="submit">
                        {managedSummary.numberAssigned ? 'Continue setup' : 'Provision business'}
                      </Button>
                    </form>
                  ) : webhooksNeedAttention ? (
                    <WebhookResyncButton businessId={business.id} label="Re-sync webhooks" target="ALL" variant="default" />
                  ) : managedSummary.messagingReady && business.provisioningStatus !== 'LIVE' ? (
                    <StatusButton
                      businessId={business.id}
                      label={onboardingConfidence.canSafelyMarkLive ? 'Mark live' : 'Mark live with warnings'}
                      status="LIVE"
                      variant={onboardingConfidence.canSafelyMarkLive ? 'default' : 'outline'}
                    />
                  ) : (
                    <Link className={buttonVariants({ size: 'sm' })} href={`/admin/${business.id}/workspace`}>
                      Open support workspace
                    </Link>
                  )}

                  {!isBusinessArchived(business) ? (
                    <form action={provisionBusinessAction}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="mode" value="NEW_NUMBER" />
                      <Button size="sm" type="submit" variant="outline">
                        Re-run provisioning
                      </Button>
                    </form>
                  ) : null}
                  {assignedNumber ? <WebhookResyncButton businessId={business.id} label="Re-sync all webhooks" target="ALL" /> : null}
                </div>
              </div>
            </div>

            {onboardingConfidence.blockers.length > 0 ? (
              <div className="grid gap-3">
                {onboardingConfidence.blockers.map((blocker, index) => (
                  <div
                    key={`${blocker.message}-${index}`}
                    className={cn(
                      'rounded-xl border p-4 text-sm',
                      blocker.level === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'bg-background/80'
                    )}
                  >
                    {blocker.message}
                  </div>
                ))}
              </div>
            ) : null}

            {onboardingConfidence.milestones.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {onboardingConfidence.milestones.map((item) => (
                  <div key={item.key} className="rounded-xl border bg-background/80 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{item.label}</p>
                      <Badge variant={getConfidenceMilestoneBadgeVariant(item.variant)}>{item.complete ? 'Done' : 'Next'}</Badge>
                    </div>
                    <p className="mt-2 text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
                No onboarding milestones are available for this business yet.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-4">
              {[
                { label: 'Leads', value: leadCount },
                { label: 'Calls', value: callCount },
                { label: 'Messages', value: messageCount },
                { label: 'Qualified alerts', value: successfulLeadCount },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border bg-background/80 p-4">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Support mode shortcuts</CardTitle>
            <CardDescription>Safe customer-side entry points without impersonation or tenant bleed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Link className={buttonVariants({ variant: 'default', size: 'sm' })} href={`/admin/${business.id}/workspace`}>
                Open customer workspace
              </Link>
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/admin/${business.id}/workspace#recent-leads`}>
                Open customer leads
              </Link>
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/admin/${business.id}/workspace#settings-snapshot`}>
                Open customer settings
              </Link>
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/admin/${business.id}/workspace#call-flow-snapshot`}>
                Open customer call flow
              </Link>
            </div>

            <form action={sendBusinessTestSmsAction} className="rounded-xl border bg-background/80 p-4">
              <input type="hidden" name="businessId" value={business.id} />
              <div className="space-y-2">
                <Label htmlFor="destinationPhone">Send test SMS</Label>
                <Input
                  id="destinationPhone"
                  name="destinationPhone"
                  type="tel"
                  defaultValue={business.notificationSettings?.ownerPhone || business.notifyPhone || ''}
                  placeholder="+1 555 123 4567"
                />
                <p className="text-xs text-muted-foreground">
                  Sends a short admin verification message from the assigned business line to the destination above.
                </p>
              </div>
              <Button className="mt-3" size="sm" type="submit" variant="outline">
                Send test SMS
              </Button>
            </form>

            <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
              Support mode stays read-only. Use it to inspect leads, settings, and call flow quickly without weakening business isolation.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="bg-card/90" id="business-info">
          <CardHeader>
            <CardTitle>Business info</CardTitle>
            <CardDescription>Fast edits for the business record, owner identity, and operator notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form action={saveAdminBusinessProfileAction} className="space-y-4">
              <input type="hidden" name="businessId" value={business.id} />
              <HiddenAdminBusinessFields
                defaults={defaults}
                exclude={['name', 'ownerName', 'ownerEmail', 'internalNotes']}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Business name</Label>
                  <Input id="name" name="name" defaultValue={business.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerName">Owner name</Label>
                  <Input id="ownerName" name="ownerName" defaultValue={business.ownerName || ''} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ownerEmail">Owner email</Label>
                  <Input id="ownerEmail" name="ownerEmail" type="email" defaultValue={business.notificationSettings?.ownerEmail || ''} required />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="internalNotes">Internal notes</Label>
                  <Textarea
                    id="internalNotes"
                    name="internalNotes"
                    defaultValue={business.internalNotes || ''}
                    rows={4}
                    placeholder="Keep launch notes, edge cases, and handoff context here so the founder does not have to remember it."
                  />
                </div>
              </div>
              <Button type="submit">Save business info</Button>
            </form>

            <div className="rounded-xl border bg-background/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{ownerState.name || business.ownerName || 'Owner not named yet'}</p>
                <Badge variant={ownerState.connected ? 'success' : ownerState.pending ? 'outline' : 'destructive'}>
                  {ownerState.connected ? 'Connected' : ownerState.pending ? 'Pending invite' : 'Needs connection'}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {ownerState.email || business.notificationSettings?.ownerEmail || 'Owner email missing'}
              </p>
              {ownerState.clerkUserId ? <p className="mt-2 text-xs text-muted-foreground">{ownerState.clerkUserId}</p> : null}
              {ownerState.invitedAt ? <p className="mt-2 text-xs text-muted-foreground">Invite sent {formatDateTime(ownerState.invitedAt)}</p> : null}
            </div>

            <form action={connectBusinessOwnerAction} className="grid gap-4 md:grid-cols-2 rounded-xl border bg-background/80 p-4">
              <input type="hidden" name="businessId" value={business.id} />
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="connectOwnerEmail">Owner email</Label>
                <Input id="connectOwnerEmail" name="ownerEmail" type="email" defaultValue={business.notificationSettings?.ownerEmail || ''} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="connectOwnerName">Owner name</Label>
                <Input id="connectOwnerName" name="ownerName" defaultValue={business.ownerName || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerClerkId">Existing Clerk user ID</Label>
                <Input id="ownerClerkId" name="ownerClerkId" defaultValue={ownerState.connected ? ownerState.clerkUserId || '' : ''} />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" variant="outline">
                  Connect or invite owner
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/90" id="provisioning-health">
          <CardHeader>
            <CardTitle>Provisioning health</CardTitle>
            <CardDescription>Everything needed to finish setup or repair launch blockers without digging through a long form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">Current status</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant={getAdminProvisioningStatusVariant(business.provisioningStatus)}>
                    {adminProvisioningStatusLabels[business.provisioningStatus]}
                  </Badge>
                  <Badge variant={managedSummary.messagingReady ? 'success' : managedSummary.attentionRequired ? 'destructive' : 'secondary'}>
                    {managedSummary.messagingReady ? 'Healthy' : managedSummary.attentionRequired ? 'Needs attention' : 'Pending'}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Last provisioning run: {formatDateTime(business.provisioningLastRunAt)}</p>
                {business.provisioningError ? <p className="mt-2 text-sm text-destructive">{business.provisioningError}</p> : null}
              </div>
              <form action={provisionBusinessAction} className="rounded-xl border bg-background/80 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="mode" value="NEW_NUMBER" />
                <div className="space-y-2">
                  <Label htmlFor="areaCode">Preferred area code</Label>
                  <Input id="areaCode" name="areaCode" maxLength={3} placeholder="512" />
                  <p className="text-xs text-muted-foreground">
                    Use this as the main onboarding button. Existing-number attach stays in Advanced because it is still admin-assisted.
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="submit">{assignedNumber ? 'Continue setup' : 'Provision business'}</Button>
                  <WebhookResyncButton businessId={business.id} label="Re-sync all webhooks" target="ALL" />
                </div>
              </form>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-sm">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Subaccount status</p>
                <p className="mt-2">{business.twilioSubaccountSid ? 'Connected' : 'Missing'}</p>
                <p className="mt-2 break-all text-xs text-muted-foreground">{business.twilioSubaccountSid || 'Create or reconnect the business subaccount.'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Messaging service</p>
                <p className="mt-2">{business.twilioMessagingServiceSid ? 'Connected' : 'Missing'}</p>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {business.twilioMessagingServiceSid || 'Provisioning will create or repair the Twilio Messaging Service.'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Assigned number</p>
                <p className="mt-2">{assignedNumber ? formatPhoneForDisplay(assignedNumber) : 'Not assigned yet'}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || 'Number SID missing'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Number path</p>
                <p className="mt-2">{assignedNumber ? 'Current path active' : 'Path not chosen yet'}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {assignedNumber
                    ? 'New-number re-provisioning is the default. Existing-number support stays in Advanced.'
                    : 'Use Provision business for a new number, or use the admin-assisted existing-number tools in Advanced.'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Voice webhook sync</p>
                <p className="mt-2">{webhookSnapshot?.voiceSynced ? 'Healthy' : 'Needs sync'}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {webhookSnapshot?.currentVoiceUrl || webhookSnapshot?.expectedVoiceUrl || 'Voice webhook will appear after number assignment.'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">SMS webhook sync</p>
                <p className="mt-2">{webhookSnapshot?.smsSynced ? 'Healthy' : 'Needs sync'}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {webhookSnapshot?.currentSmsUrl || webhookSnapshot?.expectedSmsUrl || 'SMS webhook will appear after number assignment.'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Status callback sync</p>
                <p className="mt-2">{webhookSnapshot?.statusSynced ? 'Healthy' : 'Needs sync'}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {webhookSnapshot?.currentStatusUrl || webhookSnapshot?.expectedStatusUrl || 'Status callback will appear after number assignment.'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Last provisioning run</p>
                <p className="mt-2 text-muted-foreground">{formatDateTime(business.provisioningLastRunAt)}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Last provisioning error</p>
                <p className={cn('mt-2 text-muted-foreground', business.provisioningError ? 'text-destructive' : '')}>
                  {business.provisioningError || 'No current provisioning error recorded.'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {checklist.map((item) => (
                <div key={item.key} className="rounded-xl border bg-background/80 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{item.label}</span>
                    <Badge variant={item.complete ? 'success' : 'outline'}>{item.complete ? 'Done' : 'Pending'}</Badge>
                  </div>
                  <p className="mt-2 text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {assignedNumber ? <WebhookResyncButton businessId={business.id} label="Re-sync voice" target="VOICE" /> : null}
              {assignedNumber ? <WebhookResyncButton businessId={business.id} label="Re-sync SMS" target="SMS" /> : null}
              {managedSummary.messagingReady && business.provisioningStatus !== 'LIVE' ? (
                <StatusButton
                  businessId={business.id}
                  label={onboardingConfidence.canSafelyMarkLive ? 'Mark live' : 'Mark live with warnings'}
                  status="LIVE"
                  variant={onboardingConfidence.canSafelyMarkLive ? 'secondary' : 'outline'}
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90" id="messaging-readiness">
          <CardHeader>
            <CardTitle>Messaging / A2P readiness</CardTitle>
            <CardDescription>Plain-English launch blocker plus the operator tracking fields that matter for compliance follow-up.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-background/80 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={managedSummary.messagingReady ? 'success' : managedSummary.attentionRequired ? 'destructive' : 'secondary'}>
                  {managedSummary.label}
                </Badge>
                <Badge variant={managedSummary.complianceReady ? 'success' : managedSummary.attentionRequired ? 'destructive' : 'outline'}>
                  {managedSummary.complianceReady ? 'Approved' : managedSummary.attentionRequired ? 'Needs attention' : 'Pending'}
                </Badge>
              </div>
              <p className="mt-3 text-muted-foreground">{managedSummary.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {managedSummary.messagingReady ? 'Messaging is clear to go live.' : managedSummary.nextStep}
              </p>
              {business.a2pApprovedAt ? <p className="mt-2 text-xs text-muted-foreground">Approved {formatDateTime(business.a2pApprovedAt)}</p> : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">Readiness state</p>
                <p className="mt-2">{managedSummary.label}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">Live blocker</p>
                <p className="mt-2 text-muted-foreground">{managedSummary.messagingReady ? 'No current blocker.' : managedSummary.nextStep}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">Brand status</p>
                <p className="mt-2">{brandStatusLabel}</p>
                <p className="mt-2 break-all text-xs text-muted-foreground">{business.a2pBrandSid || 'Brand SID not recorded yet'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">Campaign status</p>
                <p className="mt-2">{campaignStatusLabel}</p>
                <p className="mt-2 break-all text-xs text-muted-foreground">{business.a2pCampaignSid || 'Campaign SID not recorded yet'}</p>
              </div>
            </div>

            <form action={saveAdminBusinessProfileAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
              <input type="hidden" name="businessId" value={business.id} />
              <HiddenAdminBusinessFields
                defaults={defaults}
                exclude={['managedTwilioStatus', 'a2pFailureReason', 'a2pCustomerProfileSid', 'a2pBrandSid', 'a2pCampaignSid']}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="managedTwilioStatus">Readiness state</Label>
                  <Select id="managedTwilioStatus" name="managedTwilioStatus" defaultValue={business.managedTwilioStatus}>
                    {Object.entries(managedTwilioStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a2pCustomerProfileSid">Customer profile SID</Label>
                  <Input id="a2pCustomerProfileSid" name="a2pCustomerProfileSid" defaultValue={business.a2pCustomerProfileSid || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a2pBrandSid">Brand SID</Label>
                  <Input id="a2pBrandSid" name="a2pBrandSid" defaultValue={business.a2pBrandSid || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a2pCampaignSid">Campaign SID</Label>
                  <Input id="a2pCampaignSid" name="a2pCampaignSid" defaultValue={business.a2pCampaignSid || ''} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="a2pFailureReason">Launch blocker note</Label>
                  <Textarea
                    id="a2pFailureReason"
                    name="a2pFailureReason"
                    defaultValue={business.a2pFailureReason || ''}
                    rows={3}
                    placeholder="Record what is still blocking live texting, or what manual review is waiting on Twilio."
                  />
                </div>
              </div>
              <Button type="submit" variant="outline">
                Save readiness tracking
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/90" id="automation-settings">
          <CardHeader>
            <CardTitle>Automation settings</CardTitle>
            <CardDescription>Quick edits for owner alert routing, missed-call handling, and the controls that affect day-to-day operations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">Automation state</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant={getAdminProvisioningStatusVariant(business.provisioningStatus)}>
                    {adminProvisioningStatusLabels[business.provisioningStatus]}
                  </Badge>
                  <Badge variant={defaults.notifySms ? 'success' : 'outline'}>{defaults.notifySms ? 'Owner SMS alerts on' : 'Owner SMS alerts off'}</Badge>
                </div>
              </div>
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">Alert destination</p>
                <p className="mt-2 text-muted-foreground">
                  {formatPhoneForDisplay(business.notificationSettings?.ownerPhone || business.notifyPhone)} · {business.notificationSettings?.ownerEmail || 'No owner email'}
                </p>
              </div>
            </div>

            <form action={saveAdminBusinessProfileAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
              <input type="hidden" name="businessId" value={business.id} />
              <HiddenAdminBusinessFields
                defaults={defaults}
                exclude={['ownerPhone', 'forwardingNumber', 'missedCallSeconds', 'notifySms', 'notifyEmail', 'notifyInApp', 'urgentOnly']}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ownerPhone">Owner alert phone</Label>
                  <Input
                    id="ownerPhone"
                    name="ownerPhone"
                    type="tel"
                    defaultValue={business.notificationSettings?.ownerPhone || business.notifyPhone || ''}
                    placeholder="+1 555 123 4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forwardingNumber">Missed-call forward number</Label>
                  <Input id="forwardingNumber" name="forwardingNumber" type="tel" defaultValue={business.forwardingNumber} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="missedCallSeconds">Missed-call timeout</Label>
                  <Input id="missedCallSeconds" name="missedCallSeconds" type="number" min={5} max={90} defaultValue={business.missedCallSeconds} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" name="timezone" defaultValue={business.timezone} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                  <input type="checkbox" name="notifySms" defaultChecked={business.notificationSettings?.notifySms ?? true} />
                  Owner SMS alerts
                </label>
                <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                  <input type="checkbox" name="notifyEmail" defaultChecked={business.notificationSettings?.notifyEmail ?? true} />
                  Owner email alerts
                </label>
                <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                  <input type="checkbox" name="notifyInApp" defaultChecked={business.notificationSettings?.notifyInApp ?? true} />
                  In-app alerts
                </label>
                <label className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                  <input type="checkbox" name="urgentOnly" defaultChecked={business.notificationSettings?.urgentOnly ?? false} />
                  Urgent leads only
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit">Save automation settings</Button>
                {business.provisioningStatus !== 'LIVE' ? (
                  <StatusButton
                    businessId={business.id}
                    label={onboardingConfidence.canSafelyMarkLive ? 'Mark live' : 'Mark live with warnings'}
                    status="LIVE"
                    variant={onboardingConfidence.canSafelyMarkLive ? 'secondary' : 'outline'}
                  />
                ) : (
                  <StatusButton businessId={business.id} label="Back to onboarding" status="ONBOARDING" variant="outline" />
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/90" id="account-state">
          <CardHeader>
            <CardTitle>Account / commercial state</CardTitle>
            <CardDescription>Plan, billing, lifecycle, and business state in one compact scan.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Subscription</p>
              <p className="mt-2 text-muted-foreground">{business.subscriptionStatus.toLowerCase()}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Billing access</p>
              <p className="mt-2 text-muted-foreground">{billingAccess.billingActive ? 'Active' : 'Inactive'}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Setup state</p>
              <p className="mt-2 text-muted-foreground">{adminProvisioningStatusLabels[business.provisioningStatus]}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Archive state</p>
              <p className="mt-2 text-muted-foreground">{isBusinessArchived(business) ? 'Archived' : 'Active'}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Customer-facing state</p>
              <p className="mt-2 text-muted-foreground">{customerStatus.description}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Last updated</p>
              <p className="mt-2 text-muted-foreground">{formatDateTime(business.updatedAt)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/90" id="recent-events">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Business-scoped operator timeline with plain-English summaries first and details on demand.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Latest provisioning attempt</p>
              <p className="mt-2">{latestProvisioningEvent?.summary || 'No provisioning run recorded'}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {latestProvisioningEvent
                  ? getOperatorEventDetails(latestProvisioningEvent.detailsJson)[0]?.value || 'Open the timeline below for full provisioning detail.'
                  : 'Run provisioning from the top of this page when setup should continue.'}
              </p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Latest webhook issue</p>
              <p className="mt-2">{latestWebhookEvent?.summary || 'No webhook issue recorded'}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {latestWebhookEvent
                  ? getOperatorEventDetails(latestWebhookEvent.detailsJson)[0]?.value || 'Webhook sync looks healthy.'
                  : 'Webhook sync looks healthy.'}
              </p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Latest outbound SMS</p>
              <p className="mt-2">
                {latestOutboundSms
                  ? `${latestOutboundSms.participant === 'OWNER' ? 'Owner SMS' : 'Lead SMS'}${latestOutboundSms.status ? ` · ${formatMessageStatus(latestOutboundSms.status)}` : ''}`
                  : 'No outbound SMS yet'}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{latestOutboundSms?.body || 'No outbound SMS has been recorded yet.'}</p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Latest owner alert</p>
              <p className="mt-2">
                {latestOwnerAlert ? `Owner ${latestOwnerAlert.channel.toLowerCase()} · ${latestOwnerAlert.status.toLowerCase()}` : 'No owner alert yet'}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {latestOwnerAlert?.error || latestOwnerAlert?.destination || 'No owner alert issue is currently recorded.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {businessTimelineFilterOptions.map((option) => {
              const href = option.key === 'all' ? `/admin/${business.id}#recent-events` : `/admin/${business.id}?activity=${option.key}#recent-events`;
              return (
                <Link
                  key={option.key}
                  className={cn(
                    buttonVariants({ variant: option.key === activityFilter ? 'default' : 'outline', size: 'sm' }),
                    option.key === activityFilter && 'pointer-events-none'
                  )}
                  href={href}
                >
                  {option.label} ({timelineFilterCounts.get(option.key) ?? 0})
                </Link>
              );
            })}
          </div>

          {visibleTimelineEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No recent operator events are recorded for this business yet.</div>
          ) : (
            <div className="grid gap-3">
              {visibleTimelineEvents.map((event) => {
                const details = getOperatorEventDetails(event.detailsJson);
                const relatedHref = buildOperatorEventRelatedHref(business.id, event.relatedEntityType, event.relatedEntityId);
                return (
                <details key={event.id} className="rounded-xl border bg-background/80 p-4 text-sm">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={getOperatorEventBadgeVariant(event.status)}>
                            {operatorEventStatusLabels[event.status]}
                          </Badge>
                          <Badge variant="outline">{operatorEventCategoryLabels[event.category]}</Badge>
                          <span className="font-medium">{event.summary}</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">Show detail</span>
                    </div>
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{event.id}</code>
                      <CopyValueButton value={event.id} label="Copy event ID" />
                      {relatedHref ? (
                        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={relatedHref}>
                          Open related view
                        </Link>
                      ) : null}
                    </div>
                    {details.length > 0 ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {details.map((detail) => (
                          <div key={detail.key} className="rounded-lg border bg-background/70 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{detail.label}</p>
                            <p className="mt-1 text-muted-foreground">{detail.value}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No extra detail recorded.</p>
                    )}
                  </div>
                </details>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]" id="advanced">
        <Card className="border-destructive/20 bg-card/90">
          <CardHeader>
            <CardTitle>Advanced / rare actions</CardTitle>
            <CardDescription>Manual number support and low-level Twilio repair stay separated from the everyday onboarding path.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={provisionBusinessAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
              <input type="hidden" name="businessId" value={business.id} />
              <input type="hidden" name="mode" value="EXISTING_NUMBER" />
              <div className="space-y-2">
                <Label htmlFor="existingNumberSidManual">Attach existing number</Label>
                <Input id="existingNumberSidManual" name="existingNumberSidManual" placeholder="PN..." />
                <p className="text-xs text-muted-foreground">
                  Existing-number launches remain admin-assisted. The number must already exist in the right Twilio account context before attach.
                </p>
              </div>
              {availableNumbers.numbers.length > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="existingNumberSelect">Choose loaded number</Label>
                  <select
                    id="existingNumberSelect"
                    name="existingNumberSidSelect"
                    defaultValue=""
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select a number</option>
                    {availableNumbers.numbers.map((number) => (
                      <option key={number.sid} value={number.sid}>
                        {formatPhoneForDisplay(number.phoneNumber)} · {number.sid}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {availableNumbers.error || 'No Twilio numbers were found on the current account context.'}
                </p>
              )}
              <Button type="submit" variant="outline">
                Attach existing number
              </Button>
            </form>

            <form action={saveAdminBusinessProfileAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
              <input type="hidden" name="businessId" value={business.id} />
              <HiddenAdminBusinessFields
                defaults={defaults}
                exclude={['twilioPhoneNumber', 'twilioPhoneNumberSid', 'twilioMessagingServiceSid']}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="twilioPhoneNumber">Assigned number</Label>
                  <Input
                    id="twilioPhoneNumber"
                    name="twilioPhoneNumber"
                    type="tel"
                    defaultValue={business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="twilioPhoneNumberSid">Number SID</Label>
                  <Input
                    id="twilioPhoneNumberSid"
                    name="twilioPhoneNumberSid"
                    defaultValue={business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || ''}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="twilioMessagingServiceSid">Messaging Service SID</Label>
                  <Input id="twilioMessagingServiceSid" name="twilioMessagingServiceSid" defaultValue={business.twilioMessagingServiceSid || ''} />
                </div>
              </div>
              <label className="flex items-start gap-2 rounded-lg border bg-background/80 p-3 text-sm">
                <input className="mt-1" type="checkbox" name="confirmCriticalFieldClears" value="true" />
                <span>I understand this can clear or replace live Twilio mappings and should only be used for deliberate internal repair.</span>
              </label>
              <Button type="submit" variant="outline">
                Save manual Twilio mapping
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-destructive/20 bg-card/90">
          <CardHeader>
            <CardTitle>Lifecycle / destructive actions</CardTitle>
            <CardDescription>Pause or archive safely. Delete stays locked to archived test/demo businesses only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2 rounded-xl border bg-background/80 p-4">
              {business.provisioningStatus === 'PAUSED' ? (
                <StatusButton businessId={business.id} label="Resume automation" status="ONBOARDING" />
              ) : (
                <StatusButton businessId={business.id} label="Pause automation" status="PAUSED" variant="outline" />
              )}
              <StatusButton businessId={business.id} label="Mark needs attention" status="NEEDS_ATTENTION" variant="destructive" />
              <StatusButton businessId={business.id} label="Mark onboarding" status="ONBOARDING" variant="secondary" />
            </div>

            {isBusinessArchived(business) ? (
              <form action={restoreBusinessAction} className="rounded-xl border bg-background/80 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                <div className="space-y-2">
                  <Label htmlFor="restoreName">Type business name to restore</Label>
                  <Input id="restoreName" name="confirmationName" placeholder={business.name} />
                </div>
                <Button className="mt-3" type="submit">
                  Restore business
                </Button>
              </form>
            ) : (
              <form action={archiveBusinessAction} className="rounded-xl border bg-background/80 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                <div className="space-y-2">
                  <Label htmlFor="archiveName">Type business name to archive</Label>
                  <Input id="archiveName" name="confirmationName" placeholder={business.name} />
                </div>
                <Button className="mt-3" type="submit" variant="outline">
                  Archive business safely
                </Button>
              </form>
            )}

            {canDeleteTestBusiness(business) ? (
              <form action={deleteTestBusinessAction} className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                <div className="space-y-2">
                  <Label htmlFor="deleteName">Type business name to delete this test workspace</Label>
                  <Input id="deleteName" name="confirmationName" placeholder={business.name} />
                </div>
                <Button className="mt-3" type="submit" variant="destructive">
                  Delete archived test business
                </Button>
              </form>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-muted-foreground">
                Delete stays unavailable until this workspace is archived and marked as a test/demo business.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/90" id="recent-leads">
        <CardHeader>
          <CardTitle>Recent leads snapshot</CardTitle>
          <CardDescription>Useful context without forcing a jump into multiple customer pages.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recentLeads.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No recent leads yet.</div>
          ) : (
            recentLeads.map((lead) => (
              <div key={lead.id} className="rounded-xl border bg-background/80 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getLeadStatusBadgeVariant(lead.status)}>{leadStatusLabels[lead.status]}</Badge>
                  <Badge variant={lead.readiness === 'URGENT' ? 'destructive' : lead.readiness === 'QUALIFIED' ? 'secondary' : 'outline'}>
                    {leadReadinessLabels[lead.readiness]}
                  </Badge>
                </div>
                <p className="mt-3 font-medium">{getLeadCallbackState(lead)}</p>
                <p className="mt-2 text-muted-foreground">{lead.summary || 'Lead details are still coming in.'}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Last activity {formatRelativeTime(lead.lastInteractionAt || lead.createdAt)} · {lead.id}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
