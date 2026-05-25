import { getClerkFrontendApiOrigin } from '@/lib/clerk-config';

type EnvMap = Readonly<Record<string, string | undefined>>;

function isProductionEnv(env: EnvMap) {
  return env.NODE_ENV === 'production';
}

function buildDirective(name: string, values: string[]) {
  return `${name} ${Array.from(new Set(values)).join(' ')}`;
}

function buildContentSecurityPolicy(env: EnvMap = process.env) {
  const clerkFrontendApiOrigin = getClerkFrontendApiOrigin(env);
  const clerkScriptOrigins = [
    "'self'",
    "'unsafe-inline'",
    'https://js.stripe.com',
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://challenges.cloudflare.com',
    ...(clerkFrontendApiOrigin ? [clerkFrontendApiOrigin] : []),
  ];
  const clerkConnectOrigins = [
    "'self'",
    'https://api.stripe.com',
    'https://checkout.stripe.com',
    'https://billing.stripe.com',
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    ...(clerkFrontendApiOrigin ? [clerkFrontendApiOrigin] : []),
  ];
  const clerkFrameOrigins = [
    "'self'",
    'https://js.stripe.com',
    'https://hooks.stripe.com',
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://challenges.cloudflare.com',
    ...(clerkFrontendApiOrigin ? [clerkFrontendApiOrigin] : []),
  ];
  const clerkFormOrigins = [
    "'self'",
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://checkout.stripe.com',
    'https://billing.stripe.com',
    ...(clerkFrontendApiOrigin ? [clerkFrontendApiOrigin] : []),
  ];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    buildDirective('form-action', clerkFormOrigins),
    buildDirective('script-src', clerkScriptOrigins),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: https://img.clerk.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    buildDirective('connect-src', clerkConnectOrigins),
    buildDirective('frame-src', clerkFrameOrigins),
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function getSecurityHeaders(env: EnvMap = process.env): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };

  if (isProductionEnv(env)) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
    headers['Content-Security-Policy'] = buildContentSecurityPolicy(env);
  }

  return headers;
}

export function withSecurityHeaders<T extends Response>(response: T, env: EnvMap = process.env) {
  const headers = getSecurityHeaders(env);
  Object.entries(headers).forEach(([name, value]) => {
    response.headers.set(name, value);
  });
  return response;
}
