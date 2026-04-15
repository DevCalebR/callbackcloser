import Link from 'next/link';

import { SetupChecklist } from '@/components/setup-checklist';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAdminSession } from '@/lib/admin';
import { requireBusiness } from '@/lib/auth';
import { getBusinessNotificationSettingsForBusiness } from '@/lib/business-access';
import { db } from '@/lib/db';
import { getManagedTextingNumber, getManagedTwilioStatusSummary } from '@/lib/managed-twilio';
import { formatPhoneForDisplay } from '@/lib/phone';
import { isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { isSmsRecipientOptedOut } from '@/lib/twilio-sms-compliance';

import {
  buyTwilioNumberAction,
  resyncTwilioWebhooksAction,
  saveBusinessSettingsAction,
  saveBusinessTwilioAdminOverridesAction,
} from './actions';

const adminChangedFieldLabels: Record<string, string> = {
  ownerPhone: 'owner alert phone',
  twilioPhoneNumber: 'Twilio number',
  twilioPhoneNumberSid: 'Twilio number SID',
  twilioMessagingServiceSid: 'messaging service SID',
};

export default async function SettingsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const adminSession = demoMode ? null : await getAdminSession();
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const saved = searchParams?.saved === '1';
  const numberBought = searchParams?.numberBought === '1';
  const twilioConnected = searchParams?.twilioConnected === '1';
  const twilioSynced = searchParams?.twilioSynced === '1';
  const adminTwilioSaved = searchParams?.adminTwilioSaved === '1';
  const adminChangedRaw = typeof searchParams?.adminChanged === 'string' ? searchParams.adminChanged : '';
  const adminChanged = adminChangedRaw
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => adminChangedFieldLabels[field] || field);
  const billingAccess = getBusinessBillingAccessState(business);
  const subscriptionReady = billingAccess.billingActive;
  const ownerNotifyPhoneOptedOut =
    demoMode || !business.notifyPhone
      ? false
      : await isSmsRecipientOptedOut({ businessId: business.id, phone: business.notifyPhone });
  const successfulLeadCount = demoMode
    ? 1
    : await db.lead.count({
        where: {
          businessId: business.id,
          OR: [{ ownerNotifiedAt: { not: null } }, { notifiedAt: { not: null } }],
        },
      });
  const notificationSettings = demoMode
    ? null
    : await getBusinessNotificationSettingsForBusiness(business.id);
  const managedTextingNumber = getManagedTextingNumber(business);
  const managedTwilioSummary = getManagedTwilioStatusSummary(business);
  const lastManagedSetupRefresh = business.twilioWebhookSyncedAt ? new Date(business.twilioWebhookSyncedAt).toLocaleString() : 'Never';
  const activationReady =
    Boolean(business.forwardingNumber) &&
    Boolean(managedTextingNumber) &&
    managedTwilioSummary.messagingServiceReady &&
    Boolean(business.notifyPhone) &&
    !ownerNotifyPhoneOptedOut &&
    subscriptionReady;

  const checklistItems = [
    {
      key: 'twilio',
      label: 'Business info submitted',
      detail: business.name ? `${business.name} is ready for managed setup.` : 'Start with the basic business profile.',
      complete: Boolean(business.name),
    },
    {
      key: 'texting-line',
      label: 'Texting number provisioned',
      detail: managedTextingNumber
        ? `Your texting line is ${formatPhoneForDisplay(managedTextingNumber)}.`
        : 'We still need to provision your business texting line.',
      complete: Boolean(managedTextingNumber),
    },
    {
      key: 'forwarding',
      label: 'Forwarding configured',
      detail: business.forwardingNumber
        ? `Forwarding is set to ${formatPhoneForDisplay(business.forwardingNumber)}.`
        : 'Add the business line that should ring first.',
      complete: Boolean(business.forwardingNumber),
    },
    {
      key: 'sms-template',
      label: 'Messaging service active',
      detail: managedTwilioSummary.messagingServiceReady
        ? 'Managed messaging is connected to your texting line.'
        : 'Messaging setup is still in progress.',
      complete: managedTwilioSummary.messagingServiceReady,
    },
    {
      key: 'compliance',
      label: managedTwilioSummary.complianceReady ? 'Compliance approved' : 'Compliance review in progress',
      detail: managedTwilioSummary.description,
      complete: managedTwilioSummary.complianceReady,
    },
    {
      key: 'owner-number',
      label: 'Owner number verified',
      detail: business.notifyPhone
        ? ownerNotifyPhoneOptedOut
          ? 'Owner number is present but currently opted out.'
          : `Owner alerts route to ${formatPhoneForDisplay(business.notifyPhone)}.`
        : 'Add the owner mobile number for alert delivery.',
      complete: Boolean(business.notifyPhone) && !ownerNotifyPhoneOptedOut,
    },
    {
      key: 'billing',
      label: 'Billing active',
      detail: subscriptionReady ? 'Automated SMS follow-up can run on live missed calls.' : 'Activate billing before live auto-texting resumes.',
      complete: subscriptionReady,
    },
    {
      key: 'test-lead',
      label: 'Test lead passed',
      detail:
        successfulLeadCount > 0
          ? `${successfulLeadCount} lead${successfulLeadCount === 1 ? '' : 's'} reached the owner-alert stage.`
          : 'Run your first missed-call test and confirm the owner alert lands.',
      complete: successfulLeadCount > 0,
    },
  ];

  const firstReplyPreview = `CallbackCloser: We missed your call. What service do you need? Reply 1 ${business.serviceLabel1}, 2 ${business.serviceLabel2}, 3 ${business.serviceLabel3}, or reply with a short description. Reply STOP to opt out or HELP for help. Msg freq varies. Msg & data rates may apply.`;
  const ownerSummaryPreview = `New missed-call lead: ${business.serviceLabel1} | Urgency: Today | Location: 78704 | Callback: Afternoon | Open in dashboard`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Badge variant="outline">Business Settings</Badge>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Business settings and activation</h1>
            <p className="text-sm text-muted-foreground">
              Get your missed-call coverage live without digging through setup screens or guessing what comes next.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/call-flow">
              Open Call Flow
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/billing">
              Open Billing
            </Link>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business settings saved.</div> : null}
      {numberBought ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Your business texting line was provisioned and connected.</div> : null}
      {twilioConnected ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Your business texting line was connected and setup was refreshed.</div> : null}
      {twilioSynced ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Managed texting setup refreshed.</div> : null}
      {adminTwilioSaved ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          Internal Twilio mapping saved{adminChanged.length > 0 ? `: ${adminChanged.join(', ')}.` : '.'}
        </div>
      ) : null}

      <SetupChecklist
        title="Setup checklist"
        description="The fastest route to first value is simple: get the texting line live, confirm routing, verify alerts, then run the missed-call test."
        items={checklistItems}
      />

      <Card className={activationReady ? 'border-accent/40 bg-accent/20' : 'border-primary/20 bg-primary/5'}>
        <CardHeader>
          <CardTitle>Activation guidance</CardTitle>
          <CardDescription>Use these prompts to get to the first successful missed-call handoff quickly.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Run your first test</p>
            <p className="mt-2 text-muted-foreground">
              {activationReady
                ? 'Routing, billing, and managed setup look ready. Place a missed call and confirm the owner alert arrives.'
                : 'Finish the incomplete checklist items, then place the missed call and watch Recovered Leads for the handoff.'}
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Confirm your SMS template</p>
            <p className="mt-2 text-muted-foreground">
              Check the first reply and lead questions below so the handoff feels right for your business.
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Verify your owner alert number</p>
            <p className="mt-2 text-muted-foreground">
              {business.notifyPhone && !ownerNotifyPhoneOptedOut
                ? `Alerts are set to ${formatPhoneForDisplay(business.notifyPhone)}.`
                : 'Add the owner mobile number so qualified leads reach the right phone immediately.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <form action={saveBusinessSettingsAction} className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>1. Business Profile</CardTitle>
                <CardDescription>Core business identity and operating context.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="name">Business name</Label>
                  <Input id="name" name="name" defaultValue={business.name} required />
                </div>
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" name="timezone" defaultValue={business.timezone} required />
                </div>
                <div>
                  <Label htmlFor="serviceArea">Service area</Label>
                  <Input id="serviceArea" defaultValue="Managed during launch" disabled />
                </div>
                <div>
                  <Label htmlFor="ownerName">Owner name</Label>
                  <Input id="ownerName" defaultValue="Uses your account owner profile" disabled />
                </div>
                <div>
                  <Label htmlFor="supportEmail">Support email</Label>
                  <Input id="supportEmail" defaultValue="Uses your billing contact email" disabled />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>2. Phone and Routing</CardTitle>
                <CardDescription>Make sure missed callers get covered and the right phone still rings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="forwardingNumber">Forwarding number</Label>
                    <Input id="forwardingNumber" name="forwardingNumber" defaultValue={business.forwardingNumber} required />
                    <p className="mt-1 text-xs text-muted-foreground">This is the real business line that should ring during the live call test.</p>
                  </div>
                  <div>
                    <Label htmlFor="missedCallSeconds">Missed-call timeout (seconds)</Label>
                    <Input
                      id="missedCallSeconds"
                      name="missedCallSeconds"
                      type="number"
                      min={5}
                      max={90}
                      defaultValue={business.missedCallSeconds}
                      required
                    />
                    <p className="mt-1 text-xs text-muted-foreground">CallbackCloser starts the recovery flow after this unanswered window.</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <p className="font-medium">Your texting line</p>
                    <p className="mt-2 text-muted-foreground">
                      {managedTextingNumber ? formatPhoneForDisplay(managedTextingNumber) : 'No business texting line assigned yet'}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <p className="font-medium">Setup status</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={managedTwilioSummary.numberAssigned ? 'success' : 'outline'}>
                        {managedTwilioSummary.numberAssigned ? 'Line assigned' : 'Needs line'}
                      </Badge>
                      <Badge variant={activationReady ? 'success' : 'outline'}>
                        {activationReady ? 'Ready for test' : 'Action needed'}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <p className="font-medium">Missed call detection</p>
                    <p className="mt-2 text-muted-foreground">
                      {business.forwardingNumber
                        ? `Calls ring through to ${formatPhoneForDisplay(business.forwardingNumber)} while missed callers stay covered.`
                        : 'Add the business line that should still ring when new calls come in.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {managedTextingNumber ? (
                    <Link className={buttonVariants()} href={`tel:${managedTextingNumber}`}>
                      Test Call
                    </Link>
                  ) : (
                    <Button type="button" disabled>
                      Test Call
                    </Button>
                  )}
                  <Link className={buttonVariants({ variant: 'outline' })} href="/app/call-flow">
                    Review call flow
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>3. SMS Behavior</CardTitle>
                <CardDescription>What the caller sees first and how their lead gets qualified.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="serviceLabel1">Service option 1</Label>
                    <Input id="serviceLabel1" name="serviceLabel1" defaultValue={business.serviceLabel1} required />
                  </div>
                  <div>
                    <Label htmlFor="serviceLabel2">Service option 2</Label>
                    <Input id="serviceLabel2" name="serviceLabel2" defaultValue={business.serviceLabel2} required />
                  </div>
                  <div>
                    <Label htmlFor="serviceLabel3">Service option 3</Label>
                    <Input id="serviceLabel3" name="serviceLabel3" defaultValue={business.serviceLabel3} required />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border bg-background/80 p-4 text-sm">
                    <p className="font-medium">First reply template</p>
                    <p className="mt-2 text-muted-foreground">{firstReplyPreview}</p>
                  </div>
                  <div className="rounded-xl border bg-background/80 p-4 text-sm">
                    <p className="font-medium">Qualification questions</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                      <li>What service do you need?</li>
                      <li>How urgent is it?</li>
                      <li>What ZIP code or service area should the owner know?</li>
                      <li>Would you like a callback today?</li>
                      <li>Name capture if the caller shares it.</li>
                    </ol>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <p className="font-medium">Quiet hours</p>
                    <p className="mt-2 text-muted-foreground">
                      Standard daytime sending windows are used today. If your team needs a custom quiet-hours schedule, we can set that up during launch.
                    </p>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <p className="font-medium">STOP / HELP preview</p>
                    <p className="mt-2 text-muted-foreground">
                      Leads can reply STOP to opt out, HELP for support details, and START to opt back in.
                    </p>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <p className="font-medium">Opt-out handling status</p>
                    <p className="mt-2 text-muted-foreground">
                      Compliance handling is active for live messaging flows. Owner notify number status: {ownerNotifyPhoneOptedOut ? 'opted out' : 'ready'}.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>4. Owner Notifications</CardTitle>
                <CardDescription>Where the ready-to-close handoff goes and what the owner sees.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="notifyPhone">Owner mobile number</Label>
                    <Input id="notifyPhone" name="notifyPhone" defaultValue={notificationSettings?.ownerPhone ?? business.notifyPhone ?? ''} />
                    <p className="mt-1 text-xs text-muted-foreground">The owner summary SMS is sent here as soon as the lead is qualified.</p>
                  </div>
                  <div>
                    <Label htmlFor="ownerEmail">Owner email</Label>
                    <Input id="ownerEmail" name="ownerEmail" defaultValue={notificationSettings?.ownerEmail ?? ''} placeholder="owner@business.com" />
                    <p className="mt-1 text-xs text-muted-foreground">Qualified lead emails include the structured summary and a direct link to the lead.</p>
                  </div>
                </div>

                <div className="rounded-xl border bg-background/80 p-4 text-sm">
                  <p className="font-medium">Summary format preview</p>
                  <p className="mt-2 text-muted-foreground">{ownerSummaryPreview}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <input defaultChecked={notificationSettings?.notifySms ?? true} name="notifySms" type="checkbox" value="true" />
                      <div>
                        <p className="font-medium">Send owner SMS alerts</p>
                        <p className="mt-2 text-muted-foreground">Useful when the lead needs a fast callback and the owner wants a text immediately.</p>
                      </div>
                    </div>
                  </label>
                  <label className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <input defaultChecked={notificationSettings?.notifyEmail ?? true} name="notifyEmail" type="checkbox" value="true" />
                      <div>
                        <p className="font-medium">Send owner email alerts</p>
                        <p className="mt-2 text-muted-foreground">Email includes the structured summary and direct link back into CallbackCloser.</p>
                      </div>
                    </div>
                  </label>
                  <label className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <input defaultChecked={notificationSettings?.notifyInApp ?? true} name="notifyInApp" type="checkbox" value="true" />
                      <div>
                        <p className="font-medium">Show in-app notifications</p>
                        <p className="mt-2 text-muted-foreground">New qualified leads stay visible in the dashboard even if the owner misses the alert.</p>
                      </div>
                    </div>
                  </label>
                  <label className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <input defaultChecked={notificationSettings?.urgentOnly ?? false} name="urgentOnly" type="checkbox" value="true" />
                      <div>
                        <p className="font-medium">Urgent leads only</p>
                        <p className="mt-2 text-muted-foreground">Turn this on if the owner only wants outbound alerts for urgent missed-call leads.</p>
                      </div>
                    </div>
                  </label>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>5. Compliance and Trust</CardTitle>
                <CardDescription>Keep the legal and consent surfaces visible while your texting setup stays easy to understand.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-3">
                  <div className="rounded-xl border bg-background/80 p-4">
                    <p className="font-medium">Privacy policy URL</p>
                    <p className="mt-2 text-muted-foreground">/privacy</p>
                    <Link className="mt-2 inline-block underline underline-offset-4" href="/privacy">
                      Open privacy page
                    </Link>
                  </div>
                  <div className="rounded-xl border bg-background/80 p-4">
                    <p className="font-medium">Terms URL</p>
                    <p className="mt-2 text-muted-foreground">/terms</p>
                    <Link className="mt-2 inline-block underline underline-offset-4" href="/terms">
                      Open terms page
                    </Link>
                  </div>
                  <div className="rounded-xl border bg-background/80 p-4">
                    <p className="font-medium">Consent page URL</p>
                    <p className="mt-2 text-muted-foreground">/sms-consent</p>
                    <Link className="mt-2 inline-block underline underline-offset-4" href="/sms-consent">
                      Open consent page
                    </Link>
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <p className="font-medium">Message disclaimer preview</p>
                  <p className="mt-2 text-muted-foreground">
                    By replying, callers consent to text messages related to their missed call. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/90">
              <CardHeader>
                <CardTitle>Managed texting setup</CardTitle>
                <CardDescription>CallbackCloser handles the business texting line and messaging setup for you.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                  <p className="font-medium">Current setup</p>
                  <p className="mt-2 text-muted-foreground">
                    {managedTextingNumber ? formatPhoneForDisplay(managedTextingNumber) : 'No business texting line assigned yet'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Status: {managedTwilioSummary.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Last setup refresh: {lastManagedSetupRefresh}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{managedTwilioSummary.description}</p>
                </div>

                <form action={buyTwilioNumberAction} className="space-y-3">
                  <div>
                    <Label htmlFor="areaCode">Preferred area code (optional)</Label>
                    <Input
                      id="areaCode"
                      name="areaCode"
                      inputMode="numeric"
                      placeholder="512"
                      maxLength={3}
                      disabled={Boolean(managedTextingNumber)}
                    />
                  </div>
                  <Button type="submit" disabled={Boolean(managedTextingNumber)}>
                    {managedTextingNumber ? 'Texting Line Already Assigned' : 'Provision Business Texting Line'}
                  </Button>
                </form>

                <form action={resyncTwilioWebhooksAction} className="space-y-2">
                  <Button disabled={!(business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid)} type="submit" variant="outline">
                    Refresh Managed Setup
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Refreshes the managed texting-line configuration after provisioning or environment changes.
                  </p>
                </form>

                <div className="space-y-2 rounded-xl border p-4">
                  <p className="text-sm font-medium">Messaging setup</p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="rounded-md bg-muted/40 p-3">
                      Messaging service: {managedTwilioSummary.messagingServiceReady ? 'Active' : 'Still being set up'}
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      Compliance review: {managedTwilioSummary.complianceReady ? 'Approved and live' : managedTwilioSummary.label}
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      Demo-safe note: internal platform IDs stay server-side so this workspace stays business-facing.
                    </div>
                  </div>
                </div>

                {adminSession?.isAdmin ? (
                  <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Internal admin-only Twilio mapping editor</p>
                      <p className="text-xs text-muted-foreground">
                        Correct the stored Twilio number, SID, messaging service SID, and owner alert phone without leaving the business workspace. Saved
                        Twilio numbers are normalized to E.164 and update the voice/SMS lookup fields directly.
                      </p>
                    </div>

                    <form action={saveBusinessTwilioAdminOverridesAction} className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="adminTwilioPhoneNumber">Twilio number</Label>
                        <Input
                          id="adminTwilioPhoneNumber"
                          name="twilioPhoneNumber"
                          type="tel"
                          defaultValue={business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || ''}
                          placeholder="+18777480449"
                        />
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
                      <div className="space-y-2">
                        <Label htmlFor="adminTwilioMessagingServiceSid">Messaging service SID</Label>
                        <Input
                          id="adminTwilioMessagingServiceSid"
                          name="twilioMessagingServiceSid"
                          defaultValue={business.twilioMessagingServiceSid || ''}
                          placeholder="MG..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="adminOwnerPhone">Owner alert phone</Label>
                        <Input
                          id="adminOwnerPhone"
                          name="ownerPhone"
                          type="tel"
                          defaultValue={notificationSettings?.ownerPhone || business.notifyPhone || ''}
                          placeholder="+15551234567"
                        />
                      </div>
                      <label className="md:col-span-2 flex items-start gap-2 rounded-lg border bg-background/80 p-3 text-sm">
                        <input className="mt-1" type="checkbox" name="confirmCriticalFieldClears" value="true" />
                        <span>I understand this may clear live Twilio mappings or owner alert routing and should only be used for internal corrections.</span>
                      </label>
                      <div className="md:col-span-2 flex flex-wrap gap-3">
                        <Button type="submit">Save Internal Mapping</Button>
                        <p className="text-xs text-muted-foreground">
                          Manual mapping changes clear the last webhook-sync timestamp so the next refresh can verify the updated number assignment.
                        </p>
                      </div>
                    </form>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="submit">Save Business Settings</Button>
          <Link className={buttonVariants({ variant: 'outline' })} href="/app/leads">
            Open Recovered Leads
          </Link>
        </div>
      </form>
    </div>
  );
}
