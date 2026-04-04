# CallbackCloser Launch Blockers

Only must-fix items are listed here.

## 1. Shared Twilio Account Number Exposure In Customer Settings

**Why it matters**

Any signed-in business owner can currently load incoming phone numbers from the connected Twilio account. If multiple customers share one Twilio account, this exposes other customers' phone numbers and friendly names. That is a real tenant-isolation and trust failure.

**Area / files**

- `app/app/settings/page.tsx`
- `app/app/settings/actions.ts`
- `lib/twilio.ts`
- `prisma/schema.prisma`

**Suggested fix**

Stop listing shared-account incoming numbers to customer users. For launch, either:

- remove the "Use Existing Twilio Number" inventory view entirely and make number assignment founder-only, or
- implement a safer per-business isolation model, ideally with Twilio subaccounts or a vetted assignment workflow that only exposes the business's own number.

## 2. Silent Failure In Core SMS Qualification Flow

**Why it matters**

The inbound SMS webhook updates lead state, then catches and logs outbound send failures for owner notification and customer reply without returning a retryable failure. That means the customer can stop receiving prompts while the webhook still returns success. This silently breaks the core product.

**Area / files**

- `app/api/twilio/sms/route.ts`
- `lib/twilio-messaging.ts`
- `lib/twilio-webhook-retry.ts`

**Suggested fix**

Treat critical outbound follow-up sends as durable work, not best-effort logging. For launch, either:

- return retryable failures when the next customer-facing SMS cannot be sent safely, with idempotent guards, or
- move outbound sends to an outbox/queue and track send state explicitly so failures surface and retry.

## 3. Pricing And Billing Surface Mismatch

**Why it matters**

The public pricing page says customers need to email for pricing before checkout, while the app has self-serve checkout buttons. The billing page does not show actual pricing, only "Configured via Stripe Price ID." That is not credible enough for a paid SaaS launch.

**Area / files**

- `app/pricing/page.tsx`
- `app/app/billing/page.tsx`
- `app/api/stripe/checkout/route.ts`

**Suggested fix**

Publish a coherent billing story before charging:

- show actual plan names, prices, billing interval, and what is included
- align public pricing with the in-app checkout path
- explain what happens for cancellation and past-due accounts

## 4. Legal / SMS Compliance Surfaces Are Too Thin For Live Selling

**Why it matters**

Terms, privacy, refund, and SMS consent pages exist, but they are generic and minimal. For a live missed-call SMS product, that is not enough confidence on customer trust or compliance posture.

**Area / files**

- `app/privacy/page.tsx`
- `app/terms/page.tsx`
- `app/refund/page.tsx`
- `app/sms-consent/page.tsx`
- `tests/legal-pages.test.ts`

**Suggested fix**

Before launch, tighten these documents so they match real business operations:

- company/contact details
- clearer billing and cancellation language
- stronger data-handling and retention language
- clearer SMS disclosures and consent posture
- legal review for the live SMS/call workflow

## 5. No Real Production Monitoring / Launch Ops Baseline

**Why it matters**

The repo has logging and optional alert webhook support, but there is no real monitoring system, no health endpoint, no support tooling, and no evidence of live alerting. Selling without that means you will discover failures from angry customers instead of from ops signals.

**Area / files**

- `lib/observability.ts`
- `lib/twilio-logging.ts`
- `docs/PRODUCTION_ENV.md`
- `scripts/preflight_checklist.md`
- `docs/BACKUP_RESTORE_RUNBOOK.md`

**Suggested fix**

Minimum acceptable launch ops:

- wire alerts to a real destination
- define launch-day log review and smoke-test steps
- add a simple health/readiness endpoint
- document who checks what when Twilio or Stripe fails

## 6. Production Flow Has Not Been Proven End-To-End

**Why it matters**

The code is real, but there is no repo evidence that the full production path has been validated on the real domain with Clerk, Stripe, Twilio, and the database together. For this product, that is a launch blocker.

**Area / files**

- `README.md`
- `docs/EXTERNAL_SETUP_CHECKLIST.md`
- `docs/PRODUCTION_ENV.md`
- `scripts/check_env.ts`
- `scripts/print_webhook_urls.ts`

**Suggested fix**

Before selling:

- deploy to the real domain
- run Stripe test checkout and webhook confirmation
- run Twilio answered call, missed call, inbound SMS, STOP, START, HELP, and recording tests
- verify owner notification, dashboard visibility, and logs
- save the evidence as your pre-launch signoff
