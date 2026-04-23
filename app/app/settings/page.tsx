import Link from 'next/link';

import { setBusinessProvisioningStatusAction } from '@/app/admin/actions';
import { TwilioSetupChecklist } from '@/components/twilio-setup-checklist';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { getAdminSession } from '@/lib/admin';
import { getAdminTestSmsConfidenceState } from '@/lib/admin-dashboard';
import { getTwilioWebhookSnapshot } from '@/lib/admin-provisioning';
import { requireBusiness } from '@/lib/auth';
import { getBusinessNotificationSettingsForBusiness } from '@/lib/business-access';
import { TwilioSetupTone, buildTwilioSetupFlow, getTwilioAccountModeLabel, twilioAccountModeOptions, twilioNumberSetupModeOptions } from '@/lib/twilio-setup';
import { db } from '@/lib/db';
import { getManagedTextingNumber, managedTwilioStatusLabels } from '@/lib/managed-twilio-status';
import { formatPhoneForDisplay } from '@/lib/phone';
import { isPortfolioDemoMode } from '@/lib/portfolio-demo';

import {
  buyTwilioNumberAction,
  connectExistingTwilioNumberAction,
  resyncTwilioWebhooksAction,
  saveBusinessSettingsAction,
  saveBusinessTwilioAdminOverridesAction,
  saveBusinessTwilioSetupChoiceAction,
  sendBusinessTwilioTestSmsAction,
} from './actions';

const adminChangedFieldLabels: Record<string, string> = {
  ownerPhone: 'owner alert phone',
  twilioAccountMode: 'Twilio account mode',
  twilioNumberSetupMode: 'Twilio number path',
  twilioSubaccountSid: 'Twilio subaccount SID',
  twilioPhoneNumber: 'Twilio number',
  twilioPhoneNumberSid: 'Twilio number SID',
  twilioMessagingServiceSid: 'messaging service SID',
  a2pCustomerProfileSid: 'A2P customer profile SID',
  a2pBrandSid: 'A2P brand SID',
  a2pCampaignSid: 'A2P campaign SID',
  a2pFailureReason: 'A2P blocker note',
  managedTwilioStatus: 'A2P status',
};

type BusinessTwilioDefaults = {
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
  ownerPhone: string;
};

