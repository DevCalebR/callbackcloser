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
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public (`NEXT_PUBLIC_`) | Optional (future client-side Stripe usage) | Stripe / Vercel | Included in template for completeness. |
| `STRIPE_SECRET_KEY` | Server-only | Yes | Stripe / Vercel | Server Stripe API key. |
| `STRIPE_WEBHOOK_SECRET` | Server-only | Yes | Stripe / Vercel | Endpoint signing secret for `/api/stripe/webhook`. |
| `STRIPE_PRICE_STARTER` | Server-only | Yes | Stripe / Vercel | Starter plan Price ID. Also used for conversation usage-limit tier mapping. |
| `STRIPE_PRICE_PRO` | Server-only | Yes | Stripe / Vercel | Pro plan Price ID. Also used for conversation usage-limit tier mapping. |
| `TWILIO_ACCOUNT_SID` | Server-only | Yes | Twilio / Vercel | Twilio account SID. |
| `TWILIO_AUTH_TOKEN` | Server-only | Yes | Twilio / Vercel | Twilio auth token. |
| `TWILIO_WEBHOOK_AUTH_TOKEN` | Server-only | Yes (unless `TWILIO_VALIDATE_SIGNATURE=true`) | App-generated secret / Vercel | Shared secret used by Twilio webhook auth checks (header/query). Keep set for local/dev and console-based setup even if signature validation is enabled in production. |
| `TWILIO_VALIDATE_SIGNATURE` | Server-only | Optional (recommended `true` in production) | Vercel | When `true`, Twilio webhooks require valid `X-Twilio-Signature` verification using `TWILIO_AUTH_TOKEN`. Production fails closed on missing/invalid signature. |
| `DEBUG_ENV_ENDPOINT_TOKEN` | Server-only | Optional | Vercel | Protects `/api/debug/env` in production. If unset, the endpoint returns `404` in production. |
| `PORTFOLIO_DEMO_MODE` | Server-only | Optional | Local / Vercel | Enables demo data/auth bypass mode for portfolio/demo screenshots. Keep disabled in production unless intentionally using demo mode. |

## Runtime Validation (Production)

The app now validates required server env vars at runtime in production via `lib/env.server.ts`.

- Missing required vars throw a clear startup error with the variable names and provider hints.
- `NEXT_PUBLIC_APP_URL` must be a valid absolute URL and use `https://` in production.
- If `NEXT_PUBLIC_APP_URL` is missing or invalid, the app will try a safe fallback from Vercel system env vars (`VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL`) to avoid auth-page crashes, but you should still set `NEXT_PUBLIC_APP_URL` explicitly.
- `DATABASE_URL` is checked for Neon compatibility (`sslmode=require`) when using a `neon.tech` host.
- `DIRECT_DATABASE_URL` is used by Prisma for direct migration connections (`directUrl`) and should be set in Vercel for builds/deploy workflows that run Prisma commands.
- `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PRO` are required in production so the app can map active subscriptions to Starter/Pro usage limits.
- Twilio webhook auth supports two modes:
  - Shared token (default): `TWILIO_WEBHOOK_AUTH_TOKEN` required
  - Signature mode: set `TWILIO_VALIDATE_SIGNATURE=true` to require `X-Twilio-Signature` verification using `TWILIO_AUTH_TOKEN`
- `NEXT_PUBLIC_APP_URL` is the canonical value and should be set explicitly. If it is missing/invalid, the app can temporarily fall back to Vercel system env vars (`VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL`) to avoid auth-page crashes, but webhook/redirect behavior should still use an explicit `NEXT_PUBLIC_APP_URL`.

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

### Recommended Twilio webhook auth configuration (Production)

1. Set `TWILIO_VALIDATE_SIGNATURE=true`.
2. Keep `TWILIO_AUTH_TOKEN` synced with the Twilio account auth token.
3. Keep `TWILIO_WEBHOOK_AUTH_TOKEN` set as a backup for local/dev or manual token-based testing.
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
