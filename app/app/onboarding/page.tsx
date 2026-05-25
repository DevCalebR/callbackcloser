import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import {
  BusinessPhoneSetupPath,
  BusinessProvisioningStatus,
  ForwardedCallAnswerMode,
  ForwardingVerificationStatus,
  ManagedTwilioStatus,
  MessagingSetupMode,
  MessagingComplianceType,
  PortingStatus,
  TollFreeVerificationStatus,
  TwilioAccountMode,
} from '@prisma/client';

import { saveOnboardingAction } from '@/app/app/onboarding/actions';
import { TwilioSetupChecklist } from '@/components/twilio-setup-checklist';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/db';
import { buildTwilioSetupFlow, businessPhonePathOptions, twilioAccountModeOptions } from '@/lib/twilio-setup';

const DEFAULT_POST_ONBOARDING_REDIRECT = '/app/settings';

function resolveSafeNextPath(value: string | undefined) {
  const nextPath = value?.trim();
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return DEFAULT_POST_ONBOARDING_REDIRECT;
  }

  if (nextPath === '/app') return DEFAULT_POST_ONBOARDING_REDIRECT;
  if (!nextPath.startsWith('/app/')) return DEFAULT_POST_ONBOARDING_REDIRECT;
  return nextPath;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const existing = await db.business.findUnique({ where: { ownerClerkId: userId } });
  if (existing) redirect('/app/leads');
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined;
  const nextPath = resolveSafeNextPath(typeof searchParams?.next === 'string' ? searchParams.next : undefined);

  const setupPreviewFlow = buildTwilioSetupFlow({
    business: {
      name: 'New business workspace',
      publicBusinessPhone: null,
      notifyPhone: null,
      forwardingNumber: '',
      provisioningStatus: BusinessProvisioningStatus.DRAFT,
      twilioAccountMode: TwilioAccountMode.BUSINESS_SUBACCOUNT,
      phoneSetupPath: BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING,
      forwardedCallAnswerMode: ForwardedCallAnswerMode.PRESS_1_REQUIRED,
      messagingSetupMode: MessagingSetupMode.PER_BUSINESS_TWILIO,
      twilioNumberSetupMode: 'NEW_NUMBER',
      twilioSubaccountSid: null,
      twilioMessagingServiceSid: null,
      twilioPrimaryNumberSid: null,
      twilioPhoneNumberSid: null,
      twilioPrimaryPhoneNumber: null,
      twilioPhoneNumber: null,
      twilioWebhookSyncedAt: null,
      forwardingVerificationStatus: ForwardingVerificationStatus.NOT_STARTED,
      forwardingVerifiedAt: null,
      forwardingVerificationNote: null,
      portingStatus: PortingStatus.NOT_STARTED,
      portingNotes: null,
      portingCompletedAt: null,
      messagingComplianceType: MessagingComplianceType.UNKNOWN,
      managedTwilioStatus: ManagedTwilioStatus.DRAFT,
      a2pCustomerProfileSid: null,
      a2pBrandSid: null,
      a2pCampaignSid: null,
      a2pFailureReason: null,
      a2pApprovedAt: null,
      tollFreeVerificationStatus: TollFreeVerificationStatus.NOT_STARTED,
      tollFreeVerificationSid: null,
      tollFreeVerificationNote: null,
    },
    notificationSettings: null,
    ownerConnected: true,
    successfulLeadCount: 0,
    testSmsState: 'not_started',
    webhookSnapshot: null,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Badge variant="outline">Activation</Badge>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Create your business workspace</h1>
          <p className="text-sm text-muted-foreground">
            Start with the business details and number-connection path here. After you save, CallbackCloser opens the same shared setup flow used later for ongoing business control, without auto-provisioning ahead of your chosen account mode.
          </p>
        </div>
      </div>

      <TwilioSetupChecklist
        title="CallbackCloser Twilio launch flow"
        description="The new-business setup starts the exact same step-by-step rollout you will keep using later in the business control panel."
        banner={{
          title: 'Create the business workspace first',
          detail:
            'Save the business basics below. Then the shared setup flow opens with your account mode and business-number path already selected near the top.',
          tone: 'pending',
          stepKey: 'account_mode',
        }}
        bannerAction={
          <a className={buttonVariants({ size: 'sm' })} href="#onboarding-business-form">
            Start setup
          </a>
        }
        steps={setupPreviewFlow.steps}
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle>What happens after this form</CardTitle>
          <CardDescription>Reduce onboarding drag by carrying your number-connection choices directly into the guided control panel.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4">1. The shared setup flow opens with your chosen account mode and business-number path already saved for this business.</div>
          <div className="rounded-xl border bg-background/80 p-4">2. Nothing gets auto-provisioned before you can review Messaging Service, number assignment, webhooks, and honest A2P status in plain English.</div>
          <div className="rounded-xl border bg-background/80 p-4">3. You send the test SMS, run the missed-call validation, and only mark live after the checklist is actually clear.</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business profile and defaults</CardTitle>
          <CardDescription>Set the core business details so we can get your missed-call coverage live fast.</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <form action={saveOnboardingAction} className="grid gap-4 sm:grid-cols-2" id="onboarding-business-form">
            <input type="hidden" name="next" value={nextPath} />
            <input type="hidden" name="forwardedCallAnswerMode" value={ForwardedCallAnswerMode.PRESS_1_REQUIRED} />
            <input type="hidden" name="messagingSetupMode" value={MessagingSetupMode.PER_BUSINESS_TWILIO} />
            <div className="sm:col-span-2 space-y-3 rounded-xl border bg-background/80 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Twilio account mode</p>
                <p className="text-sm text-muted-foreground">Choose the account context before CallbackCloser provisions anything for this business.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {twilioAccountModeOptions.map((option) => (
                  <label key={option.value} className="rounded-xl border bg-card/80 p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <input
                        defaultChecked={option.value === TwilioAccountMode.BUSINESS_SUBACCOUNT}
                        name="twilioAccountMode"
                        type="radio"
                        value={option.value}
                      />
                      <div className="space-y-1">
                        <p className="font-medium">{option.label}</p>
                        <p className="text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 space-y-3 rounded-xl border bg-background/80 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Connect your business number</p>
                <p className="text-sm text-muted-foreground">Choose whether you want to keep your current public number, port it later, or start with a new CallbackCloser number.</p>
              </div>
              <div className="grid gap-3">
                {businessPhonePathOptions.map((option) => (
                  <label key={option.value} className="rounded-xl border bg-card/80 p-4 text-sm">
                    <div className="flex items-start gap-3">
                      <input
                        defaultChecked={option.value === BusinessPhoneSetupPath.CURRENT_NUMBER_FORWARDING}
                        name="phoneSetupPath"
                        type="radio"
                        value={option.value}
                      />
                      <div className="space-y-1">
                        <p className="font-medium">{option.label}</p>
                        <p className="text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Porting is tracked manually for now. CallbackCloser still preserves the managed new-number path when that is the right fit.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="name">Business name</Label>
              <Input id="name" name="name" required placeholder="Acme Plumbing" />
            </div>
            <div>
              <Label htmlFor="publicBusinessPhone">Public business number</Label>
              <Input id="publicBusinessPhone" name="publicBusinessPhone" placeholder="+15551234567" />
              <p className="mt-1 text-xs text-muted-foreground">For current-number forwarding or porting, this is the number customers already call.</p>
            </div>
            <div>
              <Label htmlFor="forwardingNumber">Owner forwarding / answer number</Label>
              <Input id="forwardingNumber" name="forwardingNumber" required placeholder="+15559876543" />
              <p className="mt-1 text-xs text-muted-foreground">When CallbackCloser rings a live call through, this is the phone that should answer.</p>
            </div>
            <div>
              <Label htmlFor="notifyPhone">Owner notify phone</Label>
              <Input id="notifyPhone" name="notifyPhone" placeholder="+15557654321" />
              <p className="mt-1 text-xs text-muted-foreground">Recommended. Ready-to-close lead summaries are sent here.</p>
            </div>
            <div>
              <Label htmlFor="missedCallSeconds">Missed-call timeout (seconds)</Label>
              <Input id="missedCallSeconds" name="missedCallSeconds" type="number" min={5} max={90} defaultValue={20} required />
            </div>
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue="America/New_York" required />
            </div>
            <div>
              <Label htmlFor="serviceLabel1">Service option 1</Label>
              <Input id="serviceLabel1" name="serviceLabel1" defaultValue="Repair" required />
            </div>
            <div>
              <Label htmlFor="serviceLabel2">Service option 2</Label>
              <Input id="serviceLabel2" name="serviceLabel2" defaultValue="Install" required />
            </div>
            <div>
              <Label htmlFor="serviceLabel3">Service option 3</Label>
              <Input id="serviceLabel3" name="serviceLabel3" defaultValue="Maintenance" required />
            </div>
            <div className="sm:col-span-2 pt-2">
              <Button type="submit">Create Business and Continue Setup</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
