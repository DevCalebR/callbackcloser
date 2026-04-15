import { parsePhoneNumberFromString } from 'libphonenumber-js';

type DefaultCountry = 'US';

export function normalizePhoneNumberToE164(value: string | null | undefined, defaultCountry: DefaultCountry = 'US') {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed?.isValid()) {
    return parsed.number;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  return '';
}

export function normalizePhoneNumber(value: string | null | undefined, defaultCountry: DefaultCountry = 'US') {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';

  const normalized = normalizePhoneNumberToE164(trimmed, defaultCountry);
  if (normalized) return normalized;

  return trimmed;
}

export function phoneNumbersEqual(left: string | null | undefined, right: string | null | undefined, defaultCountry: DefaultCountry = 'US') {
  const normalizedLeft = normalizePhoneNumberToE164(left, defaultCountry);
  const normalizedRight = normalizePhoneNumberToE164(right, defaultCountry);

  if (normalizedLeft && normalizedRight) {
    return normalizedLeft === normalizedRight;
  }

  return normalizePhoneNumber(left, defaultCountry) === normalizePhoneNumber(right, defaultCountry);
}

export function maskPhoneForAudit(value: string | null | undefined) {
  const normalized = normalizePhoneNumberToE164(value);
  if (!normalized) return null;
  return `${normalized.slice(0, 2)}***${normalized.slice(-4)}`;
}

export function formatPhoneForDisplay(value: string | null | undefined) {
  if (!value) return '-';
  try {
    const parsed = parsePhoneNumberFromString(value);
    if (parsed) return parsed.formatNational();
  } catch {
    // ignore parse failures; show raw value
  }
  return value;
}
