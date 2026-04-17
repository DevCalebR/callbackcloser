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
  buildAdminBusinessEvents,
  buildAdminNextStep,
  canDeleteTestBusiness,
  isBusinessArchived,
} from '@/lib/admin-dashboard';
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
  formatRelativeTime,
  formatMessageStatus,
  getLeadCallbackState,
  getLeadStatusBadgeVariant,
  leadReadinessLabels,
  leadStatusLabels,
} from '@/lib/lead-presenters';
import { getManagedTextingNumber, getManagedTwilioStatusSummary, managedTwilioStatusLabels } from '@/lib/managed-twilio';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getAdminBusinessStatus, getCustomerSystemStatus } from '@/lib/system-status';

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

function getQueryValue(searchParams: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = searchParams?.[key];
  return typeof value === 'string' ? value : null;
}

function getNextStepBadgeVariant(tone: 'healthy' | 'pending' | 'attention' | 'paused') {
  if (tone === 'healthy') return 'success' as const;
  if (tone === 'attention') return 'destructive' as const;
  if (tone === 'paused') return 'outline' as const;
  return 'secondary' as const;
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
}: {
  businessId: string;
  target: 'VOICE' | 'SMS' | 'ALL';
  label: string;
}) {
  return (
    <form action={resyncBusinessWebhooksAction}>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="target" value={target} />
      <Button type="submit" size="sm" variant="outline">
        {label}
      </Button>
    </form>
  );
}