function HiddenBusinessTwilioFields({
  defaults,
  exclude = [],
}: {
  defaults: BusinessTwilioDefaults;
  exclude?: Array<keyof BusinessTwilioDefaults>;
}) {
  return (
    <>
      {Object.entries(defaults).map(([name, value]) => {
        if (exclude.includes(name as keyof BusinessTwilioDefaults)) return null;
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

export default async function SettingsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const adminSession = demoMode ? null : await getAdminSession();
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const saved = searchParams?.saved === '1';
  const numberBought = searchParams?.numberBought === '1';
  const twilioSynced = searchParams?.twilioSynced === '1';
  const adminTwilioSaved = searchParams?.adminTwilioSaved === '1';
  const twilioTestSms = searchParams?.twilioTestSms === '1';
  const existingNumberIntent = searchParams?.existingNumberIntent === '1';
  const adminChangedRaw = typeof searchParams?.adminChanged === 'string' ? searchParams.adminChanged : '';
  const adminChanged = adminChangedRaw
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => adminChangedFieldLabels[field] || field);

  const [notificationSettings, successfulLeadCount, testSmsEvents, webhookSnapshot] = demoMode
    ? [null, 1, [], null]
    : await Promise.all([
        getBusinessNotificationSettingsForBusiness(business.id),
        db.lead.count({
          where: {
            businessId: business.id,
            OR: [{ ownerNotifiedAt: { not: null } }, { notifiedAt: { not: null } }],
          },
        }),
        db.businessOperatorEvent.findMany({
          where: {
            businessId: business.id,
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
        getTwilioWebhookSnapshot(business),
      ]);

  const testSmsState = getAdminTestSmsConfidenceState(testSmsEvents);
  const managedTextingNumber = getManagedTextingNumber(business);
  const setupFlow = buildTwilioSetupFlow({
    business,
    notificationSettings,
    ownerConnected: true,
    successfulLeadCount,
    testSmsState,
    webhookSnapshot,
  });
  const twilioDefaults: BusinessTwilioDefaults = {
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
    ownerPhone: notificationSettings?.ownerPhone || business.notifyPhone || '',
  };

  const bannerAction =
    setupFlow.banner.stepKey === 'voice_webhook_synced' ||
    setupFlow.banner.stepKey === 'sms_webhook_synced' ||
    setupFlow.banner.stepKey === 'status_callback_synced' ? (
      <form action={resyncTwilioWebhooksAction}>
        <Button size="sm" type="submit">
          Sync webhooks
        </Button>
      </form>
    ) : setupFlow.banner.stepKey === 'safe_to_mark_live' && adminSession?.isAdmin && setupFlow.safeToMarkLive && business.provisioningStatus !== 'LIVE' ? (
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
          setupFlow.banner.stepKey === 'account_mode'
            ? '#account-mode-step'
            : setupFlow.banner.stepKey === 'number_path'
              ? '#number-path-step'
              : setupFlow.banner.stepKey === 'test_sms_delivered'
                ? '#test-sms-step'
                : setupFlow.banner.stepKey === 'missed_call_validated'
                  ? '/app/call-flow'
                  : '#twilio-setup-flow'
        }
      >
        {setupFlow.banner.stepKey === 'missed_call_validated' ? 'Open call flow' : 'Review step'}
      </Link>
    );

  const setupSteps = setupFlow.steps.map((step) => {
    if (step.key === 'owner_connected') {
      return {
        ...step,
        body: (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="success">Connected</Badge>
            <span>Your signed-in business account is already attached to this workspace.</span>
          </div>
        ),
      };
    }

    if (step.key === 'account_mode') {
      return {
        ...step,
        body: (
          <form action={saveBusinessTwilioSetupChoiceAction} className="space-y-4" id="account-mode-step">
            <input type="hidden" name="twilioNumberSetupMode" value={setupFlow.numberSetupMode} />
            <div className="grid gap-3 md:grid-cols-2">
              {twilioAccountModeOptions.map((option) => (
                <label key={option.value} className="rounded-xl border bg-background/80 p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <input defaultChecked={setupFlow.accountMode === option.value} name="twilioAccountMode" type="radio" value={option.value} />
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
          <form action={saveBusinessTwilioSetupChoiceAction} className="space-y-4" id="number-path-step">
            <input type="hidden" name="twilioAccountMode" value={setupFlow.accountMode} />
            <div className="grid gap-3 md:grid-cols-2">
              {twilioNumberSetupModeOptions.map((option) => (
                <label key={option.value} className="rounded-xl border bg-background/80 p-4 text-sm">
                  <div className="flex items-start gap-3">
                    <input defaultChecked={setupFlow.numberSetupMode === option.value} name="twilioNumberSetupMode" type="radio" value={option.value} />
                    <div className="space-y-1">
                      <p className="font-medium">{option.label}</p>
                      <p className="text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {setupFlow.numberSetupMode === 'EXISTING_NUMBER' ? (
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
        body: adminSession?.isAdmin ? (
          <form action={saveBusinessTwilioAdminOverridesAction} className="space-y-4">
            <HiddenBusinessTwilioFields defaults={twilioDefaults} exclude={['twilioSubaccountSid']} />
            {setupFlow.accountMode === 'BUSINESS_SUBACCOUNT' ? (
              <div className="space-y-2">
                <Label htmlFor="businessTwilioSubaccountSid">Business subaccount SID</Label>
                <Input
                  id="businessTwilioSubaccountSid"
                  name="twilioSubaccountSid"
                  defaultValue={business.twilioSubaccountSid || ''}
                  placeholder="AC..."
                />
                <p className="text-xs text-muted-foreground">Paste a known subaccount SID to reuse it, or leave this blank and let provisioning create one.</p>
              </div>
            ) : (
              <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
                Main account mode is active. CallbackCloser will use the parent Twilio account directly for this business.
              </div>
            )}
            <Button size="sm" type="submit" variant="outline">
              Save account target
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            {setupFlow.accountMode === 'BUSINESS_SUBACCOUNT'
              ? 'CallbackCloser will create or reuse a dedicated Twilio subaccount for this business during setup.'
              : 'CallbackCloser will keep this business on the parent Twilio account.'}
          </p>
        ),
      };
    }

    if (step.key === 'messaging_service_ready') {
      return {
        ...step,
        body: adminSession?.isAdmin ? (
          <form action={saveBusinessTwilioAdminOverridesAction} className="space-y-4">
            <HiddenBusinessTwilioFields defaults={twilioDefaults} exclude={['twilioMessagingServiceSid']} />
            <div className="space-y-2">
              <Label htmlFor="businessMessagingServiceSid">Messaging Service SID</Label>
              <Input
                id="businessMessagingServiceSid"
                name="twilioMessagingServiceSid"
                defaultValue={business.twilioMessagingServiceSid || ''}
                placeholder="MG..."
              />
            </div>
            <Button size="sm" type="submit" variant="outline">
              Save Messaging Service
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Current value: {business.twilioMessagingServiceSid || 'Not recorded yet.'}</p>
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
                <p className="font-medium">Number path</p>
                <p className="mt-2 text-muted-foreground">{setupFlow.numberSetupModeLabel}</p>
              </div>
            </div>

            {setupFlow.numberSetupMode === 'NEW_NUMBER' ? (
              <form action={buyTwilioNumberAction} className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="w-full md:max-w-xs">
                  <Label htmlFor="setupAreaCode">Preferred area code</Label>
                  <Input id="setupAreaCode" name="areaCode" inputMode="numeric" maxLength={3} placeholder="512" />
                </div>
                <Button size="sm" type="submit" disabled={Boolean(managedTextingNumber)}>
                  {managedTextingNumber ? 'Number already assigned' : 'Provision number'}
                </Button>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{setupFlow.existingNumberMessage}</p>
                <form action={connectExistingTwilioNumberAction}>
                  <Button size="sm" type="submit" variant="outline">
                    Keep existing number
                  </Button>
                </form>
              </div>
            )}

            {adminSession?.isAdmin ? (
              <form action={saveBusinessTwilioAdminOverridesAction} className="grid gap-4 md:grid-cols-2">
                <HiddenBusinessTwilioFields defaults={twilioDefaults} exclude={['twilioPhoneNumber', 'twilioPhoneNumberSid']} />
                <div className="space-y-2">
                  <Label htmlFor="businessTwilioPhoneNumber">Twilio number</Label>
                  <Input id="businessTwilioPhoneNumber" name="twilioPhoneNumber" defaultValue={managedTextingNumber || ''} placeholder="+15551234567" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessTwilioPhoneNumberSid">Twilio number SID</Label>
                  <Input
                    id="businessTwilioPhoneNumberSid"
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
            ) : null}
          </div>
        ),
      };
    }

    if (step.key === 'voice_webhook_synced') {
      return {
        ...step,
        body: (
          <form action={resyncTwilioWebhooksAction} className="flex flex-wrap gap-3">
            <Button size="sm" type="submit" disabled={!(business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid)}>
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
        body: adminSession?.isAdmin ? (
          <form action={saveBusinessTwilioAdminOverridesAction} className="grid gap-4 md:grid-cols-2">
            <HiddenBusinessTwilioFields
              defaults={twilioDefaults}
              exclude={['managedTwilioStatus', 'a2pCustomerProfileSid', 'a2pBrandSid', 'a2pCampaignSid', 'a2pFailureReason']}
            />
            <div className="space-y-2">
              <Label htmlFor="businessManagedTwilioStatus">A2P status</Label>
              <Select id="businessManagedTwilioStatus" name="managedTwilioStatus" defaultValue={business.managedTwilioStatus}>
                {Object.entries(managedTwilioStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessA2pCustomerProfileSid">Customer profile SID</Label>
              <Input id="businessA2pCustomerProfileSid" name="a2pCustomerProfileSid" defaultValue={business.a2pCustomerProfileSid || ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessA2pBrandSid">Brand SID</Label>
              <Input id="businessA2pBrandSid" name="a2pBrandSid" defaultValue={business.a2pBrandSid || ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessA2pCampaignSid">Campaign SID</Label>
              <Input id="businessA2pCampaignSid" name="a2pCampaignSid" defaultValue={business.a2pCampaignSid || ''} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="businessA2pFailureReason">A2P blocker note</Label>
              <Input
                id="businessA2pFailureReason"
                name="a2pFailureReason"
                defaultValue={business.a2pFailureReason || ''}
                placeholder="Record why launch is blocked, pending, or approved."
              />
            </div>
            <div className="md:col-span-2">
              <Button size="sm" type="submit" variant="outline">
                Save A2P status
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant={getBadgeVariant(step.tone)}>{step.stateLabel}</Badge>
            <span className="text-muted-foreground">CallbackCloser keeps this launch status truthful even while review is pending.</span>
          </div>
        ),
      };
    }

    if (step.key === 'test_sms_delivered') {
      return {
        ...step,
        body: (
          <form action={sendBusinessTwilioTestSmsAction} className="space-y-3" id="test-sms-step">
            <div className="space-y-2">
              <Label htmlFor="businessTwilioTestSmsPhone">Test SMS destination</Label>
              <Input
                id="businessTwilioTestSmsPhone"
                name="destinationPhone"
                defaultValue={notificationSettings?.ownerPhone || business.notifyPhone || ''}
                placeholder="+15551234567"
              />
              <p className="text-xs text-muted-foreground">Send a real test text from the current business line before you treat this setup as launch-ready.</p>
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
            <Link className={buttonVariants({ size: 'sm' })} href="/app/call-flow">
              Open call flow
            </Link>
            <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="/app/leads">
              Open recovered leads
            </Link>
          </div>
        ),
      };
    }

    if (step.key === 'safe_to_mark_live') {
      return {
        ...step,
        body: adminSession?.isAdmin ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">Launch state is managed after the setup checklist, test SMS, and missed-call validation all clear.</p>
        ),
      };
    }

    return step;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Badge variant="outline">Twilio Setup</Badge>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Business Twilio setup</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              One guided place to choose the Twilio account mode, track each provisioning step, and keep launch status honest without digging through admin screens.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/call-flow">
              Open call flow
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/leads">
              Open recovered leads
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business settings saved.</div> : null}
      {numberBought ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">A new business number was provisioned for the selected Twilio account mode.</div> : null}
      {existingNumberIntent ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Existing-number path saved. CallbackCloser will keep this business on the admin-assisted existing-number rollout until the Twilio account context and A2P path are reviewed.
        </div>
      ) : null}
      {twilioSynced ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Webhook sync completed for the current business number.</div> : null}
      {twilioTestSms ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Test SMS requested. Wait for delivery before you treat the setup as launch-ready.</div> : null}
      {adminTwilioSaved ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Internal setup state saved{adminChanged.length > 0 ? `: ${adminChanged.join(', ')}.` : '.'}
        </div>
      ) : null}

      <div id="twilio-setup-flow">
        <TwilioSetupChecklist
          title="CallbackCloser Twilio launch flow"
          description="The same step-by-step provisioning flow powers new-business setup and ongoing business control."
          banner={setupFlow.banner}
          bannerAction={bannerAction}
          steps={setupSteps}
        />
      </div>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Business basics</CardTitle>
          <CardDescription>Keep the live call path and owner routing current while Twilio setup moves forward.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveBusinessSettingsAction} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="settingsBusinessName">Business name</Label>
              <Input id="settingsBusinessName" name="name" defaultValue={business.name} required />
            </div>
            <div>
              <Label htmlFor="settingsForwardingNumber">Forwarding number</Label>
              <Input id="settingsForwardingNumber" name="forwardingNumber" defaultValue={business.forwardingNumber} required />
            </div>
            <div>
              <Label htmlFor="settingsNotifyPhone">Owner alert phone</Label>
              <Input id="settingsNotifyPhone" name="notifyPhone" defaultValue={notificationSettings?.ownerPhone || business.notifyPhone || ''} />
            </div>
            <div>
              <Label htmlFor="settingsOwnerEmail">Owner email</Label>
              <Input id="settingsOwnerEmail" name="ownerEmail" defaultValue={notificationSettings?.ownerEmail || ''} placeholder="owner@business.com" />
            </div>
            <div>
              <Label htmlFor="settingsTimezone">Timezone</Label>
              <Input id="settingsTimezone" name="timezone" defaultValue={business.timezone} required />
            </div>
            <div>
              <Label htmlFor="settingsMissedCallSeconds">Missed-call timeout (seconds)</Label>
              <Input id="settingsMissedCallSeconds" name="missedCallSeconds" type="number" min={5} max={90} defaultValue={business.missedCallSeconds} required />
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
                <span>Send owner SMS alerts</span>
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
                <span>Show in-app notifications</span>
              </div>
            </label>
            <label className="rounded-xl border bg-background/80 p-4 text-sm">
              <div className="flex items-start gap-3">
                <input defaultChecked={notificationSettings?.urgentOnly ?? false} name="urgentOnly" type="checkbox" value="true" />
                <span>Urgent leads only</span>
              </div>
            </label>
            <div className="md:col-span-2">
              <Button type="submit">Save business basics</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Advanced</CardTitle>
          <CardDescription>Rare setup notes and trust links that should stay visible without crowding the main flow.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
            Existing-number support stays honest here. CallbackCloser does not automatically discover arbitrary Twilio subaccounts or numbers outside the selected account context.
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
            Public trust pages stay linked from setup: <Link className="underline underline-offset-4" href="/privacy">Privacy</Link>,{' '}
            <Link className="underline underline-offset-4" href="/terms">Terms</Link>, and{' '}
            <Link className="underline underline-offset-4" href="/sms-consent">SMS consent</Link>.
          </div>
          {adminSession?.isAdmin ? (
            <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground md:col-span-2">
              Admin mode is active on this page, so the internal Twilio mapping fields above are editable without leaving the business workspace.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
