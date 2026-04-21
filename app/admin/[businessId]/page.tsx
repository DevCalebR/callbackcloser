import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  archiveBusinessAction,
  connectExistingBusinessOwnerAction,
  deleteTestBusinessAction,
  inviteBusinessOwnerAction,
  provisionBusinessAction,
  resyncBusinessWebhooksAction,
  restoreBusinessAction,
  saveAdminTwilioSetupAction,
  sendBusinessTestSmsAction,
  setBusinessProvisioningStatusAction,
} from '@/app/admin/actions';
import { TwilioSetupChecklist } from '@/components/twilio-setup-checklist';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { buildAdminCustomerOpenHref } from '@/lib/admin-customer-paths';
import { getAdminTestSmsConfidenceState, isBusinessArchived } from '@/lib/admin-dashboard';
import { getAdminOwnerState, getTwilioWebhookSnapshot, listAdminTwilioNumbers } from '@/lib/admin-provisioning';
import { requireAdmin } from '@/lib/admin';
import { TwilioSetupTone, buildTwilioSetupFlow, twilioAccountModeOptions, twilioNumberSetupModeOptions } from '@/lib/twilio-setup';
import { db } from '@/lib/db';
import { getManagedTextingNumber, managedTwilioStatusLabels } from '@/lib/managed-twilio-status';
import { formatPhoneForDisplay } from '@/lib/phone';

type AdminTwilioDefaults = {
  businessId: string;
  twilioAccountMode: string;
  twilioNumberSetupMode: string;
  twilioSubaccountSid: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
  twilioMessagingServiceSid: string;
  a2pCustomerProfileSid: string;
  a2pBrandSid: string;
  a2pCampaignSid: string;
  a2pFailureReason: string;
  managedTwilioStatus: string;
};

function getQueryValue(searchParams: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = searchParams?.[key];
  return typeof value === 'string' ? value : null;
}

function HiddenAdminTwilioFields({
  defaults,
  exclude = [],
}: {
  defaults: AdminTwilioDefaults;
  exclude?: Array<keyof AdminTwilioDefaults>;
}) {
  return (
    <>
      {Object.entries(defaults).map(([name, value]) => {
        if (exclude.includes(name as keyof AdminTwilioDefaults)) return null;
        return <input key={name} name={name} type="hidden" value={value} />;
      })}
    </>
  );
}

function getBadgeVariant(tone: TwilioSetupTone) {
  if (tone === 'success') return 'success' as const;
  if (tone === 'attention') return 'destructive' as const;
  if (tone === 'pending') return 'outline' as const;
  return 'secondary' as const;
}

