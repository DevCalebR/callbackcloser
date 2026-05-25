import { OperatorEventCategory, OperatorEventStatus, type BusinessOperatorEvent } from '@prisma/client';

import { formatMessageStatus } from '@/lib/lead-presenters';
import { operatorEventCategoryLabels, operatorEventStatusLabels } from '@/lib/operator-events';
import type { TwilioSetupStepKey, TwilioSetupTone } from '@/lib/twilio-setup';

type IssueEventRecord = Pick<BusinessOperatorEvent, 'type' | 'category' | 'status' | 'summary' | 'detailsJson' | 'createdAt'>;
type TestSmsEventRecord = Pick<BusinessOperatorEvent, 'type' | 'status' | 'summary' | 'detailsJson' | 'createdAt'>;

type CurrentStepSignal = {
  stepKey: TwilioSetupStepKey | null;
  title: string;
  detail: string;
  tone: TwilioSetupTone;
};

export type AdminTestSmsTruthState = 'not_run' | 'pending' | 'delivered' | 'failed';

export type AdminTestSmsTruth = {
  state: AdminTestSmsTruthState;
  label: string;
  tone: 'neutral' | 'pending' | 'success' | 'attention';
  summary: string;
  detail: string;
  reason: string | null;
  lastAttemptAt: Date | null;
  eventType: string | null;
};

