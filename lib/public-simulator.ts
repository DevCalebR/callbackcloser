import {
  getMissedCallCallbackPrompt,
  getMissedCallCompletionPrompt,
  getMissedCallContactLocationPrompt,
  getMissedCallServicePrompt,
  getMissedCallUrgencyPrompt,
  MISSED_CALL_CALLBACK_OPTIONS,
  MISSED_CALL_URGENCY_OPTIONS,
} from '@/lib/missed-call-copy';
import {
  normalizePublicSimulatorPhone,
  normalizeServiceNeed,
  parseCallbackPreference,
  parseContactLocation,
  parseUrgency,
} from '@/lib/missed-call-intake';

// Public /simulator must stay self-contained and must not depend on Twilio, login, or demo-business backend state.
export type PublicSimulatorStage =
  | 'waiting_for_service'
  | 'waiting_for_urgency'
  | 'waiting_for_contact_location'
  | 'waiting_for_callback_time'
  | 'qualified';

export type PublicSimulatorMessage = {
  id: string;
  role: 'system' | 'customer' | 'event';
  body: string;
};

export type PublicSimulatorLead = {
  customerName: string | null;
  customerPhone: string;
  serviceNeed: string | null;
  urgency: string | null;
  location: string | null;
  callbackTime: string | null;
  priority: 'Hot lead' | 'Qualified lead' | 'Lead in progress';
  status: 'Ready for callback' | 'Collecting details';
};

export type PublicSimulatorSession = {
  lead: PublicSimulatorLead;
  messages: PublicSimulatorMessage[];
  progressValue: number;
  progressLabel: string;
  qualified: boolean;
  stage: PublicSimulatorStage;
};

export type PublicSimulatorReplyOption = {
  label: string;
  value: string;
};

function buildMessages(customerPhone: string) {
  return [
    {
      id: 'event-missed-call',
      role: 'event' as const,
      body: `Missed call from ${customerPhone}. CallbackCloser opens the lead and sends the first text right away.`,
    },
    {
      id: 'system-service',
      role: 'system' as const,
      body: getMissedCallServicePrompt(),
    },
  ];
}

function buildLead(partial?: Partial<PublicSimulatorLead>): PublicSimulatorLead {
  const urgency = partial?.urgency ?? null;
  return {
    customerName: partial?.customerName ?? null,
    customerPhone: partial?.customerPhone ?? '(***) ***-0148',
    serviceNeed: partial?.serviceNeed ?? null,
    urgency,
    location: partial?.location ?? null,
    callbackTime: partial?.callbackTime ?? null,
    priority: urgency === 'Emergency' || urgency === 'Today' ? 'Hot lead' : urgency ? 'Qualified lead' : 'Lead in progress',
    status: partial?.callbackTime ? 'Ready for callback' : 'Collecting details',
  };
}

function buildProgress(stage: PublicSimulatorStage) {
  if (stage === 'waiting_for_service') return { progressValue: 20, progressLabel: 'Step 1 of 5: service need' };
  if (stage === 'waiting_for_urgency') return { progressValue: 40, progressLabel: 'Step 2 of 5: urgency' };
  if (stage === 'waiting_for_contact_location') return { progressValue: 60, progressLabel: 'Step 3 of 5: name and location' };
  if (stage === 'waiting_for_callback_time') return { progressValue: 80, progressLabel: 'Step 4 of 5: callback time' };
  return { progressValue: 100, progressLabel: 'Step 5 of 5: lead qualified' };
}

function appendMessage(session: PublicSimulatorSession, message: Omit<PublicSimulatorMessage, 'id'>) {
  return {
    ...session,
    messages: [...session.messages, { ...message, id: `${message.role}-${session.messages.length + 1}` }],
  };
}

function completeLead(lead: PublicSimulatorLead): PublicSimulatorLead {
  return {
    ...lead,
    priority: lead.urgency === 'Emergency' || lead.urgency === 'Today' ? 'Hot lead' : 'Qualified lead',
    status: 'Ready for callback',
  };
}

export function createPublicSimulatorSession(phoneInput = '+1 (865) 555-0148'): PublicSimulatorSession {
  const customerPhone = normalizePublicSimulatorPhone(phoneInput);
  const stage: PublicSimulatorStage = 'waiting_for_service';

  return {
    lead: buildLead({ customerPhone }),
    messages: buildMessages(customerPhone),
    qualified: false,
    stage,
    ...buildProgress(stage),
  };
}

