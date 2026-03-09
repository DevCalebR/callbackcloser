import twilio from 'twilio';

type EnvMap = Readonly<Record<string, string | undefined>>;

export type TwilioClient = ReturnType<typeof twilio>;

let twilioClientSingleton: TwilioClient | null = null;
const twilioSubaccountClientSingletons = new Map<string, TwilioClient>();

export function hasTwilioClientEnv(env: EnvMap = process.env) {
  return Boolean(env.TWILIO_ACCOUNT_SID?.trim() && env.TWILIO_AUTH_TOKEN?.trim());
}

export function getTwilioClient(env: EnvMap = process.env) {
  if (env === process.env && twilioClientSingleton) {
    return twilioClientSingleton;
  }

  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();

  if (!accountSid || !authToken) {
    throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  }

  const client = twilio(accountSid, authToken);
  if (env === process.env) {
    twilioClientSingleton = client;
  }

  return client;
}

export function getTwilioSubaccountClient(subaccountSid: string, env: EnvMap = process.env) {
  const normalizedSubaccountSid = subaccountSid.trim();
  if (!/^AC[0-9a-fA-F]{32}$/.test(normalizedSubaccountSid)) {
    throw new Error('Invalid Twilio subaccount SID');
  }

  if (env === process.env) {
    const existing = twilioSubaccountClientSingletons.get(normalizedSubaccountSid);
    if (existing) return existing;
  }

  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  }

  const client = twilio(accountSid, authToken, { accountSid: normalizedSubaccountSid });
  if (env === process.env) {
    twilioSubaccountClientSingletons.set(normalizedSubaccountSid, client);
  }

  return client;
}

export function getTwilioBusinessClient(subaccountSid: string | null | undefined, env: EnvMap = process.env) {
  if (subaccountSid?.trim()) {
    return getTwilioSubaccountClient(subaccountSid, env);
  }

  return getTwilioClient(env);
}
