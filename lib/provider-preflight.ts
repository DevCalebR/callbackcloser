import { getClerkAuthUrls, isLikelyValidClerkPublishableKey, isLikelyValidClerkSecretKey } from './clerk-config.ts';
import { resolveConfiguredAppBaseUrl } from './app-url.ts';

export type ProviderPreflightStatus = 'PASS' | 'FAIL';

export type ProviderPreflightCheck = {
  id: 'clerk' | 'stripe' | 'twilio' | 'database';
  title: string;
  status: ProviderPreflightStatus;
  details: string[];
  fixes: string[];
};

type EnvMap = Readonly<Record<string, string | undefined>>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function readEnv(env: EnvMap, key: string) {
  return env[key]?.trim() ?? '';
}

function readBooleanEnv(env: EnvMap, key: string) {
  const value = readEnv(env, key).toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function buildCheck(
  id: ProviderPreflightCheck['id'],
  title: string,
  failures: string[],
  details: string[],
  fixes: string[]
): ProviderPreflightCheck {
  if (failures.length > 0) {
    return {
      id,
      title,
      status: 'FAIL',
      details: [...details, ...failures.map((failure) => `Failed: ${failure}`)],
      fixes,
    };
  }

  return {
    id,
    title,
    status: 'PASS',
    details,
    fixes: [],
  };
}

function getAppUrlContext(env: EnvMap) {
  const resolution = resolveConfiguredAppBaseUrl(env);
  if (!resolution.appUrlResolved) {
    return {
      baseUrl: null,
      baseOrigin: null,
      sourceUsed: resolution.sourceUsed,
    };
  }

  const parsed = new URL(resolution.appUrlResolved);
  return {
    baseUrl: resolution.appUrlResolved,
    baseOrigin: parsed.origin,
    sourceUsed: resolution.sourceUsed,
  };
}

function resolveRouteUrl(raw: string, fallbackPath: string, baseOrigin: string) {
  const candidate = raw.trim() || fallbackPath;
  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    return { ok: true, resolved: new URL(candidate, `${baseOrigin}/`).toString(), reason: null as string | null };
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.origin !== baseOrigin) {
      return {
        ok: false,
        resolved: null,
        reason: `must match app origin (${baseOrigin}); got ${parsed.origin}`,
      };
    }
    return { ok: true, resolved: parsed.toString(), reason: null as string | null };
  } catch {
    return { ok: false, resolved: null, reason: 'must be a relative path ("/sign-in") or absolute same-origin URL' };
  }
}

function redactWebhookToken(url: string) {
  const parsed = new URL(url);
  if (parsed.searchParams.has('webhook_token')) {
    parsed.searchParams.set('webhook_token', 'REDACTED');
  }
  return parsed.toString();
}

function normalizeUrlForCompare(rawUrl: string) {
  const parsed = new URL(rawUrl);
  parsed.hash = '';
  parsed.searchParams.sort();
  return parsed.toString().replace(/\/$/, '');
}

