type EnvMap = Readonly<Record<string, string | undefined>>;

function isProductionEnv(env: EnvMap) {
  return env.NODE_ENV === 'production';
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
