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

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function lower(text: string) {
  return normalizeText(text).toLowerCase();
}

function cleanSegment(value: string) {
  return value.replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').trim();
}

function looksLikeName(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed || /\d/.test(trimmed)) return false;

  const tokens = trimmed.split(' ');
  if (tokens.length < 1 || tokens.length > 4) return false;

  return tokens.every((token) => /^[A-Za-z][A-Za-z'.-]*$/.test(token));
}

function looksLikeLocation(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return false;

  if (/\d{5}(?:-\d{4})?/.test(trimmed) || /\d/.test(trimmed)) return true;
  if (/\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|way|hwy|highway|suite|ste|apt|unit)\b/i.test(trimmed)) {
    return true;
  }

  return trimmed.length >= 3;
}

export function getServicePrompt(_business: BusinessPromptConfig) {
  return `Hey, sorry we missed your call. What can we help you with today?

You can reply with something like:
Repair, estimate, installation, emergency, or anything else.
Reply STOP to opt out.`;
}

export function getUrgencyPrompt() {
  return `Got it — how soon do you need help?

Reply:
1 Emergency
2 Today
3 This week
4 Just getting a quote`;
}

export function getContactLocationPrompt() {
  return 'Thanks. What name should we put on the request, and what city/ZIP or service address is this for?';
}

export function getBestTimePrompt() {
  return `What’s the best time for someone to call you back?

Reply:
1 ASAP
2 Morning
3 Afternoon
4 Evening`;
}

export function getCompletionPrompt(customerName?: string | null) {
  const greeting = customerName ? `Thanks, ${customerName} —` : 'Thanks —';
  return `${greeting} we have your request. Someone will reach out as soon as possible.

If there’s anything important we should know, you can reply here.`;
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
    '4': 'Just getting a quote',
    quote: 'Just getting a quote',
    estimate: 'Just getting a quote',
    'just getting a quote': 'Just getting a quote',
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

function parseContactLocation(input: string) {
  const text = normalizeWhitespace(input);
  if (!text) {
    return {
      callerName: null,
      contactName: null,
      location: null,
      zipCode: null,
    };
  }

  const delimitedMatch = text.match(/^(.+?)(?:\s*(?:,|;|-|–|—)\s*)(.+)$/);
  if (delimitedMatch) {
    const candidateName = cleanSegment(delimitedMatch[1] || '');
    const candidateLocation = cleanSegment(delimitedMatch[2] || '');

    if (looksLikeName(candidateName) && looksLikeLocation(candidateLocation)) {
      return {
        callerName: candidateName,
        contactName: candidateName,
        location: candidateLocation,
        zipCode: parseZip(candidateLocation),
      };
    }
  }

  const inMatch = text.match(/^(.+?)\s+\bin\b\s+(.+)$/i);
  if (inMatch) {
    const candidateName = cleanSegment(inMatch[1] || '');
    const candidateLocation = cleanSegment(inMatch[2] || '');

    if (looksLikeName(candidateName) && looksLikeLocation(candidateLocation)) {
      return {
        callerName: candidateName,
        contactName: candidateName,
        location: candidateLocation,
        zipCode: parseZip(candidateLocation),
      };
    }
  }

  if (looksLikeName(text)) {
    return {
      callerName: text,
      contactName: text,
      location: null,
      zipCode: null,
    };
  }

  return {
    callerName: null,
    contactName: null,
    location: text,
    zipCode: parseZip(text),
  };
}

function parseCallbackPreference(input: string) {
  const value = lower(input);
  if (!value) return null;

  const map: Record<string, { callbackRequested: boolean; bestTime: string | null }> = {
    '1': { callbackRequested: true, bestTime: 'ASAP' },
    asap: { callbackRequested: true, bestTime: 'ASAP' },
    urgent: { callbackRequested: true, bestTime: 'ASAP' },
    now: { callbackRequested: true, bestTime: 'ASAP' },
    soon: { callbackRequested: true, bestTime: 'ASAP' },
    anytime: { callbackRequested: true, bestTime: 'ASAP' },
    '2': { callbackRequested: true, bestTime: 'Morning' },
    morning: { callbackRequested: true, bestTime: 'Morning' },
    am: { callbackRequested: true, bestTime: 'Morning' },
    '3': { callbackRequested: true, bestTime: 'Afternoon' },
    afternoon: { callbackRequested: true, bestTime: 'Afternoon' },
    '4': { callbackRequested: true, bestTime: 'Evening' },
    evening: { callbackRequested: true, bestTime: 'Evening' },
    tonight: { callbackRequested: true, bestTime: 'Evening' },
    yes: { callbackRequested: true, bestTime: 'ASAP' },
    call: { callbackRequested: true, bestTime: 'ASAP' },
    'call me': { callbackRequested: true, bestTime: 'ASAP' },
    'please call': { callbackRequested: true, bestTime: 'ASAP' },
    no: { callbackRequested: false, bestTime: 'Text only' },
    'no callback': { callbackRequested: false, bestTime: 'Text only' },
    'text only': { callbackRequested: false, bestTime: 'Text only' },
  };

  if (map[value]) {
    return map[value];
  }

  if (value.length >= 2 && value.length <= 80) {
    return { callbackRequested: true, bestTime: normalizeText(input) };
  }

  return null;
}

export function advanceLeadConversation(
  lead: Pick<Lead, 'smsState' | 'callerName' | 'contactName'>,
  body: string,
  business: BusinessPromptConfig
): TransitionResult {
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
          responseText: `Please tell us what you need help with in a few words.

${getServicePrompt(business)}`,
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
          responseText: 'Please reply 1, 2, 3, or 4 for urgency.\n\n' + getUrgencyPrompt(),
        };
      }

      return {
        ok: true,
        nextState: SmsConversationState.AWAITING_ZIP,
        leadUpdates: { urgency },
        responseText: getContactLocationPrompt(),
        markQualified: true,
      };
    }

    case SmsConversationState.AWAITING_ZIP: {
      if (!text || text.length < 2 || text.length > 140) {
        return {
          ok: false,
          responseText: 'Please reply with your name and the city, ZIP, or service address if you can.',
        };
      }

      return {
        ok: true,
        nextState: SmsConversationState.AWAITING_BEST_TIME,
        leadUpdates: parseContactLocation(text),
        responseText: getBestTimePrompt(),
      };
    }

    case SmsConversationState.AWAITING_BEST_TIME: {
      const callback = parseCallbackPreference(text);
      if (!callback) {
        return {
          ok: false,
          responseText: 'Please reply 1, 2, 3, 4, or tell us the best callback time.',
        };
      }

      return {
        ok: true,
        nextState: SmsConversationState.COMPLETED,
        leadUpdates: { callbackRequested: callback.callbackRequested, bestTime: callback.bestTime },
        responseText: getCompletionPrompt(lead.callerName || lead.contactName),
        markQualified: true,
        notifyOwner: true,
        completed: true,
      };
    }

    case SmsConversationState.AWAITING_NAME: {
      const value = lower(text);
      const contactName = !text || ['skip', 'no', 'n/a', 'na'].includes(value) ? null : text;
      return {
        ok: true,
        nextState: SmsConversationState.COMPLETED,
        leadUpdates: { contactName, callerName: contactName },
        responseText: getCompletionPrompt(contactName),
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