export function runClerkPreflight(env: EnvMap = process.env): ProviderPreflightCheck {
  const failures: string[] = [];
  const details: string[] = [];
  const fixes = [
    'Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in the target environment.',
    'Set NEXT_PUBLIC_CLERK_SIGN_IN_URL and NEXT_PUBLIC_CLERK_SIGN_UP_URL to /sign-in and /sign-up or same-origin absolute URLs.',
    'In Clerk Dashboard, allow callbackcloser.com and the sign-in/sign-up redirect URLs for the deployed environment.',
  ];

  const app = getAppUrlContext(env);
  const publishableKey = readEnv(env, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  const secretKey = readEnv(env, 'CLERK_SECRET_KEY');
  const { signInUrl, signUpUrl } = getClerkAuthUrls(env);

  if (!app.baseUrl || !app.baseOrigin) {
    failures.push('NEXT_PUBLIC_APP_URL (or Vercel fallback) is missing or invalid, so Clerk origin parity cannot be verified.');
  } else {
    details.push(`App base URL: ${app.baseUrl} (${app.sourceUsed ?? 'unknown source'})`);
  }

  if (!publishableKey) {
    failures.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing.');
  } else if (!isLikelyValidClerkPublishableKey(publishableKey)) {
    failures.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_.');
  } else {
    details.push('Publishable key format: looks valid (pk_*)');
  }

  if (!secretKey) {
    failures.push('CLERK_SECRET_KEY is missing.');
  } else if (!isLikelyValidClerkSecretKey(secretKey)) {
    failures.push('CLERK_SECRET_KEY must start with sk_.');
  } else {
    details.push('Secret key format: looks valid (sk_*)');
  }

  if (app.baseOrigin) {
    const signIn = resolveRouteUrl(readEnv(env, 'NEXT_PUBLIC_CLERK_SIGN_IN_URL'), signInUrl, app.baseOrigin);
    if (!signIn.ok) {
      failures.push(`NEXT_PUBLIC_CLERK_SIGN_IN_URL ${signIn.reason}.`);
    } else {
      details.push(`Sign-in URL resolves to: ${signIn.resolved}`);
    }

    const signUp = resolveRouteUrl(readEnv(env, 'NEXT_PUBLIC_CLERK_SIGN_UP_URL'), signUpUrl, app.baseOrigin);
    if (!signUp.ok) {
      failures.push(`NEXT_PUBLIC_CLERK_SIGN_UP_URL ${signUp.reason}.`);
    } else {
      details.push(`Sign-up URL resolves to: ${signUp.resolved}`);
    }
  }

  return buildCheck('clerk', 'Clerk keys and auth route parity', failures, details, fixes);
}

export function runStripePreflight(env: EnvMap = process.env): ProviderPreflightCheck {
  const failures: string[] = [];
  const details: string[] = [];
  const fixes = [
    'Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, and STRIPE_PRICE_PRO on Vercel.',
    'Point the Stripe webhook endpoint to https://<app-origin>/api/stripe/webhook.',
    'Use the Billing page to confirm checkout and portal flows after deployment.',
  ];

  const app = getAppUrlContext(env);
  const webhookSecret = readEnv(env, 'STRIPE_WEBHOOK_SECRET');

  if (!app.baseUrl) {
    failures.push('NEXT_PUBLIC_APP_URL (or Vercel fallback) is missing or invalid.');
  }

  if (!readEnv(env, 'STRIPE_SECRET_KEY')) {
    failures.push('STRIPE_SECRET_KEY is missing.');
  }

  if (!webhookSecret) {
    failures.push('STRIPE_WEBHOOK_SECRET is missing.');
  } else if (!webhookSecret.startsWith('whsec_')) {
    failures.push('STRIPE_WEBHOOK_SECRET must start with whsec_.');
  } else {
    details.push('Webhook secret format: looks valid (whsec_*)');
  }

  if (!readEnv(env, 'STRIPE_PRICE_STARTER')) {
    failures.push('STRIPE_PRICE_STARTER is missing.');
  }

  if (!readEnv(env, 'STRIPE_PRICE_PRO')) {
    failures.push('STRIPE_PRICE_PRO is missing.');
  }

  if (app.baseUrl) {
    const endpoint = new URL('/api/stripe/webhook', `${app.baseUrl}/`);
    details.push(`Expected Stripe webhook endpoint: ${endpoint.toString()}`);
    if (LOCAL_HOSTS.has(endpoint.hostname)) {
      failures.push('Stripe webhook endpoint hostname is local-only and not reachable from Stripe.');
    } else if (endpoint.protocol !== 'https:') {
      failures.push('Stripe webhook endpoint must use HTTPS.');
    }
  }

  return buildCheck('stripe', 'Stripe keys, prices, and webhook endpoint assumptions', failures, details, fixes);
}

export function runTwilioPreflight(env: EnvMap = process.env): ProviderPreflightCheck {
  const failures: string[] = [];
  const details: string[] = [];
  const fixes = [
    'Set NEXT_PUBLIC_APP_URL to the exact public origin used in Twilio webhook configuration.',
    'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WEBHOOK_AUTH_TOKEN, and TWILIO_VALIDATE_SIGNATURE=true in production.',
    'Run npm run webhooks:print and compare those URLs against Twilio Console.',
  ];

  const app = getAppUrlContext(env);
  const webhookToken = readEnv(env, 'TWILIO_WEBHOOK_AUTH_TOKEN');
  const signatureValidationEnabled = readBooleanEnv(env, 'TWILIO_VALIDATE_SIGNATURE');
  const productionLike = readEnv(env, 'NODE_ENV') === 'production' || readEnv(env, 'VERCEL_ENV') === 'production';

  if (!readEnv(env, 'TWILIO_ACCOUNT_SID')) {
    failures.push('TWILIO_ACCOUNT_SID is missing.');
  }

  if (!readEnv(env, 'TWILIO_AUTH_TOKEN')) {
    failures.push('TWILIO_AUTH_TOKEN is missing.');
  }

  if (!webhookToken) {
    failures.push('TWILIO_WEBHOOK_AUTH_TOKEN is missing.');
  }

  if (productionLike && !signatureValidationEnabled) {
    failures.push('TWILIO_VALIDATE_SIGNATURE must be true in production-like environments.');
  }

  if (!app.baseUrl) {
    failures.push('NEXT_PUBLIC_APP_URL (or Vercel fallback) is missing or invalid.');
    return buildCheck('twilio', 'Twilio webhook target parity', failures, details, fixes);
  }

  const voiceUrl = new URL('/api/twilio/voice', `${app.baseUrl}/`);
  const smsUrl = new URL('/api/twilio/sms', `${app.baseUrl}/`);
  const statusUrl = new URL('/api/twilio/status', `${app.baseUrl}/`);

  if (webhookToken) {
    voiceUrl.searchParams.set('webhook_token', webhookToken);
    smsUrl.searchParams.set('webhook_token', webhookToken);
    statusUrl.searchParams.set('webhook_token', webhookToken);
  }

  details.push(`Expected voice webhook URL: ${redactWebhookToken(voiceUrl.toString())}`);
  details.push(`Expected SMS webhook URL: ${redactWebhookToken(smsUrl.toString())}`);
  details.push(`Expected status webhook URL: ${redactWebhookToken(statusUrl.toString())}`);

  const hostname = new URL(app.baseUrl).hostname;
  if (productionLike && LOCAL_HOSTS.has(hostname)) {
    failures.push('Production-like environments cannot use local-only app URLs for Twilio webhooks.');
  }

  if (signatureValidationEnabled && app.sourceUsed !== 'NEXT_PUBLIC_APP_URL') {
    failures.push('TWILIO_VALIDATE_SIGNATURE=true should use an explicit NEXT_PUBLIC_APP_URL to avoid signature URL drift.');
  }

  const voiceConfigured = readEnv(env, 'TWILIO_WEBHOOK_VOICE_URL');
  const smsConfigured = readEnv(env, 'TWILIO_WEBHOOK_SMS_URL');
  const statusConfigured = readEnv(env, 'TWILIO_WEBHOOK_STATUS_URL');

  if (voiceConfigured) {
    try {
      if (normalizeUrlForCompare(voiceConfigured) !== normalizeUrlForCompare(voiceUrl.toString())) {
        failures.push('TWILIO_WEBHOOK_VOICE_URL does not match the expected voice webhook URL.');
      } else {
        details.push('TWILIO_WEBHOOK_VOICE_URL parity: matched');
      }
    } catch {
      failures.push('TWILIO_WEBHOOK_VOICE_URL is not a valid URL.');
    }
  }

  if (smsConfigured) {
    try {
      if (normalizeUrlForCompare(smsConfigured) !== normalizeUrlForCompare(smsUrl.toString())) {
        failures.push('TWILIO_WEBHOOK_SMS_URL does not match the expected SMS webhook URL.');
      } else {
        details.push('TWILIO_WEBHOOK_SMS_URL parity: matched');
      }
    } catch {
      failures.push('TWILIO_WEBHOOK_SMS_URL is not a valid URL.');
    }
  }

  if (statusConfigured) {
    try {
      if (normalizeUrlForCompare(statusConfigured) !== normalizeUrlForCompare(statusUrl.toString())) {
        failures.push('TWILIO_WEBHOOK_STATUS_URL does not match the expected status webhook URL.');
      } else {
        details.push('TWILIO_WEBHOOK_STATUS_URL parity: matched');
      }
    } catch {
      failures.push('TWILIO_WEBHOOK_STATUS_URL is not a valid URL.');
    }
  }

  return buildCheck('twilio', 'Twilio webhook target parity', failures, details, fixes);
}

export async function runDatabasePreflight(dbHealthCheck: () => Promise<void>): Promise<ProviderPreflightCheck> {
  const fixes = [
    'Verify DATABASE_URL and DIRECT_DATABASE_URL credentials, host, and sslmode=require settings.',
    'Confirm the deployed runtime can reach the target Postgres instance.',
  ];

  try {
    await dbHealthCheck();
    return {
      id: 'database',
      title: 'Database connection health',
      status: 'PASS',
      details: ['Database health query succeeded (SELECT 1).'],
      fixes: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'database',
      title: 'Database connection health',
      status: 'FAIL',
      details: [`Failed: ${message}`],
      fixes,
    };
  }
}

export async function runProviderPreflight(dbHealthCheck: () => Promise<void>, env: EnvMap = process.env) {
  const checks: ProviderPreflightCheck[] = [
    runClerkPreflight(env),
    runStripePreflight(env),
    runTwilioPreflight(env),
    await runDatabasePreflight(dbHealthCheck),
  ];
  const failed = checks.filter((check) => check.status === 'FAIL');

  return {
    checks,
    passed: failed.length === 0,
    failedCount: failed.length,
  };
}
