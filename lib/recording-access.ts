export type RecordingAccessReason =
  | 'ok'
  | 'unauthenticated'
  | 'wrong_business'
  | 'recording_unavailable';

// Twilio recording callbacks resolve to API URLs on these hosts.
export const TWILIO_RECORDING_HOST_ALLOWLIST = [
  'api.twilio.com',
  'api.us1.twilio.com',
  'api.ie1.twilio.com',
  'api.au1.twilio.com',
] as const;

export function resolveRecordingAccessReason(input: {
  requestUserId: string | null | undefined;
  businessOwnerClerkId: string | null | undefined;
  recordingUrl: string | null | undefined;
}): RecordingAccessReason {
  if (!input.requestUserId) return 'unauthenticated';
  if (!input.businessOwnerClerkId || input.businessOwnerClerkId !== input.requestUserId) {
    return 'wrong_business';
  }
  if (!input.recordingUrl) return 'recording_unavailable';
  return 'ok';
}

export function isAllowedTwilioRecordingUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  if (!TWILIO_RECORDING_HOST_ALLOWLIST.includes(hostname as (typeof TWILIO_RECORDING_HOST_ALLOWLIST)[number])) {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  return /\/Recordings\//i.test(url.pathname);
}

export function getTwilioRecordingMediaUrl(recordingUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(recordingUrl);
  } catch {
    return null;
  }

  if (!isAllowedTwilioRecordingUrl(parsed)) {
    return null;
  }

  const pathname = parsed.pathname;
  if (pathname.endsWith('.mp3') || pathname.endsWith('.wav')) {
    return parsed;
  }

  parsed.pathname = pathname.endsWith('.json') ? `${pathname.slice(0, -5)}.mp3` : `${pathname}.mp3`;
  return parsed;
}
