export type AppUrlSourceUsed = 'NEXT_PUBLIC_APP_URL' | 'VERCEL_URL' | 'VERCEL_PROJECT_PRODUCTION_URL';
type VercelFallbackSource = Exclude<AppUrlSourceUsed, 'NEXT_PUBLIC_APP_URL'>;

export type AppUrlResolution = {
  appUrlResolved: string | null;
  sourceUsed: AppUrlSourceUsed | null;
  usedFallback: boolean;
  nextPublicAppUrlState: 'valid' | 'missing' | 'invalid';
};

type EnvMap = Readonly<Record<string, string | undefined>>;

export function inferVercelEnvLabel(env: EnvMap = process.env) {
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === 'production') return 'Production';
  if (vercelEnv === 'preview') return 'Preview';
  if (vercelEnv === 'development') return 'Development';
  return env.NODE_ENV === 'production' ? 'Production or Preview' : 'Development';
}

function normalizeParsedUrl(parsed: URL) {
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
}

function tryParseAbsoluteUrl(rawValue: string | undefined, { requireHttps }: { requireHttps: boolean }): string | null {
  const raw = rawValue?.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (requireHttps && parsed.protocol !== 'https:') {
      return null;
    }
    return normalizeParsedUrl(parsed);
  } catch {
    return null;
  }
}

function getVercelFallbackSourceOrder(env: EnvMap = process.env): VercelFallbackSource[] {
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === 'production') {
    return ['VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'];
  }
  return ['VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL'];
}

function tryResolveVercelSystemUrl(source: VercelFallbackSource, env: EnvMap) {
  const raw = env[source]?.trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return tryParseAbsoluteUrl(withProtocol, { requireHttps: true });
}

export function resolveConfiguredAppBaseUrl(env: EnvMap = process.env): AppUrlResolution {
  const requireHttps = env.NODE_ENV === 'production';
  const fromPrimary = tryParseAbsoluteUrl(env.NEXT_PUBLIC_APP_URL, { requireHttps });
  if (fromPrimary) {
    return {
      appUrlResolved: fromPrimary,
      sourceUsed: 'NEXT_PUBLIC_APP_URL',
      usedFallback: false,
      nextPublicAppUrlState: 'valid',
    };
  }

  const nextPublicAppUrlState = env.NEXT_PUBLIC_APP_URL?.trim() ? 'invalid' : 'missing';
  for (const source of getVercelFallbackSourceOrder(env)) {
    const fallback = tryResolveVercelSystemUrl(source, env);
    if (fallback) {
      return {
        appUrlResolved: fallback,
        sourceUsed: source,
        usedFallback: true,
        nextPublicAppUrlState,
      };
    }
  }

  return {
    appUrlResolved: null,
    sourceUsed: null,
    usedFallback: false,
    nextPublicAppUrlState,
  };
}

export function buildNextPublicAppUrlErrorMessage(
  resolution: AppUrlResolution,
  env: EnvMap = process.env
) {
  const likelyEnv = inferVercelEnvLabel(env);
  const stateMsg =
    resolution.nextPublicAppUrlState === 'missing'
      ? 'is missing'
      : 'is invalid (it must be a valid absolute URL and include https:// in production)';

  return (
    `Invalid environment configuration: NEXT_PUBLIC_APP_URL ${stateMsg} and no Vercel fallback URL is available.\n` +
    `Set NEXT_PUBLIC_APP_URL in Vercel -> Project Settings -> Environment Variables -> ${likelyEnv}.\n` +
    'Example value: https://callbackcloser.com\n' +
    'Fallbacks checked: VERCEL_URL and VERCEL_PROJECT_PRODUCTION_URL.'
  );
}
