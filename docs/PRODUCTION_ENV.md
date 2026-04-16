# Production Environment Variables

This project uses `NEXT_PUBLIC_APP_URL` as the single canonical app origin for server-generated URLs and Twilio webhook URL syncing.

## Setup Model

- Local development: use `.env.local` (never commit it)
- Shared template: use `.env.example` (no secrets)
- Vercel: configure environment variables per environment (`Development`, `Preview`, `Production`)

## Environment Variable Reference

| Variable | Visibility | Required | Provider / Owner | Notes |
|---|---|---:|---|---|
| `NEXT_PUBLIC_APP_URL` | Public (`NEXT_PUBLIC_`) | Yes | Vercel | Canonical app URL. Must be a full absolute `https://` URL in Vercel Production/Preview (for example `https://callbackcloser.com`). Used for redirects and Twilio webhook sync URLs. |
| `DATABASE_URL` | Server-only | Yes | Neon / Vercel | Prisma runtime connection string. Use the **Neon pooled (`-pooler`) URL** for app/serverless runtime. Include `sslmode=require`. |
| `DIRECT_DATABASE_URL` | Server-only | Yes (for Prisma migrations / deploys) | Neon / Vercel | Prisma direct connection for migrations (`directUrl`). Use the **Neon direct (non-`-pooler`) endpoint** with `sslmode=require`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public (`NEXT_PUBLIC_`) | Yes | Clerk / Vercel | Clerk frontend key. |
| `CLERK_SECRET_KEY` | Server-only | Yes | Clerk / Vercel | Clerk backend secret. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Public (`NEXT_PUBLIC_`) | Optional (recommended) | Vercel | Usually `/sign-in`. Keeps Clerk routes explicit. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Public (`NEXT_PUBLIC_`) | Optional (recommended) | Vercel | Usually `/sign-up`. Keeps Clerk routes explicit. |
| `ADMIN_EMAIL_ALLOWLIST` | Server-only | Optional | Vercel | Comma-separated admin email allowlist for `/admin` access. Keep this tightly scoped in production. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public (`NEXT_PUBLIC_`) | Optional (future client-side Stripe usage) | Stripe / Vercel | Included in template for completeness. |
| `STRIPE_SECRET_KEY` | Server-only | Yes | Stripe / Vercel | Server Stripe API key. |
| `STRIPE_WEBHOOK_SECRET` | Server-only | Yes | Stripe / Vercel | Endpoint signing secret for `/api/stripe/webhook`. |
| `STRIPE_PRICE_STARTER` | Server-only | Yes | Stripe / Vercel | Starter plan Price ID. Also used for conversation usage-limit tier mapping. |
| `STRIPE_PRICE_PRO` | Server-only | Yes | Stripe / Vercel | Pro plan Price ID. Also used for conversation usage-limit tier mapping. |
| `TWILIO_ACCOUNT_SID` | Server-only | Yes | Twilio / Vercel | Twilio account SID. |
| `TWILIO_AUTH_TOKEN` | Server-only | Yes | Twilio / Vercel | Twilio auth token. |
| `TWILIO_WEBHOOK_AUTH_TOKEN` | Server-only | Optional | App-generated secret / Vercel | Shared secret used only for local/dev token-mode checks and webhook URL tooling when signature validation is disabled. Production does not rely on it for Twilio webhook auth. |
| `TWILIO_VALIDATE_SIGNATURE` | Server-only | Yes (production) | Vercel | Must be `true` in production. Twilio webhooks require valid `X-Twilio-Signature` verification using the correct Twilio account auth token for the request; production fails closed otherwise. |
| `RESEND_API_KEY` | Server-only | Optional | Resend / Vercel | Enables owner email delivery for qualified leads. Without it, email notifications are skipped while SMS and in-app alerts can still operate. |
| `CALLBACKCLOSER_FROM_EMAIL` | Server-only | Optional | Resend / Vercel | Verified sender address used for transactional owner emails. |
| `DEBUG_ENV_ENDPOINT_TOKEN` | Server-only | Optional | Vercel | Protects `/api/debug/env` in production. If unset, the endpoint returns `404` in production. |
| `PORTFOLIO_DEMO_MODE` | Server-only | Optional | Local / Vercel | Enables demo data/auth bypass mode for portfolio/demo screenshots. Keep disabled in production unless intentionally using demo mode. |
| `ALLOW_PRODUCTION_DEMO_MODE` | Server-only | Optional (break-glass only) | Vercel | Required only when intentionally running demo mode in production. If unset while `PORTFOLIO_DEMO_MODE` is enabled in production, startup is blocked. |
| `ENABLE_PUBLIC_MISSED_CALL_SIMULATOR` | Server-only | Optional | Vercel | Enables the public `/simulator` route. Keep disabled unless the simulator business is intentionally configured. |
| `SIMULATOR_BUSINESS_ID` | Server-only | Optional | Vercel | Business record used by the public simulator. Must point to an isolated demo workspace, never a real customer business. |
| `ENABLE_PUBLIC_SIMULATOR_REAL_SMS` | Server-only | Optional | Vercel | Allows the simulator to send real caller-side SMS from the simulator business number when a non-placeholder texting line exists. Keep off by default. |
| `RATE_LIMIT_WINDOW_MS` | Server-only | Optional | Vercel | Shared rate-limit window in milliseconds. Default `60000`. |
| `RATE_LIMIT_TWILIO_AUTH_MAX` | Server-only | Optional | Vercel | Max Twilio webhook requests per window for valid/authorized traffic. Default `240`. |
| `RATE_LIMIT_TWILIO_UNAUTH_MAX` | Server-only | Optional | Vercel | Max Twilio webhook requests per window for unauthorized traffic. Default `40`. |
| `RATE_LIMIT_STRIPE_AUTH_MAX` | Server-only | Optional | Vercel | Max Stripe webhook requests per window for valid-signed traffic. Default `240`. |
| `RATE_LIMIT_STRIPE_UNAUTH_MAX` | Server-only | Optional | Vercel | Max Stripe webhook requests per window for invalid-signature traffic. Default `40`. |
| `RATE_LIMIT_PROTECTED_API_MAX` | Server-only | Optional | Vercel | Max requests per window for protected Stripe mutation APIs (`/api/stripe/checkout`, `/api/stripe/portal`). Default `80`. |
| `ALERT_WEBHOOK_URL` | Server-only | Optional | Vercel / Ops | If set, critical application errors are POSTed to this webhook for alert fan-out (Slack/Pager/incident gateway). |
| `ALERT_WEBHOOK_TOKEN` | Server-only | Optional | Vercel / Ops | Optional bearer token added to alert webhook requests as `Authorization: Bearer <token>`. |
| `ALERT_WEBHOOK_TIMEOUT_MS` | Server-only | Optional | Vercel / Ops | Timeout for alert webhook dispatch. Default `4000` ms. |

