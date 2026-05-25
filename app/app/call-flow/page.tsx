import Link from 'next/link';

import {
  getBusinessPhoneSetupGate,
  getBusinessPhoneSetupPathLabel,
  getBusinessRoutingNumber,
  getPublicBusinessPhone,
} from '@/lib/business-phone-setup';
import { SetupChecklist } from '@/components/setup-checklist';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBusiness } from '@/lib/auth';
import { db } from '@/lib/db';
import { getManagedTextingNumber, getManagedTwilioStatusSummary } from '@/lib/managed-twilio';
import { formatPhoneForDisplay } from '@/lib/phone';
import { isPortfolioDemoMode } from '@/lib/portfolio-demo';
import { getBusinessBillingAccessState } from '@/lib/subscription';
import { getCustomerSystemStatus } from '@/lib/system-status';
import { isSmsRecipientOptedOut } from '@/lib/twilio-sms-compliance';

export default async function CallFlowPage() {
  const business = await requireBusiness();
  const demoMode = isPortfolioDemoMode();
  const billingAccess = getBusinessBillingAccessState(business);
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
  const managedTextingNumber = getManagedTextingNumber(business);
  const managedTwilioSummary = getManagedTwilioStatusSummary(business);
  const phoneSetupGate = getBusinessPhoneSetupGate(business);
  const publicBusinessPhone = getPublicBusinessPhone(business);
  const routingNumber = getBusinessRoutingNumber(business);
  const readiness = {
    ready:
      Boolean(business.forwardingNumber) &&
      phoneSetupGate.complete &&
      managedTwilioSummary.messagingReady &&
      Boolean(business.notifyPhone) &&
      !ownerNotifyPhoneOptedOut &&
      billingAccess.billingActive,
    blockers: [
      !managedTextingNumber ? { key: 'texting_line', label: 'Texting line', detail: 'CallbackCloser still needs to provision your business texting line.' } : null,
      !business.forwardingNumber ? { key: 'routing', label: 'Owner answer number', detail: 'Add the owner or staff number that should receive live forwarded calls.' } : null,
      !phoneSetupGate.complete ? { key: 'phone_path', label: getBusinessPhoneSetupPathLabel(business.phoneSetupPath), detail: phoneSetupGate.detail } : null,
      !managedTwilioSummary.onboardingReady
        ? { key: 'messaging', label: 'Messaging infrastructure', detail: managedTwilioSummary.nextStep }
        : null,
      !managedTwilioSummary.complianceReady
        ? {
            key: 'compliance',
            label:
              managedTwilioSummary.complianceType === 'TOLL_FREE_VERIFICATION'
                ? 'Toll-free verification'
                : managedTwilioSummary.complianceTypeUnknown
                  ? 'Number type'
                  : 'A2P approval',
            detail: managedTwilioSummary.description,
          }
        : null,
      !business.notifyPhone || ownerNotifyPhoneOptedOut
        ? {
            key: 'owner_alerts',
            label: 'Owner alerts',
            detail: !business.notifyPhone
              ? 'Add the owner mobile number so lead summaries reach the right phone.'
              : 'The owner alert number is opted out and needs to reply START before go-live.'
          }
        : null,
      !billingAccess.billingActive
        ? { key: 'billing', label: 'Billing', detail: 'Activate billing so auto-texting can stay live on missed calls.' }
        : null,
    ].filter(Boolean) as Array<{ key: string; label: string; detail: string }>,
  };

  const setupItems = [
    {
      key: 'routing',
      label: 'Owner answer number ready',
      detail: business.forwardingNumber
        ? `Live calls ring ${formatPhoneForDisplay(business.forwardingNumber)}`
        : 'Add the owner or staff number your team answers.',
      complete: Boolean(business.forwardingNumber),
    },
    {
      key: 'phone_path',
      label: getBusinessPhoneSetupPathLabel(business.phoneSetupPath),
      detail: phoneSetupGate.detail,
      complete: phoneSetupGate.complete,
    },
    {
      key: 'twilio',
      label: 'CallbackCloser routing number assigned',
      detail: managedTextingNumber
        ? `Your CallbackCloser routing number is ${formatPhoneForDisplay(managedTextingNumber)}.`
        : 'CallbackCloser still needs to provision or map your routing number.',
      complete: Boolean(managedTextingNumber),
    },
    {
      key: 'messaging',
      label: 'Messaging infrastructure ready',
      detail: managedTwilioSummary.onboardingReady
        ? 'Managed messaging, number assignment, and webhook sync are ready.'
        : managedTwilioSummary.nextStep,
      complete: managedTwilioSummary.onboardingReady,
    },
    {
      key: 'compliance',
      label: managedTwilioSummary.complianceReady
        ? managedTwilioSummary.complianceType === 'TOLL_FREE_VERIFICATION'
          ? 'Toll-free verification complete'
          : 'A2P approved'
        : managedTwilioSummary.complianceType === 'TOLL_FREE_VERIFICATION'
          ? 'Toll-free verification in progress'
          : managedTwilioSummary.complianceTypeUnknown
            ? 'Number type still needed'
            : 'A2P approval in progress',
      detail: managedTwilioSummary.description,
      complete: managedTwilioSummary.complianceReady,
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
  const allChecklistComplete = setupItems.every((item) => item.complete);
  const systemStatus = getCustomerSystemStatus(business, successfulLeadCount);

  const flowSteps = [
      {
        title: 'A caller reaches your connected business number',
        detail:
          business.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING'
            ? publicBusinessPhone && routingNumber
              ? `Customers call ${formatPhoneForDisplay(publicBusinessPhone)}, which forwards into ${formatPhoneForDisplay(routingNumber)} so CallbackCloser can catch the missed-call moment.`
              : phoneSetupGate.detail
            : managedTextingNumber
              ? `Calls hit ${formatPhoneForDisplay(managedTextingNumber)} so CallbackCloser can catch the missed-call moment.`
              : 'CallbackCloser still needs to provision or map the routing number that will cover missed calls.',
    },
    {
      title: 'CallbackCloser sees the missed call',
      detail: `Current missed-call timeout is ${business.missedCallSeconds} seconds before the recovery flow starts.`,
    },
      {
        title: 'The caller gets a text right away',
        detail: managedTwilioSummary.complianceReady
          ? 'The conversation collects the service type, urgency, ZIP, callback timing, and optional name without extra admin work.'
          : managedTwilioSummary.complianceType === 'TOLL_FREE_VERIFICATION'
            ? 'The automated SMS handoff stays pending until the managed Twilio setup and toll-free verification are complete.'
            : managedTwilioSummary.complianceTypeUnknown
              ? 'The automated SMS handoff stays pending until the number type is selected and messaging compliance is recorded.'
              : 'The automated SMS handoff stays pending until the managed Twilio setup and A2P approval are complete.',
      },
    {
      title: 'You get the handoff ready to call',
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
            This is exactly what happens when a missed call occurs, what is already live, and what still needs attention before a confident first test.
          </p>
        </div>
      </div>

      {allChecklistComplete ? (
        <Card className="border-accent/40 bg-accent/20">
          <CardHeader>
            <CardTitle>🎉 Your system is live — run a test call now</CardTitle>
            <CardDescription>
              Messaging, compliance, and test-lead handoff are all complete. One more test call is the fastest way to confirm everything still feels right.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {managedTextingNumber ? (
              <Link className={buttonVariants()} href={`tel:${managedTextingNumber}`}>
                Run test call
              </Link>
            ) : null}
            <Link className={buttonVariants({ variant: 'outline' })} href="/app/leads">
              Open Recovered Leads
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <SetupChecklist
        title="Activation checklist"
        description="The fastest path to value is still: get the texting line live, confirm routing, verify owner alerts, then run the missed-call test."
        items={setupItems}
      />

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Current call flow</CardTitle>
            <CardDescription>Business-facing steps from missed call to owner handoff.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {flowSteps.map((step, index) => (
              <div key={step.title} className="rounded-xl border bg-background/80 p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{step.title}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader>
            <CardTitle>Next activation move</CardTitle>
            <CardDescription>{systemStatus.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {readiness.ready ? (
              <div className="rounded-xl border border-accent/40 bg-accent/20 p-4">
                Routing, notifications, billing, managed setup, and messaging compliance look ready. Run the missed-call test and confirm the owner alert lands.
              </div>
            ) : (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
                <p className="font-medium">Action needed before go-live</p>
                <p className="mt-1 text-sm text-destructive/80">
                  {readiness.blockers.length} blocker{readiness.blockers.length === 1 ? '' : 's'} still need attention before the system is operationally ready for live customer messaging.
                </p>
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
