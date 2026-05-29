import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  archiveBusinessAction,
  confirmForwardingVerificationAction,
  confirmMissedCallValidationAction,
  connectExistingBusinessOwnerAction,
  createBusinessMessagingServiceAction,
  createBusinessTwilioSubaccountAction,
  deleteTestBusinessAction,
  inviteBusinessOwnerAction,
  markBusinessLiveAction,
  provisionBusinessAction,
  resyncBusinessWebhooksAction,
  restoreBusinessAction,
  saveAdminSetupBasicsAction,
  saveAdminTwilioSetupAction,
  sendBusinessTestSmsAction,
  setBusinessProvisioningStatusAction,
} from '@/app/admin/actions';
import { AdminBusinessActivityTimeline } from '@/components/admin-business-activity-timeline';
import { AdminBusinessSetupStepCard } from '@/components/admin-business-setup-step-card';
import { MessagingComplianceFields } from '@/components/messaging-compliance-fields';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { buildAdminCustomerOpenHref } from '@/lib/admin-customer-paths';
import { buildAdminOnboardingConfidence, canDeleteTestBusiness, getDeleteTestBusinessBlockedReason, isBusinessArchived } from '@/lib/admin-dashboard';
import { customerSetupStatusLabels, shouldShowCustomerSetupWaitingPage } from '@/lib/customer-setup';
import { buildAdminMissedCallValidationTruth, buildAdminOperationalProofs } from '@/lib/admin-operator-proof';
import { buildAdminNextStepGuide, buildAdminSetupPanels } from '@/lib/admin-setup-remediation';
import {
  buildAdminBusinessIssue,
  buildAdminTestSmsTruth,
  getOperatorToneBadgeVariant,
} from '@/lib/admin-operator-visibility';
import { getAdminOwnerState, getTwilioWebhookSnapshot, listAdminTwilioNumbers } from '@/lib/admin-provisioning';
import { requireAdmin } from '@/lib/admin';
import { getBusinessPhoneSetupPathLabel } from '@/lib/business-phone-setup';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/lead-presenters';
import {
  getManagedTextingNumber,
  managedTwilioStatusLabels,
  messagingComplianceTypeLabels,
  tollFreeVerificationStatusLabels,
} from '@/lib/managed-twilio-status';
import {
  businessTimelineFilterOptions,
  countTimelineFilters,
  listBusinessOperatorEvents,
  matchesTimelineFilter,
  type BusinessTimelineFilter,
} from '@/lib/operator-events';
import { formatPhoneForDisplay } from '@/lib/phone';
import {
  type TwilioSetupStep,
  type TwilioSetupStepKey,
  type TwilioSetupTone,
  businessPhonePathOptions,
  buildTwilioSetupFlow,
  forwardedCallAnswerOptions,
  messagingSetupOptions,
  twilioAccountModeOptions,
} from '@/lib/twilio-setup';

type AdminTwilioDefaults = {
  businessId: string;
  twilioAccountMode: string;
  phoneSetupPath: string;
  forwardedCallAnswerMode: string;
  messagingSetupMode: string;
  twilioNumberSetupMode: string;
  twilioSubaccountSid: string;
  twilioPhoneNumber: string;
  twilioPhoneNumberSid: string;
  twilioMessagingServiceSid: string;
  forwardingVerificationStatus: string;
  forwardingVerificationNote: string;
  portingStatus: string;
  portingNotes: string;
  messagingComplianceType: string;
  a2pCustomerProfileSid: string;
  a2pBrandSid: string;
  a2pCampaignSid: string;
  a2pFailureReason: string;
  tollFreeVerificationStatus: string;
  tollFreeVerificationSid: string;
  tollFreeVerificationNote: string;
  managedTwilioStatus: string;
};

function getQueryValue(searchParams: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = searchParams?.[key];
  return typeof value === 'string' ? value : null;
}

function getTimelineFilter(searchParams: Record<string, string | string[] | undefined> | undefined): BusinessTimelineFilter {
  const value = getQueryValue(searchParams, 'timeline');
  if (value && businessTimelineFilterOptions.some((option) => option.key === value)) {
    return value as BusinessTimelineFilter;
  }
  return 'all';
}

function getActivityExpanded(searchParams: Record<string, string | string[] | undefined> | undefined) {
  return getQueryValue(searchParams, 'activity') === 'all';
}

function buildTimelineFilterPath(
  businessId: string,
  filter: BusinessTimelineFilter,
  step: TwilioSetupStepKey | null,
  activityExpanded: boolean
) {
  const search = new URLSearchParams();
  if (filter !== 'all') search.set('timeline', filter);
  if (step) search.set('step', step);
  if (activityExpanded) search.set('activity', 'all');
  const query = search.toString();
  return query ? `/admin/${businessId}?${query}` : `/admin/${businessId}`;
}

function buildStepPath(
  businessId: string,
  step: TwilioSetupStepKey,
  timelineFilter: BusinessTimelineFilter,
  activityExpanded: boolean
) {
  const search = new URLSearchParams();
  if (timelineFilter !== 'all') {
    search.set('timeline', timelineFilter);
  }
  search.set('step', step);
  if (activityExpanded) {
    search.set('activity', 'all');
  }
  return `/admin/${businessId}?${search.toString()}#step-${step}`;
}

function buildActivityPath(
  businessId: string,
  timelineFilter: BusinessTimelineFilter,
  step: TwilioSetupStepKey | null,
  expanded: boolean
) {
  const search = new URLSearchParams();
  if (timelineFilter !== 'all') {
    search.set('timeline', timelineFilter);
  }
  if (step) {
    search.set('step', step);
  }
  if (expanded) {
    search.set('activity', 'all');
  }

  const query = search.toString();
  return query ? `/admin/${businessId}?${query}#recent-activity` : `/admin/${businessId}#recent-activity`;
}

function HiddenAdminTwilioFields({
  defaults,
  returnStep,
  exclude = [],
}: {
  defaults: AdminTwilioDefaults;
  returnStep?: TwilioSetupStepKey | null;
  exclude?: Array<keyof AdminTwilioDefaults>;
}) {
  return (
    <>
      {Object.entries(defaults).map(([name, value]) => {
        if (exclude.includes(name as keyof AdminTwilioDefaults)) return null;
        return <input key={name} name={name} type="hidden" value={value} />;
      })}
      {returnStep ? <input name="returnStep" type="hidden" value={returnStep} /> : null}
    </>
  );
}