## Runtime Validation (Production)

The app now validates required server env vars at runtime in production via `lib/env.server.ts`.

- Missing required vars throw a clear startup error with the variable names and provider hints.
- `NEXT_PUBLIC_APP_URL` must be a valid absolute URL and use `https://` in production.
- If `NEXT_PUBLIC_APP_URL` is missing or invalid, the app will try a safe fallback from Vercel system env vars (`VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL`) to avoid auth-page crashes, but you should still set `NEXT_PUBLIC_APP_URL` explicitly.
- `DATABASE_URL` is checked for Neon compatibility (`sslmode=require`) when using a `neon.tech` host.
- `DIRECT_DATABASE_URL` is used by Prisma for direct migration connections (`directUrl`) and should be set in Vercel for builds/deploy workflows that run Prisma commands.
- `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PRO` are required in production so the app can map active subscriptions to Starter/Pro usage limits.
- Twilio webhook auth behavior:
  - Production: `TWILIO_VALIDATE_SIGNATURE=true` is required, token-only auth is rejected, and subaccount requests are verified with the matching Twilio account auth token
  - Non-production: disabling signature validation switches the app into explicit shared-token webhook auth mode for local/dev workflows
- Demo mode safety guard:
  - Production blocks startup/request handling if `PORTFOLIO_DEMO_MODE` is enabled without `ALLOW_PRODUCTION_DEMO_MODE=true`.
  - Use `ALLOW_PRODUCTION_DEMO_MODE` only as an explicit break-glass override.
