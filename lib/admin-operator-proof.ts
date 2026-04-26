import { BusinessProvisioningStatus, OperatorEventStatus, type BusinessOperatorEvent } from '@prisma/client';

import type { TwilioWebhookSnapshot } from '@/lib/admin-provisioning-presenters';
import type { AdminTestSmsTruth } from '@/lib/admin-operator-visibility';
import type { TwilioSetupStepKey } from '@/lib/twilio-setup';

type ProofEvent = Pick<
  BusinessOperatorEvent,
  'type' | 'status' | 'summary' | 'detailsJson' | 'createdAt' | 'relatedEntityType' | 'relatedEntityId'
>;

export type AdminProofTone = 'neutral' | 'pending' | 'success' | 'attention';
export type AdminProofStatus = 'not_started' | 'waiting' | 'validated' | 'manual' | 'failed';

export type AdminMissedCallValidationTruth = {
  state: 'not_run' | 'waiting' | 'validated_by_sequence' | 'manually_confirmed' | 'failed';
  label: string;
  tone: AdminProofTone;
  summary: string;
  detail: string;
  verifiedAt: Date | null;
  sourceLabel: string | null;
  evidenceSummary: string | null;
  relatedLeadId: string | null;
  latestRelatedEventAt: Date | null;
  countsAsLaunchProof: boolean;
};

export type AdminGoLiveDecisionTruth = {
  state: 'not_acknowledged' | 'ready_for_live' | 'marked_live' | 'marked_live_with_warnings';
  label: string;
  tone: AdminProofTone;
  summary: string;
  detail: string;
  decidedAt: Date | null;
  sourceLabel: string | null;
  note: string | null;
  blockers: string[];
};

