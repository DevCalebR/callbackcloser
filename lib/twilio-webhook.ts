const DEFAULT_HEADER_NAMES = [
  'x-callbackcloser-webhook-token',
  'x-twilio-webhook-auth-token',
  'x-webhook-token',
  'authorization',
];

export function hasValidTwilioWebhookToken(request: Request) {
  const expected = process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim();
  if (!expected) {
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
