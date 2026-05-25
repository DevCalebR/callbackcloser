import { maskPhoneForAudit } from '@/lib/phone';

const SECRET_KEY_PATTERN = /(token|secret|authorization|api[-_]?key|signature)/i;
const BODY_KEY_PATTERN = /(^body$|bodyPreview|messageBody|textBody)/i;
const PHONE_KEY_PATTERN = /(phone|from|to|destination)/i;
const SID_KEY_PATTERN = /sid/i;
const TWILIO_SID_PATTERN = /^[A-Z]{2}[0-9a-fA-F]{32}$/;

function maskSid(value: string) {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function redactEmbeddedSecrets(value: string) {
  return value
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]')
    .replace(/(Basic\s+)[A-Za-z0-9+/=]+/gi, '$1[redacted]')
    .replace(/([?&](?:token|webhook_token|auth|signature|api_key)=)[^&]+/gi, '$1[redacted]');
}

function sanitizeString(value: string, key: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (SECRET_KEY_PATTERN.test(key)) {
    return '[redacted]';
  }

  if (BODY_KEY_PATTERN.test(key)) {
    return `[redacted:${trimmed.length} chars]`;
  }

  if (SID_KEY_PATTERN.test(key) && TWILIO_SID_PATTERN.test(trimmed)) {
    return maskSid(trimmed);
  }

  if (PHONE_KEY_PATTERN.test(key)) {
    const maskedPhone = maskPhoneForAudit(trimmed);
    if (maskedPhone) return maskedPhone;
  }

  const redacted = redactEmbeddedSecrets(trimmed);
  return redacted.length > 240 ? `${redacted.slice(0, 239)}…` : redacted;
}

function sanitizeArray(values: unknown[], key: string, depth: number): unknown[] {
  if (depth >= 3) return ['[truncated]'];
  return values.slice(0, 12).map((value) => sanitizeLogValue(value, key, depth + 1));
}

function sanitizeObject(value: Record<string, unknown>, depth: number) {
  if (depth >= 3) return '[truncated]';

  const output: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value).slice(0, 24)) {
    output[entryKey] = sanitizeLogValue(entryValue, entryKey, depth + 1);
  }
  return output;
}

export function sanitizeLogValue(value: unknown, key = '', depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value, key);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return sanitizeArray(value, key, depth);
  if (typeof value === 'object') return sanitizeObject(value as Record<string, unknown>, depth);
  return String(value);
}

export function sanitizeLogFields(fields: Record<string, unknown>) {
  return sanitizeObject(fields, 0) as Record<string, unknown>;
}
