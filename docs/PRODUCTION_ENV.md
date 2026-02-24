# Production Environment Variables

This project uses `NEXT_PUBLIC_APP_URL` as the single canonical app origin for server-generated URLs and Twilio webhook URL syncing.

## Setup Model

- Local development: use `.env.local` (never commit it)
- Shared template: use `.env.example` (no secrets)
- Vercel: configure environment variables per environment (`Development`, `Preview`, `Production`)

## Environment Variable Reference

| Variable | Visibility | Required | Provider / Owner | Notes |
|---|---|---:|---|---|
| `NEXT_PUBLIC_APP_URL` | Public (`NEXT_PUBLIC_`) | Yes | Vercel | Canonical app URL. Must be `https://` in production. Used for redirects and Twilio webhook sync URLs. |
| `DATABASE_URL` | Server-only | Yes | Neon / Vercel | Prisma runtime connection string. Use the **Neon pooled (`-pooler`) URL** for app/serverless runtime. Include `sslmode=require`. |
| `DIRECT_DATABASE_URL` | Server-only | Yes (for Prisma migrations / deploys) | Neon / Vercel | Prisma direct connection for migrations (`directUrl`). Use the **Neon direct (non-`-pooler`) endpoint** with `sslmode=require`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public (`NEXT_PUBLIC_`) | Yes | Clerk / Vercel | Clerk frontend key. |
| `CLERK_SECRET_KEY` | Server-only | Yes | Clerk / Vercel | Clerk backend secret. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Public (`NEXT_PUBLIC_`) | Optional (recommended) | Vercel | Usually `/sign-in`. Keeps Clerk routes explicit. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Public (`NEXT_PUBLIC_`) | Optional (recommended) | Vercel | Usually `/sign-up`. Keeps Clerk routes explicit. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Public (`NEXT_PUBLIC_`) | Optional (future client-side Stripe usage) | Stripe / Vercel | Included in template for completeness. |
| `STRIPE_SECRET_KEY` | Server-only | Yes | Stripe / Vercel | Server Stripe API key. |
| `STRIPE_WEBHOOK_SECRET` | Server-only | Yes | Stripe / Vercel | Endpoint signing secret for `/api/stripe/webhook`. |
| `STRIPE_PRICE_STARTER` | Server-only | Yes | Stripe / Vercel | Starter plan Price ID. |
| `STRIPE_PRICE_PRO` | Server-only | Yes | Stripe / Vercel | Pro plan Price ID. |
| `TWILIO_ACCOUNT_SID` | Server-only | Yes | Twilio / Vercel | Twilio account SID. |
| `TWILIO_AUTH_TOKEN` | Server-only | Yes | Twilio / Vercel | Twilio auth token. |
| `TWILIO_WEBHOOK_AUTH_TOKEN` | Server-only | Yes | App-generated secret / Vercel | Shared secret used by Twilio webhook auth checks. |

## Runtime Validation (Production)

The app now validates required server env vars at runtime in production via `lib/env.server.ts`.

- Missing required vars throw a clear startup error with the variable names and provider hints.
- `NEXT_PUBLIC_APP_URL` must be a valid absolute URL and use `https://` in production.
- `DATABASE_URL` is checked for Neon compatibility (`sslmode=require`) when using a `neon.tech` host.
- `DIRECT_DATABASE_URL` is used by Prisma for direct migration connections (`directUrl`) and should be set in Vercel for builds/deploy workflows that run Prisma commands.

## Vercel: Preview vs Production

Use separate values for `Preview` and `Production` where appropriate.

### Recommended approach

- `NEXT_PUBLIC_APP_URL`
  - Preview: your Vercel preview URL (or a preview-safe canonical URL if you use one)
  - Production: your live domain (for example `https://app.example.com`)
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

## After updating env vars on Vercel

- Redeploy the app (or trigger a new deployment)
- Re-run Twilio webhook sync if the production app URL changed
- Verify Stripe webhook endpoint is pointing at the correct environment URL
