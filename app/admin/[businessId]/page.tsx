import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  connectBusinessOwnerAction,
  provisionBusinessAction,
  resyncBusinessWebhooksAction,
  saveAdminBusinessProfileAction,
  setBusinessProvisioningStatusAction,
} from '@/app/admin/actions';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatDateTime } from '@/lib/lead-presenters';
import { getManagedTextingNumber, getManagedTwilioStatusSummary, managedTwilioStatusLabels } from '@/lib/managed-twilio';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getAdminBusinessStatus, getCustomerSystemStatus } from '@/lib/system-status';

export const dynamic = 'force-dynamic';

function getQueryValue(searchParams: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = searchParams?.[key];
  return typeof value === 'string' ? value : null;
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
      <Button type="submit" variant="outline">
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

  const [
    business,
    successfulLeadCount,
    leadCount,
    callCount,
    messageCount,
  ] = await Promise.all([
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
  ]);

  if (!business) notFound();

  const [
    ownerState,
    webhookSnapshot,
    availableNumbers,
  ] = await Promise.all([
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

  const created = getQueryValue(searchParams, 'created') === '1';
  const saved = getQueryValue(searchParams, 'saved') === '1';
  const ownerStateMessage = getQueryValue(searchParams, 'ownerState');
  const provisioned = getQueryValue(searchParams, 'provisioned') === '1';
  const synced = getQueryValue(searchParams, 'synced');
  const statusSaved = getQueryValue(searchParams, 'statusSaved');
  const error = getQueryValue(searchParams, 'error');

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-2">
        <Link className="text-sm text-muted-foreground underline underline-offset-4" href="/admin">
          Back to admin dashboard
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
            <p className="text-sm text-muted-foreground">
              Internal provisioning console for owner setup, Twilio configuration, webhook sync, and go-live status.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={getAdminProvisioningStatusVariant(business.provisioningStatus)}>
              {adminProvisioningStatusLabels[business.provisioningStatus]}
            </Badge>
            <Badge variant={rolloutStatus.badgeVariant}>{rolloutStatus.label}</Badge>
            <Badge variant={customerStatus.badgeVariant}>{customerStatus.label}</Badge>
          </div>
        </div>
      </div>

      {created ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business workspace created and ready for provisioning.</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business details saved.</div> : null}
      {ownerStateMessage ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          {ownerStateMessage === 'connected'
            ? 'Owner account connected.'
            : ownerStateMessage === 'invited'
              ? 'Owner invite sent. Re-run owner connection after the invite is accepted.'
              : 'Owner state updated.'}
        </div>
      ) : null}
      {provisioned ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Provisioning finished. Review the checklist and mark the business live when ready.</div> : null}
      {synced ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Webhook sync complete for {synced.toLowerCase()}.</div> : null}
      {statusSaved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business status updated to {statusSaved.replace(/_/g, ' ')}.</div> : null}
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Leads', value: leadCount },
          { label: 'Calls', value: callCount },
          { label: 'Messages', value: messageCount },
          { label: 'Qualified alerts', value: successfulLeadCount },
          { label: 'Billing', value: billingAccess.billingActive ? 'Active' : business.subscriptionStatus.toLowerCase() },
        ].map((item) => (
          <Card key={item.label} className="bg-card/90">
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Business identity</CardTitle>
            <CardDescription>Save the customer profile, routing defaults, owner alerts, and internal notes.</CardDescription>
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
                <Input id="ownerName" name="ownerName" defaultValue={business.ownerName || ''} placeholder="Casey Owner" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner email</Label>
                <Input
                  id="ownerEmail"
                  name="ownerEmail"
                  type="email"
                  defaultValue={business.notificationSettings?.ownerEmail || ''}
                  placeholder="owner@business.com"
                  required
                />
              </div>
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
                <Label htmlFor="forwardingNumber">Forwarding number</Label>
                <Input id="forwardingNumber" name="forwardingNumber" type="tel" defaultValue={business.forwardingNumber} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" name="timezone" defaultValue={business.timezone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="missedCallSeconds">Missed-call timeout</Label>
                <Input
                  id="missedCallSeconds"
                  name="missedCallSeconds"
                  type="number"
                  min={5}
                  max={90}
                  defaultValue={business.missedCallSeconds}
                />
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
              <div className="space-y-3 md:col-span-2">
                <Label htmlFor="internalNotes">Internal notes</Label>
                <Textarea
                  id="internalNotes"
                  name="internalNotes"
                  defaultValue={business.internalNotes || ''}
                  placeholder="Store launch notes, customer preferences, or any follow-up needed for this rollout."
                  rows={5}
                />
              </div>
              <div className="md:col-span-2 space-y-3 rounded-xl border bg-background/80 p-4">
                <div>
                  <p className="text-sm font-medium">Owner notifications</p>
                  <p className="text-xs text-muted-foreground">These control the owner alerts CallbackCloser sends when a lead is qualified.</p>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="notifySms" defaultChecked={business.notificationSettings?.notifySms ?? true} />
                    SMS alerts
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="notifyEmail" defaultChecked={business.notificationSettings?.notifyEmail ?? true} />
                    Email alerts
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="notifyInApp" defaultChecked={business.notificationSettings?.notifyInApp ?? true} />
                    In-app alerts
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="urgentOnly" defaultChecked={business.notificationSettings?.urgentOnly ?? false} />
                    Urgent leads only
                  </label>
                </div>
              </div>
              <div className="md:col-span-2">
                <Button type="submit">Save business details</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Owner account</CardTitle>
              <CardDescription>Connect an existing Clerk user by ID or email. If the owner has not signed up yet, CallbackCloser will send an invite.</CardDescription>
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
                  <Input
                    id="connectOwnerEmail"
                    name="ownerEmail"
                    type="email"
                    defaultValue={business.notificationSettings?.ownerEmail || ''}
                    placeholder="owner@business.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="connectOwnerName">Owner name</Label>
                  <Input id="connectOwnerName" name="ownerName" defaultValue={business.ownerName || ''} placeholder="Casey Owner" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerClerkId">Existing Clerk user ID</Label>
                  <Input id="ownerClerkId" name="ownerClerkId" defaultValue={ownerState.connected ? ownerState.clerkUserId || '' : ''} placeholder="user_..." />
                </div>
                <Button type="submit">Create or connect owner</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Provisioning status</CardTitle>
              <CardDescription>Internal rollout state plus the exact setup steps still blocking go-live.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background/80 p-4 text-sm">
                  <p className="font-medium text-foreground">Current status</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={getAdminProvisioningStatusVariant(business.provisioningStatus)}>
                      {adminProvisioningStatusLabels[business.provisioningStatus]}
                    </Badge>
                    <Badge variant={managedSummary.messagingServiceReady ? 'success' : 'outline'}>
                      {managedSummary.messagingServiceReady ? 'Messaging ready' : 'Messaging pending'}
                    </Badge>
                  </div>
                  <p className="mt-3 text-muted-foreground">Last run: {formatDateTime(business.provisioningLastRunAt)}</p>
                  {business.provisioningError ? <p className="mt-2 text-destructive">{business.provisioningError}</p> : null}
                </div>
                <div className="rounded-xl border bg-background/80 p-4 text-sm">
                  <p className="font-medium text-foreground">Checklist</p>
                  <div className="mt-3 space-y-3">
                    {checklist.map((item) => (
                      <div key={item.key} className="rounded-lg border bg-card p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{item.label}</span>
                          <Badge variant={item.complete ? 'success' : 'outline'}>{item.complete ? 'Done' : 'Pending'}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
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
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Twilio configuration</CardTitle>
            <CardDescription>Current subaccount, number, messaging service, and webhook health for this business.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Provisioning path</p>
                <p className="mt-2 text-muted-foreground">
                  {business.twilioPrimaryNumberSid ? 'Business number attached' : 'Choose new number or existing number path below.'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Managed status</p>
                <p className="mt-2 text-muted-foreground">{managedTwilioStatusLabels[business.managedTwilioStatus]}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Billing</p>
                <p className="mt-2 text-muted-foreground">{billingAccess.billingActive ? 'Active' : business.subscriptionStatus.toLowerCase()}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Subaccount SID</p>
                <p className="mt-2 break-all text-muted-foreground">{business.twilioSubaccountSid || 'Not created yet'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Messaging Service SID</p>
                <p className="mt-2 break-all text-muted-foreground">{business.twilioMessagingServiceSid || 'Not created yet'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Primary texting line</p>
                <p className="mt-2 text-muted-foreground">{formatPhoneForDisplay(getManagedTextingNumber(business))}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Primary number SID</p>
                <p className="mt-2 break-all text-muted-foreground">{business.twilioPrimaryNumberSid || 'Not assigned yet'}</p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">Voice webhook</p>
                <p className="mt-2 text-muted-foreground">
                  {webhookSnapshot?.voiceSynced ? 'Synced' : webhookSnapshot?.error ? 'Unable to verify' : 'Needs sync'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium text-foreground">SMS webhook</p>
                <p className="mt-2 text-muted-foreground">
                  {webhookSnapshot?.smsSynced ? 'Synced' : webhookSnapshot?.error ? 'Unable to verify' : 'Needs sync'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium text-foreground">Webhook status</p>
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
                <p className="mt-2 text-muted-foreground">
                  CallbackCloser will verify webhook drift after a number is attached and Twilio credentials are available.
                </p>
              )}
            </div>

            <div className="rounded-xl border bg-background/80 p-4">
              <p className="font-medium text-foreground">Available existing numbers</p>
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
              <CardTitle>Provision business</CardTitle>
              <CardDescription>
                Use the new-number path when CallbackCloser should buy a line. Use the existing-number path when the Twilio number is already present on the
                business account context.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form action={provisionBusinessAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="mode" value="NEW_NUMBER" />
                <div className="space-y-2">
                  <Label htmlFor="areaCode">Preferred area code</Label>
                  <Input id="areaCode" name="areaCode" placeholder="512" maxLength={3} />
                  <p className="text-xs text-muted-foreground">Optional. Leave blank to let CallbackCloser choose the first available US local number.</p>
                </div>
                <Button type="submit">Provision business</Button>
              </form>

              <form action={provisionBusinessAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="mode" value="EXISTING_NUMBER" />
                <div className="space-y-2">
                  <Label htmlFor="existingNumberSidManual">Existing number SID</Label>
                  <Input id="existingNumberSidManual" name="existingNumberSidManual" placeholder="PN..." />
                  <p className="text-xs text-muted-foreground">
                    The existing-number path expects a number already available in the current Twilio account context. If the number still lives elsewhere,
                    move it into the target account before running this step.
                  </p>
                </div>
                {availableNumbers.numbers.length > 0 ? (
                  <div className="space-y-2">
                    <Label htmlFor="existingNumberSelect">Choose from loaded Twilio numbers</Label>
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
                <Button type="submit" variant="outline">Attach existing number</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Webhook tools</CardTitle>
              <CardDescription>Re-sync voice, SMS, or all number webhooks when the app URL changes or Twilio drifts.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <WebhookResyncButton businessId={business.id} target="VOICE" label="Re-sync voice webhook" />
              <WebhookResyncButton businessId={business.id} target="SMS" label="Re-sync SMS webhook" />
              <WebhookResyncButton businessId={business.id} target="ALL" label="Re-sync all webhooks" />
            </CardContent>
          </Card>

          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>Commercial + live state</CardTitle>
              <CardDescription>Internal view of billing, go-live readiness, and any manual follow-up still needed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="font-medium text-foreground">Subscription</p>
                  <p className="mt-2 text-muted-foreground">{business.subscriptionStatus.toLowerCase()}</p>
                </div>
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="font-medium text-foreground">Marked live</p>
                  <p className="mt-2 text-muted-foreground">{business.provisioningStatus === 'LIVE' ? 'Yes' : 'No'}</p>
                </div>
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="font-medium text-foreground">Owner alert destination</p>
                  <p className="mt-2 text-muted-foreground">
                    {formatPhoneForDisplay(business.notificationSettings?.ownerPhone || business.notifyPhone)} · {business.notificationSettings?.ownerEmail || 'No owner email'}
                  </p>
                </div>
                <div className="rounded-xl border bg-background/80 p-4">
                  <p className="font-medium text-foreground">Last updated</p>
                  <p className="mt-2 text-muted-foreground">{formatDateTime(business.updatedAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
