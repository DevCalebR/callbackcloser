export type TwilioWebhookConfigLite = {
  voiceUrl: string;
  smsUrl: string;
  statusUrl: string;
};

export type TwilioWebhookSyncOptions = {
  voice?: boolean;
  sms?: boolean;
  status?: boolean;
};

export function buildTwilioIncomingPhoneNumberWebhookUpdate(
  webhookConfig: TwilioWebhookConfigLite,
  options: TwilioWebhookSyncOptions = {}
) {
  const voice = options.voice ?? true;
  const sms = options.sms ?? true;
  const status = options.status ?? true;

  return {
    ...(voice
      ? {
          voiceUrl: webhookConfig.voiceUrl,
          voiceMethod: 'POST' as const,
        }
      : {}),
    ...(sms
      ? {
          smsUrl: webhookConfig.smsUrl,
          smsMethod: 'POST' as const,
        }
      : {}),
    ...(status
      ? {
          statusCallback: webhookConfig.statusUrl,
          statusCallbackMethod: 'POST' as const,
        }
      : {}),
  };
}