export function getPublicSimulatorReplyOptions(stage: PublicSimulatorStage): PublicSimulatorReplyOption[] {
  if (stage === 'waiting_for_urgency') {
    return MISSED_CALL_URGENCY_OPTIONS.map((option) => ({ label: option.label, value: option.value }));
  }

  if (stage === 'waiting_for_callback_time') {
    return MISSED_CALL_CALLBACK_OPTIONS.map((option) => ({ label: option.label, value: option.value }));
  }

  return [];
}

export function canReplyToPublicSimulator(stage: PublicSimulatorStage) {
  return stage !== 'qualified';
}

export function applyPublicSimulatorReply(session: PublicSimulatorSession, reply: string) {
  const trimmedReply = reply.trim();
  if (!trimmedReply) return session;

  let nextSession = appendMessage(session, {
    role: 'customer',
    body: trimmedReply,
  });

  if (session.stage === 'waiting_for_service') {
    const serviceNeed = normalizeServiceNeed(trimmedReply) || trimmedReply;
    const stage: PublicSimulatorStage = 'waiting_for_urgency';
    nextSession = appendMessage(
      {
        ...nextSession,
        lead: buildLead({ ...nextSession.lead, serviceNeed }),
        stage,
        qualified: false,
        ...buildProgress(stage),
      },
      {
        role: 'system',
        body: getMissedCallUrgencyPrompt(),
      },
    );

    return nextSession;
  }

  if (session.stage === 'waiting_for_urgency') {
    const urgency = parseUrgency(trimmedReply) || trimmedReply;
    const stage: PublicSimulatorStage = 'waiting_for_contact_location';
    nextSession = appendMessage(
      {
        ...nextSession,
        lead: buildLead({ ...nextSession.lead, urgency }),
        stage,
        qualified: false,
        ...buildProgress(stage),
      },
      {
        role: 'system',
        body: getMissedCallContactLocationPrompt(),
      },
    );

    return nextSession;
  }

  if (session.stage === 'waiting_for_contact_location') {
    const parsed = parseContactLocation(trimmedReply);
    const stage: PublicSimulatorStage = 'waiting_for_callback_time';
    nextSession = appendMessage(
      {
        ...nextSession,
        lead: buildLead({
          ...nextSession.lead,
          customerName: parsed.callerName || parsed.contactName || nextSession.lead.customerName,
          location: parsed.location || trimmedReply,
        }),
        stage,
        qualified: false,
        ...buildProgress(stage),
      },
      {
        role: 'system',
        body: getMissedCallCallbackPrompt(),
      },
    );

    return nextSession;
  }

  if (session.stage === 'waiting_for_callback_time') {
    const callback = parseCallbackPreference(trimmedReply);
    const callbackTime = callback?.bestTime || trimmedReply;
    const finalLead = completeLead(
      buildLead({
        ...nextSession.lead,
        callbackTime,
      }),
    );
    const stage: PublicSimulatorStage = 'qualified';

    nextSession = appendMessage(
      {
        ...nextSession,
        lead: finalLead,
        stage,
        qualified: true,
        ...buildProgress(stage),
      },
      {
        role: 'system',
        body: getMissedCallCompletionPrompt(finalLead.customerName),
      },
    );

    return nextSession;
  }

  return session;
}

export function buildPublicSimulatorLeadSummary(session: PublicSimulatorSession) {
  return {
    name: session.lead.customerName || 'Name pending',
    phone: session.lead.customerPhone,
    service: session.lead.serviceNeed || 'Service pending',
    urgency: session.lead.urgency || 'Urgency pending',
    location: session.lead.location || 'Location pending',
    callbackTime: session.lead.callbackTime || 'Callback time pending',
    priority: session.lead.priority,
    status: session.lead.status,
  };
}

export function buildPublicSimulatorOwnerAlert(session: PublicSimulatorSession) {
  const summary = buildPublicSimulatorLeadSummary(session);

  return `🔥 Hot missed-call lead

Name: ${summary.name}
Service: ${summary.service}
Urgency: ${summary.urgency}
Location: ${summary.location}
Callback: ${summary.callbackTime}

Call now: ${summary.phone}
View lead: /app/leads/demo-missed-call-lead`;
}
