import twilio from 'twilio';

import { getConfiguredAppBaseUrl, resolveConfiguredAppBaseUrl } from '@/lib/env.server';

let twilioClient: ReturnType<typeof twilio> | null = null;

export type TwilioWebhookConfig = {
  appBaseUrl: string;
  voiceUrl: string;
  smsUrl: string;
  statusUrl: string;
};

export function getTwilioClient() {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  }

  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
}

export function getTwilioWebhookConfig(): TwilioWebhookConfig {
  const appBaseUrl = getConfiguredAppBaseUrl();
  if (!appBaseUrl) {
    const resolution = resolveConfiguredAppBaseUrl();
    const state = resolution.nextPublicAppUrlState === 'missing' ? 'missing' : 'invalid';
    throw new Error(
      `Missing Twilio webhook app URL: NEXT_PUBLIC_APP_URL is ${state} and no Vercel fallback URL is available. ` +
        'Set NEXT_PUBLIC_APP_URL to an absolute https URL (for example https://callbackcloser.com).'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(appBaseUrl);
  } catch {
    throw new Error('Configured app URL must be a valid absolute URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Configured app URL must use https:// for Twilio webhooks');
  }

  const webhookToken = process.env.TWILIO_WEBHOOK_AUTH_TOKEN?.trim();
  if (!webhookToken) {
    throw new Error('Missing TWILIO_WEBHOOK_AUTH_TOKEN');
  }

  const normalizedBaseUrl = parsed.toString().replace(/\/$/, '');
  const buildUrl = (path: string) => {
    const next = new URL(path, `${normalizedBaseUrl}/`);
    next.searchParams.set('webhook_token', webhookToken);
    return next.toString();
  };

  return {
    appBaseUrl: normalizedBaseUrl,
    voiceUrl: buildUrl('/api/twilio/voice'),
    smsUrl: buildUrl('/api/twilio/sms'),
    statusUrl: buildUrl('/api/twilio/status'),
  };
}

export async function syncTwilioIncomingPhoneNumberWebhooks(phoneNumberSid: string) {
  const client = getTwilioClient();
  const webhookConfig = getTwilioWebhookConfig();

  const number = await client.incomingPhoneNumbers(phoneNumberSid).update({
    voiceUrl: webhookConfig.voiceUrl,
    voiceMethod: 'POST',
    smsUrl: webhookConfig.smsUrl,
    smsMethod: 'POST',
    statusCallback: webhookConfig.statusUrl,
    statusCallbackMethod: 'POST',
  });

  console.info('Twilio webhook sync applied', {
    phoneNumberSid: number.sid,
    phoneNumber: number.phoneNumber,
    appBaseUrl: webhookConfig.appBaseUrl,
  });

  return { number, webhookConfig };
}
