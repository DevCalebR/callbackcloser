import { requireBusiness } from '@/lib/auth';
import { formatPhoneForDisplay } from '@/lib/phone';
import { getPortfolioDemoTwilioNumbers, getPortfolioDemoWebhookConfig, isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getTwilioClient, getTwilioWebhookConfig } from '@/lib/twilio';
import { saveBusinessSettingsAction, buyTwilioNumberAction, connectExistingTwilioNumberAction, resyncTwilioWebhooksAction } from '@/app/app/settings/actions';
import { CopyValueButton } from '@/components/copy-value-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  let existingTwilioNumberError: string | undefined;
  let existingTwilioNumbers: Array<{ sid: string; phoneNumber: string; friendlyName: string | null }> = [];

  if (demoMode) {
    existingTwilioNumbers = getPortfolioDemoTwilioNumbers();
  } else {
    try {
      const client = getTwilioClient();
      const numbers = await client.incomingPhoneNumbers.list({ limit: 50 });
      existingTwilioNumbers = numbers.map((number) => ({
        sid: number.sid,
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName || null,
      }));
    } catch (twilioError) {
      existingTwilioNumberError = twilioError instanceof Error ? twilioError.message : 'Failed to load Twilio incoming phone numbers';
    }
  }

  const selectedExistingNumberSid = business.twilioPhoneNumberSid || existingTwilioNumbers[0]?.sid || '';
  const selectedExistingNumber = existingTwilioNumbers.find((number) => number.sid === selectedExistingNumberSid);
  const lastTwilioWebhookSync = business.twilioWebhookSyncedAt ? new Date(business.twilioWebhookSyncedAt).toLocaleString() : 'Never';

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
              </div>
              <div>
                <Label htmlFor="notifyPhone">Owner notify phone</Label>
                <Input id="notifyPhone" name="notifyPhone" defaultValue={business.notifyPhone ?? ''} />
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
            <CardDescription>Connect an existing number or buy a US local number, then keep webhooks synced to your current public URL.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Current number</p>
              <p className="text-muted-foreground">{business.twilioPhoneNumber ? formatPhoneForDisplay(business.twilioPhoneNumber) : 'None assigned'}</p>
              <p className="mt-1 text-xs text-muted-foreground">SID: {business.twilioPhoneNumberSid ?? 'None assigned'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Last webhook sync: {lastTwilioWebhookSync}</p>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Use Existing Twilio Number</p>
                <p className="text-xs text-muted-foreground">Select a number from your Twilio account and sync the webhooks to the current `NEXT_PUBLIC_APP_URL`.</p>
              </div>

              {existingTwilioNumberError ? <p className="text-xs text-destructive">{existingTwilioNumberError}</p> : null}
              {!existingTwilioNumberError && existingTwilioNumbers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No incoming Twilio numbers found on this account.</p>
              ) : null}

              <form action={connectExistingTwilioNumberAction} className="space-y-3">
                {existingTwilioNumbers.length > 1 ? (
                  <div>
                    <Label htmlFor="phoneNumberSid">Existing Twilio number</Label>
                    <select
                      id="phoneNumberSid"
                      name="phoneNumberSid"
                      className="flex h-10 w-full rounded-md border bg-card px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      defaultValue={selectedExistingNumberSid}
                    >
                      {existingTwilioNumbers.map((number) => (
                        <option key={number.sid} value={number.sid}>
                          {formatPhoneForDisplay(number.phoneNumber)} {number.friendlyName ? `(${number.friendlyName})` : ''} [{number.sid}]
                        </option>
                      ))}
                    </select>
                  </div>
                ) : selectedExistingNumberSid ? (
                  <input name="phoneNumberSid" type="hidden" value={selectedExistingNumberSid} />
                ) : null}

                <Button disabled={!twilioWebhookConfig || existingTwilioNumbers.length === 0} type="submit" variant="outline">
                  {existingTwilioNumbers.length === 0 ? 'No Existing Numbers Available' : 'Use Existing Number & Sync Webhooks'}
                </Button>
              </form>
            </div>

            <form action={buyTwilioNumberAction} className="space-y-3">
              <div>
                <Label htmlFor="areaCode">Preferred area code (optional)</Label>
                <Input id="areaCode" name="areaCode" inputMode="numeric" placeholder="512" maxLength={3} disabled={Boolean(business.twilioPhoneNumber)} />
              </div>
              <Button type="submit" disabled={Boolean(business.twilioPhoneNumber)}>
                {business.twilioPhoneNumber ? 'Twilio Number Already Assigned' : 'Buy Twilio Number'}
              </Button>
            </form>

            <form action={resyncTwilioWebhooksAction} className="space-y-2">
              <Button disabled={!business.twilioPhoneNumberSid || !twilioWebhookConfig} type="submit" variant="outline">
                Re-sync webhooks
              </Button>
              <p className="text-xs text-muted-foreground">Re-applies the current webhook URLs to the selected Twilio number using the current `NEXT_PUBLIC_APP_URL`.</p>
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

            <p className="text-xs text-muted-foreground">Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_AUTH_TOKEN`, and an `https://` `NEXT_PUBLIC_APP_URL`.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