export type AdminOperationalProof = {
  key: 'owner_flow' | 'webhooks' | 'messaging_path' | 'test_sms' | 'missed_call_flow' | 'go_live_decision';
  label: string;
  stepKey: TwilioSetupStepKey;
  status: AdminProofStatus;
  statusLabel: string;
  tone: AdminProofTone;
  detail: string;
  sourceLabel: string | null;
  verifiedAt: Date | null;
  evidenceSummary: string | null;
  countsAsLaunchProof: boolean;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getDetailString(details: unknown, key: string) {
  if (!isJsonObject(details)) return null;
  const value = details[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getLatestEvent(events: ProofEvent[], predicate: (event: ProofEvent) => boolean) {
  return events
    .filter(predicate)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] || null;
}

function getLeadId(event: ProofEvent) {
  if (event.relatedEntityType === 'lead' && event.relatedEntityId) {
    return event.relatedEntityId;
  }

  return getDetailString(event.detailsJson, 'leadId');
}

function buildProofState(params: {
  status: AdminProofStatus;
  detail: string;
  sourceLabel: string | null;
  verifiedAt: Date | null;
  evidenceSummary: string | null;
  countsAsLaunchProof: boolean;
  stepKey: TwilioSetupStepKey;
  label: string;
}) {
  const meta = {
    not_started: { statusLabel: 'Not started', tone: 'neutral' as const },
    waiting: { statusLabel: 'Waiting', tone: 'pending' as const },
    validated: { statusLabel: 'Validated', tone: 'success' as const },
    manual: { statusLabel: 'Manually confirmed', tone: 'success' as const },
    failed: { statusLabel: 'Needs attention', tone: 'attention' as const },
  }[params.status];

  return {
    key: params.label,
    label: params.label,
    stepKey: params.stepKey,
    status: params.status,
    statusLabel: meta.statusLabel,
    tone: meta.tone,
    detail: params.detail,
    sourceLabel: params.sourceLabel,
    verifiedAt: params.verifiedAt,
    evidenceSummary: params.evidenceSummary,
    countsAsLaunchProof: params.countsAsLaunchProof,
  };
}

export function buildAdminMissedCallValidationTruth(params: {
  events: ProofEvent[];
  successfulLeadCount: number;
}) {
  const { events, successfulLeadCount } = params;
  const sortedEvents = [...events].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const manualConfirmation = getLatestEvent(sortedEvents, (event) => event.type === 'admin.missed_call_validation_confirmed');
  const latestFailure = getLatestEvent(
    sortedEvents,
    (event) =>
      event.type === 'messaging.missed_call_sms_suppressed' ||
      event.type === 'messaging.outbound_sms_delivery_failed' ||
      event.type === 'owner_alert.sms_failed' ||
      event.type === 'owner_alert.email_failed' ||
      event.type === 'owner_alert.in_app_failed'
  );

  const latestLeadSignal = getLatestEvent(
    sortedEvents,
    (event) =>
      event.type === 'voice.lead_created_from_call' ||
      event.type === 'voice.lead_updated_from_call' ||
      event.type === 'messaging.missed_call_sms_started' ||
      event.type === 'messaging.outbound_sms_requested' ||
      event.type === 'messaging.outbound_sms_accepted' ||
      event.type === 'messaging.outbound_sms_delivered' ||
      event.type === 'messaging.inbound_sms_received' ||
      event.type === 'owner_alert.sms_sent' ||
      event.type === 'owner_alert.email_sent' ||
      event.type === 'owner_alert.in_app_sent' ||
      event.type === 'owner_alert.sms_delivered'
  );

  if (manualConfirmation && (!latestFailure || manualConfirmation.createdAt >= latestFailure.createdAt)) {
    const note = getDetailString(manualConfirmation.detailsJson, 'note');
    return {
      state: 'manually_confirmed',
      label: 'Manually confirmed',
      tone: 'success',
      summary: manualConfirmation.summary,
      detail: note || 'An operator recorded manual proof that the missed-call flow reached the expected outcome.',
      verifiedAt: manualConfirmation.createdAt,
      sourceLabel: 'Operator confirmation',
      evidenceSummary: note,
      relatedLeadId: getLeadId(manualConfirmation),
      latestRelatedEventAt: manualConfirmation.createdAt,
      countsAsLaunchProof: true,
    } satisfies AdminMissedCallValidationTruth;
  }

  const byLead = new Map<
    string,
    {
      leadEvent?: ProofEvent;
      smsEvent?: ProofEvent;
      replyEvent?: ProofEvent;
      ownerAlertEvent?: ProofEvent;
    }
  >();

  for (const event of sortedEvents) {
    const leadId = getLeadId(event);
    if (!leadId) continue;

    const current = byLead.get(leadId) || {};

    if (!current.leadEvent && (event.type === 'voice.lead_created_from_call' || event.type === 'voice.lead_updated_from_call')) {
      current.leadEvent = event;
    }

    if (
      !current.smsEvent &&
      (event.type === 'messaging.missed_call_sms_started' ||
        event.type === 'messaging.outbound_sms_requested' ||
        event.type === 'messaging.outbound_sms_accepted' ||
        event.type === 'messaging.outbound_sms_delivered')
    ) {
      current.smsEvent = event;
    }

    if (!current.replyEvent && event.type === 'messaging.inbound_sms_received') {
      current.replyEvent = event;
    }

    if (
      !current.ownerAlertEvent &&
      (event.type === 'owner_alert.sms_sent' ||
        event.type === 'owner_alert.email_sent' ||
        event.type === 'owner_alert.in_app_sent' ||
        event.type === 'owner_alert.sms_delivered')
    ) {
      current.ownerAlertEvent = event;
    }

    byLead.set(leadId, current);
  }

  const recentSequence = [...byLead.entries()]
    .map(([leadId, entry]) => ({
      leadId,
      entry,
      verifiedAt: [entry.leadEvent, entry.smsEvent, entry.replyEvent, entry.ownerAlertEvent]
        .filter((event): event is ProofEvent => Boolean(event))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0]?.createdAt || null,
    }))
    .filter((candidate) => Boolean(candidate.entry.leadEvent && candidate.entry.smsEvent && candidate.entry.ownerAlertEvent))
    .sort((left, right) => (right.verifiedAt?.getTime() || 0) - (left.verifiedAt?.getTime() || 0))[0];

  if (recentSequence && (!latestFailure || (recentSequence.verifiedAt && recentSequence.verifiedAt >= latestFailure.createdAt))) {
    const hadReply = Boolean(recentSequence.entry.replyEvent);
    return {
      state: 'validated_by_sequence',
      label: 'Validated by event sequence',
      tone: 'success',
      summary: 'Missed-call flow validated by recent business activity',
      detail: hadReply
        ? 'CallbackCloser recorded the missed call, recovery SMS path, inbound reply, and owner alert for one lead.'
        : 'CallbackCloser recorded the missed call, recovery SMS path, and owner alert for one lead.',
      verifiedAt: recentSequence.verifiedAt,
      sourceLabel: 'Recent event sequence',
      evidenceSummary: `Lead ${recentSequence.leadId.slice(-6)} shows a missed-call recovery sequence through owner alert delivery.`,
      relatedLeadId: recentSequence.leadId,
      latestRelatedEventAt: recentSequence.verifiedAt,
      countsAsLaunchProof: true,
    } satisfies AdminMissedCallValidationTruth;
  }

  if (latestFailure) {
    const reason = getDetailString(latestFailure.detailsJson, 'errorMessage') || getDetailString(latestFailure.detailsJson, 'error');
    return {
      state: 'failed',
      label: 'Needs attention',
      tone: 'attention',
      summary: latestFailure.summary,
      detail: reason || 'The latest missed-call recovery attempt did not complete cleanly enough to count as proof.',
      verifiedAt: null,
      sourceLabel: 'Recent failed event',
      evidenceSummary: latestFailure.summary,
      relatedLeadId: getLeadId(latestFailure),
      latestRelatedEventAt: latestFailure.createdAt,
      countsAsLaunchProof: false,
    } satisfies AdminMissedCallValidationTruth;
  }

  if (latestLeadSignal) {
    return {
      state: 'waiting',
      label: 'Waiting for proof',
      tone: 'pending',
      summary: latestLeadSignal.summary,
      detail: 'CallbackCloser has seen part of the missed-call flow, but it does not yet have enough evidence to prove the full business path.',
      verifiedAt: null,
      sourceLabel: 'Partial event sequence',
      evidenceSummary: latestLeadSignal.summary,
      relatedLeadId: getLeadId(latestLeadSignal),
      latestRelatedEventAt: latestLeadSignal.createdAt,
      countsAsLaunchProof: false,
    } satisfies AdminMissedCallValidationTruth;
  }

  if (successfulLeadCount > 0) {
    return {
      state: 'waiting',
      label: 'Historical signal only',
      tone: 'pending',
      summary: 'Historical lead activity exists, but explicit launch proof is still missing',
      detail: 'This business has historical owner-notified leads, but the current operator console does not yet have a recorded validation sequence or manual confirmation.',
      verifiedAt: null,
      sourceLabel: 'Historical lead count',
      evidenceSummary: `${successfulLeadCount} historical owner-notified lead${successfulLeadCount === 1 ? '' : 's'}`,
      relatedLeadId: null,
      latestRelatedEventAt: null,
      countsAsLaunchProof: false,
    } satisfies AdminMissedCallValidationTruth;
  }

  return {
    state: 'not_run',
    label: 'Not run',
    tone: 'neutral',
    summary: 'Missed-call flow not validated yet',
    detail: 'Run one real missed call from start to finish, or record a manual confirmation note if you validated it outside this console.',
    verifiedAt: null,
    sourceLabel: null,
    evidenceSummary: null,
    relatedLeadId: null,
    latestRelatedEventAt: null,
    countsAsLaunchProof: false,
  } satisfies AdminMissedCallValidationTruth;
}

export function buildAdminGoLiveDecisionTruth(params: {
  provisioningStatus: BusinessProvisioningStatus;
  canSafelyMarkLive: boolean;
  blockers: string[];
  events: ProofEvent[];
}) {
  const latestDecisionEvent = getLatestEvent(
    params.events,
    (event) => event.type === 'admin.go_live_marked_safe' || event.type === 'admin.go_live_marked_with_warnings'
  );
  const note = latestDecisionEvent ? getDetailString(latestDecisionEvent.detailsJson, 'note') : null;

  if (params.provisioningStatus === BusinessProvisioningStatus.LIVE) {
    if (!params.canSafelyMarkLive) {
      return {
        state: 'marked_live_with_warnings',
        label: 'Live with warnings',
        tone: 'attention',
        summary:
          latestDecisionEvent?.type === 'admin.go_live_marked_with_warnings'
            ? latestDecisionEvent.summary
            : 'Business is live with known launch gaps',
        detail:
          note ||
          (params.blockers.length > 0
            ? `The business is live even though these launch gaps still exist: ${params.blockers.join(', ')}.`
            : 'The business is live, but the current launch proof is incomplete.'),
        decidedAt: latestDecisionEvent?.createdAt || null,
        sourceLabel: latestDecisionEvent ? 'Operator acknowledgment' : 'Current business state',
        note,
        blockers: params.blockers,
      } satisfies AdminGoLiveDecisionTruth;
    }

    return {
      state: 'marked_live',
      label: 'Live',
      tone: 'success',
      summary:
        latestDecisionEvent?.type === 'admin.go_live_marked_safe'
          ? latestDecisionEvent.summary
          : 'Business is live and no current go-live warnings remain',
      detail:
        latestDecisionEvent?.type === 'admin.go_live_marked_with_warnings' && note
          ? `Earlier warning note: ${note}`
          : note || 'The business is live and the current launch proof clears the go-live gate.',
      decidedAt: latestDecisionEvent?.createdAt || null,
      sourceLabel: latestDecisionEvent ? 'Operator decision' : 'Current business state',
      note,
      blockers: [],
    } satisfies AdminGoLiveDecisionTruth;
  }

  if (params.canSafelyMarkLive) {
    return {
      state: 'ready_for_live',
      label: 'Ready for live',
      tone: 'success',
      summary: 'All required launch checks are in place',
      detail: 'This business clears the current go-live gate. Mark it live when you are ready to activate automation.',
      decidedAt: null,
      sourceLabel: 'Current launch proof',
      note: null,
      blockers: [],
    } satisfies AdminGoLiveDecisionTruth;
  }

  return {
    state: 'not_acknowledged',
    label: 'Not ready',
    tone: 'pending',
    summary: 'Go-live decision still needs operator review',
    detail:
      params.blockers.length > 0
        ? `Before this business goes live, fix or acknowledge these gaps: ${params.blockers.join(', ')}.`
        : 'The business still needs a final operator review before it should go live.',
    decidedAt: latestDecisionEvent?.createdAt || null,
    sourceLabel: latestDecisionEvent ? 'Previous operator note' : null,
    note,
    blockers: params.blockers,
  } satisfies AdminGoLiveDecisionTruth;
}

export function buildAdminOperationalProofs(params: {
  ownerConnected: boolean;
  ownerEmail: string | null;
  ownerPhone: string | null;
  messagingServiceReady: boolean;
  numberAssigned: boolean;
  testSmsTruth: AdminTestSmsTruth;
  missedCallValidation: AdminMissedCallValidationTruth;
  webhookSnapshot: TwilioWebhookSnapshot | null;
  provisioningStatus: BusinessProvisioningStatus;
  canSafelyMarkLive: boolean;
  blockers: string[];
  events: ProofEvent[];
}) {
  const webhookSyncEvent = getLatestEvent(params.events, (event) => event.type === 'webhooks.sync_succeeded');
  const goLiveDecision = buildAdminGoLiveDecisionTruth({
    provisioningStatus: params.provisioningStatus,
    canSafelyMarkLive: params.canSafelyMarkLive,
    blockers: params.blockers,
    events: params.events,
  });

  const webhookProof = buildProofState({
    label: 'Webhook expectations',
    stepKey: 'voice_webhook_synced',
    status:
      params.webhookSnapshot && !params.webhookSnapshot.error
        ? params.webhookSnapshot.voiceSynced && params.webhookSnapshot.smsSynced && params.webhookSnapshot.statusSynced
          ? 'validated'
          : 'failed'
        : 'waiting',
    detail:
      !params.webhookSnapshot
        ? 'CallbackCloser cannot compare live Twilio webhook values until it can read the assigned number.'
        : params.webhookSnapshot.error
          ? params.webhookSnapshot.error
          : params.webhookSnapshot.voiceSynced && params.webhookSnapshot.smsSynced && params.webhookSnapshot.statusSynced
            ? 'Voice, SMS, and status callbacks match the current CallbackCloser URLs.'
            : 'At least one webhook does not match the current CallbackCloser URL yet.',
    sourceLabel: params.webhookSnapshot ? 'Live Twilio webhook read' : null,
    verifiedAt: webhookSyncEvent?.createdAt || null,
    evidenceSummary:
      params.webhookSnapshot && !params.webhookSnapshot.error
        ? `Voice ${params.webhookSnapshot.voiceSynced ? 'ok' : 'mismatch'}, SMS ${params.webhookSnapshot.smsSynced ? 'ok' : 'mismatch'}, status ${params.webhookSnapshot.statusSynced ? 'ok' : 'mismatch'}.`
        : null,
    countsAsLaunchProof:
      Boolean(
        params.webhookSnapshot &&
          !params.webhookSnapshot.error &&
          params.webhookSnapshot.voiceSynced &&
          params.webhookSnapshot.smsSynced &&
          params.webhookSnapshot.statusSynced
      ),
  });

  const ownerProof = buildProofState({
    label: 'Owner flow',
    stepKey: 'owner_connected',
    status: params.ownerConnected && Boolean(params.ownerEmail || params.ownerPhone) ? 'validated' : 'waiting',
    detail:
      params.ownerConnected && Boolean(params.ownerEmail || params.ownerPhone)
        ? 'The owner account is connected and CallbackCloser has at least one route for alerts or follow-up.'
        : 'Connect the owner and save an owner phone or email before you rely on this business in production.',
    sourceLabel: params.ownerConnected ? 'Saved business owner state' : null,
    verifiedAt: null,
    evidenceSummary: params.ownerEmail || params.ownerPhone,
    countsAsLaunchProof: params.ownerConnected && Boolean(params.ownerEmail || params.ownerPhone),
  });

  const testSmsProof = buildProofState({
    label: 'Test SMS',
    stepKey: 'test_sms_delivered',
    status:
      params.testSmsTruth.state === 'delivered'
        ? 'validated'
        : params.testSmsTruth.state === 'failed'
          ? 'failed'
          : params.testSmsTruth.state === 'pending'
            ? 'waiting'
            : 'not_started',
    detail: params.testSmsTruth.detail,
    sourceLabel:
      params.testSmsTruth.state === 'delivered'
        ? 'Twilio delivery callback'
        : params.testSmsTruth.state === 'failed'
          ? 'Twilio delivery callback'
          : params.testSmsTruth.state === 'pending'
            ? 'Twilio accepted the request'
            : null,
    verifiedAt: params.testSmsTruth.lastAttemptAt,
    evidenceSummary: params.testSmsTruth.summary,
    countsAsLaunchProof: params.testSmsTruth.state === 'delivered',
  });

  const messagingProof = buildProofState({
    label: 'Messaging path',
    stepKey: 'messaging_service_ready',
    status:
      params.messagingServiceReady && params.numberAssigned && params.testSmsTruth.state === 'delivered'
        ? 'validated'
        : params.testSmsTruth.state === 'failed'
          ? 'failed'
          : params.messagingServiceReady && params.numberAssigned
            ? 'waiting'
            : 'not_started',
    detail:
      params.messagingServiceReady && params.numberAssigned && params.testSmsTruth.state === 'delivered'
        ? 'The Messaging Service, business number, and delivered test SMS all support the live messaging path.'
        : params.testSmsTruth.state === 'failed'
          ? 'The messaging path is configured, but the latest test SMS failed. Fix delivery before launch.'
          : params.messagingServiceReady && params.numberAssigned
            ? 'The Twilio resources are saved, but the live messaging path still needs a delivered test SMS.'
            : 'Create or save the Messaging Service and business number before messaging can be trusted.',
    sourceLabel: params.testSmsTruth.state === 'delivered' ? 'Resource state + delivered test SMS' : 'Saved Twilio setup',
    verifiedAt: params.testSmsTruth.lastAttemptAt,
    evidenceSummary:
      params.messagingServiceReady && params.numberAssigned
        ? params.testSmsTruth.state === 'delivered'
          ? 'Messaging resources saved and delivery proven.'
          : 'Messaging resources saved, delivery still unproven.'
        : null,
    countsAsLaunchProof: params.messagingServiceReady && params.numberAssigned && params.testSmsTruth.state === 'delivered',
  });

  const missedCallProof = buildProofState({
    label: 'Missed-call flow',
    stepKey: 'missed_call_validated',
    status:
      params.missedCallValidation.state === 'validated_by_sequence'
        ? 'validated'
        : params.missedCallValidation.state === 'manually_confirmed'
          ? 'manual'
          : params.missedCallValidation.state === 'failed'
            ? 'failed'
            : params.missedCallValidation.state === 'waiting'
              ? 'waiting'
              : 'not_started',
    detail: params.missedCallValidation.detail,
    sourceLabel: params.missedCallValidation.sourceLabel,
    verifiedAt: params.missedCallValidation.verifiedAt,
    evidenceSummary: params.missedCallValidation.evidenceSummary,
    countsAsLaunchProof: params.missedCallValidation.countsAsLaunchProof,
  });

  const goLiveProof = buildProofState({
    label: 'Go-live decision',
    stepKey: 'safe_to_mark_live',
    status:
      goLiveDecision.state === 'marked_live'
        ? 'validated'
        : goLiveDecision.state === 'marked_live_with_warnings'
          ? 'failed'
          : goLiveDecision.state === 'ready_for_live'
            ? 'validated'
            : 'waiting',
    detail: goLiveDecision.detail,
    sourceLabel: goLiveDecision.sourceLabel,
    verifiedAt: goLiveDecision.decidedAt,
    evidenceSummary: goLiveDecision.note,
    countsAsLaunchProof: params.canSafelyMarkLive,
  });

  return {
    goLiveDecision,
    proofs: [
      { ...ownerProof, key: 'owner_flow' as const },
      { ...webhookProof, key: 'webhooks' as const },
      { ...messagingProof, key: 'messaging_path' as const },
      { ...testSmsProof, key: 'test_sms' as const },
      { ...missedCallProof, key: 'missed_call_flow' as const },
      { ...goLiveProof, key: 'go_live_decision' as const },
    ] satisfies AdminOperationalProof[],
  };
}
