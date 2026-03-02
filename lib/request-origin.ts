type HeaderGetter = {
  headers: Pick<Headers, 'get'>;
};

function parseOrigin(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function parseOriginFromReferer(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function isAllowedRequestOrigin(request: HeaderGetter, appBaseUrl: string | null | undefined) {
  const expectedOrigin = parseOrigin(appBaseUrl);
  if (!expectedOrigin) return true;

  const originHeader = parseOrigin(request.headers.get('origin'));
  if (originHeader) {
    return originHeader === expectedOrigin;
  }

  const refererOrigin = parseOriginFromReferer(request.headers.get('referer'));
  if (refererOrigin) {
    return refererOrigin === expectedOrigin;
  }

  // If no origin/referrer is provided, do not hard-fail to avoid blocking non-browser clients.
  return true;
}
