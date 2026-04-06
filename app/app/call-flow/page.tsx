import Link from 'next/link';

import { SetupChecklist } from '@/components/setup-checklist';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import { getLiveSmokeReadiness } from '@/lib/live-smoke-readiness';
import { formatPhoneForDisplay } from '@/lib/phone';
import { isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { isSmsRecipientOptedOut } from '@/lib/twilio-sms-compliance';
import { describeUsageLimit, getConversationUsageForBusiness, isConversationLimitReached } from '@/lib/usage';

export default async function CallFlowPage() {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const billingAccess = getBusinessBillingAccessState(business);
  const ownerNotifyPhoneOptedOut =
    demoMode || !business.notifyPhone
      ? false
      : await isSmsRecipientOptedOut({ businessId: business.id, phone: business.notifyPhone });
  const usage = demoMode || !billingAccess.billingActive ? null : await getConversationUsageForBusiness(business);
  const conversationLimitReached = usage ? isConversationLimitReached(usage) : undefined;
  const successfulLeadCount = demoMode
    ? 1
    : await db.lead.count({ where: { businessId: business.id, ownerNotifiedAt: { not: null } } });

  const readiness = getLiveSmokeReadiness({
    demoModeEnabled: demoMode,
    hasForwardingNumber: Boolean(business.forwardingNumber),
    hasNotifyPhone: Boolean(business.notifyPhone),
    ownerNotifyPhoneOptedOut,
    hasActiveSubscription: billingAccess.billingActive,
    conversationLimitReached,
    usageSummary: usage ? describeUsageLimit(usage) : undefined,
    hasTwilioNumber: Boolean(business.twilioPhoneNumber),
    hasTwilioNumberSid: Boolean(business.twilioPhoneNumberSid),
    hasWebhookConfig: Boolean(business.twilioPhoneNumber),
    hasWebhookSync: Boolean(business.twilioWebhookSyncedAt),
    hasTwilioAccountAccess: true,
    canVerifyAssignedTwilioNumber: Boolean(business.twilioPhoneNumberSid),
    hasAssignedTwilioNumberInAccount: Boolean(business.twilioPhoneNumber),
  });

  const setupItems = [
    {
      key: 'routing',
      label: 'Phone routing ready',
      detail: business.forwardingNumber
        ? `Forwarding to ${formatPhoneForDisplay(business.forwardingNumber)}`
        : 'Add the forwarding number your team answers.',
      complete: Boolean(business.forwardingNumber),
    },
    {
      key: 'twilio',
      label: 'Twilio line connected',
      detail: business.twilioPhoneNumber
        ? `Inbound line ${formatPhoneForDisplay(business.twilioPhoneNumber)} is assigned.`
        : 'Assign or buy the inbound number that callers will reach.',
      complete: Boolean(business.twilioPhoneNumber),
    },
    {
      key: 'owner-alert',
      label: 'Owner notifications ready',
      detail: business.notifyPhone ? 'Owner notify phone is present for handoff texts.' : 'Add the owner mobile number for lead alerts.',
      complete: Boolean(business.notifyPhone) && !ownerNotifyPhoneOptedOut,
    },
    {
      key: 'billing',
      label: 'Billing active',
      detail: billingAccess.billingActive ? 'Automation can text back on live missed calls.' : 'Activate billing before live SMS follow-up resumes.',
      complete: billingAccess.billingActive,
    },
    {
      key: 'test',
      label: 'Successful test lead',
      detail: successfulLeadCount > 0 ? `${successfulLeadCount} lead${successfulLeadCount === 1 ? '' : 's'} reached owner-alert stage.` : 'Run a missed-call test and verify the owner alert.',
      complete: successfulLeadCount > 0,
    },
  ];

  const flowSteps = [
    {
      title: 'Inbound call hits your CallbackCloser number',
      detail: business.twilioPhoneNumber
        ? `Calls arrive on ${formatPhoneForDisplay(business.twilioPhoneNumber)} before routing to the business line.`
        : 'Assign a Twilio number so CallbackCloser can catch the missed call.',
    },
    {
      title: 'CallbackCloser detects the missed call',
      detail: `Current missed-call timeout is ${business.missedCallSeconds} seconds before follow-up logic starts.`,
    },
    {
      title: 'SMS qualification collects the details',
      detail: 'The current flow asks for service type, urgency, ZIP, callback timing, and optional name.',
    },
    {
      title: 'Owner receives the handoff',
      detail: business.notifyPhone
        ? `Qualified lead summaries are routed to ${formatPhoneForDisplay(business.notifyPhone)}.`
        : 'Add an owner mobile number so the summary can be delivered.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="outline">Call Flow</Badge>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Call flow and activation</h1>
          <p className="text-sm text-muted-foreground">
            See how the missed-call route works, what is live already, and what still blocks a confident first test.
          </p>
        </div>
      </div>

      <SetupChecklist
        title="Activation checklist"
        description="The fastest path to value is still: connect routing, confirm SMS, verify owner alerts, then run the test call."
        items={setupItems}
      />

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Current call flow</CardTitle>
            <CardDescription>Operational steps from missed call to owner handoff.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {flowSteps.map((step, index) => (
              <div key={step.title} className="rounded-xl border bg-background/80 p-4">
                <p className="font-medium">
                  {index + 1}. {step.title}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Next activation move</CardTitle>
            <CardDescription>Keep the first successful missed-call test moving.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {readiness.ready ? (
              <div className="rounded-xl border border-accent/40 bg-accent/20 p-4">
                Routing, notifications, and billing look ready. Run the missed-call test and confirm the owner alert lands.
              </div>
            ) : (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
                <p className="font-medium">Current blockers</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {readiness.blockers.map((blocker) => (
                    <li key={blocker.key}>
                      {blocker.label}: {blocker.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-3">
              <Link className={buttonVariants()} href="/app/settings">
                Open Business Settings
              </Link>
              <Link className={buttonVariants({ variant: 'outline' })} href="/app/leads">
                Open Recovered Leads
              </Link>
              <Link className={buttonVariants({ variant: 'outline' })} href="/app/billing">
                Open Billing
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
