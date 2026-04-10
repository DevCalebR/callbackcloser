import type { Lead } from '@prisma/client';
import { SmsConversationState } from '@prisma/client';

type LeadFieldUpdates = {
  serviceType?: string | null;
  serviceRequested?: string | null;
  serviceSelectionRaw?: string | null;
  urgency?: string | null;
  location?: string | null;
  callbackRequested?: boolean | null;
  callerName?: string | null;
  zipCode?: string | null;
  bestTime?: string | null;
  contactName?: string | null;
};

type BusinessPromptConfig = {
  serviceLabel1: string;
  serviceLabel2: string;
  serviceLabel3: string;
};

type TransitionResult = {
  ok: boolean;
  nextState?: SmsConversationState;
  leadUpdates?: LeadFieldUpdates;
  responseText: string;
  markQualified?: boolean;
  notifyOwner?: boolean;
  completed?: boolean;
};

function normalizeText(text: string) {
  return text.trim();
}

function lower(text: string) {
  return normalizeText(text).toLowerCase();
}

export function getServicePrompt(business: BusinessPromptConfig) {
  return `CallbackCloser: We missed your call. What service do you need? Reply 1 for ${business.serviceLabel1}, 2 for ${business.serviceLabel2}, 3 for ${business.serviceLabel3}, or reply with a short description. Reply STOP to opt out or HELP for help. Msg freq varies. Msg & data rates may apply.`;
}

export function getUrgencyPrompt() {
  return 'How urgent is it? Reply emergency, today, this week, or quote.';
}

export function getZipPrompt() {
  return 'What ZIP code or service area should the tech know about?';
}

export function getBestTimePrompt() {
  return 'Would you like a callback today? Reply yes, no, or tell us a preferred time.';
}

export function getNamePrompt() {
  return 'What name should we ask for? Reply with your name or type skip.';
}

export function getCompletionPrompt() {
  return 'Thanks. CallbackCloser has your details and will pass them along for follow-up shortly.';
}

function parseService(input: string, business: BusinessPromptConfig) {
  const trimmed = normalizeText(input);
  if (!trimmed) return null;

  if (trimmed === '1') return business.serviceLabel1;
  if (trimmed === '2') return business.serviceLabel2;
  if (trimmed === '3') return business.serviceLabel3;

  return trimmed;
}

function parseUrgency(input: string) {
  const value = lower(input);
  const map: Record<string, string> = {
    '1': 'Emergency',
    emergency: 'Emergency',
    urgent: 'Emergency',
    '2': 'Today',
    today: 'Today',
    asap: 'Today',
    now: 'Today',
    '3': 'This week',
    week: 'This week',
    'this week': 'This week',
    '4': 'Quote',
    quote: 'Quote',
    estimate: 'Quote',
  };
  return map[value] ?? null;
}

function parseZip(input: string) {
  const trimmed = normalizeText(input);
  if (!trimmed) return null;
  if (/^\d{5}(?:-\d{4})?$/.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9\- ]{3,10}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

function parseCallbackPreference(input: string) {
  const value = lower(input);
  if (!value) return null;
  if (['no', 'no callback', 'text only'].includes(value)) {
    return { callbackRequested: false, bestTime: null };
  }
  if (['yes', 'call', 'call me', 'please call', 'today'].includes(value)) {
    return { callbackRequested: true, bestTime: 'Today' };
  }

  if (value.length >= 2 && value.length <= 40) {
    return { callbackRequested: true, bestTime: normalizeText(input) };
  }

  return null;
}

export function advanceLeadConversation(lead: Pick<Lead, 'smsState'>, body: string, business: BusinessPromptConfig): TransitionResult {
  const state = lead.smsState;
  const text = normalizeText(body);

  switch (state) {
    case SmsConversationState.NOT_STARTED:
      return {
        ok: true,
        nextState: SmsConversationState.AWAITING_SERVICE,
        responseText: getServicePrompt(business),
      };

    case SmsConversationState.AWAITING_SERVICE: {
      const service = parseService(text, business);
      if (!service) {
        return {
          ok: false,
          responseText: `Please reply 1, 2, or 3, or send a short service description. ${getServicePrompt(business)}`,
        };
      }
      return {
        ok: true,
        nextState: SmsConversationState.AWAITING_URGENCY,
        leadUpdates: { serviceType: service, serviceRequested: service, serviceSelectionRaw: text || service },
        responseText: getUrgencyPrompt(),
      };
    }

    case SmsConversationState.AWAITING_URGENCY: {
      const urgency = parseUrgency(text);
      if (!urgency) {
        return {
          ok: false,
          responseText: 'Please reply 1, 2, 3, or 4 for urgency. ' + getUrgencyPrompt(),
        };
      }
      return {
        ok: true,
        nextState: SmsConversationState.AWAITING_ZIP,
        leadUpdates: { urgency },
        responseText: getZipPrompt(),
        markQualified: true,
      };
    }

    case SmsConversationState.AWAITING_ZIP: {
      const location = normalizeText(text);
      if (!location || location.length < 3 || location.length > 80) {
        return {
          ok: false,
          responseText: 'Please reply with a ZIP code or short service area description.',
        };
      }
      const zipCode = parseZip(text);
      return {
        ok: true,
        nextState: SmsConversationState.AWAITING_BEST_TIME,
        leadUpdates: { location, zipCode },
        responseText: getBestTimePrompt(),
      };
    }

    case SmsConversationState.AWAITING_BEST_TIME: {
      const callback = parseCallbackPreference(text);
      if (!callback) {
        return {
          ok: false,
          responseText: 'Please reply yes, no, or tell us the best callback time.',
        };
      }
      return {
        ok: true,
        nextState: SmsConversationState.AWAITING_NAME,
        leadUpdates: { callbackRequested: callback.callbackRequested, bestTime: callback.bestTime },
        responseText: getNamePrompt(),
        markQualified: true,
      };
    }

    case SmsConversationState.AWAITING_NAME: {
      const value = lower(text);
      const contactName = !text || ['skip', 'no', 'n/a', 'na'].includes(value) ? null : text;
      return {
        ok: true,
        nextState: SmsConversationState.COMPLETED,
        leadUpdates: { contactName, callerName: contactName },
        responseText: getCompletionPrompt(),
        notifyOwner: true,
        completed: true,
      };
    }

    case SmsConversationState.COMPLETED:
      return {
        ok: true,
        nextState: SmsConversationState.COMPLETED,
        responseText: 'Thanks - we already have your request. We will follow up soon.',
      };

    default:
      return {
        ok: false,
        responseText: getServicePrompt(business),
      };
  }
}
