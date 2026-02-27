import twilio from 'twilio';

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

function parseBooleanFlag(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isTwilioSignatureValidationEnabled(env: Record<string, string | undefined> = process.env) {
  return parseBooleanFlag(env.TWILIO_VALIDATE_SIGNATURE);
}

export function hasValidTwilioWebhookToken(request: Request) {
  const expected = process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      if (!missingTokenWarningLogged) {
        missingTokenWarningLogged = true;
        logTwilioError('webhook-auth', 'missing_expected_token_production', {
          decision: 'reject',
          vercelEnv: process.env.VERCEL_ENV ?? null,
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

  const url = new URL(request.url);
  const queryToken = url.searchParams.get('webhook_token')?.trim();
  if (queryToken && queryToken === expected) {
    return true;
  }

  return false;
}

export function hasValidTwilioWebhookSignature(
  request: Request,
  params: Record<string, string>,
  env: Record<string, string | undefined> = process.env
) {
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    if (!missingSignatureConfigWarningLogged) {
      missingSignatureConfigWarningLogged = true;
      logTwilioError('webhook-auth', 'missing_twilio_auth_token_for_signature_validation', {
        decision: 'reject',
        nodeEnv: env.NODE_ENV ?? null,
        vercelEnv: env.VERCEL_ENV ?? null,
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

export function hasValidTwilioWebhookRequest(
  request: Request,
  params: Record<string, string>,
  env: Record<string, string | undefined> = process.env
) {
  if (!isTwilioSignatureValidationEnabled(env)) {
    return hasValidTwilioWebhookToken(request);
  }

  const signatureValid = hasValidTwilioWebhookSignature(request, params, env);
  if (signatureValid) return true;

  if (env.NODE_ENV !== 'production') {
    return hasValidTwilioWebhookToken(request);
  }

  return false;
}
