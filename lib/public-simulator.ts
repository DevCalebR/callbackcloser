import { formatPhoneForDisplay, normalizePhoneNumberToE164 } from '@/lib/phone';

export const publicSimulatorStages = [
  'started',
  'missed_call_received',
  'first_message_shown',
  'service_captured',
  'urgency_captured',
  'owner_alert_ready',
  'completed',
] as const;

export type PublicSimulatorStage = (typeof publicSimulatorStages)[number];

export type PublicSimulatorQuickReply =
  | 'Repair'
  | 'Install'
  | 'Maintenance'
  | 'Emergency'
  | 'Today'
  | 'This week'
  | 'Just getting a quote';

export type PublicSimulatorService = 'Repair' | 'Install' | 'Maintenance' | 'Emergency' | 'General service';

export type PublicSimulatorUrgency = 'Emergency' | 'Today' | 'This week' | 'Just getting a quote';

export type PublicSimulatorMessage = {
  id: string;
  body: string;
  label: string;
  kind: 'event' | 'assistant' | 'caller';
  timestamp: string;
};

export type PublicSimulatorSession = {
  callerPhone: string;
  callerPhoneDisplay: string;
  callerPhoneMasked: string;
  completed: boolean;
  issueSummary: string | null;
  selectedService: PublicSimulatorService | null;
  selectedUrgency: PublicSimulatorUrgency | null;
  stage: PublicSimulatorStage;
  transcript: PublicSimulatorMessage[];
};

export const PUBLIC_SIMULATOR_DEMO_PHONE = '+1 (865) 555-0148';
export const PUBLIC_SIMULATOR_BUSINESS_NAME = 'Northside Home Services';

const SERVICE_REPLY_OPTIONS: PublicSimulatorQuickReply[] = ['Repair', 'Install', 'Maintenance', 'Emergency'];
const URGENCY_REPLY_OPTIONS: PublicSimulatorQuickReply[] = ['Today', 'This week', 'Just getting a quote'];
const TIMESTAMP_SEQUENCE = ['2:14 PM', '2:14 PM', '2:15 PM', '2:15 PM', '2:16 PM', '2:16 PM', '2:17 PM', '2:17 PM'];

function nextTimestamp(messageCount: number) {
  return TIMESTAMP_SEQUENCE[Math.min(messageCount, TIMESTAMP_SEQUENCE.length - 1)];
}

