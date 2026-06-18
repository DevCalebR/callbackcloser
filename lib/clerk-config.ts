const CLERK_PREVIEW_FALLBACK_KEY = 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k';

export const DEFAULT_CLERK_SIGN_IN_URL = '/sign-in';
export const DEFAULT_CLERK_SIGN_UP_URL = '/sign-up';
export const DEFAULT_CLERK_AFTER_AUTH_URL = '/app';
export const DEFAULT_CLERK_AFTER_SIGN_OUT_URL = '/';

type EnvMap = Readonly<Record<string, string | undefined>>;

export function isLikelyValidClerkPublishableKey(value: string) {
  return /^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(value);
}

export function isLikelyValidClerkSecretKey(value: string) {
  return /^sk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(value);
}

function normalizeClerkRoute(rawValue: string | undefined, fallbackPath: string) {
  const value = rawValue?.trim();
  if (!value) return fallbackPath;
  if (value.startsWith('/') && !value.startsWith('//')) {
    return value.split('?')[0]?.split('#')[0] || fallbackPath;
  }

  try {
    const parsed = new URL(value);
    const normalized = parsed.pathname || fallbackPath;
    return normalized.startsWith('/') ? normalized : fallbackPath;
  } catch {
    return fallbackPath;
  }
}

export function getClerkAuthUrls(env: EnvMap = process.env) {
  return {
    signInUrl: normalizeClerkRoute(env.NEXT_PUBLIC_CLERK_SIGN_IN_URL, DEFAULT_CLERK_SIGN_IN_URL),
    signUpUrl: normalizeClerkRoute(env.NEXT_PUBLIC_CLERK_SIGN_UP_URL, DEFAULT_CLERK_SIGN_UP_URL),
  };
}

export function hasRequiredValidClerkEnv(env: EnvMap = process.env) {
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? '';
  const secretKey = env.CLERK_SECRET_KEY?.trim() ?? '';

  return Boolean(
    publishableKey &&
      secretKey &&
      isLikelyValidClerkPublishableKey(publishableKey) &&
      isLikelyValidClerkSecretKey(secretKey)
  );
}

export function canUseClerkClientComponents(env: EnvMap = process.env) {
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? '';
  if (!publishableKey || !isLikelyValidClerkPublishableKey(publishableKey)) {
    return false;
  }

  // Localhost cannot use the production Clerk frontend API origin, so prefer the
  // explicit auth-unavailable fallback instead of mounting broken widgets.
  if (env.NODE_ENV !== 'production' && publishableKey.startsWith('pk_live_')) {
    return false;
  }

  return true;
}

export function resolveClerkPublishableKey(env: EnvMap = process.env) {
  const configured = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? '';
  if (configured && !canUseClerkClientComponents(env)) {
    return CLERK_PREVIEW_FALLBACK_KEY;
  }

  if (configured && isLikelyValidClerkPublishableKey(configured)) {
    return configured;
  }

  const allowPreviewFallback = env.NODE_ENV !== 'production' || env.VERCEL_ENV === 'preview';
  if (allowPreviewFallback) {
    return CLERK_PREVIEW_FALLBACK_KEY;
  }

  return configured;
}

export function validateOptionalClerkRouteEnv(name: string, env: EnvMap = process.env) {
  const value = env[name]?.trim();
  if (!value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return null;

  try {
    new URL(value);
    return null;
  } catch {
    return `${name} must be a relative path like /sign-in or a valid absolute URL`;
  }
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

export function getClerkFrontendApiOrigin(env: EnvMap = process.env) {
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? '';
  const match = publishableKey.match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return null;

  try {
    const decoded = decodeBase64Url(match[1]).replace(/\$$/, '').trim();
    if (!decoded) return null;

    const withProtocol = decoded.startsWith('http://') || decoded.startsWith('https://')
      ? decoded
      : `https://${decoded}`;
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}
