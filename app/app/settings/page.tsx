import Link from 'next/link';

import { CopyValueButton } from '@/components/copy-value-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requireBusiness } from '@/lib/auth';
import { getLiveSmokeReadiness } from '@/lib/live-smoke-readiness';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoWebhookConfig, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getTwilioBusinessClient } from '@/lib/twilio-client';
import { isSmsRecipientOptedOut } from '@/lib/twilio-sms-compliance';
import { getTwilioWebhookConfig } from '@/lib/twilio';
import { describeUsageLimit, getConversationUsageForBusiness, isConversationLimitReached } from '@/lib/usage';

import { buyTwilioNumberAction, resyncTwilioWebhooksAction, saveBusinessSettingsAction } from './actions';

export default async function SettingsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const saved = searchParams?.saved === '1';
  const numberBought = searchParams?.numberBought === '1';
  const twilioConnected = searchParams?.twilioConnected === '1';
  const twilioSynced = searchParams?.twilioSynced === '1';

  let twilioWebhookConfigError: string | undefined;
  let twilioWebhookConfig:
    | {
        appBaseUrl: string;
        voiceUrl: string;
        smsUrl: string;
        statusUrl: string;
      }
    | undefined;

  if (demoMode) {
    twilioWebhookConfig = getPortfolioDemoWebhookConfig();
  } else {
    try {
      twilioWebhookConfig = getTwilioWebhookConfig();
    } catch (twilioError) {
      twilioWebhookConfigError = twilioError instanceof Error ? twilioError.message : 'Failed to compute Twilio webhook URLs';
    }
  }

  let assignedTwilioNumberError: string | undefined;
  let assignedTwilioNumber:
    | {
        sid: string;
        phoneNumber: string;
        friendlyName: string | null;
      }
    | undefined;

  if (demoMode) {
    if (business.twilioPhoneNumberSid && business.twilioPhoneNumber) {
      assignedTwilioNumber = {
        sid: business.twilioPhoneNumberSid,
        phoneNumber: business.twilioPhoneNumber,
        friendlyName: `${business.name} demo number`,
      };
    }
  } else if (business.twilioPhoneNumberSid) {
    try {
      const client = getTwilioBusinessClient(business.twilioSubaccountSid);
      const number = await client.incomingPhoneNumbers(business.twilioPhoneNumberSid).fetch();
      assignedTwilioNumber = {
        sid: number.sid,
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName || null,
      };
    } catch (twilioError) {
      assignedTwilioNumberError = twilioError instanceof Error ? twilioError.message : 'Failed to load the assigned Twilio number';
    }
  }

  const assignedTwilioNumberVerified = Boolean(assignedTwilioNumber);
  const lastTwilioWebhookSync = business.twilioWebhookSyncedAt ? new Date(business.twilioWebhookSyncedAt).toLocaleString() : 'Never';
  const billingAccess = getBusinessBillingAccessState(business);
  const subscriptionReady = billingAccess.billingActive;
  const ownerNotifyPhoneOptedOut =
    demoMode || !business.notifyPhone
      ? false
      : await isSmsRecipientOptedOut({ businessId: business.id, phone: business.notifyPhone });
  const usage = demoMode || !subscriptionReady ? null : await getConversationUsageForBusiness(business);
  const conversationLimitReached = usage ? isConversationLimitReached(usage) : undefined;
  const liveSmokeReadiness = getLiveSmokeReadiness({
    demoModeEnabled: demoMode,
    hasForwardingNumber: Boolean(business.forwardingNumber),
    hasNotifyPhone: Boolean(business.notifyPhone),
    ownerNotifyPhoneOptedOut,
    hasActiveSubscription: subscriptionReady,
    conversationLimitReached,
    usageSummary: usage ? describeUsageLimit(usage) : undefined,
    hasTwilioNumber: Boolean(business.twilioPhoneNumber),
    hasTwilioNumberSid: Boolean(business.twilioPhoneNumberSid),
    hasWebhookConfig: Boolean(twilioWebhookConfig),
    hasWebhookSync: Boolean(business.twilioWebhookSyncedAt),
    hasTwilioAccountAccess: !assignedTwilioNumberError,
    canVerifyAssignedTwilioNumber: Boolean(business.twilioPhoneNumberSid) && !assignedTwilioNumberError,
    hasAssignedTwilioNumberInAccount: assignedTwilioNumberVerified,
    webhookAppBaseUrl: twilioWebhookConfig?.appBaseUrl,
    webhookConfigError: twilioWebhookConfigError,
    twilioAccountLookupError: assignedTwilioNumberError,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business Settings</h1>
        <p className="text-sm text-muted-foreground">Configure call forwarding, owner notifications, and qualification prompts.</p>
      </div>

      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Settings saved.</div> : null}
      {numberBought ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Twilio number purchased and connected.</div> : null}
      {twilioConnected ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Existing Twilio number connected and webhooks synced.</div> : null}
      {twilioSynced ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Twilio webhooks re-synced.</div> : null}
      {billingAccess.founderBillingBypassActive ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950">
          Founder-only billing bypass is active for this founder-owned business. Live smoke testing can proceed without a paid subscription
          while this override is enabled. Turn it off after testing so Stripe billing gates apply normally again.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Live smoke test readiness</CardTitle>
              <CardDescription>These blockers should be clear before you place a real missed-call test.</CardDescription>
            </div>
            <Badge variant={liveSmokeReadiness.ready ? 'success' : 'outline'}>
              {liveSmokeReadiness.ready
                ? 'ready_for_live_smoke'
                : `${liveSmokeReadiness.blockers.length}_blocker${liveSmokeReadiness.blockers.length === 1 ? '' : 's'}`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {liveSmokeReadiness.ready ? (
            <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
              Live smoke prerequisites look ready. Place the missed call, do not answer the forwarded ring, then watch the Leads dashboard and the owner phone.
            </div>
          ) : (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p className="font-medium">Fix these blockers before the live smoke test:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {liveSmokeReadiness.blockers.map((blocker) => (
                  <li key={blocker.key}>
                    {blocker.label}: {blocker.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {liveSmokeReadiness.checks.map((check) => (
              <div key={check.key} className="rounded-lg border bg-muted/20 p-4 text-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-medium">{check.label}</p>
                  <Badge variant={check.ready ? 'success' : 'outline'}>{check.ready ? 'ready' : 'blocked'}</Badge>
                </div>
                <p className="text-muted-foreground">{check.detail}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-lg border bg-card p-4 text-sm">
              <p className="font-medium">Manual live smoke steps</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Use a caller phone that has not opted out before. If it has, send START first and wait for the opt-in confirmation.</li>
                <li>Use the assigned Twilio number as the called number and let the forwarded call go unanswered.</li>
                <li>Open the Leads dashboard and confirm a new lead appears.</li>
                <li>Reply from the caller phone to the automated SMS and progress through service, urgency, ZIP, and best time.</li>
                <li>After the ZIP reply, confirm the owner notify phone receives the summary text.</li>
                <li>Open the lead detail page and confirm the transcript reflects the live conversation.</li>
              </ol>
            </div>

            <div className="rounded-lg border bg-card p-4 text-sm">
              <p className="font-medium">If the smoke test fails</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Check Vercel logs for `twilio.voice`, `twilio.status`, `twilio.sms`, `twilio.messaging`, and `app.error`.</li>
                <li>Check Twilio Console request logs for webhook `401`, `429`, or delivery errors.</li>
                <li>If the lead appears with `billing_required`, billing is still gating SMS follow-up.</li>
                <li>If no initial SMS arrives, confirm the caller phone has not previously sent STOP and that monthly usage is still below the plan limit.</li>
                <li>If the owner does not get a summary text, confirm the owner notify phone and progress the SMS flow through ZIP code.</li>
              </ul>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link className="underline underline-offset-4" href="/app/leads">
                  Open Leads dashboard
                </Link>
                <Link className="underline underline-offset-4" href="/app/billing">
                  Open Billing
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>These values drive call forwarding and the SMS script.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveBusinessSettingsAction} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Business name</Label>
                <Input id="name" name="name" defaultValue={business.name} required />
              </div>
              <div>
                <Label htmlFor="forwardingNumber">Forwarding number</Label>
                <Input id="forwardingNumber" name="forwardingNumber" defaultValue={business.forwardingNumber} required />
                <p className="mt-1 text-xs text-muted-foreground">This is the real business line that should ring during the live call test.</p>
              </div>
              <div>
                <Label htmlFor="notifyPhone">Owner notify phone</Label>
                <Input id="notifyPhone" name="notifyPhone" defaultValue={business.notifyPhone ?? ''} />
                <p className="mt-1 text-xs text-muted-foreground">The owner summary SMS is sent here after the lead shares their ZIP code.</p>
              </div>
              <div>
                <Label htmlFor="missedCallSeconds">Missed-call timeout (sec)</Label>
                <Input id="missedCallSeconds" name="missedCallSeconds" type="number" min={5} max={90} defaultValue={business.missedCallSeconds} required />
              </div>
              <div>
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" name="timezone" defaultValue={business.timezone} required />
              </div>
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
              <div className="sm:col-span-2 pt-2">
                <Button type="submit">Save Settings</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Twilio Number</CardTitle>
            <CardDescription>Buy a pilot number here or have CallbackCloser attach your existing number without exposing shared account inventory.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Current number</p>
              <p className="text-muted-foreground">{business.twilioPhoneNumber ? formatPhoneForDisplay(business.twilioPhoneNumber) : 'None assigned'}</p>
              <p className="mt-1 text-xs text-muted-foreground">SID: {business.twilioPhoneNumberSid ?? 'None assigned'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Last webhook sync: {lastTwilioWebhookSync}</p>
              {assignedTwilioNumberVerified ? (
                <p className="mt-1 text-xs text-muted-foreground">Account match: verified assigned number in the current Twilio account.</p>
              ) : null}
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Existing Twilio numbers are founder-managed during pilots</p>
                <p className="text-xs text-muted-foreground">
                  To keep customer workspaces isolated, CallbackCloser does not expose Twilio account inventory in self-serve settings. If you
                  already own a Twilio number, email{' '}
                  <a className="underline underline-offset-4" href="mailto:support@callbackcloser.com">
                    support@callbackcloser.com
                  </a>{' '}
                  with your business name and number and we will attach it for you.
                </p>
              </div>
              {assignedTwilioNumberError ? <p className="text-xs text-destructive">{assignedTwilioNumberError}</p> : null}
              {assignedTwilioNumber ? (
                <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  Verified assigned number: {formatPhoneForDisplay(assignedTwilioNumber.phoneNumber)} [{assignedTwilioNumber.sid}]
                </div>
              ) : null}
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
                  disabled={Boolean(business.twilioPhoneNumber)}
                />
              </div>
              <Button type="submit" disabled={Boolean(business.twilioPhoneNumber)}>
                {business.twilioPhoneNumber ? 'Twilio Number Already Assigned' : 'Buy Twilio Number'}
              </Button>
              {!business.twilioPhoneNumber ? (
                <p className="text-xs text-muted-foreground">
                  Buying a number is the safest self-serve path for pilot accounts because it does not reveal the rest of the shared Twilio account.
                </p>
              ) : null}
            </form>

            <form action={resyncTwilioWebhooksAction} className="space-y-2">
              <Button disabled={!business.twilioPhoneNumberSid || !twilioWebhookConfig} type="submit" variant="outline">
                Re-sync webhooks
              </Button>
              <p className="text-xs text-muted-foreground">
                Re-applies the current webhook URLs to the selected Twilio number using the current `NEXT_PUBLIC_APP_URL`.
              </p>
            </form>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Webhook URLs</p>
              {twilioWebhookConfigError ? <p className="text-xs text-destructive">{twilioWebhookConfigError}</p> : null}
              {twilioWebhookConfig ? (
                <div className="space-y-2">
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">Voice (POST)</p>
                      <CopyValueButton value={twilioWebhookConfig.voiceUrl} />
                    </div>
                    <code className="block break-all text-xs">{twilioWebhookConfig.voiceUrl}</code>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">Messaging (POST)</p>
                      <CopyValueButton value={twilioWebhookConfig.smsUrl} />
                    </div>
                    <code className="block break-all text-xs">{twilioWebhookConfig.smsUrl}</code>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">Status (POST)</p>
                      <CopyValueButton value={twilioWebhookConfig.statusUrl} />
                    </div>
                    <code className="block break-all text-xs">{twilioWebhookConfig.statusUrl}</code>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Local test checklist</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Start Next.js (`npm run dev`) and ensure it is on port 3000.</li>
                <li>Run `ngrok` and update `NEXT_PUBLIC_APP_URL` to the current `https://` URL.</li>
                <li>Click `Re-sync webhooks` on this page.</li>
                <li>Send an SMS or call to the Twilio number.</li>
                <li>Confirm local logs show `POST /api/twilio/sms` and `POST /api/twilio/voice` with `200` responses.</li>
              </ol>
            </div>

            <p className="text-xs text-muted-foreground">
              Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_AUTH_TOKEN`, and an `https://` `NEXT_PUBLIC_APP_URL`.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