function appendMessage(
  session: PublicSimulatorSession,
  message: Omit<PublicSimulatorMessage, 'id' | 'timestamp'>,
): PublicSimulatorSession {
  const nextMessage: PublicSimulatorMessage = {
    ...message,
    id: `sim-message-${session.transcript.length + 1}`,
    timestamp: nextTimestamp(session.transcript.length),
  };

  return {
    ...session,
    transcript: [...session.transcript, nextMessage],
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function toSentenceCase(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function formatCustomReply(value: string) {
  const trimmed = toSentenceCase(value.replace(/[.!?]+$/, ''));
  return trimmed || 'Customer asked for help';
}

export function maskPublicSimulatorPhone(value: string | null | undefined) {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    const lastFour = digits.slice(-4);
    return `(***) ***-${lastFour}`;
  }

  if (digits.length >= 4) {
    return `***-${digits.slice(-4)}`;
  }

  return 'Private demo caller';
}

export function getPublicSimulatorQuickReplies(stage: PublicSimulatorStage) {
  if (stage === 'first_message_shown') return SERVICE_REPLY_OPTIONS;
  if (stage === 'service_captured') return URGENCY_REPLY_OPTIONS;
  return [];
}

export function canReplyToPublicSimulator(stage: PublicSimulatorStage) {
  return stage === 'first_message_shown' || stage === 'service_captured';
}

export function startPublicSimulatorSession(phoneInput: string): PublicSimulatorSession | null {
  const normalized = normalizePhoneNumberToE164(phoneInput) || normalizeWhitespace(phoneInput);
  if (!normalized) return null;

  const display = formatPhoneForDisplay(normalized);
  const masked = maskPublicSimulatorPhone(normalized);

  return {
    callerPhone: normalized,
    callerPhoneDisplay: display,
    callerPhoneMasked: masked,
    completed: false,
    issueSummary: null,
    selectedService: null,
    selectedUrgency: null,
    stage: 'started',
    transcript: [
      {
        id: 'sim-message-1',
        body: `Private demo run started for ${masked}. No real SMS will be sent.`,
        kind: 'event',
        label: 'Interactive preview mode',
        timestamp: nextTimestamp(0),
      },
    ],
  };
}

export function advancePublicSimulatorSession(session: PublicSimulatorSession): PublicSimulatorSession {
  if (session.stage === 'started') {
    return appendMessage(
      {
        ...session,
        stage: 'missed_call_received',
      },
      {
        body: `${PUBLIC_SIMULATOR_BUSINESS_NAME} missed a call from ${session.callerPhoneMasked}. CallbackCloser opened a private demo run for this visitor only.`,
        kind: 'event',
        label: 'Missed call received',
      },
    );
  }

  if (session.stage === 'missed_call_received') {
    return appendMessage(
      {
        ...session,
        stage: 'first_message_shown',
      },
      {
        body: 'Sorry we missed your call. What do you need help with today: repair, install, maintenance, or emergency service?',
        kind: 'assistant',
        label: 'CallbackCloser',
      },
    );
  }

  if (session.stage === 'urgency_captured') {
    return appendMessage(
      {
        ...session,
        stage: 'owner_alert_ready',
      },
      {
        body: 'Qualified lead summary ready. The business would now get the alert, full transcript, and callback context without any real delivery leaving this page.',
        kind: 'event',
        label: 'Owner alert ready',
      },
    );
  }

  if (session.stage === 'owner_alert_ready') {
    return {
      ...session,
      completed: true,
      stage: 'completed',
    };
  }

  return session;
}

function inferService(value: string): PublicSimulatorService {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (
    normalized.includes('emergency') ||
    normalized.includes('urgent') ||
    normalized.includes('asap') ||
    normalized.includes('no heat') ||
    normalized.includes('no cool') ||
    normalized.includes('not working') ||
    normalized.includes('stopped working')
  ) {
    return 'Emergency';
  }

  if (
    normalized.includes('install') ||
    normalized.includes('replace') ||
    normalized.includes('replacement') ||
    normalized.includes('new unit')
  ) {
    return 'Install';
  }

  if (
    normalized.includes('maintenance') ||
    normalized.includes('tune') ||
    normalized.includes('service plan') ||
    normalized.includes('checkup')
  ) {
    return 'Maintenance';
  }

  if (
    normalized.includes('repair') ||
    normalized.includes('fix') ||
    normalized.includes('leak') ||
    normalized.includes('diagnostic') ||
    normalized.includes('diagnosis')
  ) {
    return 'Repair';
  }

  return 'General service';
}

function inferUrgency(value: string): PublicSimulatorUrgency {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (
    normalized.includes('emergency') ||
    normalized.includes('urgent') ||
    normalized.includes('asap') ||
    normalized.includes('now') ||
    normalized.includes('immediately')
  ) {
    return 'Emergency';
  }

  if (normalized.includes('today') || normalized.includes('this afternoon') || normalized.includes('tonight')) {
    return 'Today';
  }

  if (
    normalized.includes('quote') ||
    normalized.includes('estimate') ||
    normalized.includes('pricing') ||
    normalized.includes('price')
  ) {
    return 'Just getting a quote';
  }

  if (
    normalized.includes('week') ||
    normalized.includes('later') ||
    normalized.includes('next') ||
    normalized.includes('schedule')
  ) {
    return 'This week';
  }

  return 'Today';
}

function summarizeIssue(service: PublicSimulatorService, rawReply: string) {
  const normalized = normalizeWhitespace(rawReply);
  if (!normalized) return 'Customer asked for service help';

  if (SERVICE_REPLY_OPTIONS.includes(normalized as PublicSimulatorQuickReply)) {
    if (service === 'Emergency') return 'Emergency service request';
    if (service === 'Install') return 'New install request';
    if (service === 'Maintenance') return 'Maintenance visit request';
    if (service === 'Repair') return 'Repair request';
  }

  return formatCustomReply(normalized);
}

export function applyPublicSimulatorReply(session: PublicSimulatorSession, reply: string): PublicSimulatorSession {
  const trimmedReply = normalizeWhitespace(reply);
  if (!trimmedReply || !canReplyToPublicSimulator(session.stage)) {
    return session;
  }

  if (session.stage === 'first_message_shown') {
    const selectedService = inferService(trimmedReply);
    const issueSummary = summarizeIssue(selectedService, trimmedReply);

    const withReply = appendMessage(session, {
      body: trimmedReply,
      kind: 'caller',
      label: session.callerPhoneMasked,
    });

    return appendMessage(
      {
        ...withReply,
        issueSummary,
        selectedService,
        stage: 'service_captured',
      },
      {
        body: 'Thanks. How urgent is this: today, this week, or are you just getting a quote?',
        kind: 'assistant',
        label: 'CallbackCloser',
      },
    );
  }

  const selectedUrgency = inferUrgency(trimmedReply);
  const withReply = appendMessage(session, {
    body: trimmedReply,
    kind: 'caller',
    label: session.callerPhoneMasked,
  });

  return appendMessage(
    {
      ...withReply,
      selectedUrgency,
      stage: 'urgency_captured',
    },
    {
      body: 'Perfect. CallbackCloser has enough detail to build the lead summary and owner alert preview.',
      kind: 'assistant',
      label: 'CallbackCloser',
    },
  );
}

export function buildPublicSimulatorLeadSummary(session: PublicSimulatorSession) {
  const service = session.selectedService || 'Pending';
  const urgency = session.selectedUrgency || 'Pending';
  const issue = session.issueSummary || 'Waiting for caller details';

  return {
    callbackWindow:
      urgency === 'Emergency'
        ? 'Call immediately'
        : urgency === 'Today'
          ? 'Call back today'
          : urgency === 'This week'
            ? 'Schedule this week'
            : 'Follow up with pricing details',
    callerPhone: session.callerPhoneMasked,
    issue,
    service,
    status: session.stage === 'completed' ? 'Ready for callback' : 'Qualifying lead',
    urgency,
  };
}

export function buildPublicSimulatorOwnerAlert(session: PublicSimulatorSession) {
  const leadSummary = buildPublicSimulatorLeadSummary(session);

  return {
    body: `New missed-call lead: ${leadSummary.service} request from ${leadSummary.callerPhone}. ${leadSummary.issue}. Urgency: ${leadSummary.urgency}. ${leadSummary.callbackWindow}. Demo only - no real SMS sent.`,
    headline: 'New missed-call lead',
    leadSummary,
    note: 'This owner alert is rendered on-page only for the public simulator.',
    subject: `${PUBLIC_SIMULATOR_BUSINESS_NAME}: ${leadSummary.service} lead ready`,
  };
}