export type AdminBusinessIssue = {
  state: 'healthy' | 'issue';
  tone: 'neutral' | 'pending' | 'attention';
  summary: string;
  detail: string;
  createdAt: Date | null;
  categoryLabel: string | null;
  statusLabel: string | null;
  eventType: string | null;
  remediationStepKey: TwilioSetupStepKey | null;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getDetailString(details: unknown, key: string) {
  if (!isJsonObject(details)) return null;
  const value = details[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getDetailReason(details: unknown) {
  const errorMessage = getDetailString(details, 'errorMessage');
  if (errorMessage) return errorMessage;

  const error = getDetailString(details, 'error');
  if (error) return error;

  const nextStep = getDetailString(details, 'nextStep');
  if (nextStep) return nextStep;

  const reason = getDetailString(details, 'reason');
  if (reason) return reason.replace(/_/g, ' ');

  const messageStatus = getDetailString(details, 'messageStatus');
  if (messageStatus) return formatMessageStatus(messageStatus) || messageStatus;

  const errorCode = getDetailString(details, 'errorCode');
  if (errorCode) return `Twilio error ${errorCode}`;

  return null;
}

function isTestSmsEvent(event: Pick<BusinessOperatorEvent, 'type'>) {
  return event.type.startsWith('admin.test_sms_');
}

function isOpenIssueStatus(status: OperatorEventStatus) {
  return status === OperatorEventStatus.FAILED || status === OperatorEventStatus.WARNING;
}

function getRemediationStepKeyForIssueEvent(event: IssueEventRecord): TwilioSetupStepKey | null {
  if (event.type.startsWith('onboarding.owner_')) return 'owner_connected';
  if (event.type.startsWith('admin.test_sms_')) return 'test_sms_delivered';
  if (event.type.startsWith('owner_alert.')) return 'owner_connected';
  if (event.type === 'provisioning.twilio_subaccount_failed') return 'account_ready';
  if (event.type === 'provisioning.messaging_service_failed') return 'messaging_service_ready';
  if (
    event.type === 'provisioning.number_purchase_failed' ||
    event.type === 'provisioning.number_attach_failed' ||
    event.type === 'provisioning.number_assignment_failed'
  ) {
    return 'number_assigned';
  }
  if (event.type === 'webhooks.sync_failed') {
    const target = getDetailString(event.detailsJson, 'target');
    if (target === 'SMS') return 'sms_webhook_synced';
    if (target === 'STATUS') return 'status_callback_synced';
    return 'voice_webhook_synced';
  }

  const remediationStepKey = getDetailString(event.detailsJson, 'remediationStepKey');
  if (remediationStepKey) {
    return remediationStepKey as TwilioSetupStepKey;
  }

  return null;
}

function getTestSmsState(event: Pick<BusinessOperatorEvent, 'type'> | null): AdminTestSmsTruthState {
  if (!event) return 'not_run';
  if (event.type === 'admin.test_sms_delivered') return 'delivered';
  if (
    event.type === 'admin.test_sms_failed' ||
    event.type === 'admin.test_sms_suppressed' ||
    event.type === 'admin.test_sms_delivery_failed'
  ) {
    return 'failed';
  }
  return 'pending';
}

export function buildAdminTestSmsTruth(events: TestSmsEventRecord[]): AdminTestSmsTruth {
  const latestEvent = events
    .filter((event) => isTestSmsEvent(event))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] || null;

  const state = getTestSmsState(latestEvent);
  const reason = latestEvent ? getDetailReason(latestEvent.detailsJson) : null;

  if (!latestEvent) {
    return {
      state,
      label: 'Not run',
      tone: 'neutral',
      summary: 'No admin test SMS recorded',
      detail: 'Run a test SMS from this page before treating delivery as proven.',
      reason: null,
      lastAttemptAt: null,
      eventType: null,
    };
  }

  if (state === 'delivered') {
    return {
      state,
      label: 'Delivered',
      tone: 'success',
      summary: latestEvent.summary,
      detail: reason ? `Delivery confirmed. ${reason}.` : 'Delivery confirmed by the Twilio status callback.',
      reason,
      lastAttemptAt: latestEvent.createdAt,
      eventType: latestEvent.type,
    };
  }

  if (state === 'failed') {
    return {
      state,
      label: 'Failed',
      tone: 'attention',
      summary: latestEvent.summary,
      detail: reason ? `The latest test SMS did not complete cleanly: ${reason}.` : 'The latest test SMS did not complete cleanly.',
      reason,
      lastAttemptAt: latestEvent.createdAt,
      eventType: latestEvent.type,
    };
  }

  return {
    state,
    label: 'Pending delivery',
    tone: 'pending',
    summary: latestEvent.summary,
    detail:
      latestEvent.type === 'admin.test_sms_accepted'
        ? 'Twilio accepted the latest test SMS, but delivery is not confirmed yet.'
        : 'The latest test SMS request started, but the final delivery result is not known yet.',
    reason,
    lastAttemptAt: latestEvent.createdAt,
    eventType: latestEvent.type,
  };
}

export function buildAdminBusinessIssue(params: {
  events: IssueEventRecord[];
  currentStep: CurrentStepSignal;
}): AdminBusinessIssue {
  const latestIssueEvent = params.events
    .filter((event) => isOpenIssueStatus(event.status))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

  if (latestIssueEvent) {
    const remediationStepKey = getRemediationStepKeyForIssueEvent(latestIssueEvent);
    return {
      state: 'issue',
      tone: 'attention',
      summary: latestIssueEvent.summary,
      detail: getDetailReason(latestIssueEvent.detailsJson) || `${operatorEventCategoryLabels[latestIssueEvent.category]} requires attention.`,
      createdAt: latestIssueEvent.createdAt,
      categoryLabel: operatorEventCategoryLabels[latestIssueEvent.category],
      statusLabel: operatorEventStatusLabels[latestIssueEvent.status],
      eventType: latestIssueEvent.type,
      remediationStepKey,
    };
  }

  if (params.currentStep.tone === 'attention' || params.currentStep.tone === 'pending') {
    return {
      state: 'issue',
      tone: params.currentStep.tone === 'attention' ? 'attention' : 'pending',
      summary: params.currentStep.title,
      detail: params.currentStep.detail,
      createdAt: null,
      categoryLabel: 'Current step',
      statusLabel: params.currentStep.tone === 'attention' ? 'Warning' : 'Pending',
      eventType: null,
      remediationStepKey: params.currentStep.stepKey,
    };
  }

  return {
    state: 'healthy',
    tone: 'neutral',
    summary: 'No open issues recorded',
    detail: 'Recent business events do not show an unresolved failure or blocker right now.',
    createdAt: null,
    categoryLabel: null,
    statusLabel: null,
    eventType: null,
    remediationStepKey: null,
  };
}

export function getOperatorToneBadgeVariant(tone: 'neutral' | 'pending' | 'success' | 'attention') {
  if (tone === 'success') return 'success' as const;
  if (tone === 'attention') return 'destructive' as const;
  if (tone === 'pending') return 'outline' as const;
  return 'secondary' as const;
}

export function getOperatorEventStatusBadgeVariant(status: OperatorEventStatus) {
  if (status === OperatorEventStatus.SUCCESS) return 'success' as const;
  if (status === OperatorEventStatus.FAILED) return 'destructive' as const;
  if (status === OperatorEventStatus.WARNING) return 'destructive' as const;
  if (status === OperatorEventStatus.PENDING) return 'outline' as const;
  return 'secondary' as const;
}

export function getOperatorEventCategoryBadgeVariant(category: OperatorEventCategory) {
  if (category === OperatorEventCategory.ERRORS) return 'destructive' as const;
  if (category === OperatorEventCategory.WEBHOOKS) return 'outline' as const;
  if (category === OperatorEventCategory.ADMIN_ACTIONS) return 'secondary' as const;
  return 'outline' as const;
}

const stepKeyByChangedField: Partial<Record<string, TwilioSetupStepKey>> = {
  twilioAccountMode: 'account_mode',
  phoneSetupPath: 'number_path',
  twilioNumberSetupMode: 'number_path',
  twilioSubaccountSid: 'account_ready',
  twilioMessagingServiceSid: 'messaging_service_ready',
  twilioPhoneNumber: 'number_assigned',
  twilioPhoneNumberSid: 'number_assigned',
  forwardingVerificationStatus: 'forwarding_verified',
  forwardingVerificationNote: 'forwarding_verified',
  portingStatus: 'forwarding_verified',
  portingNotes: 'forwarding_verified',
  messagingComplianceType: 'a2p_status_recorded',
  a2pCustomerProfileSid: 'a2p_status_recorded',
  a2pBrandSid: 'a2p_status_recorded',
  a2pCampaignSid: 'a2p_status_recorded',
  a2pFailureReason: 'a2p_status_recorded',
  tollFreeVerificationStatus: 'a2p_status_recorded',
  tollFreeVerificationSid: 'a2p_status_recorded',
  tollFreeVerificationNote: 'a2p_status_recorded',
  managedTwilioStatus: 'a2p_status_recorded',
};

const stepSummaryByKey: Record<TwilioSetupStepKey, string> = {
  owner_connected: 'Owner connection updated',
  account_mode: 'Twilio account mode updated',
  number_path: 'Business number path updated',
  account_ready: 'Twilio account target updated',
  messaging_service_ready: 'Messaging Service details updated',
  number_assigned: 'Business number mapping updated',
  forwarding_verified: 'Business number verification updated',
  voice_webhook_synced: 'Voice webhook step updated',
  sms_webhook_synced: 'SMS webhook step updated',
  status_callback_synced: 'Status callback step updated',
  a2p_status_recorded: 'Messaging compliance updated',
  test_sms_delivered: 'Test SMS step updated',
  missed_call_validated: 'Missed-call validation updated',
  safe_to_mark_live: 'Live gate updated',
};

export function buildTwilioSetupUpdateEventMetadata(changedFields: Array<{ key: string; label: string }>) {
  const stepKeys = Array.from(
    new Set(changedFields.map((field) => stepKeyByChangedField[field.key]).filter((value): value is TwilioSetupStepKey => Boolean(value)))
  );
  const primaryStepKey = stepKeys[0] ?? null;

  return {
    primaryStepKey,
    stepKeys,
    summary: primaryStepKey ? stepSummaryByKey[primaryStepKey] : 'Twilio setup details updated',
  };
}
