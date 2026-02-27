type TwilioLogRoute = 'voice' | 'sms' | 'status' | 'messaging' | 'webhook-auth';
type TwilioLogLevel = 'info' | 'warn' | 'error';

type TwilioLogFields = Record<string, unknown>;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function write(level: TwilioLogLevel, route: TwilioLogRoute, event: string, fields: TwilioLogFields) {
  const payload = { route, event, ...fields };
  if (level === 'info') console.info(`twilio.${route}`, payload);
  if (level === 'warn') console.warn(`twilio.${route}`, payload);
  if (level === 'error') console.error(`twilio.${route}`, payload);
}

export function logTwilioInfo(route: TwilioLogRoute, event: string, fields: TwilioLogFields = {}) {
  write('info', route, event, fields);
}

export function logTwilioWarn(route: TwilioLogRoute, event: string, fields: TwilioLogFields = {}) {
  write('warn', route, event, fields);
}

export function logTwilioError(route: TwilioLogRoute, event: string, fields: TwilioLogFields = {}, error?: unknown) {
  write('error', route, event, error ? { ...fields, error: errorMessage(error) } : fields);
}
