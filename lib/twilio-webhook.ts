import twilio from 'twilio';

import { getTwilioClient } from './twilio-client.ts';
import { logTwilioError, logTwilioWarn } from './twilio-logging.ts';

const DEFAULT_HEADER_NAMES = [
  'x-callbackcloser-webhook-token',
  'x-twilio-webhook-auth-token',
  'x-webhook-token',
  'authorization',
];

let missingTokenWarningLogged = false;
let missingSignatureConfigWarningLogged = false;
let missingSignatureHeaderWarningLogged = false;
let productionSignatureModeWarningLogged = false;
const missingSubaccountAuthTokenLogged = new Set<string>();

type TwilioWebhookValidationOptions = {
  env?: Record<string, string | undefined>;
  resolveSubaccountAuthToken?: (
    accountSid: string,
    env: Record<string, string | undefined>
  ) => Promise<string | null>;
};

const ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;
const twilioAuthTokenCache = new Map<string, string>();

function parseBooleanFlag(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isTwilioSignatureValidationEnabled(env: Record<string, string | undefined> = process.env) {
  return parseBooleanFlag(env.TWILIO_VALIDATE_SIGNATURE);
}

export function hasValidTwilioWebhookToken(
  request: Request,
  options: { env?: Record<string, string | undefined>; allowQueryParam?: boolean } = {}
) {
  const env = options.env ?? process.env;
  const allowQueryParam = options.allowQueryParam ?? env.NODE_ENV !== 'production';
  const expected = env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim();
  if (!expected) {
    if (env.NODE_ENV === 'production') {
      if (!missingTokenWarningLogged) {
        missingTokenWarningLogged = true;
        logTwilioError('webhook-auth', 'missing_expected_token_production', {
          decision: 'reject',
          vercelEnv: env.VERCEL_ENV ?? null,
        });
      }
      return false;
    }

    if (!missingTokenWarningLogged) {
      missingTokenWarningLogged = true;
      logTwilioWarn('webhook-auth', 'missing_expected_token_non_production', { decision: 'allow' });
    }
    return true;
  }

  for (const headerName of DEFAULT_HEADER_NAMES) {
    const raw = request.headers.get(headerName);
    if (!raw) continue;
    const value = raw.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : raw.trim();
    if (value === expected) return true;
  }

  if (allowQueryParam) {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('webhook_token')?.trim();
    if (queryToken && queryToken === expected) {
      return true;
    }
  }

  return false;
}

export function hasValidTwilioWebhookSignature(
  request: Request,
  params: Record<string, string>,
  authToken: string
) {
  if (!authToken) {
    if (!missingSignatureConfigWarningLogged) {
      missingSignatureConfigWarningLogged = true;
      logTwilioError('webhook-auth', 'missing_twilio_auth_token_for_signature_validation', {
        decision: 'reject',
        nodeEnv: process.env.NODE_ENV ?? null,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      });
    }
    return false;
  }

  const signature = request.headers.get('x-twilio-signature')?.trim();
  if (!signature) {
    if (!missingSignatureHeaderWarningLogged) {
      missingSignatureHeaderWarningLogged = true;
      logTwilioWarn('webhook-auth', 'missing_x_twilio_signature_header', { decision: 'reject' });
    }
    return false;
  }

  try {
    return twilio.validateRequest(authToken, signature, request.url, params);
  } catch (error) {
    logTwilioError('webhook-auth', 'signature_validation_exception', { decision: 'reject' }, error);
    return false;
  }
}

async function resolveTwilioSubaccountAuthToken(
  accountSid: string,
  env: Record<string, string | undefined>
) {
  const normalizedAccountSid = accountSid.trim();
  if (!ACCOUNT_SID_PATTERN.test(normalizedAccountSid)) {
    return null;
  }

  const cachedAuthToken = twilioAuthTokenCache.get(normalizedAccountSid);
  if (cachedAuthToken) {
    return cachedAuthToken;
  }

  try {
    const account = await getTwilioClient(env).api.v2010.accounts(normalizedAccountSid).fetch();
    const authToken = account.authToken?.trim() || null;

    if (!authToken) {
      if (!missingSubaccountAuthTokenLogged.has(normalizedAccountSid)) {
        missingSubaccountAuthTokenLogged.add(normalizedAccountSid);
        logTwilioError('webhook-auth', 'missing_subaccount_auth_token_for_signature_validation', {
          decision: 'reject',
          accountSid: normalizedAccountSid,
        });
      }
      return null;
    }

    twilioAuthTokenCache.set(normalizedAccountSid, authToken);
    return authToken;
  } catch (error) {
    logTwilioError(
      'webhook-auth',
      'subaccount_auth_token_lookup_failed',
      { decision: 'reject', accountSid: normalizedAccountSid },
      error
    );
    return null;
  }
}

async function resolveTwilioRequestAuthToken(
  params: Record<string, string>,
  env: Record<string, string | undefined>,
  resolveSubaccountAuthToken?: TwilioWebhookValidationOptions['resolveSubaccountAuthToken']
) {
  const requestAccountSid = params.AccountSid?.trim();
  const parentAccountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const parentAuthToken = env.TWILIO_AUTH_TOKEN?.trim() || null;

  if (!requestAccountSid || !parentAccountSid || requestAccountSid === parentAccountSid) {
    return parentAuthToken;
  }

  if (resolveSubaccountAuthToken) {
    return resolveSubaccountAuthToken(requestAccountSid, env);
  }

  return resolveTwilioSubaccountAuthToken(requestAccountSid, env);
}

export async function hasValidTwilioWebhookRequest(
  request: Request,
  params: Record<string, string>,
  options: TwilioWebhookValidationOptions = {}
) {
  const env = options.env ?? process.env;
  const signatureValidationEnabled = isTwilioSignatureValidationEnabled(env);

  if (env.NODE_ENV === 'production' && !signatureValidationEnabled) {
    if (!productionSignatureModeWarningLogged) {
      productionSignatureModeWarningLogged = true;
      logTwilioError('webhook-auth', 'production_requires_signature_validation', {
        decision: 'reject',
        nodeEnv: env.NODE_ENV ?? null,
        vercelEnv: env.VERCEL_ENV ?? null,
      });
    }
    return false;
  }

  if (!signatureValidationEnabled) {
    return hasValidTwilioWebhookToken(request, { env, allowQueryParam: true });
  }

  const authToken = await resolveTwilioRequestAuthToken(params, env, options.resolveSubaccountAuthToken);
  const signatureValid = authToken ? hasValidTwilioWebhookSignature(request, params, authToken) : false;
  if (signatureValid) return true;

  if (env.NODE_ENV !== 'production') {
    return hasValidTwilioWebhookToken(request, { env, allowQueryParam: true });
  }

  return false;
}
