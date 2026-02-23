import type { Lead } from '@prisma/client';
import { SmsConversationState } from '@prisma/client';

type LeadFieldUpdates = {
  serviceRequested?: string | null;
  serviceSelectionRaw?: string | null;
  urgency?: string | null;
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
  return `Thanks for calling. What do you need help with? Reply 1 for ${business.serviceLabel1}, 2 for ${business.serviceLabel2}, 3 for ${business.serviceLabel3}, or reply with a short description.`;
}

export function getUrgencyPrompt() {
  return 'How urgent is it? Reply 1 Emergency, 2 Today, 3 This week, 4 Quote.';
}

export function getZipPrompt() {
  return 'What is the job ZIP code?';
}

export function getBestTimePrompt() {
  return 'Best time for a callback? Reply morning, afternoon, or evening.';
}

export function getNamePrompt() {
  return 'Optional: what name should we ask for? Reply with your name or type skip.';
}

export function getCompletionPrompt() {
  return 'Thanks - we have your details and will reach out shortly.';
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

function parseBestTime(input: string) {
  const value = lower(input);
  const map: Record<string, string> = {
    '1': 'Morning',
    morning: 'Morning',
    am: 'Morning',
    '2': 'Afternoon',
    afternoon: 'Afternoon',
    pm: 'Afternoon',
    '3': 'Evening',
    evening: 'Evening',
    tonight: 'Evening',
  };
  return map[value] ?? null;
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
        leadUpdates: { serviceRequested: service, serviceSelectionRaw: text || service },
        responseText: getUrgencyPrompt(),
        markQualified: true,
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
      };
    }

    case SmsConversationState.AWAITING_ZIP: {
      const zipCode = parseZip(text);
      if (!zipCode) {
        return {
          ok: false,
          responseText: 'Please reply with a valid ZIP/postal code.',
        };
      }
      return {
        ok: true,
        nextState: SmsConversationState.AWAITING_BEST_TIME,
        leadUpdates: { zipCode },
        responseText: getBestTimePrompt(),
        notifyOwner: true,
      };
    }

    case SmsConversationState.AWAITING_BEST_TIME: {
      const bestTime = parseBestTime(text);
      if (!bestTime) {
        return {
          ok: false,
          responseText: 'Please reply morning, afternoon, or evening.',
        };
      }
      return {
        ok: true,
        nextState: SmsConversationState.AWAITING_NAME,
        leadUpdates: { bestTime },
        responseText: getNamePrompt(),
      };
    }

    case SmsConversationState.AWAITING_NAME: {
      const value = lower(text);
      const contactName = !text || ['skip', 'no', 'n/a', 'na'].includes(value) ? null : text;
      return {
        ok: true,
        nextState: SmsConversationState.COMPLETED,
        leadUpdates: { contactName },
        responseText: getCompletionPrompt(),
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