- Rate limiting defaults are tuned to avoid blocking normal Twilio/Stripe provider traffic while still throttling abusive bursts. Tune limits only if you observe false positives in logs.
- Error reporting emits structured `app.error` logs and, when configured, dispatches alert payloads to `ALERT_WEBHOOK_URL`.
- `NEXT_PUBLIC_APP_URL` is the canonical value and should be set explicitly. If it is missing/invalid, the app can temporarily fall back to Vercel system env vars (`VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL`) to avoid auth-page crashes, but webhook/redirect behavior should still use an explicit `NEXT_PUBLIC_APP_URL`.
- `/admin` access depends on either `FOUNDER_CLERK_USER_ID` or `ADMIN_EMAIL_ALLOWLIST`; do not leave admin authorization implicit.
- Owner email alerts are optional, but if you intend to advertise email delivery you must set both `RESEND_API_KEY` and `CALLBACKCLOSER_FROM_EMAIL`.
- The public simulator is optional and should only point at a dedicated demo workspace via `SIMULATOR_BUSINESS_ID`.

## Vercel: Preview vs Production

Use separate values for `Preview` and `Production` where appropriate.

### Recommended approach

- `NEXT_PUBLIC_APP_URL`
  - Preview: your Vercel preview URL (or a preview-safe canonical URL if you use one)
  - Production: your live domain (for example `https://app.example.com`)
  - Must include `https://` (a bare hostname like `callbackcloser.com` will fail validation)
- `DATABASE_URL` (Neon pooled / `-pooler`)
  - Preview: preview/staging **pooled** database URL
  - Production: production **pooled** database URL
- `DIRECT_DATABASE_URL` (Neon direct / non-`-pooler`)
  - Preview: preview/staging **direct** database URL for Prisma migrations
  - Production: production **direct** database URL for Prisma migrations
- Stripe / Twilio / Clerk keys
  - Prefer separate test/staging credentials for Preview
  - Use live credentials only in Production

### Important Twilio note

Twilio webhook syncing uses `NEXT_PUBLIC_APP_URL`. If you run webhook sync actions in Preview, they will point Twilio to the Preview URL. In most teams, Twilio webhook sync should be done only from a controlled environment (local with tunnel or Production) to avoid accidental webhook target changes.

### Required Twilio webhook auth configuration (Production)

1. Set `TWILIO_VALIDATE_SIGNATURE=true` (required).
2. Keep `TWILIO_AUTH_TOKEN` synced with the parent Twilio account auth token so the app can validate parent-account webhooks and resolve managed subaccount auth tokens.
3. Treat `TWILIO_WEBHOOK_AUTH_TOKEN` as optional local/dev tooling only; do not depend on it for production webhook auth.
4. Ensure Twilio points to the exact production URL (`NEXT_PUBLIC_APP_URL`) so signature validation uses the same URL Twilio signed.

## After updating env vars on Vercel

- Redeploy the app (or trigger a new deployment)
- Run `npm run env:check` locally (or in CI) to confirm required variables are present
- Re-run Twilio webhook sync if the production app URL changed
- Verify Stripe webhook endpoint is pointing at the correct environment URL

## Troubleshooting: "NEXT_PUBLIC_APP_URL must be a valid absolute URL"

If sign-in/sign-up or other server-rendered pages fail in production with an error about `NEXT_PUBLIC_APP_URL`:

1. In Vercel, open **Project Settings -> Environment Variables**.
2. Set `NEXT_PUBLIC_APP_URL` in the correct environment (`Production` and/or `Preview`) to a full URL including `https://`.
   - Example: `https://callbackcloser.com`
3. Redeploy.

Notes:

- A value like `callbackcloser.com` (missing `https://`) is invalid.
- A stale preview URL can break redirects/webhook sync behavior; update it when needed.
- For debugging, `/api/debug/env` returns the resolved app URL source in non-production. In production, protect it by setting `DEBUG_ENV_ENDPOINT_TOKEN` and calling `/api/debug/env?token=...`.
- `VERCEL_URL` and `VERCEL_PROJECT_PRODUCTION_URL` are Vercel system env vars (you usually do not set them manually).
