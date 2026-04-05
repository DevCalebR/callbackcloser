export type LiveSmokeReadinessInput = {
  demoModeEnabled: boolean;
  hasForwardingNumber: boolean;
  hasNotifyPhone: boolean;
  ownerNotifyPhoneOptedOut: boolean;
  hasActiveSubscription: boolean;
  conversationLimitReached?: boolean;
  usageSummary?: string;
  hasTwilioNumber: boolean;
  hasTwilioNumberSid: boolean;
  hasWebhookConfig: boolean;
  hasWebhookSync: boolean;
  hasTwilioAccountAccess: boolean;
  canVerifyAssignedTwilioNumber: boolean;
  hasAssignedTwilioNumberInAccount: boolean;
  webhookAppBaseUrl?: string;
  webhookConfigError?: string;
  twilioAccountLookupError?: string;
};

export type LiveSmokeCheck = {
  key:
    | 'demo_mode'
    | 'webhook_config'
    | 'twilio_account'
    | 'twilio_number'
    | 'webhook_sync'
    | 'forwarding_number'
    | 'owner_notify_phone'
    | 'billing'
    | 'conversation_capacity';
  label: string;
  ready: boolean;
  detail: string;
  blocking: boolean;
};

function getWebhookConfigDetail(input: LiveSmokeReadinessInput, ready: boolean) {
  if (ready) {
    return input.webhookAppBaseUrl
      ? `Webhook URLs are ready for ${input.webhookAppBaseUrl}.`
      : 'Webhook URLs can be generated for the current app URL.';
  }

  const error = input.webhookConfigError || '';
  if (error.includes('NEXT_PUBLIC_APP_URL')) {
    return 'Webhook URLs are not ready because the public app URL is missing or invalid.';
  }
  if (error.includes('https://')) {
    return 'Webhook URLs are not ready because the public app URL must use https://.';
  }
  if (error.includes('TWILIO_WEBHOOK_AUTH_TOKEN')) {
    return 'Webhook URLs are not ready because the Twilio webhook token is missing.';
  }
  return 'Webhook URLs are not ready. Check the public app URL and Twilio webhook configuration.';
}

function getTwilioAccountDetail(input: LiveSmokeReadinessInput, ready: boolean) {
  if (ready) {
    return 'Twilio account lookup succeeded in this environment.';
  }

  const error = input.twilioAccountLookupError || '';
  if (error.includes('TWILIO_ACCOUNT_SID') || error.includes('TWILIO_AUTH_TOKEN')) {
    return 'Twilio account lookup failed. Check the configured account SID and auth token.';
  }
  return 'Twilio account lookup failed. Check Twilio credentials and refresh before the live smoke test.';
}

function getTwilioNumberDetail(input: LiveSmokeReadinessInput, ready: boolean) {
  if (ready) {
    return 'An assigned Twilio number with a stored SID is available for inbound calls and SMS.';
  }

  if (!input.hasTwilioNumber || !input.hasTwilioNumberSid) {
    return 'Connect or buy a Twilio number and store its SID before the live smoke test.';
  }

  if (input.canVerifyAssignedTwilioNumber && !input.hasAssignedTwilioNumberInAccount) {
    return 'The assigned Twilio number SID was not found in the current Twilio account list. Reconnect or re-sync before testing.';
  }

  return 'Assigned Twilio number could not be verified yet because Twilio account access is failing.';
}

export function getLiveSmokeReadiness(input: LiveSmokeReadinessInput) {
  const checks: LiveSmokeCheck[] = [
    {
      key: 'demo_mode',
      label: 'Real runtime',
      ready: !input.demoModeEnabled,
      detail: input.demoModeEnabled
        ? 'Portfolio demo mode is enabled. Turn it off before running a real live smoke test.'
        : 'Portfolio demo mode is off, so this screen reflects the real business setup.',
      blocking: true,
    },
    {
      key: 'webhook_config',
      label: 'Webhook URL config',
      ready: input.hasWebhookConfig,
      detail: getWebhookConfigDetail(input, input.hasWebhookConfig),
      blocking: true,
    },
    {
      key: 'twilio_account',
      label: 'Twilio account access',
      ready: input.hasTwilioAccountAccess,
      detail: getTwilioAccountDetail(input, input.hasTwilioAccountAccess),
      blocking: true,
    },
    {
      key: 'twilio_number',
      label: 'Twilio number assignment',
      ready:
        input.hasTwilioNumber &&
        input.hasTwilioNumberSid &&
        (!input.canVerifyAssignedTwilioNumber || input.hasAssignedTwilioNumberInAccount),
      detail: getTwilioNumberDetail(
        input,
        input.hasTwilioNumber &&
          input.hasTwilioNumberSid &&
          (!input.canVerifyAssignedTwilioNumber || input.hasAssignedTwilioNumberInAccount)
      ),
      blocking: true,
    },
    {
      key: 'webhook_sync',
      label: 'Webhook sync',
      ready: input.hasTwilioNumberSid && input.hasWebhookConfig && input.hasWebhookSync,
      detail:
        input.hasTwilioNumberSid && input.hasWebhookConfig && input.hasWebhookSync
          ? 'The assigned Twilio number has a recorded webhook sync timestamp.'
          : 'Re-sync webhooks so the assigned number points at the current public app URL before testing.',
      blocking: true,
    },
    {
      key: 'forwarding_number',
      label: 'Forwarding number',
      ready: input.hasForwardingNumber,
      detail: input.hasForwardingNumber
        ? 'Inbound calls have a forwarding target for the live ring-through step.'
        : 'Set the forwarding number first or the missed-call flow cannot start correctly.',
      blocking: true,
    },
    {
      key: 'owner_notify_phone',
      label: 'Owner notify phone',
      ready: input.hasNotifyPhone && !input.ownerNotifyPhoneOptedOut,
      detail: !input.hasNotifyPhone
        ? 'Add an owner notify phone or the owner-notification step in the smoke test will not fire.'
        : input.ownerNotifyPhoneOptedOut
          ? 'The owner notify phone has opted out. Reply START from that phone before the live smoke test.'
          : 'Owner summary SMS can fire after the lead shares their ZIP code.',
      blocking: true,
    },
    {
      key: 'billing',
      label: 'Billing gate',
      ready: input.hasActiveSubscription,
      detail: input.hasActiveSubscription
        ? 'Subscription gating allows automated SMS follow-up for new missed-call leads.'
        : 'Billing is inactive, so leads will be created with billing_required and automated SMS will not start.',
      blocking: true,
    },
  ];

  if (input.hasActiveSubscription && typeof input.conversationLimitReached === 'boolean') {
    checks.push({
      key: 'conversation_capacity',
      label: 'Monthly conversation capacity',
      ready: !input.conversationLimitReached,
      detail: input.conversationLimitReached
        ? 'The monthly conversation limit has been reached, so automated SMS will be skipped until capacity resets or the plan changes.'
        : input.usageSummary
          ? `Current monthly usage is within plan limits (${input.usageSummary}).`
          : 'Current monthly usage is within plan limits.',
      blocking: true,
    });
  }

  const blockers = checks.filter((check) => check.blocking && !check.ready);

  return {
    ready: blockers.length === 0,
    blockers,
    checks,
  };
}
