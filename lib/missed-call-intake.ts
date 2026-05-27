export type ParsedContactLocation = {
  callerName: string | null;
  contactName: string | null;
  location: string | null;
  zipCode: string | null;
};

export type ParsedCallbackPreference = {
  callbackRequested: boolean;
  bestTime: string | null;
};

function normalizeText(text: string) {
  return text.trim();
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function lower(text: string) {
  return normalizeText(text).toLowerCase();
}

function cleanSegment(value: string) {
  return value.replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').trim();
}

function looksLikeName(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed || /\d/.test(trimmed)) return false;

  const tokens = trimmed.split(' ');
  if (tokens.length < 1 || tokens.length > 4) return false;

  return tokens.every((token) => /^[A-Za-z][A-Za-z'.-]*$/.test(token));
}

function looksLikeLocation(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return false;

  if (/\d{5}(?:-\d{4})?/.test(trimmed) || /\d/.test(trimmed)) return true;
  if (/\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|way|hwy|highway|suite|ste|apt|unit)\b/i.test(trimmed)) {
    return true;
  }

  return trimmed.length >= 3;
}

export function parseZip(input: string) {
  const trimmed = normalizeText(input);
  if (!trimmed) return null;
  if (/^\d{5}(?:-\d{4})?$/.test(trimmed)) return trimmed;
  if (/^[A-Za-z0-9\- ]{3,10}$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

export function parseUrgency(input: string) {
  const value = lower(input);
  const map: Record<string, string> = {
    '1': 'Emergency',
    emergency: 'Emergency',
    urgent: 'Emergency',
    '2': 'Today',
    today: 'Today',
    asap: 'Today',
    now: 'Today',
    '3': 'This week',
    week: 'This week',
    'this week': 'This week',
    '4': 'Just getting a quote',
    quote: 'Just getting a quote',
    estimate: 'Just getting a quote',
    'just getting a quote': 'Just getting a quote',
  };

  return map[value] ?? null;
}

export function parseContactLocation(input: string): ParsedContactLocation {
  const text = normalizeWhitespace(input);
  if (!text) {
    return {
      callerName: null,
      contactName: null,
      location: null,
      zipCode: null,
    };
  }

  const delimitedMatch = text.match(/^(.+?)(?:\s*(?:,|;|-|–|—)\s*)(.+)$/);
  if (delimitedMatch) {
    const candidateName = cleanSegment(delimitedMatch[1] || '');
    const candidateLocation = cleanSegment(delimitedMatch[2] || '');

    if (looksLikeName(candidateName) && looksLikeLocation(candidateLocation)) {
      return {
        callerName: candidateName,
        contactName: candidateName,
        location: candidateLocation,
        zipCode: parseZip(candidateLocation),
      };
    }
  }

  const inMatch = text.match(/^(.+?)\s+\bin\b\s+(.+)$/i);
  if (inMatch) {
    const candidateName = cleanSegment(inMatch[1] || '');
    const candidateLocation = cleanSegment(inMatch[2] || '');

    if (looksLikeName(candidateName) && looksLikeLocation(candidateLocation)) {
      return {
        callerName: candidateName,
        contactName: candidateName,
        location: candidateLocation,
        zipCode: parseZip(candidateLocation),
      };
    }
  }

  if (looksLikeName(text)) {
    return {
      callerName: text,
      contactName: text,
      location: null,
      zipCode: null,
    };
  }

  return {
    callerName: null,
    contactName: null,
    location: text,
    zipCode: parseZip(text),
  };
}

export function parseCallbackPreference(input: string): ParsedCallbackPreference | null {
  const value = lower(input);
  if (!value) return null;

  const map: Record<string, ParsedCallbackPreference> = {
    '1': { callbackRequested: true, bestTime: 'ASAP' },
    asap: { callbackRequested: true, bestTime: 'ASAP' },
    urgent: { callbackRequested: true, bestTime: 'ASAP' },
    now: { callbackRequested: true, bestTime: 'ASAP' },
    soon: { callbackRequested: true, bestTime: 'ASAP' },
    anytime: { callbackRequested: true, bestTime: 'ASAP' },
    '2': { callbackRequested: true, bestTime: 'Morning' },
    morning: { callbackRequested: true, bestTime: 'Morning' },
    am: { callbackRequested: true, bestTime: 'Morning' },
    '3': { callbackRequested: true, bestTime: 'Afternoon' },
    afternoon: { callbackRequested: true, bestTime: 'Afternoon' },
    '4': { callbackRequested: true, bestTime: 'Evening' },
    evening: { callbackRequested: true, bestTime: 'Evening' },
    tonight: { callbackRequested: true, bestTime: 'Evening' },
    yes: { callbackRequested: true, bestTime: 'ASAP' },
    call: { callbackRequested: true, bestTime: 'ASAP' },
    'call me': { callbackRequested: true, bestTime: 'ASAP' },
    'please call': { callbackRequested: true, bestTime: 'ASAP' },
    no: { callbackRequested: false, bestTime: 'Text only' },
    'no callback': { callbackRequested: false, bestTime: 'Text only' },
    'text only': { callbackRequested: false, bestTime: 'Text only' },
  };

  if (map[value]) {
    return map[value];
  }

  if (value.length >= 2 && value.length <= 80) {
    return { callbackRequested: true, bestTime: normalizeText(input) };
  }

  return null;
}

export function normalizeServiceNeed(input: string) {
  const text = normalizeWhitespace(input);
  if (!text) return null;

  const value = text.toLowerCase();
  if (value === '1' || value.includes('repair')) return 'Repair';
  if (value === '2' || value.includes('install')) return 'Installation';
  if (value.includes('estimate') || value.includes('quote')) return 'Estimate';
  if (value.includes('emergency')) return 'Emergency';

  return text;
}

export function normalizePublicSimulatorPhone(input: string) {
  const digits = input.replace(/\D/g, '');
  if (!digits) return 'Private demo caller';
  const lastFour = digits.slice(-4).padStart(4, '0');
  return `(***) ***-${lastFour}`;
}
