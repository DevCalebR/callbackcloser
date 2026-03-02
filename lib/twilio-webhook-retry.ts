export type TwilioWebhookRoute = 'sms' | 'status';

const RETRYABLE_ERROR_BODY = {
  error: 'Temporary webhook processing failure',
  retryable: true,
} as const;

export function buildTwilioRetryableErrorResponse(route: TwilioWebhookRoute) {
  return Response.json({ ...RETRYABLE_ERROR_BODY, route }, { status: 503 });
}