export default async function AdminBusinessDetailPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdmin();

  const [business, successfulLeadCount, leadCount, callCount, messageCount, recentLeads, recentCalls, recentMessages, recentOwnerNotifications] =
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
  const nextStep = buildAdminNextStep({
    business,
    notificationSettings: business.notificationSettings,
    ownerConnected: ownerState.connected,
  });
  const recentEvents = buildAdminBusinessEvents({
    business,
    messages: recentMessages,
    ownerNotifications: recentOwnerNotifications,
    leads: recentLeads,
    calls: recentCalls,
  }).slice(0, 10);
  const assignedNumber = getManagedTextingNumber(business);

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
              <h1 className="text-3xl font-semibold tracking-tight">{business.name}</h1>
              {business.isTestBusiness ? <Badge variant="outline">Test</Badge> : null}
              {isBusinessArchived(business) ? <Badge variant="outline">Archived</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              One page for business health, recovery actions, safe editing, support workspace access, and recent operator context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants({ variant: 'default' })} href={`/admin/${business.id}/workspace`}>
              Open support workspace
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
          <Badge variant={getNextStepBadgeVariant(nextStep.tone)}>{nextStep.title}</Badge>
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
      {provisioned ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Provisioning finished. Review the health sections below.</div> : null}
      {synced ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Webhook sync complete for {synced.toLowerCase()}.</div> : null}
      {statusSaved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business status updated to {statusSaved.replace(/_/g, ' ')}.</div> : null}
      {testSms ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Admin test SMS sent.</div> : null}
      {archived ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business archived safely. Automation is paused.</div> : null}
      {restored ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business restored and ready for review.</div> : null}
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>What should I do next?</CardTitle>
            <CardDescription>Plain-English guidance to keep the founder out of the weeds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-background/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{nextStep.title}</p>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{nextStep.detail}</p>
                </div>
                <Badge variant={getNextStepBadgeVariant(nextStep.tone)}>{nextStep.actionLabel}</Badge>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Common fixes and shortcuts should be one click away.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <form action={provisionBusinessAction}>
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="mode" value="NEW_NUMBER" />
                <Button size="sm" type="submit">
                  Re-run provisioning
                </Button>
              </form>
              <WebhookResyncButton businessId={business.id} target="ALL" label="Re-sync webhooks" />
              {business.provisioningStatus === 'PAUSED' ? (
                <StatusButton businessId={business.id} status="ONBOARDING" label="Resume automation" />
              ) : (
                <StatusButton businessId={business.id} status="PAUSED" label="Pause automation" variant="outline" />
              )}
              {business.provisioningStatus === 'LIVE' ? null : <StatusButton businessId={business.id} status="LIVE" label="Mark live" variant="secondary" />}
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

            <div className="grid gap-2 sm:grid-cols-2">
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/admin/${business.id}/workspace`}>
                Open support workspace
              </Link>
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`#recent-events`}>
                Open recent events
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Business info</CardTitle>
            <CardDescription>Edit the business, owner contact settings, internal notes, and admin-only Twilio mapping safely from one place.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveAdminBusinessProfileAction} className="grid gap-4 md:grid-cols-2">
              <input type="hidden" name="businessId" value={business.id} />
              <div className="space-y-2">
                <Label htmlFor="name">Business name</Label>
                <Input id="name" name="name" defaultValue={business.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner name</Label>
                <Input id="ownerName" name="ownerName" defaultValue={business.ownerName || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner email</Label>
                <Input id="ownerEmail" name="ownerEmail" type="email" defaultValue={business.notificationSettings?.ownerEmail || ''} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerPhone">Owner alert phone</Label>
                <Input
                  id="ownerPhone"
                  name="ownerPhone"
                  type="tel"
                  defaultValue={business.notificationSettings?.ownerPhone || business.notifyPhone || ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forwardingNumber">Forwarding number</Label>
                <Input id="forwardingNumber" name="forwardingNumber" type="tel" defaultValue={business.forwardingNumber} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" name="timezone" defaultValue={business.timezone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="missedCallSeconds">Missed-call timeout</Label>
                <Input id="missedCallSeconds" name="missedCallSeconds" type="number" min={5} max={90} defaultValue={business.missedCallSeconds} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceLabel1">Primary service label</Label>
                <Input id="serviceLabel1" name="serviceLabel1" defaultValue={business.serviceLabel1} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceLabel2">Secondary service label</Label>
                <Input id="serviceLabel2" name="serviceLabel2" defaultValue={business.serviceLabel2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceLabel3">Tertiary service label</Label>
                <Input id="serviceLabel3" name="serviceLabel3" defaultValue={business.serviceLabel3} />
              </div>
              <label className="md:col-span-2 flex items-start gap-2 rounded-xl border bg-background/80 p-3 text-sm">
                <input defaultChecked={business.isTestBusiness} name="isTestBusiness" type="checkbox" value="true" />
                <span>Test/demo business. Required for safe destructive delete after archive.</span>
              </label>
              <div className="space-y-3 md:col-span-2">
                <Label htmlFor="internalNotes">Internal notes</Label>
                <Textarea
                  id="internalNotes"
                  name="internalNotes"
                  defaultValue={business.internalNotes || ''}
                  rows={5}
                  placeholder="Store launch notes, handoff context, or anything the founder should not have to remember."
                />
              </div>

              <div className="md:col-span-2 space-y-3 rounded-xl border bg-background/80 p-4">
                <div>
                  <p className="text-sm font-medium">Automation settings</p>
                  <p className="text-xs text-muted-foreground">Critical owner alert toggles and operational state.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="notifySms" defaultChecked={business.notificationSettings?.notifySms ?? true} />
                    Owner SMS alerts
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="notifyEmail" defaultChecked={business.notificationSettings?.notifyEmail ?? true} />
                    Owner email alerts
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="notifyInApp" defaultChecked={business.notificationSettings?.notifyInApp ?? true} />
                    In-app alerts
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="urgentOnly" defaultChecked={business.notificationSettings?.urgentOnly ?? false} />
                    Urgent leads only
                  </label>
                </div>
              </div>

              <div className="md:col-span-2 space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div>
                  <p className="text-sm font-medium">Admin Twilio editor</p>
                  <p className="text-xs text-muted-foreground">
                    Use this for safe business corrections, manual provisioning repair, or A2P tracking without leaving admin.
                  </p>
                </div>
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
                  <div className="space-y-2">
                    <Label htmlFor="twilioMessagingServiceSid">Messaging Service SID</Label>
                    <Input id="twilioMessagingServiceSid" name="twilioMessagingServiceSid" defaultValue={business.twilioMessagingServiceSid || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="managedTwilioStatus">Managed Twilio status</Label>
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a2pFailureReason">A2P or launch attention note</Label>
                  <Textarea
                    id="a2pFailureReason"
                    name="a2pFailureReason"
                    defaultValue={business.a2pFailureReason || ''}
                    rows={3}
                    placeholder="Record exactly what is blocking live messaging or what manual action is still needed."
                  />
                </div>
                <label className="flex items-start gap-2 rounded-lg border bg-background/80 p-3 text-sm">
                  <input className="mt-1" type="checkbox" name="confirmCriticalFieldClears" value="true" />
                  <span>I understand this can clear live Twilio mappings or alert routing and should only be used for deliberate internal corrections.</span>
                </label>
              </div>

              <div className="md:col-span-2">
                <Button type="submit">Save business settings</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Provisioning health</CardTitle>
              <CardDescription>Checklist-style visibility into subaccount, number, webhooks, and readiness.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
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
                <div className="rounded-xl border bg-background/80 p-4 text-sm">
                  <p className="font-medium">Webhooks</p>
                  <p className="mt-2">{business.twilioWebhookSyncedAt ? 'Synced' : 'Needs sync'}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {business.twilioWebhookSyncedAt
                      ? `Last synced ${formatRelativeTime(business.twilioWebhookSyncedAt)}`
                      : 'Voice, SMS, and status callback URLs still need to be pushed to the assigned number.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {checklist.map((item) => (
                  <div key={item.key} className="rounded-xl border bg-background/80 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{item.label}</span>
                      <Badge variant={item.complete ? 'success' : 'outline'}>{item.complete ? 'Done' : 'Pending'}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusButton businessId={business.id} status="LIVE" label="Mark live" />
                <StatusButton businessId={business.id} status="ONBOARDING" label="Mark onboarding" variant="secondary" />
                <StatusButton businessId={business.id} status="NEEDS_ATTENTION" label="Needs attention" variant="destructive" />
                {business.provisioningStatus === 'PAUSED' ? (
                  <StatusButton businessId={business.id} status="ONBOARDING" label="Resume" />
                ) : (
                  <StatusButton businessId={business.id} status="PAUSED" label="Pause" variant="outline" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Owner account</CardTitle>
              <CardDescription>Connect or re-invite the owner without leaving the operator page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">{ownerState.name || business.ownerName || 'Owner not named yet'}</p>
                <p className="mt-1 text-muted-foreground">{ownerState.email || business.notificationSettings?.ownerEmail || 'Owner email missing'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant={ownerState.connected ? 'success' : ownerState.pending ? 'outline' : 'destructive'}>
                    {ownerState.connected ? 'Connected' : ownerState.pending ? 'Pending invite' : 'Needs connection'}
                  </Badge>
                  {ownerState.clerkUserId ? <Badge variant="outline">{ownerState.clerkUserId}</Badge> : null}
                </div>
                {ownerState.invitedAt ? <p className="mt-2 text-xs text-muted-foreground">Invite sent {formatDateTime(ownerState.invitedAt)}</p> : null}
              </div>

              <form action={connectBusinessOwnerAction} className="space-y-4">
                <input type="hidden" name="businessId" value={business.id} />
                <div className="space-y-2">
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
                <Button type="submit" variant="outline">
                  Connect or invite owner
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Provisioning health</CardTitle>
            <CardDescription>Technical truth without forcing the founder to hunt for it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Subaccount</p>
                <p className="mt-2 break-all text-muted-foreground">{business.twilioSubaccountSid || 'Not created yet'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Messaging Service</p>
                <p className="mt-2 break-all text-muted-foreground">{business.twilioMessagingServiceSid || 'Not created yet'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Assigned number</p>
                <p className="mt-2 text-muted-foreground">{formatPhoneForDisplay(assignedNumber)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || 'Number SID missing'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Provisioning path</p>
                <p className="mt-2 text-muted-foreground">{assignedNumber ? 'Number attached' : 'Choose new or existing number path below.'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Billing</p>
                <p className="mt-2 text-muted-foreground">{billingAccess.billingActive ? 'Active' : business.subscriptionStatus.toLowerCase()}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Last update</p>
                <p className="mt-2 text-muted-foreground">{formatDateTime(business.updatedAt)}</p>
              </div>
            </div>

            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Webhook status</p>
              {webhookSnapshot ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Voice</p>
                    <p className="mt-1">{webhookSnapshot.voiceSynced ? 'Current app URL' : 'Drifted'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{webhookSnapshot.currentVoiceUrl || webhookSnapshot.expectedVoiceUrl}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">SMS</p>
                    <p className="mt-1">{webhookSnapshot.smsSynced ? 'Current app URL' : 'Drifted'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{webhookSnapshot.currentSmsUrl || webhookSnapshot.expectedSmsUrl}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Status callback</p>
                    <p className="mt-1">{webhookSnapshot.statusSynced ? 'Current app URL' : 'Drifted'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{webhookSnapshot.currentStatusUrl || webhookSnapshot.expectedStatusUrl}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-muted-foreground">Webhook verification becomes available once a number is attached and Twilio credentials are present.</p>
              )}
            </div>

            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Available existing numbers</p>
              <p className="mt-2 text-muted-foreground">
                {availableNumbers.error
                  ? availableNumbers.error
                  : availableNumbers.numbers.length > 0
                    ? `Loaded from the ${availableNumbers.sourceLabel}.`
                    : 'No Twilio numbers were found on the current account context.'}
              </p>
              {availableNumbers.numbers.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {availableNumbers.numbers.map((number) => (
                    <li key={number.sid} className="rounded-lg border bg-card p-3">
                      <p className="font-medium">{formatPhoneForDisplay(number.phoneNumber)}</p>
                      <p className="text-xs text-muted-foreground">{number.friendlyName || 'No friendly name'} · {number.sid}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Messaging / A2P readiness</CardTitle>
              <CardDescription>Explain clearly what is blocking live messaging, or whether no action is needed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Current state</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant={managedSummary.messagingReady ? 'success' : managedSummary.attentionRequired ? 'destructive' : 'secondary'}>
                    {managedSummary.label}
                  </Badge>
                  {managedSummary.complianceReady ? <Badge variant="success">Approved</Badge> : null}
                </div>
                <p className="mt-3 text-muted-foreground">{managedSummary.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">{managedSummary.nextStep}</p>
                {business.a2pApprovedAt ? <p className="mt-2 text-xs text-muted-foreground">Approved {formatDateTime(business.a2pApprovedAt)}</p> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="font-medium">Brand / campaign IDs</p>
                  <p className="mt-2 break-all text-muted-foreground">{business.a2pBrandSid || 'Brand not recorded yet'}</p>
                  <p className="mt-2 break-all text-muted-foreground">{business.a2pCampaignSid || 'Campaign not recorded yet'}</p>
                </div>
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="font-medium">Attention note</p>
                  <p className="mt-2 text-muted-foreground">{business.a2pFailureReason || 'No current compliance blocker recorded.'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Commercial / account state</CardTitle>
              <CardDescription>Plan, setup state, alert routing, and live launch context.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Subscription</p>
                <p className="mt-2 text-muted-foreground">{business.subscriptionStatus.toLowerCase()}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Billing access</p>
                <p className="mt-2 text-muted-foreground">{billingAccess.billingActive ? 'Active' : 'Inactive'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Owner alert destination</p>
                <p className="mt-2 text-muted-foreground">
                  {formatPhoneForDisplay(business.notificationSettings?.ownerPhone || business.notifyPhone)} · {business.notificationSettings?.ownerEmail || 'No owner email'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">Customer-facing status</p>
                <p className="mt-2 text-muted-foreground">{customerStatus.description}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Provision / attach number</CardTitle>
              <CardDescription>Use the new-number path for normal launches. Existing numbers stay admin-assisted.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form action={provisionBusinessAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="mode" value="NEW_NUMBER" />
                <div className="space-y-2">
                  <Label htmlFor="areaCode">Preferred area code</Label>
                  <Input id="areaCode" name="areaCode" placeholder="512" maxLength={3} />
                </div>
                <Button type="submit">Provision new number</Button>
              </form>

              <form action={provisionBusinessAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="mode" value="EXISTING_NUMBER" />
                <div className="space-y-2">
                  <Label htmlFor="existingNumberSidManual">Existing number SID</Label>
                  <Input id="existingNumberSidManual" name="existingNumberSidManual" placeholder="PN..." />
                  <p className="text-xs text-muted-foreground">
                    Keep-number launches are still admin-assisted. The number must already exist in the target Twilio account context first.
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
                ) : null}
                <Button type="submit" variant="outline">
                  Attach existing number
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Webhook tools</CardTitle>
              <CardDescription>Keep recovery actions close to the thing they fix.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <WebhookResyncButton businessId={business.id} target="VOICE" label="Re-sync voice webhook" />
              <WebhookResyncButton businessId={business.id} target="SMS" label="Re-sync SMS webhook" />
              <WebhookResyncButton businessId={business.id} target="ALL" label="Re-sync all webhooks" />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="bg-card/90" id="recent-events">
        <CardHeader>
          <CardTitle>Logs / recent events</CardTitle>
          <CardDescription>Concise summaries first, details on demand, no secrets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No recent operator events are recorded for this business yet.</div>
          ) : (
            recentEvents.map((event) => (
              <details key={event.id} className="rounded-xl border bg-background/80 p-4 text-sm">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={event.severity === 'error' ? 'destructive' : event.severity === 'warning' ? 'outline' : 'secondary'}>
                          {event.label}
                        </Badge>
                        <span className="font-medium">{event.summary}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">Show detail</span>
                  </div>
                </summary>
                <p className="mt-3 text-muted-foreground">{event.detail}</p>
              </details>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Support workspace access</CardTitle>
            <CardDescription>Fast entry into a safe customer-style snapshot without risky impersonation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              The support workspace is read-only by design. It surfaces recent leads, recent alerts, and key settings for this business without weakening tenant isolation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link className={buttonVariants({ variant: 'default' })} href={`/admin/${business.id}/workspace`}>
                Open support workspace
              </Link>
              <Link className={buttonVariants({ variant: 'outline' })} href={`/admin/${business.id}/workspace#recent-leads`}>
                Open recent leads
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Archive / delete controls</CardTitle>
            <CardDescription>Archive real businesses safely. Delete only archived test/demo workspaces.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
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
