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
      resolution,
    };
  }

  const parsed = new URL(resolution.appUrlResolved);
  return {
    baseUrl: resolution.appUrlResolved,
    baseOrigin: parsed.origin,
    sourceUsed: resolution.sourceUsed,
    resolution,
  };
}

function resolveRouteUrl(raw: string, fallbackPath: string, baseOrigin: string) {
  const candidate = raw.trim() || fallbackPath;
  if (candidate.startsWith('/')) {
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
    return { ok: false, resolved: null, reason: 'must be a relative path ("/sign-in") or absolute URL' };
  }
}

function redactWebhookToken(url: string) {
  const parsed = new URL(url);
  if (parsed.searchParams.has('webhook_token')) {
    parsed.searchParams.set('webhook_token', 'REDACTED');
  }
  return parsed.toString();
}

export function runClerkPreflight(env: EnvMap = process.env): ProviderPreflightCheck {
  const failures: string[] = [];
  const details: string[] = [];
  const fixes = [
    'Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in target env.',
    'Set NEXT_PUBLIC_CLERK_SIGN_IN_URL and NEXT_PUBLIC_CLERK_SIGN_UP_URL to relative app routes (/sign-in, /sign-up) or same-origin absolute URLs.',
    'In Clerk Dashboard, allow the app origin and redirect URLs derived from NEXT_PUBLIC_APP_URL.',
  ];

  const app = getAppUrlContext(env);
  if (!app.baseUrl || !app.baseOrigin) {
    failures.push('NEXT_PUBLIC_APP_URL (or Vercel fallback) is missing/invalid, so Clerk origin parity cannot be validated.');
  } else {
    details.push(`App base URL: ${app.baseUrl} (${app.sourceUsed ?? 'unknown source'})`);
  }

  const publishableKey = readEnv(env, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  const secretKey = readEnv(env, 'CLERK_SECRET_KEY');

  if (!publishableKey) {
    failures.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing.');
  } else if (!publishableKey.startsWith('pk_')) {
    failures.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with "pk_".');
  } else {
    details.push('Publishable key format: looks valid (pk_*)');
  }

  if (!secretKey) {
    failures.push('CLERK_SECRET_KEY is missing.');
  } else if (!secretKey.startsWith('sk_')) {
    failures.push('CLERK_SECRET_KEY must start with "sk_".');
  } else {
    details.push('Secret key format: looks valid (sk_*)');
  }

  if (app.baseOrigin) {
    const signIn = resolveRouteUrl(readEnv(env, 'NEXT_PUBLIC_CLERK_SIGN_IN_URL'), '/sign-in', app.baseOrigin);
    if (!signIn.ok) {
      failures.push(`NEXT_PUBLIC_CLERK_SIGN_IN_URL ${signIn.reason}.`);
    } else {
      details.push(`Sign-in URL resolves to: ${signIn.resolved}`);
    }

    const signUp = resolveRouteUrl(readEnv(env, 'NEXT_PUBLIC_CLERK_SIGN_UP_URL'), '/sign-up', app.baseOrigin);
    if (!signUp.ok) {
      failures.push(`NEXT_PUBLIC_CLERK_SIGN_UP_URL ${signUp.reason}.`);
    } else {
      details.push(`Sign-up URL resolves to: ${signUp.resolved}`);
    }
  }

  return buildCheck('clerk', 'Clerk URLs/origins consistency', failures, details, fixes);
}

export function runStripePreflight(env: EnvMap = process.env): ProviderPreflightCheck {
  const failures: string[] = [];
  const details: string[] = [];
  const fixes = [
    'Set STRIPE_WEBHOOK_SECRET from Stripe Dashboard -> Developers -> Webhooks.',
    'Set NEXT_PUBLIC_APP_URL to the public HTTPS app origin and ensure /api/stripe/webhook is deployed.',
    'In Stripe Dashboard, point webhook endpoint to <app-url>/api/stripe/webhook.',
  ];

  const app = getAppUrlContext(env);
  if (!app.baseUrl) {
    failures.push('NEXT_PUBLIC_APP_URL (or Vercel fallback) is missing/invalid.');
  }

  const stripeWebhookSecret = readEnv(env, 'STRIPE_WEBHOOK_SECRET');
  if (!stripeWebhookSecret) {
    failures.push('STRIPE_WEBHOOK_SECRET is missing.');
  } else if (!stripeWebhookSecret.startsWith('whsec_')) {
    failures.push('STRIPE_WEBHOOK_SECRET must start with "whsec_".');
  } else {
    details.push('Webhook secret format: looks valid (whsec_*)');
  }

  if (app.baseUrl) {
    const endpoint = new URL('/api/stripe/webhook', `${app.baseUrl}/`);
    details.push(`Expected Stripe webhook endpoint: ${endpoint.toString()}`);
    if (LOCAL_HOSTS.has(endpoint.hostname)) {
      failures.push('Stripe webhook endpoint hostname is local-only and not reachable from Stripe.');
    } else if (endpoint.protocol !== 'https:') {
      failures.push('Stripe webhook endpoint must use HTTPS.');
    } else {
      details.push('Reachability assumption: endpoint uses public HTTPS origin.');
    }
  }

  return buildCheck('stripe', 'Stripe webhook secret + endpoint assumptions', failures, details, fixes);
}

function normalizeUrlForCompare(rawUrl: string) {
  const parsed = new URL(rawUrl);
  parsed.hash = '';
  if (!parsed.searchParams.has('webhook_token')) {
    parsed.searchParams.sort();
    return parsed.toString().replace(/\/$/, '');
  }
  parsed.searchParams.sort();
  return parsed.toString().replace(/\/$/, '');
}

export function runTwilioPreflight(env: EnvMap = process.env): ProviderPreflightCheck {
  const failures: string[] = [];
  const details: string[] = [];
  const fixes = [
    'Set NEXT_PUBLIC_APP_URL to the exact public app origin used for Twilio webhooks.',
    'Set TWILIO_WEBHOOK_AUTH_TOKEN (used for tooling/local token-mode checks).',
    'Run npm run webhooks:print and compare each URL with Twilio Console number configuration.',
  ];

  const app = getAppUrlContext(env);
  const webhookToken = readEnv(env, 'TWILIO_WEBHOOK_AUTH_TOKEN');
  const signatureValidationEnabled = readBooleanEnv(env, 'TWILIO_VALIDATE_SIGNATURE');
  const productionLike = readEnv(env, 'NODE_ENV') === 'production' || readEnv(env, 'VERCEL_ENV') === 'production';

  if (!app.baseUrl) {
    failures.push('NEXT_PUBLIC_APP_URL (or Vercel fallback) is missing/invalid.');
    return buildCheck('twilio', 'Twilio webhook target parity', failures, details, fixes);
  }

  const voiceUrl = new URL('/api/twilio/voice', `${app.baseUrl}/`);
  const smsUrl = new URL('/api/twilio/sms', `${app.baseUrl}/`);
  const statusUrl = new URL('/api/twilio/status', `${app.baseUrl}/`);

  if (webhookToken) {
    voiceUrl.searchParams.set('webhook_token', webhookToken);
    smsUrl.searchParams.set('webhook_token', webhookToken);
    statusUrl.searchParams.set('webhook_token', webhookToken);
    details.push(`Expected voice webhook URL: ${redactWebhookToken(voiceUrl.toString())}`);
    details.push(`Expected SMS webhook URL: ${redactWebhookToken(smsUrl.toString())}`);
    details.push(`Expected status webhook URL: ${redactWebhookToken(statusUrl.toString())}`);
  } else {
    failures.push('TWILIO_WEBHOOK_AUTH_TOKEN is missing.');
  }

  const hostname = new URL(app.baseUrl).hostname;
  if (productionLike && LOCAL_HOSTS.has(hostname)) {
    failures.push('Production-like environment cannot use local-only app URLs for Twilio webhooks.');
  }

  if (signatureValidationEnabled && app.sourceUsed !== 'NEXT_PUBLIC_APP_URL') {
    failures.push('TWILIO_VALIDATE_SIGNATURE=true requires explicit NEXT_PUBLIC_APP_URL to avoid signature URL drift.');
  }

  const voiceConfigured = readEnv(env, 'TWILIO_WEBHOOK_VOICE_URL');
  const smsConfigured = readEnv(env, 'TWILIO_WEBHOOK_SMS_URL');
  const statusConfigured = readEnv(env, 'TWILIO_WEBHOOK_STATUS_URL');

  if (voiceConfigured) {
    try {
      const expected = normalizeUrlForCompare(voiceUrl.toString());
      const configured = normalizeUrlForCompare(voiceConfigured);
      if (expected !== configured) {
        failures.push('TWILIO_WEBHOOK_VOICE_URL does not match expected value derived from NEXT_PUBLIC_APP_URL.');
      } else {
        details.push('TWILIO_WEBHOOK_VOICE_URL parity: matched');
      }
    } catch {
      failures.push('TWILIO_WEBHOOK_VOICE_URL is not a valid URL.');
    }
  }

  if (smsConfigured) {
    try {
      const expected = normalizeUrlForCompare(smsUrl.toString());
      const configured = normalizeUrlForCompare(smsConfigured);
      if (expected !== configured) {
        failures.push('TWILIO_WEBHOOK_SMS_URL does not match expected value derived from NEXT_PUBLIC_APP_URL.');
      } else {
        details.push('TWILIO_WEBHOOK_SMS_URL parity: matched');
      }
    } catch {
      failures.push('TWILIO_WEBHOOK_SMS_URL is not a valid URL.');
    }
  }

  if (statusConfigured) {
    try {
      const expected = normalizeUrlForCompare(statusUrl.toString());
      const configured = normalizeUrlForCompare(statusConfigured);
      if (expected !== configured) {
        failures.push('TWILIO_WEBHOOK_STATUS_URL does not match expected value derived from NEXT_PUBLIC_APP_URL.');
      } else {
        details.push('TWILIO_WEBHOOK_STATUS_URL parity: matched');
      }
    } catch {
      failures.push('TWILIO_WEBHOOK_STATUS_URL is not a valid URL.');
    }
  }

  details.push('Parity assumption: Twilio Console webhooks should exactly match the expected URLs above.');

  return buildCheck('twilio', 'Twilio webhook target parity', failures, details, fixes);
}

export async function runDatabasePreflight(
  dbHealthCheck: () => Promise<void>
): Promise<ProviderPreflightCheck> {
  const details: string[] = [];
  const fixes = [
    'Verify DATABASE_URL and DIRECT_DATABASE_URL credentials/host/SSL settings.',
    'Ensure target Postgres is reachable from this runtime and run npm run db:smoke for deeper checks.',
  ];

  try {
    await dbHealthCheck();
    details.push('Database health query succeeded (SELECT 1).');
    return {
      id: 'database',
      title: 'Database connection health',
      status: 'PASS',
      details,
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

export async function runProviderPreflight(
  dbHealthCheck: () => Promise<void>,
  env: EnvMap = process.env
) {
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
