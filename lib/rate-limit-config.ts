import { getRateLimitNumber } from './rate-limit';

export const RATE_LIMIT_WINDOW_MS = getRateLimitNumber('RATE_LIMIT_WINDOW_MS', 60_000, {
  min: 1_000,
  max: 3_600_000,
});

export const RATE_LIMIT_TWILIO_AUTH_MAX = getRateLimitNumber('RATE_LIMIT_TWILIO_AUTH_MAX', 240, {
  min: 10,
  max: 10_000,
});

export const RATE_LIMIT_TWILIO_UNAUTH_MAX = getRateLimitNumber('RATE_LIMIT_TWILIO_UNAUTH_MAX', 40, {
  min: 5,
  max: 5_000,
});

export const RATE_LIMIT_STRIPE_AUTH_MAX = getRateLimitNumber('RATE_LIMIT_STRIPE_AUTH_MAX', 240, {
  min: 10,
  max: 10_000,
});

export const RATE_LIMIT_STRIPE_UNAUTH_MAX = getRateLimitNumber('RATE_LIMIT_STRIPE_UNAUTH_MAX', 40, {
  min: 5,
  max: 5_000,
});

export const RATE_LIMIT_PROTECTED_API_MAX = getRateLimitNumber('RATE_LIMIT_PROTECTED_API_MAX', 80, {
  min: 10,
  max: 10_000,
});