function getBadgeVariant(tone: TwilioSetupTone) {
  if (tone === 'success') return 'success' as const;
  if (tone === 'attention') return 'destructive' as const;
  if (tone === 'pending') return 'outline' as const;
  return 'secondary' as const;
}

function renderWebhookExpectation(label: string, value: string) {
  return (
    <div className="space-y-2 rounded-xl border bg-background/80 p-4 text-sm">
      <p className="font-medium">{label}</p>
      <code className="block overflow-x-auto rounded bg-background px-3 py-2 text-xs">{value}</code>
    </div>
  );
}

function getStepByKey(steps: TwilioSetupStep[], key: TwilioSetupStepKey) {
  return steps.find((step) => step.key === key)!;
}

export default async function AdminBusinessDetailPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  await requireAdmin();

  const [businessRecord, successfulLeadCount, operatorEvents] = await Promise.all([
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
    listBusinessOperatorEvents(params.businessId, 'all', 120),
  ]);

  if (!businessRecord) notFound();
  const business = businessRecord;

  const timelineFilter = getTimelineFilter(searchParams);
  const activityExpanded = getActivityExpanded(searchParams);
  const testSmsTruth = buildAdminTestSmsTruth(operatorEvents);
  const [ownerState, webhookSnapshot, availableNumbers] = await Promise.all([
    getAdminOwnerState(business, business.notificationSettings),
    getTwilioWebhookSnapshot(business),
    listAdminTwilioNumbers(business),
  ]);

  const testSmsState =
    testSmsTruth.state === 'not_run'
      ? 'not_started'
      : testSmsTruth.state === 'pending'
        ? 'pending_delivery'
        : testSmsTruth.state;
  const managedTextingNumber = getManagedTextingNumber(business);
  const ownerContact = business.notificationSettings?.ownerPhone || business.notifyPhone || null;
  const missedCallValidation = buildAdminMissedCallValidationTruth({
    events: operatorEvents,
    successfulLeadCount,
  });
  const setupFlow = buildTwilioSetupFlow({
    business,
    notificationSettings: business.notificationSettings,
    ownerConnected: ownerState.connected,
    successfulLeadCount,
    testSmsState,
    webhookSnapshot,
    missedCallValidation: {
      complete: missedCallValidation.countsAsLaunchProof,
      stateLabel: missedCallValidation.label,
      detail: missedCallValidation.detail,
      tone:
        missedCallValidation.tone === 'success'
          ? 'success'
          : missedCallValidation.tone === 'attention'
            ? 'attention'
            : missedCallValidation.tone === 'pending'
              ? 'pending'
              : 'neutral',
    },
  });
  const onboardingConfidence = buildAdminOnboardingConfidence({
    business,
    notificationSettings: business.notificationSettings,
    ownerConnected: ownerState.connected,
    successfulLeadCount,
    operatorEvents,
    webhookSnapshot,
    missedCallValidation,
  });
  const { goLiveDecision, proofs } = buildAdminOperationalProofs({
    ownerConnected: ownerState.connected,
    ownerEmail: business.notificationSettings?.ownerEmail || null,
    ownerPhone: ownerContact,
    messagingServiceReady: Boolean(business.twilioMessagingServiceSid),
    numberAssigned: Boolean(managedTextingNumber && (business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid)),
    testSmsTruth,
    missedCallValidation,
    webhookSnapshot,
    provisioningStatus: business.provisioningStatus,
    canSafelyMarkLive: onboardingConfidence.canSafelyMarkLive,
    blockers: onboardingConfidence.blockers.map((blocker) => blocker.message),
    events: operatorEvents,
  });
  const lastIssue = buildAdminBusinessIssue({
    events: operatorEvents,
    currentStep: {
      stepKey: setupFlow.banner.stepKey,
      title: setupFlow.banner.title,
      detail: setupFlow.banner.detail,
      tone: setupFlow.banner.tone,
    },
  });
  const timelineCounts = countTimelineFilters(operatorEvents);
  const rawStepParam = getQueryValue(searchParams, 'step');
  const selectedStepKey =
    rawStepParam && setupFlow.steps.some((step) => step.key === rawStepParam)
      ? (rawStepParam as TwilioSetupStepKey)
      : (lastIssue.remediationStepKey || setupFlow.banner.stepKey);
  const timelineFilterLinks = businessTimelineFilterOptions.map((option) => ({
    key: option.key,
    label: option.label,
    href: buildTimelineFilterPath(business.id, option.key, selectedStepKey, activityExpanded),
    count: timelineCounts.get(option.key) ?? 0,
  }));
  const visibleTimelineEvents = operatorEvents.filter((event) => matchesTimelineFilter(event, timelineFilter));
  const expandActivityHref = visibleTimelineEvents.length > 5 ? buildActivityPath(business.id, timelineFilter, selectedStepKey, true) : null;
  const collapseActivityHref = activityExpanded ? buildActivityPath(business.id, timelineFilter, selectedStepKey, false) : null;
  const lastIssueHref = lastIssue.remediationStepKey
    ? buildStepPath(business.id, lastIssue.remediationStepKey, timelineFilter, activityExpanded)
    : null;
  const defaults: AdminTwilioDefaults = {
    businessId: business.id,
    twilioAccountMode: business.twilioAccountMode,
    phoneSetupPath: business.phoneSetupPath,
    forwardedCallAnswerMode: business.forwardedCallAnswerMode,
    messagingSetupMode: business.messagingSetupMode,
    twilioNumberSetupMode: business.twilioNumberSetupMode,
    twilioSubaccountSid: business.twilioSubaccountSid || '',
    twilioPhoneNumber: business.twilioPrimaryPhoneNumber || business.twilioPhoneNumber || '',
    twilioPhoneNumberSid: business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || '',
    twilioMessagingServiceSid: business.twilioMessagingServiceSid || '',
    forwardingVerificationStatus: business.forwardingVerificationStatus,
    forwardingVerificationNote: business.forwardingVerificationNote || '',
    portingStatus: business.portingStatus,
    portingNotes: business.portingNotes || '',
    messagingComplianceType: business.messagingComplianceType,
    a2pCustomerProfileSid: business.a2pCustomerProfileSid || '',
    a2pBrandSid: business.a2pBrandSid || '',
    a2pCampaignSid: business.a2pCampaignSid || '',
    a2pFailureReason: business.a2pFailureReason || '',
    tollFreeVerificationStatus: business.tollFreeVerificationStatus,
    tollFreeVerificationSid: business.tollFreeVerificationSid || '',
    tollFreeVerificationNote: business.tollFreeVerificationNote || '',
    managedTwilioStatus: business.managedTwilioStatus,
  };
  const setupPanels = buildAdminSetupPanels({
    business,
    setupFlow,
    ownerState,
    webhookSnapshot,
    testSmsTruth,
    onboardingConfidence,
    missedCallValidation,
    goLiveDecision,
    proofs,
  });
  const nextStepGuide = buildAdminNextStepGuide({
    setupFlow,
    lastIssueStepKey: lastIssue.remediationStepKey,
    panels: setupPanels,
  });
  const nextStep = getStepByKey(setupFlow.steps, nextStepGuide.key);
  const nextStepHref = buildStepPath(business.id, nextStepGuide.key, timelineFilter, activityExpanded);
  const selectedStep = getStepByKey(setupFlow.steps, selectedStepKey);
  const showPendingSetupBanner = shouldShowCustomerSetupWaitingPage(business.provisioningStatus);

  const created = getQueryValue(searchParams, 'created') === '1';
  const saved = getQueryValue(searchParams, 'saved') === '1';
  const ownerAction = getQueryValue(searchParams, 'ownerAction');
  const provisioned = getQueryValue(searchParams, 'provisioned') === '1';
  const synced = getQueryValue(searchParams, 'synced');
  const testSms = getQueryValue(searchParams, 'testSms') === '1';
  const archived = getQueryValue(searchParams, 'archived') === '1';
  const restored = getQueryValue(searchParams, 'restored') === '1';
  const statusSaved = getQueryValue(searchParams, 'statusSaved');
  const validationSaved = getQueryValue(searchParams, 'validationSaved') === '1';
  const liveAcknowledged = getQueryValue(searchParams, 'liveAcknowledged');
  const error = getQueryValue(searchParams, 'error');
  const ownerEmail = ownerState.email || business.notificationSettings?.ownerEmail || 'the saved owner email';
  const stepFeedbackNotice = error
    ? { variant: 'destructive' as const, message: error }
    : ownerAction === 'connected'
      ? {
          variant: 'success' as const,
          message: `Existing owner connected for ${ownerEmail}. Customer access should now reflect the linked account.`,
        }
      : ownerAction === 'invited'
        ? {
            variant: 'success' as const,
            message: `Owner invitation sent to ${ownerEmail}. CallbackCloser will auto-connect the owner after they accept and sign in, or show a one-click connect action here if review is still needed.`,
          }
        : ownerAction === 'resent'
          ? {
              variant: 'success' as const,
              message: `Owner invitation resent to ${ownerEmail}. CallbackCloser will auto-connect the owner after they accept and sign in, or show a one-click connect action here if review is still needed.`,
            }
          : provisioned
            ? {
                variant: 'success' as const,
                message: 'Provisioning run finished. Review the current step evidence before moving forward.',
              }
            : synced
              ? {
                  variant: 'success' as const,
                  message: `Webhook sync completed for ${synced}. Confirm the URLs in this step before marking it done.`,
                }
              : testSms
                ? {
                    variant: 'success' as const,
                    message: 'Test SMS requested. Wait for the final delivery result in Recent activity before trusting the setup.',
                  }
                : validationSaved
                  ? {
                      variant: 'success' as const,
                      message: 'Manual missed-call validation proof saved for this step.',
                    }
                  : liveAcknowledged
                    ? {
                        variant: 'success' as const,
                        message:
                          liveAcknowledged === 'warnings'
                            ? 'Business marked live with explicit warning acknowledgment.'
                            : 'Business marked live after launch checks.',
                      }
                    : statusSaved
                      ? {
                          variant: 'success' as const,
                          message: `Provisioning status updated to ${statusSaved}.`,
                        }
                      : saved
                        ? {
                            variant: 'success' as const,
                            message: `Setup state saved for ${selectedStep.label.toLowerCase()}.`,
                          }
                        : null;

  function renderAutomaticActions(step: TwilioSetupStep) {
    if (step.key === 'owner_connected') {
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <form action={inviteBusinessOwnerAction} className="rounded-xl border bg-background/80 p-4">
            <input name="businessId" type="hidden" value={business.id} />
            <input name="returnStep" type="hidden" value={step.key} />
            <div className="space-y-2">
              <Label htmlFor="ownerInviteName">Owner name</Label>
              <Input defaultValue={business.ownerName || ''} id="ownerInviteName" name="ownerName" />
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="ownerInviteEmail">Owner email</Label>
              <Input
                defaultValue={business.notificationSettings?.ownerEmail || ''}
                id="ownerInviteEmail"
                name="ownerEmail"
                placeholder="owner@business.com"
                required
                type="email"
              />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Use this when the owner does not already have a CallbackCloser login.</p>
            <Button className="mt-4" size="sm" type="submit" variant="outline">
              {ownerState.status === 'invitation_pending' ? 'Resend owner invite' : 'Invite owner by email'}
            </Button>
          </form>

          <form action={connectExistingBusinessOwnerAction} className="rounded-xl border bg-background/80 p-4">
            <input name="businessId" type="hidden" value={business.id} />
            <input name="returnStep" type="hidden" value={step.key} />
            {ownerState.matchedUserId ? <input name="ownerClerkId" type="hidden" value={ownerState.matchedUserId} /> : null}
            <div className="space-y-2">
              <Label htmlFor="ownerConnectName">Owner name</Label>
              <Input defaultValue={business.ownerName || ''} id="ownerConnectName" name="ownerName" />
            </div>
            <div className="mt-4 space-y-2">
              <Label htmlFor="ownerConnectEmail">Owner email</Label>
              <Input
                defaultValue={business.notificationSettings?.ownerEmail || ''}
                id="ownerConnectEmail"
                name="ownerEmail"
                placeholder="owner@business.com"
                required
                type="email"
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
      );
    }

    if (step.key === 'account_mode') {
      return (
        <form action={saveAdminTwilioSetupAction} className="space-y-4">
          <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioAccountMode']} returnStep={step.key} />
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
      );
    }

    if (step.key === 'number_path') {
      return (
        <form action={saveAdminTwilioSetupAction} className="space-y-4">
          <HiddenAdminTwilioFields
            defaults={defaults}
            exclude={['phoneSetupPath', 'forwardedCallAnswerMode', 'messagingSetupMode']}
            returnStep={step.key}
          />
          <div className="grid gap-3">
            {businessPhonePathOptions.map((option) => (
              <label key={option.value} className="rounded-xl border bg-background/80 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <input defaultChecked={business.phoneSetupPath === option.value} name="phoneSetupPath" type="radio" value={option.value} />
                  <div className="space-y-1">
                    <p className="font-medium">{option.label}</p>
                    <p className="text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="grid gap-3">
            <p className="text-sm font-medium">Forwarded call answer confirmation</p>
            {forwardedCallAnswerOptions.map((option) => (
              <label key={option.value} className="rounded-xl border bg-background/80 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <input
                    defaultChecked={business.forwardedCallAnswerMode === option.value}
                    name="forwardedCallAnswerMode"
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
          <div className="grid gap-3">
            <p className="text-sm font-medium">Messaging setup mode</p>
            {messagingSetupOptions.map((option) => (
              <label key={option.value} className="rounded-xl border bg-background/80 p-4 text-sm">
                <div className="flex items-start gap-3">
                  <input
                    defaultChecked={business.messagingSetupMode === option.value}
                    name="messagingSetupMode"
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
          <Button size="sm" type="submit" variant="outline">
            Save call and messaging path
          </Button>
        </form>
      );
    }

    if (step.key === 'account_ready') {
      if (business.messagingSetupMode === 'SHARED_PILOT_MESSAGING_SERVICE') {
        return (
          <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
            Pilot setup is founder-operated. A dedicated subaccount is optional while SMS sends through the approved CallbackCloser Messaging
            Service.
          </div>
        );
      }

      if (business.twilioAccountMode === 'MAIN_ACCOUNT') {
        return <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">Main account mode is active, so this step does not require a business subaccount.</div>;
      }

      return (
        <form action={createBusinessTwilioSubaccountAction} className="space-y-3 rounded-xl border bg-background/80 p-4">
          <input name="businessId" type="hidden" value={business.id} />
          <input name="returnStep" type="hidden" value={step.key} />
          <p className="text-sm text-muted-foreground">Create a dedicated Twilio subaccount for this business without leaving the admin page.</p>
          <Button size="sm" type="submit">
            Create subaccount automatically
          </Button>
        </form>
      );
    }

    if (step.key === 'messaging_service_ready') {
      if (business.messagingSetupMode === 'SHARED_PILOT_MESSAGING_SERVICE') {
        return (
          <div className="space-y-3 rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
            <p>Pilot setup: current number forwards to CallbackCloser; SMS sends from the approved CallbackCloser messaging number.</p>
            <p>Do not create a new per-business Messaging Service here. Save the approved shared Messaging Service SID in the admin override panel below.</p>
          </div>
        );
      }

      return (
        <form action={createBusinessMessagingServiceAction} className="space-y-3 rounded-xl border bg-background/80 p-4">
          <input name="businessId" type="hidden" value={business.id} />
          <input name="returnStep" type="hidden" value={step.key} />
          <p className="text-sm text-muted-foreground">Create the Twilio Messaging Service from CallbackCloser, then verify delivery with a test SMS.</p>
          <Button size="sm" type="submit">
            Create Messaging Service automatically
          </Button>
        </form>
      );
    }

    if (step.key === 'number_assigned') {
      return (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-background/80 p-4 text-sm">
              <p className="font-medium">Current number</p>
              <p className="mt-2 text-muted-foreground">
                {managedTextingNumber ? formatPhoneForDisplay(managedTextingNumber) : 'No business number recorded yet'}
              </p>
            </div>
            <div className="rounded-xl border bg-background/80 p-4 text-sm">
              <p className="font-medium">Numbers visible in the selected account</p>
              <p className="mt-2 text-muted-foreground">
                {availableNumbers.error
                  ? availableNumbers.error
                  : `${availableNumbers.numbers.length} number${availableNumbers.numbers.length === 1 ? '' : 's'} available in ${availableNumbers.sourceLabel || 'Twilio'}.`}
              </p>
            </div>
          </div>

          {business.phoneSetupPath !== 'PORT_EXISTING_NUMBER' ? (
            <form action={provisionBusinessAction} className="flex flex-col gap-3 rounded-xl border bg-background/80 p-4 md:flex-row md:items-end">
              <input name="businessId" type="hidden" value={business.id} />
              <input name="mode" type="hidden" value="NEW_NUMBER" />
              <input name="returnStep" type="hidden" value={step.key} />
              <div className="w-full md:max-w-xs">
                <Label htmlFor="adminAreaCode">Preferred area code</Label>
                <Input id="adminAreaCode" inputMode="numeric" maxLength={3} name="areaCode" placeholder="512" />
              </div>
              <Button size="sm" type="submit">
                {managedTextingNumber ? 'Re-run routing number provisioning' : 'Provision routing number automatically'}
              </Button>
            </form>
          ) : (
            <div className="space-y-3 rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
              <p>Porting is tracked manually in this rollout. Save the Twilio routing number below only after the port is complete and the number is active inside Twilio.</p>
            </div>
          )}
        </div>
      );
    }

    if (step.key === 'forwarding_verified') {
      if (business.phoneSetupPath === 'CURRENT_NUMBER_FORWARDING') {
        return (
          <div className="space-y-4">
            <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
              CallbackCloser will auto-verify this step after a fresh inbound call reaches the routing number. If you already confirmed the carrier forward manually, record that below.
            </div>
            <form action={confirmForwardingVerificationAction} className="space-y-3 rounded-xl border bg-background/80 p-4">
              <input name="businessId" type="hidden" value={business.id} />
              <input name="returnStep" type="hidden" value={step.key} />
              <div className="space-y-2">
                <Label htmlFor="manualForwardingVerificationNote">Verification note</Label>
                <Textarea
                  id="manualForwardingVerificationNote"
                  name="note"
                  placeholder="Example: Confirmed the carrier forward from the public business line into the CallbackCloser routing number and watched the live test call ring through."
                  rows={4}
                />
              </div>
              <Button size="sm" type="submit" variant="outline">
                Mark forwarding verified
              </Button>
            </form>
          </div>
        );
      }

      if (business.phoneSetupPath === 'PORT_EXISTING_NUMBER') {
        return (
          <form action={saveAdminTwilioSetupAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
            <HiddenAdminTwilioFields defaults={defaults} exclude={['portingStatus', 'portingNotes']} returnStep={step.key} />
            <div className="space-y-2">
              <Label htmlFor="adminPortingStatus">Porting status</Label>
              <Select defaultValue={business.portingStatus} id="adminPortingStatus" name="portingStatus">
                <option value="NOT_STARTED">Not started</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="BLOCKED">Blocked</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPortingNotes">Porting notes</Label>
              <Textarea
                defaultValue={business.portingNotes || ''}
                id="adminPortingNotes"
                name="portingNotes"
                placeholder="Track the current porting state, carrier dependencies, or blockers here."
                rows={4}
              />
            </div>
            <Button size="sm" type="submit" variant="outline">
              Save porting status
            </Button>
          </form>
        );
      }

      return (
        <div className="rounded-xl border bg-background/80 p-4 text-sm text-muted-foreground">
          A new CallbackCloser number does not need separate forwarding verification. Once the routing number is assigned, this path is ready.
        </div>
      );
    }

    if (step.key === 'voice_webhook_synced' || step.key === 'sms_webhook_synced' || step.key === 'status_callback_synced') {
      const target = step.key === 'voice_webhook_synced' ? 'VOICE' : step.key === 'sms_webhook_synced' ? 'SMS' : 'STATUS';
      const buttonLabel =
        target === 'VOICE' ? 'Re-sync voice webhook' : target === 'SMS' ? 'Re-sync SMS webhook' : 'Re-sync status callback';

      return (
        <form action={resyncBusinessWebhooksAction} className="space-y-3 rounded-xl border bg-background/80 p-4">
          <input name="businessId" type="hidden" value={business.id} />
          <input name="target" type="hidden" value={target} />
          <input name="returnStep" type="hidden" value={step.key} />
          <p className="text-sm text-muted-foreground">Run the webhook repair for this exact endpoint. The expected CallbackCloser URL is shown below for manual fallback.</p>
          <Button size="sm" type="submit">
            {buttonLabel}
          </Button>
        </form>
      );
    }

    if (step.key === 'a2p_status_recorded') {
      return (
        <form action={saveAdminTwilioSetupAction} className="rounded-xl border bg-background/80 p-4">
          <HiddenAdminTwilioFields
            defaults={defaults}
            exclude={[
              'messagingComplianceType',
              'managedTwilioStatus',
              'a2pCustomerProfileSid',
              'a2pBrandSid',
              'a2pCampaignSid',
              'a2pFailureReason',
              'tollFreeVerificationStatus',
              'tollFreeVerificationSid',
              'tollFreeVerificationNote',
            ]}
            returnStep={step.key}
          />
          <MessagingComplianceFields
            idPrefix="admin"
            initialMessagingComplianceType={business.messagingComplianceType}
            initialManagedTwilioStatus={business.managedTwilioStatus}
            initialA2pCustomerProfileSid={business.a2pCustomerProfileSid || ''}
            initialA2pBrandSid={business.a2pBrandSid || ''}
            initialA2pCampaignSid={business.a2pCampaignSid || ''}
            initialA2pFailureReason={business.a2pFailureReason || ''}
            initialTollFreeVerificationStatus={business.tollFreeVerificationStatus}
            initialTollFreeVerificationSid={business.tollFreeVerificationSid || ''}
            initialTollFreeVerificationNote={business.tollFreeVerificationNote || ''}
            complianceTypeOptions={Object.entries(messagingComplianceTypeLabels).map(([value, label]) => ({ value, label }))}
            managedTwilioStatusOptions={Object.entries(managedTwilioStatusLabels).map(([value, label]) => ({ value, label }))}
            tollFreeVerificationStatusOptions={Object.entries(tollFreeVerificationStatusLabels).map(([value, label]) => ({
              value,
              label,
            }))}
            showSubmitButton
            submitButtonVariant="outline"
          />
        </form>
      );
    }

    if (step.key === 'test_sms_delivered') {
      return (
        <div className="space-y-4">
          <form action={sendBusinessTestSmsAction} className="space-y-3 rounded-xl border bg-background/80 p-4">
            <input name="businessId" type="hidden" value={business.id} />
            <input name="returnStep" type="hidden" value={step.key} />
            <div className="space-y-2">
              <Label htmlFor="adminTwilioTestSmsDestination">Test SMS destination</Label>
              <Input
                defaultValue={business.notificationSettings?.ownerPhone || business.notifyPhone || ''}
                id="adminTwilioTestSmsDestination"
                name="destinationPhone"
                placeholder="+15551234567"
              />
            </div>
            <Button size="sm" type="submit">
              {testSmsTruth.state === 'not_run' ? 'Send test SMS' : 'Retry test SMS'}
            </Button>
          </form>
          <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="#recent-activity">
            Open recent activity
          </Link>
        </div>
      );
    }

    if (step.key === 'missed_call_validated') {
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Link className={buttonVariants({ size: 'sm' })} href={buildAdminCustomerOpenHref(business.id, '/app/call-flow')}>
              Open customer call flow
            </Link>
            <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={buildAdminCustomerOpenHref(business.id, '/app')}>
              Open customer workspace
            </Link>
            <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href="#recent-activity">
              Open recent activity
            </Link>
          </div>
          <form action={confirmMissedCallValidationAction} className="space-y-3 rounded-xl border bg-background/80 p-4">
            <input name="businessId" type="hidden" value={business.id} />
            <input name="returnStep" type="hidden" value={step.key} />
            <div className="space-y-2">
              <Label htmlFor="manualMissedCallValidationNote">Manual validation note</Label>
              <Textarea
                id="manualMissedCallValidationNote"
                name="note"
                placeholder="Example: Placed a missed call from my cell, saw the lead created, recovery SMS sent, and owner alert arrived on +1..."
                rows={4}
              />
            </div>
            <Button size="sm" type="submit" variant="outline">
              Mark missed-call flow validated
            </Button>
          </form>
        </div>
      );
    }

    if (step.key === 'safe_to_mark_live') {
      return (
        <div className="space-y-4">
          <form action={markBusinessLiveAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
            <input name="businessId" type="hidden" value={business.id} />
            <input name="returnStep" type="hidden" value={step.key} />
            {!onboardingConfidence.canSafelyMarkLive ? (
              <>
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <p className="font-medium text-destructive">Launch proof is still incomplete</p>
                  <ul className="mt-2 space-y-2 text-destructive">
                    {onboardingConfidence.blockers.map((blocker) => (
                      <li key={blocker.message}>• {blocker.message}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goLiveNote">Operator note</Label>
                  <Textarea
                    id="goLiveNote"
                    name="note"
                    placeholder="Record why this business is going live despite the current warning state."
                    rows={4}
                  />
                </div>
                <label className="flex items-start gap-2 rounded-xl border bg-background/80 p-3 text-sm">
                  <input name="acknowledgeWarnings" type="checkbox" value="true" />
                  <span>I understand this business is going live without complete proof and I am recording that decision explicitly.</span>
                </label>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                The current launch proof is green. Review it once more, then mark the business live when you want automation active.
              </p>
            )}
            <Button disabled={business.provisioningStatus === 'LIVE' && onboardingConfidence.canSafelyMarkLive} size="sm" type="submit">
              {business.provisioningStatus === 'LIVE' && onboardingConfidence.canSafelyMarkLive
                ? 'Already live'
                : onboardingConfidence.canSafelyMarkLive
                  ? 'Mark business live'
                  : 'Mark live with warnings'}
            </Button>
          </form>

          <form action={setBusinessProvisioningStatusAction}>
            <input name="businessId" type="hidden" value={business.id} />
            <input name="returnStep" type="hidden" value={step.key} />
            <input name="status" type="hidden" value="PAUSED" />
            <Button size="sm" type="submit" variant="outline">
              Pause automation
            </Button>
          </form>
        </div>
      );
    }

    return null;
  }

  function renderManualEntry(step: TwilioSetupStep) {
    if (step.key === 'owner_connected') {
      return (
        <form action={saveAdminSetupBasicsAction} className="grid gap-4 rounded-xl border bg-background/80 p-4 md:grid-cols-2">
          <input name="businessId" type="hidden" value={business.id} />
          <input name="returnStep" type="hidden" value={step.key} />
          <div className="space-y-2">
            <Label htmlFor="manualOwnerName">Owner name</Label>
            <Input defaultValue={business.ownerName || ''} id="manualOwnerName" name="ownerName" placeholder="Casey Owner" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualOwnerEmail">Owner email</Label>
            <Input defaultValue={business.notificationSettings?.ownerEmail || ''} id="manualOwnerEmail" name="ownerEmail" placeholder="owner@business.com" type="email" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="manualOwnerPhone">Owner alert phone</Label>
            <Input defaultValue={business.notificationSettings?.ownerPhone || business.notifyPhone || ''} id="manualOwnerPhone" name="ownerPhone" placeholder="+15551234567" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="manualPublicBusinessPhone">Public business number</Label>
            <Input defaultValue={business.publicBusinessPhone || ''} id="manualPublicBusinessPhone" name="publicBusinessPhone" placeholder="+15551234567" />
          </div>
          <div className="md:col-span-2">
            <Button size="sm" type="submit" variant="outline">
              Save owner contact info
            </Button>
          </div>
        </form>
      );
    }

    if (step.key === 'account_ready') {
      if (business.twilioAccountMode === 'MAIN_ACCOUNT') return null;

      return (
        <form action={saveAdminTwilioSetupAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
          <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioSubaccountSid']} returnStep={step.key} />
          <div className="space-y-2">
            <Label htmlFor="manualTwilioSubaccountSid">Business subaccount SID</Label>
            <Input defaultValue={business.twilioSubaccountSid || ''} id="manualTwilioSubaccountSid" name="twilioSubaccountSid" placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" />
            <p className="text-xs text-muted-foreground">Paste the subaccount SID if you created or verified it manually in Twilio.</p>
          </div>
          <Button size="sm" type="submit" variant="outline">
            Save subaccount SID
          </Button>
        </form>
      );
    }

    if (step.key === 'messaging_service_ready') {
      return (
        <form action={saveAdminTwilioSetupAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
          <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioMessagingServiceSid']} returnStep={step.key} />
          <div className="space-y-2">
            <Label htmlFor="manualMessagingServiceSid">Messaging Service SID</Label>
            <Input defaultValue={business.twilioMessagingServiceSid || ''} id="manualMessagingServiceSid" name="twilioMessagingServiceSid" placeholder="MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" />
            <p className="text-xs text-muted-foreground">Paste the existing Messaging Service SID if setup happened outside CallbackCloser.</p>
          </div>
          <Button size="sm" type="submit" variant="outline">
            Save Messaging Service SID
          </Button>
        </form>
      );
    }

    if (step.key === 'number_assigned') {
      return (
        <form action={saveAdminTwilioSetupAction} className="grid gap-4 rounded-xl border bg-background/80 p-4 md:grid-cols-2">
          <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioPhoneNumber', 'twilioPhoneNumberSid']} returnStep={step.key} />
          <div className="space-y-2">
            <Label htmlFor="manualTwilioPhoneNumber">Twilio number</Label>
            <Input defaultValue={managedTextingNumber || ''} id="manualTwilioPhoneNumber" name="twilioPhoneNumber" placeholder="+15551234567" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualTwilioPhoneNumberSid">Twilio number SID</Label>
            <Input
              defaultValue={business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || ''}
              id="manualTwilioPhoneNumberSid"
              name="twilioPhoneNumberSid"
              placeholder="PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            />
          </div>
          <div className="md:col-span-2">
            <Button size="sm" type="submit" variant="outline">
              Save number mapping
            </Button>
          </div>
        </form>
      );
    }

    if (step.key === 'voice_webhook_synced' || step.key === 'sms_webhook_synced' || step.key === 'status_callback_synced') {
      const currentUrl =
        step.key === 'voice_webhook_synced'
          ? webhookSnapshot?.currentVoiceUrl || 'No current voice webhook URL read from Twilio.'
          : step.key === 'sms_webhook_synced'
            ? webhookSnapshot?.currentSmsUrl || 'No current SMS webhook URL read from Twilio.'
            : webhookSnapshot?.currentStatusUrl || 'No current status callback URL read from Twilio.';
      const expectedUrl =
        step.key === 'voice_webhook_synced'
          ? webhookSnapshot?.expectedVoiceUrl || 'Voice webhook expectation is not available yet.'
          : step.key === 'sms_webhook_synced'
            ? webhookSnapshot?.expectedSmsUrl || 'SMS webhook expectation is not available yet.'
            : webhookSnapshot?.expectedStatusUrl || 'Status callback expectation is not available yet.';

      return (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {renderWebhookExpectation('Current Twilio value', currentUrl)}
            {renderWebhookExpectation('Expected CallbackCloser value', expectedUrl)}
          </div>
          <form action={saveAdminTwilioSetupAction} className="space-y-4 rounded-xl border bg-background/80 p-4">
            <HiddenAdminTwilioFields defaults={defaults} exclude={['twilioPhoneNumberSid']} returnStep={step.key} />
            <div className="space-y-2">
              <Label htmlFor={`manualNumberSid-${step.key}`}>Twilio number SID</Label>
              <Input
                defaultValue={business.twilioPrimaryNumberSid || business.twilioPhoneNumberSid || ''}
                id={`manualNumberSid-${step.key}`}
                name="twilioPhoneNumberSid"
                placeholder="PNXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              />
              <p className="text-xs text-muted-foreground">If CallbackCloser is checking the wrong Twilio number, correct the saved number SID here before re-syncing.</p>
            </div>
            <Button size="sm" type="submit" variant="outline">
              Update number SID
            </Button>
          </form>
        </div>
      );
    }

    if (step.key === 'missed_call_validated') {
      return (
        <form action={saveAdminSetupBasicsAction} className="grid gap-4 rounded-xl border bg-background/80 p-4 md:grid-cols-2">
          <input name="businessId" type="hidden" value={business.id} />
          <input name="returnStep" type="hidden" value={step.key} />
          <div className="space-y-2">
            <Label htmlFor="manualForwardingNumber">Owner forwarding / answer number</Label>
            <Input defaultValue={business.forwardingNumber || ''} id="manualForwardingNumber" name="forwardingNumber" placeholder="+15551234567" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualValidationOwnerPhone">Owner alert phone</Label>
            <Input defaultValue={business.notificationSettings?.ownerPhone || business.notifyPhone || ''} id="manualValidationOwnerPhone" name="ownerPhone" placeholder="+15551234567" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="manualValidationPublicBusinessPhone">Public business number</Label>
            <Input defaultValue={business.publicBusinessPhone || ''} id="manualValidationPublicBusinessPhone" name="publicBusinessPhone" placeholder="+15551234567" />
          </div>
          <div className="md:col-span-2">
            <Button size="sm" type="submit" variant="outline">
              Save validation details
            </Button>
          </div>
        </form>
      );
    }

    return null;
  }

  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-2">
        <Link className="text-sm text-muted-foreground underline underline-offset-4" href="/admin">
          Back to operator board
        </Link>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{business.name} setup control panel</h1>
              {isBusinessArchived(business) ? <Badge variant="outline">Archived</Badge> : null}
              <Badge variant={getBadgeVariant(setupFlow.banner.tone)}>{setupFlow.banner.title}</Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              This page is the operator workflow for getting a business from incomplete setup to trustworthy live status. Each setup step below supports both automatic repair and manual fallback when Twilio work happens outside the app.
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
          </div>
        </div>
      </div>

      {created ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business workspace created and ready for setup.</div> : null}
      {saved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Setup state saved.</div> : null}
      {ownerAction ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          {ownerAction === 'connected'
            ? `Existing owner connected for ${ownerEmail}.`
            : ownerAction === 'invited'
              ? `Owner invitation sent to ${ownerEmail}. CallbackCloser will auto-connect after acceptance when it is safe to do so.`
              : ownerAction === 'resent'
                ? `Owner invitation resent to ${ownerEmail}. CallbackCloser will auto-connect after acceptance when it is safe to do so.`
                : 'Owner state updated.'}
        </div>
      ) : null}
      {provisioned ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Provisioning run finished. Review the exact setup step before moving on.</div> : null}
      {synced ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Webhook sync complete for {synced}.</div> : null}
      {testSms ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Test SMS requested. Wait for final delivery or failure before trusting the setup.</div> : null}
      {statusSaved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Provisioning status updated to {statusSaved}.</div> : null}
      {validationSaved ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Manual missed-call validation proof saved.</div> : null}
      {liveAcknowledged ? (
        <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">
          {liveAcknowledged === 'warnings' ? 'Business marked live with explicit warning acknowledgment.' : 'Business marked live after launch checks.'}
        </div>
      ) : null}
      {showPendingSetupBanner ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>This business is waiting for founder setup</CardTitle>
            <CardDescription>
              The owner should only see the setup-in-progress page until you finish the launch checklist and mark the workspace live.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="secondary">{customerSetupStatusLabels[business.provisioningStatus]}</Badge>
            <span className="text-muted-foreground">Next action: {onboardingConfidence.nextAction}</span>
          </CardContent>
        </Card>
      ) : null}
      {archived ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business archived safely. Automation is paused.</div> : null}
      {restored ? <div className="rounded-md border border-accent bg-accent/40 p-3 text-sm">Business restored and ready for review.</div> : null}
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <CardDescription>Onboarding confidence</CardDescription>
              <CardTitle className="text-lg">{onboardingConfidence.summary}</CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={onboardingConfidence.stateVariant}>{onboardingConfidence.stateLabel}</Badge>
              <Badge variant={onboardingConfidence.readinessVariant}>{onboardingConfidence.readinessLabel}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Next action:</p>
            <span className="text-muted-foreground">{onboardingConfidence.nextAction}</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3 rounded-xl border bg-background/80 p-4">
              <p className="font-medium">Blockers and warnings</p>
              {onboardingConfidence.blockers.length > 0 ? (
                <ul className="space-y-2 text-muted-foreground">
                  {onboardingConfidence.blockers.map((blocker) => (
                    <li key={blocker.message}>• {blocker.message}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No current blockers are recorded for the go-live decision.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Link className={buttonVariants({ size: 'sm' })} href={nextStepHref}>
                  Open next step
                </Link>
                <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={buildStepPath(business.id, 'safe_to_mark_live', timelineFilter, activityExpanded)}>
                  Open go-live step
                </Link>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {proofs.map((proof) => (
                <div key={proof.key} className="rounded-xl border bg-background/80 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{proof.label}</p>
                    <Badge variant={getOperatorToneBadgeVariant(proof.tone)}>{proof.statusLabel}</Badge>
                  </div>
                  <p className="mt-2 text-muted-foreground">{proof.detail}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {proof.verifiedAt ? `Latest proof ${formatDateTime(proof.verifiedAt)}` : proof.sourceLabel || 'No proof timestamp yet'}
                  </p>
                  {proof.evidenceSummary ? <p className="mt-2 text-xs text-muted-foreground">{proof.evidenceSummary}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardDescription>Last issue</CardDescription>
            <CardTitle className="text-lg">{lastIssue.summary}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getOperatorToneBadgeVariant(lastIssue.tone)}>
                {lastIssue.state === 'healthy' ? 'Healthy' : lastIssue.statusLabel || 'Needs attention'}
              </Badge>
              {lastIssue.categoryLabel ? <Badge variant="outline">{lastIssue.categoryLabel}</Badge> : null}
              {lastIssue.eventType ? <code className="rounded bg-background px-2 py-1 text-xs">{lastIssue.eventType}</code> : null}
            </div>
            <p className="text-muted-foreground">{lastIssue.detail}</p>
            <p className="text-xs text-muted-foreground">
              {lastIssue.createdAt ? `Recorded ${formatDateTime(lastIssue.createdAt)}` : 'Derived from the current business state.'}
            </p>
            {lastIssueHref ? (
              <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={lastIssueHref}>
                Open fix step
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader className="pb-3">
            <CardDescription>Test SMS truth</CardDescription>
            <CardTitle className="text-lg">{testSmsTruth.summary}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getOperatorToneBadgeVariant(testSmsTruth.tone)}>{testSmsTruth.label}</Badge>
              {testSmsTruth.eventType ? <code className="rounded bg-background px-2 py-1 text-xs">{testSmsTruth.eventType}</code> : null}
            </div>
            <p className="text-muted-foreground">{testSmsTruth.detail}</p>
            <p className="text-xs text-muted-foreground">
              {testSmsTruth.lastAttemptAt ? `Last attempt ${formatDateTime(testSmsTruth.lastAttemptAt)}` : 'No test SMS attempt recorded yet.'}
            </p>
            <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={buildStepPath(business.id, 'test_sms_delivered', timelineFilter, activityExpanded)}>
              Open testing step
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-card/90">
          <CardHeader className="pb-3">
            <CardDescription>Next step</CardDescription>
            <CardTitle className="text-lg">{nextStepGuide.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getBadgeVariant(nextStep.tone)}>
                {nextStep.tone === 'success'
                  ? 'Ready'
                  : nextStep.tone === 'attention'
                    ? 'Blocked'
                    : nextStep.tone === 'pending'
                      ? 'Pending'
                      : 'In review'}
              </Badge>
              <code className="rounded bg-background px-2 py-1 text-xs">{nextStepGuide.key}</code>
            </div>
            <p className="text-muted-foreground">{nextStepGuide.detail}</p>
            <p className="text-xs text-muted-foreground">This card always opens the exact setup panel that should be worked next.</p>
            <Link className={buttonVariants({ size: 'sm' })} href={nextStepHref}>
              {nextStepGuide.ctaLabel}
            </Link>
          </CardContent>
        </Card>
      </div>

      <div id="recent-activity">
        <AdminBusinessActivityTimeline
          activeFilter={timelineFilter}
          collapseHref={collapseActivityHref}
          events={visibleTimelineEvents}
          expandHref={expandActivityHref}
          expanded={activityExpanded}
          filterLinks={timelineFilterLinks}
        />
      </div>

      <Card className="bg-card/90" id="admin-setup-steps">
        <CardHeader>
          <CardTitle>Setup steps</CardTitle>
          <CardDescription>Each step includes the current state, what to do next, automatic action buttons, and manual fallback fields when operator intervention is needed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stepFeedbackNotice ? (
            <div
              className={
                stepFeedbackNotice.variant === 'destructive'
                  ? 'rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
                  : 'rounded-md border border-accent bg-accent/40 p-3 text-sm'
              }
            >
              {stepFeedbackNotice.message}
            </div>
          ) : null}
          {setupFlow.steps.map((step) => {
            const panel = setupPanels.find((candidate) => candidate.key === step.key)!;
            return (
              <AdminBusinessSetupStepCard
                key={step.key}
                automaticActions={renderAutomaticActions(step)}
                currentState={panel.currentState}
                explanation={panel.explanation}
                href={buildStepPath(business.id, step.key, timelineFilter, activityExpanded)}
                manualEntry={renderManualEntry(step)}
                nextAction={panel.nextAction}
                open={selectedStepKey === step.key}
                step={step}
                title={panel.title}
                instructions={panel.instructions}
                latestEvidence={panel.latestEvidence}
                warnings={panel.warnings}
                verification={panel.verification}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card className="bg-card/90" id="advanced">
        <CardHeader>
          <CardTitle>Advanced</CardTitle>
          <CardDescription>Destructive or lifecycle controls stay separate from the guided setup flow.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {isBusinessArchived(business) ? (
            <form action={restoreBusinessAction}>
              <input name="businessId" type="hidden" value={business.id} />
              <input name="confirmationName" type="hidden" value={business.name} />
              <Button size="sm" type="submit">
                Restore business
              </Button>
            </form>
          ) : (
            <form action={archiveBusinessAction}>
              <input name="businessId" type="hidden" value={business.id} />
              <input name="confirmationName" type="hidden" value={business.name} />
              <Button size="sm" type="submit" variant="outline">
                Archive business
              </Button>
            </form>
          )}
          {canDeleteTestBusiness(business) ? (
            <form action={deleteTestBusinessAction}>
              <input name="businessId" type="hidden" value={business.id} />
              <input name="confirmationName" type="hidden" value={business.name} />
              <Button size="sm" type="submit" variant="destructive">
                Delete test business
              </Button>
            </form>
          ) : business.isTestBusiness ? (
            <p className="text-sm text-muted-foreground">{getDeleteTestBusinessBlockedReason(business)}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-card/90">
        <CardHeader>
          <CardTitle>Setup snapshot</CardTitle>
          <CardDescription>Short business context for the operator without burying the next step.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Owner</p>
            <p className="mt-2 text-muted-foreground">{ownerState.email || business.notificationSettings?.ownerEmail || 'Owner email missing'}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Public business number</p>
            <p className="mt-2 text-muted-foreground">
              {business.publicBusinessPhone ? formatPhoneForDisplay(business.publicBusinessPhone) : 'Not saved yet'}
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Owner answer number</p>
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
            <p className="font-medium">Business number path</p>
            <p className="mt-2 text-muted-foreground">{getBusinessPhoneSetupPathLabel(business.phoneSetupPath)}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Routing number</p>
            <p className="mt-2 text-muted-foreground">
              {managedTextingNumber ? formatPhoneForDisplay(managedTextingNumber) : 'Routing number not assigned yet'}
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Answer confirmation</p>
            <p className="mt-2 text-muted-foreground">{setupFlow.forwardedCallAnswerModeLabel}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4 text-sm">
            <p className="font-medium">Messaging setup mode</p>
            <p className="mt-2 text-muted-foreground">{setupFlow.messagingSetupModeLabel}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
