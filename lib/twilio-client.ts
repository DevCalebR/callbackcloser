import twilio from 'twilio';

type EnvMap = Readonly<Record<string, string | undefined>>;

let twilioClientSingleton: ReturnType<typeof twilio> | null = null;

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