export default async function AdminBusinessDetailPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdmin();

  const [business, successfulLeadCount, operatorEvents] = await Promise.all([
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
    db.businessOperatorEvent.findMany({
      where: {
        businessId: params.businessId,
        type: {
          startsWith: 'admin.test_sms_',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        type: true,
        status: true,
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

  const testSmsState = getAdminTestSmsConfidenceState(operatorEvents);
  const managedTextingNumber = getManagedTextingNumber(business);
  const setupFlow = buildTwilioSetupFlow({
    business,
    notificationSettings: business.notificationSettings,
    ownerConnected: ownerState.connected,
    successfulLeadCount,
    testSmsState,
    webhookSnapshot,
  });
  const defaults: AdminTwilioDefaults = {
    businessId: business.id,
    twilioAccountMode: business.twilioAccountMode,
    twilioNumberSetupMode: business.twilioNumberSetupMode,
    twilioSubaccountSid: business.twilioSubaccountSid || '',
    twilioPhoneNumber: business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || '',
    twilioPhoneNumberSid: business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || '',
    twilioMessagingServiceSid: business.twilioMessagingServiceSid || '',
    a2pCustomerProfileSid: business.a2pCustomerProfileSid || '',
    a2pBrandSid: business.a2pBrandSid || '',
    a2pCampaignSid: business.a2pCampaignSid || '',
    a2pFailureReason: business.a2pFailureReason || '',
    managedTwilioStatus: business.managedTwilioStatus,
  };

  const created = getQueryValue(searchParams, 'created') === '1';
  const saved = getQueryValue(searchParams, 'saved') === '1';
  const ownerAction = getQueryValue(searchParams, 'ownerAction');
  const provisioned = getQueryValue(searchParams, 'provisioned') === '1';
  const synced = getQueryValue(searchParams, 'synced');
  const testSms = getQueryValue(searchParams, 'testSms') === '1';
  const archived = getQueryValue(searchParams, 'archived') === '1';
  const restored = getQueryValue(searchParams, 'restored') === '1';
  const error = getQueryValue(searchParams, 'error');

  const bannerAction =
    setupFlow.banner.stepKey === 'owner_connected' && !ownerState.connected ? (
      <Link className={buttonVariants({ size: 'sm' })} href="#owner-step">
        Connect owner
      </Link>
    ) : setupFlow.banner.stepKey === 'voice_webhook_synced' ||
      setupFlow.banner.stepKey === 'sms_webhook_synced' ||
      setupFlow.banner.stepKey === 'status_callback_synced' ? (
      <form action={resyncBusinessWebhooksAction}>
        <input type="hidden" name="businessId" value={business.id} />
        <input type="hidden" name="target" value="ALL" />
        <Button size="sm" type="submit">
          Sync webhooks
        </Button>
      </form>
    ) : setupFlow.banner.stepKey === 'safe_to_mark_live' && setupFlow.safeToMarkLive && business.provisioningStatus !== 'LIVE' ? (
      <form action={setBusinessProvisioningStatusAction}>
        <input type="hidden" name="businessId" value={business.id} />
        <input type="hidden" name="status" value="LIVE" />
        <Button size="sm" type="submit">
          Mark live
        </Button>
      </form>
    ) : (
      <Link
        className={buttonVariants({ size: 'sm', variant: 'outline' })}
        href={
          setupFlow.banner.stepKey === 'owner_connected'
            ? '#owner-step'
            : setupFlow.banner.stepKey === 'account_mode'
              ? '#account-mode-step'
              : setupFlow.banner.stepKey === 'number_path'
                ? '#number-path-step'
                : setupFlow.banner.stepKey === 'test_sms_delivered'
                  ? '#test-sms-step'
                  : '#admin-twilio-setup'
        }
      >
        Review step
      </Link>
    );

  const setupSteps = setupFlow.steps.map((step) => {
    if (step.key === 'owner_connected') {
      return {
        ...step,
        body: ownerState.connected ? (
          <div className="space-y-3 text-sm text-muted-foreground" id="owner-step">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="success">{ownerState.statusLabel}</Badge>
              <span>{ownerState.email || business.notificationSettings?.ownerEmail || 'Owner email not recorded'}</span>
            </div>
            <p>{ownerState.detail}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]" id="owner-step">
            <div className="rounded-xl border bg-background/80 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ownerState.badgeVariant}>{ownerState.statusLabel}</Badge>
                {ownerState.matchedUserId ? <Badge variant="outline">Existing account found</Badge> : null}
              </div>
              <p className="mt-3 text-muted-foreground">{ownerState.detail}</p>
              {ownerState.email ? <p className="mt-2 text-xs text-muted-foreground">Owner email: {ownerState.email}</p> : null}
              {ownerState.matchedUserId ? (
                <p className="mt-2 text-xs text-muted-foreground">Matched Clerk user: {ownerState.matchedUserId}</p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <form action={inviteBusinessOwnerAction} className="rounded-xl border bg-background/80 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                <div className="space-y-2">
                  <Label htmlFor="ownerInviteName">Owner name</Label>
                  <Input id="ownerInviteName" name="ownerName" defaultValue={business.ownerName || ''} />
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="ownerInviteEmail">Owner email</Label>
                  <Input
                    id="ownerInviteEmail"
                    name="ownerEmail"
                    type="email"
                    defaultValue={business.notificationSettings?.ownerEmail || ''}
                    placeholder="owner@business.com"
                    required
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Use this when the owner does not already have a CallbackCloser login.</p>
                <Button className="mt-4" size="sm" type="submit" variant="outline">
                  {ownerState.status === 'invitation_pending' ? 'Resend owner invite' : 'Invite owner by email'}
                </Button>
              </form>

              <form action={connectExistingBusinessOwnerAction} className="rounded-xl border bg-background/80 p-4">
                <input type="hidden" name="businessId" value={business.id} />
                {ownerState.matchedUserId ? <input type="hidden" name="ownerClerkId" value={ownerState.matchedUserId} /> : null}
                <div className="space-y-2">
                  <Label htmlFor="ownerConnectName">Owner name</Label>
                  <Input id="ownerConnectName" name="ownerName" defaultValue={business.ownerName || ''} />
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="ownerConnectEmail">Owner email</Label>
                  <Input
                    id="ownerConnectEmail"
                    name="ownerEmail"
                    type="email"
                    defaultValue={business.notificationSettings?.ownerEmail || ''}
                    placeholder="owner@business.com"
                    required
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Use this when the owner already has a CallbackCloser account and should be linked immediately.
                </p>
                <Button className="mt-4" size="sm" type="submit">
                  Connect existing owner
                </Button>
              </form>
            </div>
          </div>
        ),
      };
    }

    if (step.key === 'account_mode') {
      return {
        ...step,
        body: (
          <form action={saveAdminTwilioSetupAction} className="space-y-4" id="account-mode-step">
            <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioAccountMode']} />
            <div className="grid gap-3 md:grid-cols-2">
              {twilioAccountModeOptions.map((option) => (
                <label key={option.value} className="rounded-xl border bg-background/80 p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <input defaultChecked={business.twilioAccountMode === option.value} name="twilioAccountMode" type="radio" value={option.value} />
                    <div className="space-y-1">
                      <p className="font-medium">{option.label}</p>
                      <p className="text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <Button size="sm" type="submit">
              Save account mode
            </Button>
          </form>
        ),
      };
    }

    if (step.key === 'number_path') {
      return {
        ...step,
        body: (
          <form action={saveAdminTwilioSetupAction} className="space-y-4" id="number-path-step">
            <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioNumberSetupMode']} />
            <div className="grid gap-3 md:grid-cols-2">
              {twilioNumberSetupModeOptions.map((option) => (
                <label key={option.value} className="rounded-xl border bg-background/80 p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <input defaultChecked={business.twilioNumberSetupMode === option.value} name="twilioNumberSetupMode" type="radio" value={option.value} />
                    <div className="space-y-1">
                      <p className="font-medium">{option.label}</p>
                      <p className="text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {business.twilioNumberSetupMode === 'EXISTING_NUMBER' ? (
              <p className="text-sm text-muted-foreground">{setupFlow.existingNumberMessage}</p>
            ) : null}
            <Button size="sm" type="submit" variant="outline">
              Save number path
            </Button>
          </form>
        ),
      };
    }

    if (step.key === 'account_ready') {
      return {
        ...step,
        body: (
          <form action={saveAdminTwilioSetupAction} className="space-y-4">
            <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioSubaccountSid']} />
            {business.twilioAccountMode === 'BUSINESS_SUBACCOUNT' ? (
              <div className="space-y-2">
                <Label htmlFor="adminTwilioSubaccountSid">Business subaccount SID</Label>
                <Input id="adminTwilioSubaccountSid" name="twilioSubaccountSid" defaultValue={business.twilioSubaccountSid || ''} placeholder="AC..." />
                <p className="text-xs text-muted-foreground">Paste an existing subaccount SID to reuse it, or leave it blank and let provisioning create one.</p>
              </div>
            ) : (
              <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
                Main account mode is active. This business will use the parent Twilio account directly.
              </div>
            )}
            <Button size="sm" type="submit" variant="outline">
              Save account target
            </Button>
          </form>
        ),
      };
    }

    if (step.key === 'messaging_service_ready') {
      return {
        ...step,
        body: (
          <form action={saveAdminTwilioSetupAction} className="space-y-4">
            <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioMessagingServiceSid']} />
            <div className="space-y-2">
              <Label htmlFor="adminMessagingServiceSid">Messaging Service SID</Label>
              <Input id="adminMessagingServiceSid" name="twilioMessagingServiceSid" defaultValue={business.twilioMessagingServiceSid || ''} placeholder="MG..." />
            </div>
            <Button size="sm" type="submit" variant="outline">
              Save Messaging Service
            </Button>
          </form>
        ),
      };
    }

    if (step.key === 'number_assigned') {
      return {
        ...step,
        body: (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">Current number</p>
                <p className="mt-2 text-muted-foreground">
                  {managedTextingNumber ? formatPhoneForDisplay(managedTextingNumber) : 'No business number recorded yet'}
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 p-4 text-sm">
                <p className="font-medium">Numbers visible in selected account</p>
                <p className="mt-2 text-muted-foreground">
                  {availableNumbers.error ? availableNumbers.error : `${availableNumbers.numbers.length} number${availableNumbers.numbers.length === 1 ? '' : 's'} in ${availableNumbers.sourceLabel || 'Twilio'}.`}
                </p>
              </div>
            </div>

            {business.twilioNumberSetupMode === 'NEW_NUMBER' ? (
              <form action={provisionBusinessAction} className="flex flex-col gap-3 md:flex-row md:items-end">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="mode" value="NEW_NUMBER" />
                <div className="w-full md:max-w-xs">
                  <Label htmlFor="adminAreaCode">Preferred area code</Label>
                  <Input id="adminAreaCode" name="areaCode" inputMode="numeric" maxLength={3} placeholder="512" />
                </div>
                <Button size="sm" type="submit">
                  {managedTextingNumber ? 'Re-run number provisioning' : 'Provision number'}
                </Button>
              </form>
            ) : (
              <form action={provisionBusinessAction} className="space-y-4">
                <input type="hidden" name="businessId" value={business.id} />
                <input type="hidden" name="mode" value="EXISTING_NUMBER" />
                <div className="space-y-2">
                  <Label htmlFor="existingNumberSidSelect">Choose an existing number in the selected account</Label>
                  <Select id="existingNumberSidSelect" name="existingNumberSidSelect" defaultValue="">
                    <option value="">Choose a number</option>
                    {availableNumbers.numbers.map((number) => (
                      <option key={number.sid} value={number.sid}>
                        {(number.phoneNumber ? formatPhoneForDisplay(number.phoneNumber) : number.friendlyName || number.sid) ?? number.sid}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">{setupFlow.existingNumberMessage}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="existingNumberSidManual">Or paste a number SID manually</Label>
                  <Input id="existingNumberSidManual" name="existingNumberSidManual" placeholder="PN..." />
                </div>
                <Button size="sm" type="submit">
                  Attach existing number
                </Button>
              </form>
            )}

            <form action={saveAdminTwilioSetupAction} className="grid gap-4 md:grid-cols-2">
              <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioPhoneNumber', 'twilioPhoneNumberSid']} />
              <div className="space-y-2">
                <Label htmlFor="adminTwilioPhoneNumber">Twilio number</Label>
                <Input id="adminTwilioPhoneNumber" name="twilioPhoneNumber" defaultValue={managedTextingNumber || ''} placeholder="+15551234567" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminTwilioPhoneNumberSid">Twilio number SID</Label>
                <Input
                  id="adminTwilioPhoneNumberSid"
                  name="twilioPhoneNumberSid"
                  defaultValue={business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || ''}
                  placeholder="PN..."
                />
              </div>
              <div className="md:col-span-2">
                <Button size="sm" type="submit" variant="outline">
                  Save number mapping
                </Button>
              </div>
            </form>
          </div>
        ),
      };
    }

    if (step.key === 'voice_webhook_synced') {
      return {
        ...step,
        body: (
          <form action={resyncBusinessWebhooksAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="target" value="ALL" />
            <Button size="sm" type="submit">
              Sync all webhooks
            </Button>
            <span className="text-sm text-muted-foreground">Voice, SMS, and status callback sync all happen together from this page.</span>
          </form>
        ),
      };
    }

    if (step.key === 'a2p_status_recorded') {
      return {
        ...step,
        body: (
          <form action={saveAdminTwilioSetupAction} className="grid gap-4 md:grid-cols-2">
            <HiddenAdminTwilioFields
              defaults={defaults}
              exclude={['managedTwilioStatus', 'a2pCustomerProfileSid', 'a2pBrandSid', 'a2pCampaignSid', 'a2pFailureReason']}
            />
            <div className="space-y-2">
              <Label htmlFor="adminManagedTwilioStatus">A2P status</Label>
              <Select id="adminManagedTwilioStatus" name="managedTwilioStatus" defaultValue={business.managedTwilioStatus}>
                {Object.entries(managedTwilioStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminA2pCustomerProfileSid">Customer profile SID</Label>
              <Input id="adminA2pCustomerProfileSid" name="a2pCustomerProfileSid" defaultValue={business.a2pCustomerProfileSid || ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminA2pBrandSid">Brand SID</Label>
              <Input id="adminA2pBrandSid" name="a2pBrandSid" defaultValue={business.a2pBrandSid || ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminA2pCampaignSid">Campaign SID</Label>
              <Input id="adminA2pCampaignSid" name="a2pCampaignSid" defaultValue={business.a2pCampaignSid || ''} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="adminA2pFailureReason">A2P blocker note</Label>
              <Input
                id="adminA2pFailureReason"
                name="a2pFailureReason"
                defaultValue={business.a2pFailureReason || ''}
                placeholder="Record why launch is pending, blocked, or approved."
              />
            </div>
            <div className="md:col-span-2">
              <Button size="sm" type="submit" variant="outline">
                Save A2P status
              </Button>
            </div>
          </form>
        ),
      };
    }

    if (step.key === 'test_sms_delivered') {
      return {
        ...step,
        body: (
          <form action={sendBusinessTestSmsAction} className="space-y-3" id="test-sms-step">
            <input type="hidden" name="businessId" value={business.id} />
            <div className="space-y-2">
              <Label htmlFor="adminTwilioTestSmsDestination">Test SMS destination</Label>
              <Input
                id="adminTwilioTestSmsDestination"
                name="destinationPhone"
                defaultValue={business.notificationSettings?.ownerPhone || business.notifyPhone || ''}
                placeholder="+15551234567"
              />
            </div>
            <Button size="sm" type="submit">
              Send test SMS
            </Button>
          </form>
        ),
      };
    }

    if (step.key === 'missed_call_validated') {
      return {
        ...step,
        body: (
            <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants({ size: 'sm' })} href={buildAdminCustomerOpenHref(business.id, '/app')}>
              Open customer workspace
            </Link>
            <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={buildAdminCustomerOpenHref(business.id, '/app/call-flow')}>
              Open customer call flow
            </Link>
          </div>
        ),
      };
    }

    if (step.key === 'safe_to_mark_live') {
      return {
        ...step,
        body: (
          <div className="flex flex-wrap gap-3">
            <form action={setBusinessProvisioningStatusAction}>
              <input type="hidden" name="businessId" value={business.id} />
              <input type="hidden" name="status" value="LIVE" />
              <Button size="sm" type="submit" disabled={!setupFlow.safeToMarkLive || business.provisioningStatus === 'LIVE'}>
                {business.provisioningStatus === 'LIVE' ? 'Already live' : 'Mark live'}
              </Button>
            </form>
            <form action={setBusinessProvisioningStatusAction}>
              <input type="hidden" name="businessId" value={business.id} />
              <input type="hidden" name="status" value="PAUSED" />
              <Button size="sm" type="submit" variant="outline">
                Pause automation
              </Button>
            </form>
          </div>
        ),
      };
    }

    return step;
  });

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-2">
        <Link className="text-sm text-muted-foreground underline underline-offset-4" href="/admin">
          Back to operator board
        </Link>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{business.name} Twilio setup control panel</h1>
              {isBusinessArchived(business) ? <Badge variant="outline">Archived</Badge> : null}
              <Badge variant={getBadgeVariant(setupFlow.banner.tone)}>{setupFlow.banner.title}</Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Shared setup flow for new-business provisioning and existing-business control. The first choice stays visible near the top: main Twilio account or business subaccount.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants({ variant: 'default' })} href={buildAdminCustomerOpenHref(business.id, '/app')}>
              Open customer workspace
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href={buildAdminCustomerOpenHref(business.id, '/app/settings')}>
              Open customer settings
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href={buildAdminCustomerOpenHref(business.id, '/app/call-flow')}>
              Open customer call flow
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href={`/admin/${business.id}/workspace`}>
              View support workspace snapshot
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href={buildAdminCustomerOpenHref(business.id, '/app/leads?view=attention')}>
              Open customer leads
            </Link>
          </div>
        </div>
      </div>

      {created ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business workspace created and ready for the Twilio setup flow.</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Setup state saved.</div> : null}
      {ownerAction ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          {ownerAction === 'connected'
            ? 'Existing owner connected.'
            : ownerAction === 'invited'
              ? 'Owner invitation sent.'
              : ownerAction === 'resent'
                ? 'Owner invitation resent.'
                : 'Owner state updated.'}
        </div>
      ) : null}
      {provisioned ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Provisioning run finished. Review the checklist below before moving on.</div> : null}
      {synced ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Webhook sync complete for {synced.toLowerCase()}.</div> : null}
      {testSms ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Test SMS requested. Wait for delivery before treating this business as launch-ready.</div> : null}
      {archived ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business archived safely. Automation is paused.</div> : null}
      {restored ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business restored and ready for review.</div> : null}
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <div id="admin-twilio-setup">
        <TwilioSetupChecklist
          title="CallbackCloser Twilio launch flow"
          description="Use the same guided checklist here that the business sees during setup, with the admin-only controls needed to actually finish provisioning."
          banner={setupFlow.banner}
          bannerAction={bannerAction}
          steps={setupSteps}
          advanced={
            <Card className="bg-card/90" id="advanced">
              <CardHeader>
                <CardTitle>Advanced</CardTitle>
                <CardDescription>Rare lifecycle actions stay out of the main setup path.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {isBusinessArchived(business) ? (
                  <form action={restoreBusinessAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <Button size="sm" type="submit">
                      Restore business
                    </Button>
                  </form>
                ) : (
                  <form action={archiveBusinessAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="confirmationName" value={business.name} />
                    <Button size="sm" type="submit" variant="outline">
                      Archive business
                    </Button>
                  </form>
                )}
                {business.isTestBusiness ? (
                  <form action={deleteTestBusinessAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="confirmationName" value={business.name} />
                    <Button size="sm" type="submit" variant="destructive">
                      Delete test business
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          }
        />
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Setup snapshot</CardTitle>
          <CardDescription>Plain-English context without the old dashboard clutter.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Owner</p>
            <p className="mt-2 text-muted-foreground">{ownerState.email || business.notificationSettings?.ownerEmail || 'Owner email missing'}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Forwarding number</p>
            <p className="mt-2 text-muted-foreground">{formatPhoneForDisplay(business.forwardingNumber)}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Owner alert phone</p>
            <p className="mt-2 text-muted-foreground">
              {business.notificationSettings?.ownerPhone || business.notifyPhone
                ? formatPhoneForDisplay(business.notificationSettings?.ownerPhone || business.notifyPhone)
                : 'Owner alert phone missing'}
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Account inventory source</p>
            <p className="mt-2 text-muted-foreground">{availableNumbers.sourceLabel || 'Twilio not available'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
