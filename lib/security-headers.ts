type EnvMap = Readonly<Record<string, string | undefined>>;

function isProductionEnv(env: EnvMap) {
  return env.NODE_ENV === 'production';
}

function buildContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self' https://*.clerk.com https://*.clerk.accounts.dev https://checkout.stripe.com https://billing.stripe.com",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.clerk.com https://*.clerk.accounts.dev",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://billing.stripe.com https://*.clerk.com https://*.clerk.accounts.dev",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.clerk.com https://*.clerk.accounts.dev",
    "media-src 'self' blob:",
    "manifest-src 'self'",
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
    headers['Content-Security-Policy'] = buildContentSecurityPolicy();
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
