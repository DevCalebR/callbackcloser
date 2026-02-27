import { db } from './db.ts';
import { normalizePhoneNumber } from './phone.ts';

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_KEYWORDS = new Set(['START', 'YES', 'UNSTOP']);
const HELP_KEYWORDS = new Set(['HELP']);

export type SmsComplianceCommand = 'STOP' | 'START' | 'HELP';

type PersistSmsConsentParams = {
  businessId: string;
  phoneNormalized: string;
  phoneRawLastSeen: string;
  command: 'STOP' | 'START';
  messageSid?: string | null;
  now?: Date;
};

type PersistSmsConsentFn = (params: PersistSmsConsentParams) => Promise<void>;

export function normalizeSmsComplianceKeyword(body: string) {
  const token = body.trim().split(/\s+/, 1)[0] ?? '';
  return token.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function classifySmsComplianceCommand(body: string): SmsComplianceCommand | null {
  const keyword = normalizeSmsComplianceKeyword(body);
  if (!keyword) return null;
  if (STOP_KEYWORDS.has(keyword)) return 'STOP';
  if (START_KEYWORDS.has(keyword)) return 'START';
  if (HELP_KEYWORDS.has(keyword)) return 'HELP';
  return null;
}

export function buildSmsComplianceReply(command: SmsComplianceCommand, appName = 'CallbackCloser') {
  if (command === 'STOP') {
    return `${appName}: You are unsubscribed and will no longer receive messages. Reply START to opt back in.`;
  }

  if (command === 'START') {
    return `${appName}: You are opted back in. Reply HELP for help or STOP to opt out.`;
  }

  return `${appName}: Missed-call follow-up texts for your service request. Reply STOP to opt out or START to opt back in.`;
}

export async function persistSmsConsentPreference(params: PersistSmsConsentParams) {
  const at = params.now ?? new Date();
  const optedOut = params.command === 'STOP';

  await db.smsConsent.upsert({
    where: {
      businessId_phoneNormalized: {
        businessId: params.businessId,
        phoneNormalized: params.phoneNormalized,
      },
    },
    create: {
      businessId: params.businessId,
      phoneNormalized: params.phoneNormalized,
      phoneRawLastSeen: params.phoneRawLastSeen,
      optedOut,
      optedOutAt: optedOut ? at : null,
      optedInAt: optedOut ? null : at,
      lastKeyword: params.command,
      lastMessageSid: params.messageSid ?? null,
    },
    update: {
      phoneRawLastSeen: params.phoneRawLastSeen,
      optedOut,
      optedOutAt: optedOut ? at : null,
      optedInAt: optedOut ? null : at,
      lastKeyword: params.command,
      lastMessageSid: params.messageSid ?? undefined,
    },
  });
}

export async function isSmsRecipientOptedOut(params: { businessId: string; phone: string }) {
  const phoneNormalized = normalizePhoneNumber(params.phone) || params.phone.trim();
  if (!phoneNormalized) return false;

  const consent = await db.smsConsent.findUnique({
    where: {
      businessId_phoneNormalized: {
        businessId: params.businessId,
        phoneNormalized,
      },
    },
    select: { optedOut: true },
  });

  return Boolean(consent?.optedOut);
}

export type SmsComplianceHandlingResult =
  | {
      handled: false;
      command: null;
      replyText: null;
      stateChange: null;
    }
  | {
      handled: true;
      command: SmsComplianceCommand;
      replyText: string;
      stateChange: 'opted_out' | 'opted_in' | 'help_only';
    };

export async function handleInboundSmsComplianceCommand(params: {
  businessId: string;
  fromPhone: string;
  body: string;
  messageSid?: string | null;
  appName?: string;
  now?: Date;
  persistPreference?: PersistSmsConsentFn;
}): Promise<SmsComplianceHandlingResult> {
  const command = classifySmsComplianceCommand(params.body);
  if (!command) {
    return { handled: false, command: null, replyText: null, stateChange: null };
  }

  const replyText = buildSmsComplianceReply(command, params.appName);
  if (command === 'HELP') {
    return { handled: true, command, replyText, stateChange: 'help_only' };
  }

  const phoneNormalized = normalizePhoneNumber(params.fromPhone) || params.fromPhone.trim();
  if (phoneNormalized) {
    const persist = params.persistPreference ?? persistSmsConsentPreference;
    await persist({
      businessId: params.businessId,
      phoneNormalized,
      phoneRawLastSeen: params.fromPhone,
      command,
      messageSid: params.messageSid ?? null,
      now: params.now,
    });
  }

  return {
    handled: true,
    command,
    replyText,
    stateChange: command === 'STOP' ? 'opted_out' : 'opted_in',
  };
}
