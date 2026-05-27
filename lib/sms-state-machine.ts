import type { Lead } from '@prisma/client';
import { SmsConversationState } from '@prisma/client';

import {
  getMissedCallCallbackPrompt,
  getMissedCallCompletionPrompt,
  getMissedCallContactLocationPrompt,
  getMissedCallServicePrompt,
  getMissedCallUrgencyPrompt,
} from '@/lib/missed-call-copy';
import {
  parseCallbackPreference,
  parseContactLocation,
  parseUrgency,
} from '@/lib/missed-call-intake';

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

export function getServicePrompt(_business: BusinessPromptConfig) {
  return getMissedCallServicePrompt();
}

export function getUrgencyPrompt() {
  return getMissedCallUrgencyPrompt();
}

export function getContactLocationPrompt() {
  return getMissedCallContactLocationPrompt();
}

export function getBestTimePrompt() {
  return getMissedCallCallbackPrompt();
}

export function getCompletionPrompt(customerName?: string | null) {
  return getMissedCallCompletionPrompt(customerName);
}

function parseService(input: string, business: BusinessPromptConfig) {
  const trimmed = normalizeText(input);
  if (!trimmed) return null;

  if (trimmed === '1') return business.serviceLabel1;
  if (trimmed === '2') return business.serviceLabel2;
  if (trimmed === '3') return business.serviceLabel3;

  return trimmed;
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
