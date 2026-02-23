import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhoneNumber(value: string | null | undefined, defaultCountry: 'US' = 'US') {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed?.isValid()) {
    return parsed.number;
  }

  if (trimmed.startsWith('+')) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  return trimmed;
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
