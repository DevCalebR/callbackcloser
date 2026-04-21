import { getConfiguredAppBaseUrl, resolveConfiguredAppBaseUrl } from '@/lib/env.server';
import { getTwilioClient, type TwilioClient } from '@/lib/twilio-client';
import { isTwilioSignatureValidationEnabled } from '@/lib/twilio-webhook';
import {
  buildTwilioIncomingPhoneNumberWebhookUpdate,
  type TwilioWebhookConfigLite,
  type TwilioWebhookSyncOptions,
} from '@/lib/twilio-webhook-update';

export type TwilioWebhookConfig = {
  appBaseUrl: string;
  voiceUrl: string;
  smsUrl: string;
  statusUrl: string;
};

export { getTwilioBusinessClient, getTwilioClient, getTwilioSubaccountClient } from '@/lib/twilio-client';
export type { TwilioClient } from '@/lib/twilio-client';

function buildConfiguredTwilioWebhookUrl(path: string) {
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
  const usesSharedWebhookToken = !isTwilioSignatureValidationEnabled();
  if (usesSharedWebhookToken && !webhookToken) {
    throw new Error('Missing TWILIO_WEBHOOK_AUTH_TOKEN');
  }

  const normalizedBaseUrl = parsed.toString().replace(/\/$/, '');
  const next = new URL(path, `${normalizedBaseUrl}/`);
  if (usesSharedWebhookToken && webhookToken) {
    next.searchParams.set('webhook_token', webhookToken);
  }

  return {
    appBaseUrl: normalizedBaseUrl,
    url: next.toString(),
  };
}

export function getTwilioWebhookConfig(): TwilioWebhookConfig {
  const voice = buildConfiguredTwilioWebhookUrl('/api/twilio/voice');
  const sms = buildConfiguredTwilioWebhookUrl('/api/twilio/sms');
  const status = buildConfiguredTwilioWebhookUrl('/api/twilio/status');

  return {
    appBaseUrl: voice.appBaseUrl,
    voiceUrl: voice.url,
    smsUrl: sms.url,
    statusUrl: status.url,
  };
}

export function getTwilioMessageStatusCallbackUrl() {
  return buildConfiguredTwilioWebhookUrl('/api/twilio/message-status').url;
}

export async function syncTwilioIncomingPhoneNumberWebhooks(
  phoneNumberSid: string,
  client: TwilioClient = getTwilioClient(),
  options: TwilioWebhookSyncOptions = {}
) {
  const webhookConfig = getTwilioWebhookConfig();
  const update = buildTwilioIncomingPhoneNumberWebhookUpdate(webhookConfig as TwilioWebhookConfigLite, options);

  if (Object.keys(update).length === 0) {
    throw new Error('At least one Twilio webhook target must be selected for sync.');
  }

  const number = await client.incomingPhoneNumbers(phoneNumberSid).update(update);

  console.info('Twilio webhook sync applied', {
    twilioAccountSid: client.accountSid,
    phoneNumberSid: number.sid,
    phoneNumber: number.phoneNumber,
    appBaseUrl: webhookConfig.appBaseUrl,
  });

  return { number, webhookConfig };
}

export { buildTwilioIncomingPhoneNumberWebhookUpdate };
export type { TwilioWebhookConfigLite, TwilioWebhookSyncOptions };
