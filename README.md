# CallbackCloser

CallbackCloser is a Next.js SaaS MVP for the workflow: **Missed Call -> Booked Job**.

When a customer calls a business's Twilio number and the forwarded call is missed, the app:

- records the call and lead in Postgres
- starts an SMS qualification flow (subscription-gated)
- stores all inbound/outbound messages in Prisma
- extracts service type, urgency, location, callback intent, caller name, and a lead summary
- qualifies the lead once enough detail is captured
- delivers the lead to the business owner by SMS, email, and in-app visibility
- lets the owner manage leads in a protected dashboard
- includes a public missed-call simulator route for end-to-end demos without touching real customer workspaces

## Tech Stack

- Next.js 14 App Router + TypeScript
- Tailwind CSS + shadcn-style UI components
- Prisma + Postgres
- Clerk auth
- Stripe subscriptions
- Twilio voice + messaging webhooks
- Vercel-ready deployment

## Features Implemented

- Clerk sign-in/sign-up and protected `/app` area
- Business onboarding (creates `Business` associated to `ownerClerkId`)
- Business Settings with call/SMS config + Twilio number purchase button
- Managed Twilio provisioning that creates or reuses a business subaccount, Messaging Service, number assignment, and webhook sync
- Twilio voice webhook (`/api/twilio/voice`) and dial status callback (`/api/twilio/status`)
- Missed-call lead creation + idempotent callback handling
- Persisted SMS state machine per lead (`smsState` in DB)
- Twilio SMS webhook (`/api/twilio/sms`) with lead qualification steps
- Qualified-lead delivery with idempotent SMS/email/in-app owner notifications
- Lead dashboard + filters + lead detail transcript + status updates
- Public missed-call simulator (`/simulator`) with a self-contained interactive preview flow
- Stripe billing page + checkout + billing portal
- Public purchase entry route (`/buy`) for external marketing-site links
- Stripe webhook sync for subscription status gating
- SMS compliance commands (`STOP` / `START` / `HELP`) with DB-backed opt-out state
- Call recording enabled on forwarded calls + recording metadata captured on callbacks
- Twilio webhook protection: production-enforced `X-Twilio-Signature` validation, with shared-token fallback only in non-production
- Webhook observability baseline: correlation IDs (`X-Correlation-Id`), centralized `app.error` reporting, optional alert webhook dispatch
- `/api/health` readiness endpoint for deploy smoke checks and uptime monitors
- Production guardrail: `PORTFOLIO_DEMO_MODE` is blocked in production unless `ALLOW_PRODUCTION_DEMO_MODE=true` is explicitly set

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create and configure Postgres

Create a Postgres database named `callbackcloser` (or any name you prefer), then set `DATABASE_URL` in `.env.local`.

Example:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/callbackcloser?schema=public
```

### 3. Fill in environment variables

Copy `.env.example` to `.env.local` if needed, then fill all required values.

Required categories:

- Clerk keys
- Stripe keys + price IDs + webhook secret
- Twilio credentials + webhook auth token
- Optional owner email delivery (`RESEND_API_KEY`, `CALLBACKCLOSER_FROM_EMAIL`)
- Database URL
- Optional rate-limit tuning vars (defaults are built in)

Local note:

- Use Clerk test/dev keys for localhost work.
- If you point `.env.local` at production-domain-restricted Clerk keys, public pages can still render, but Clerk will log browser origin errors on `http://localhost:3000`.

### 4. Run Prisma migrations / generate client

This repo includes a Prisma migration at `prisma/migrations/20260222000000_init/migration.sql`.

```bash
npm run db:generate
npx prisma migrate deploy
```

For local development schema iteration, you can also use:

```bash
npm run db:migrate
```

### 5. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`, sign up, then go to `/app/onboarding` if not redirected automatically.

### 6. Recommended local verification

```bash
npm run env:check
npm test
npm run lint
npm run typecheck
npm run build
```

Optional helper commands:

```bash
npm run webhooks:print
npm run preflight:providers
npm run db:smoke
```

## Founder-Only Billing Bypass For Smoke Testing

If you need to run a founder-owned production smoke test without paying a real subscription fee, you can enable a narrow billing override:

```env
ALLOW_FOUNDER_BILLING_BYPASS=true
FOUNDER_CLERK_USER_ID=your_clerk_user_id
```

How it works:

- Only the business owned by `FOUNDER_CLERK_USER_ID` is treated as billing-active at runtime.
- Stripe integration and webhook syncing stay intact.
- `Business.subscriptionStatus` in the database is not rewritten.
- Normal customer accounts still require a real active Stripe subscription.
- When enabled, the protected billing and settings pages show a visible founder-bypass notice.

Turn it off after smoke testing by unsetting `ALLOW_FOUNDER_BILLING_BYPASS` or setting it back to `false`, then removing `FOUNDER_CLERK_USER_ID` if you do not need it.

## Clerk Setup (Required)

1. Create a Clerk application.
2. Copy these values into `.env.local`:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
3. In Clerk dashboard, add redirect URLs (local + production):
   - `http://localhost:3000/sign-in`
   - `http://localhost:3000/sign-up`
   - `https://YOUR_DOMAIN/sign-in`
   - `https://YOUR_DOMAIN/sign-up`
4. Ensure your app origin(s) are allowed in Clerk.
5. For localhost development, prefer Clerk test/dev keys. Production keys that are locked to `callbackcloser.com` will reject browser requests from `http://localhost:3000`.

## Stripe Setup (Required)

### Create products/prices

Create two recurring subscription prices in Stripe (Starter and Pro). Copy the **Price IDs** into:

- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`

### Configure Stripe API key

Set:

- `STRIPE_SECRET_KEY`

### Configure Stripe webhook

Create a webhook endpoint pointed to:

- `https://YOUR_DOMAIN/api/stripe/webhook`
- Local (via Stripe CLI tunnel): `http://localhost:3000/api/stripe/webhook`

Recommended events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

Set the resulting endpoint signing secret as:

- `STRIPE_WEBHOOK_SECRET`

### Local Stripe CLI example

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the printed webhook signing secret into `.env.local`.

## Twilio Setup (Required)

### Twilio credentials

Set:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VALIDATE_SIGNATURE` (**required in production**, set to `true`)
- `TWILIO_WEBHOOK_AUTH_TOKEN` (optional, only for local/non-production token-mode testing)

### Twilio number provisioning (recommended)

1. Complete Business Settings in the app.
2. Open `/app/settings`.
3. Click **Provision Business Texting Line**.
4. CallbackCloser creates or reuses the business Twilio subaccount, creates or reuses the Messaging Service, buys a US local number, attaches it to the Messaging Service, and syncs the Twilio Voice + Messaging webhook URLs.
5. The business remains in an A2P-pending state until the brand/campaign path is approved. Do not treat this step alone as “live for customer messaging.”

### Existing-number path

- Existing-number onboarding is still **admin-assisted**.
- The number must already be in the target Twilio account context before it is attached through the admin provisioning screen.
- Porting or cross-account number moves are not self-serve in the business workspace today.

### Manual Twilio number webhook settings (if using Twilio Console)

If you configure a Twilio number manually in the Twilio Console, use:

You can print the exact URLs from your current env with:

```bash
npm run webhooks:print
```

- **Voice webhook (A CALL COMES IN)**
  - Method: `POST`
  - URL: `https://YOUR_DOMAIN/api/twilio/voice`
- **Messaging webhook (A MESSAGE COMES IN)**
  - Method: `POST`
  - URL: `https://YOUR_DOMAIN/api/twilio/sms`

The `/api/twilio/status` callback URL is set automatically by the TwiML returned from `/api/twilio/voice`.

Notes:

- Production requires `TWILIO_VALIDATE_SIGNATURE=true` and valid Twilio `X-Twilio-Signature`.
- Production rejects token-only webhook auth and validates subaccount webhooks with the correct Twilio account auth token.
- Shared-secret checks (header/query) are kept only for explicit non-production/local token-mode workflows.
- `/api/twilio/status` is called automatically by the TwiML generated from `/api/twilio/voice`.
- For US long-code messaging, A2P brand/campaign approval is still required before live customer SMS should be considered ready.

## Twilio Webhook Flow

### Voice: `/api/twilio/voice`

- Looks up the `Business` by called Twilio number (`To`)
- Returns TwiML `<Dial>` to `business.forwardingNumber`
- Uses `timeout = business.missedCallSeconds`
- Enables call recording on `<Dial>` (`record-from-answer-dual`)
- Sets both dial action callback and recording status callback to `/api/twilio/status`
- Returns `401` for invalid/missing webhook auth token and logs a structured webhook event

### Dial status: `/api/twilio/status`

- Records/upserts `Call`
- Marks answered vs missed using `DialCallStatus`
- Captures recording metadata when Twilio sends recording status callbacks (`RecordingSid`, `RecordingUrl`, `RecordingStatus`, `RecordingDuration`)
- Creates missed-call `Lead` if needed (idempotent)
- Starts SMS flow only when billing is active
- If billing inactive: lead is still recorded and `billingRequired=true`
- Duplicate/retried callbacks are safe: `Call` is upserted by `twilioCallSid`, `Lead` is reused by `callId`, and an already-started SMS thread (`smsStartedAt`) is not started again

### SMS: `/api/twilio/sms`

State machine steps (persisted on `Lead.smsState`):

1. Service (1/2/3 or free text)
2. Urgency (1 Emergency / 2 Today / 3 This week / 4 Quote)
3. Location / ZIP
4. Callback requested (yes / no)
5. Optional name

Qualification + owner delivery:

- A lead becomes **qualified** once CallbackCloser knows the service type and either urgency or callback intent
- `Lead.readiness` becomes `urgent` when the caller indicates an urgent need
- The first time a lead qualifies, CallbackCloser creates idempotent owner notification records and delivers the lead through:
  - SMS alert
  - email alert
  - in-app dashboard visibility
- Simulator leads never send owner notifications to real businesses; they only create simulated preview records

Compliance handling:

- Inbound `STOP` / `STOPALL` / `UNSUBSCRIBE` / `CANCEL` / `END` / `QUIT` marks the sender opted-out in DB and returns a confirmation
- Inbound `START` / `YES` / `UNSTOP` clears opt-out and confirms
- Inbound `HELP` returns a help message with app name + instructions
- Future outbound SMS to an opted-out recipient is suppressed until they opt back in (`START`)

Security / idempotency notes:

- Invalid webhook token -> `401`
- Unauthorized webhook bursts are rate-limited with `429` (`Retry-After` + `X-RateLimit-*` headers)
- Duplicate inbound SMS retries with the same `MessageSid` are deduped via `Message.twilioSid` and ignored after persistence check
- Webhook handlers log structured events (`callSid` / `messageSid`, event type, decision)

## How Recordings Work

Current behavior:

- Forwarded calls are recorded via TwiML `<Dial record="record-from-answer-dual">`
- The app stores recording metadata on `Call` (`recordingSid`, `recordingUrl`, `recordingStatus`, `recordingDurationSeconds`) when Twilio posts recording callbacks to `/api/twilio/status`
- Recording audio remains hosted in Twilio; CallbackCloser streams it through a server-side proxy for authenticated in-app access

Recording URL safety + proxy behavior:

- Stored recording URLs are validated before use:
  - must use `https://`
  - host must be allowlisted Twilio recording/API host: `api.twilio.com`, `api.us1.twilio.com`, `api.ie1.twilio.com`, or `api.au1.twilio.com`
  - path must be a Twilio recording resource path (`.../Recordings/...`)
- Invalid/malformed recording URLs return `404` from `/api/leads/[leadId]/recording`
- Authorized requests are fetched from Twilio with server credentials and streamed back to the signed-in owner (no raw Twilio URL redirect)

Where to access recordings:

- Lead detail page (`/app/leads/[leadId]`) shows recording status/duration and an authenticated `Open recording` action
- Recording links are mediated through `/api/leads/[leadId]/recording`, which checks the signed-in owner + business ownership and streams media via the server proxy
- Twilio Console -> Monitor -> Calls (or Call Logs / Recordings, depending on account UI)
- Database (`Call.recording*` fields) for metadata lookup / correlation

## Billing Gating Behavior

- Missed calls and leads are always recorded.
- If Stripe subscription status is not active, the app does **not** send SMS to leads.
- These leads are marked `billingRequired=true` and flagged in the dashboard.
- New missed calls begin SMS follow-up automatically once subscription status becomes active again.

## Owner notification settings

Each business can control owner delivery with `BusinessNotificationSettings`:

- `ownerPhone`
- `ownerEmail`
- `notifySms`
- `notifyEmail`
- `notifyInApp`
- `urgentOnly`

If `urgentOnly=true`, the lead must reach urgent readiness before CallbackCloser sends owner delivery alerts.

## Database Models

Prisma models included:

- `Business`
- `Lead`
- `Message`
- `Call`
- `OwnerNotification`
- `BusinessNotificationSettings`
- `SimulatorRun`

## Public missed-call simulator

Route:

- `/simulator`

What it demonstrates:

1. A missed call is detected
2. CallbackCloser sends the first recovery text
3. The caller completes the full intake flow: service, urgency, name plus location, callback time
4. The lead is qualified and summarized
5. Owner delivery previews are generated
6. The dashboard-ready lead card is shown

Simulator safety:

- The public `/simulator` page is self-contained and does not require Twilio, login, or backend simulator config
- No real SMS is sent and no Twilio calls are made
- Public visitor input stays inside the browser demo and does not create customer-facing records
- Caller numbers are masked in the UI before the owner-alert preview is shown
- The public `/simulator` experience runs entirely in the browser and does not require `SIMULATOR_BUSINESS_ID` or a configured demo business

Legacy internal simulator backend:

- The repo still includes isolated simulator-record models and env flags for internal/admin demo tooling
- Those flags are not required for the current public `/simulator` experience
- The optional env-backed simulator helpers remain separate from the public route and can still be used for internal preview workflows if needed

Creating a dedicated simulator workspace:

- Open `/admin`
- Use **Create Demo Business**
- The action creates or refreshes a dedicated business named `CallbackCloser Demo`
- The success banner shows the business ID to use for legacy internal simulator workflows if you still need an isolated backend-assisted demo run
- The demo workspace uses a synthetic owner account so it does not replace a real customer workspace tied to a Clerk user

## Production Setup (Vercel)

1. Push repo to Git.
2. Import project in Vercel.
3. Add all environment variables from `.env.local` (or from your secret manager).
   - Quick check: `npm run env:check`
   - Provider parity check: `npm run preflight:providers`
4. Set `NEXT_PUBLIC_APP_URL` to your production origin, e.g. `https://app.example.com`.
5. Set Clerk auth route env vars to the app-owned paths:
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
   - `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
   - In Clerk Dashboard, allow both URLs on the deployed origin.
6. Vercel deploys should use the repo build command `npm run vercel-build`:
   - This runs `npm run db:generate`
   - Then `npm run db:deploy`
   - Then `npm run build`
   - If the Vercel dashboard overrides the build command, set it to `npm run vercel-build`
7. Configure Stripe webhook to the Vercel domain.
8. Configure Twilio phone number webhooks (or buy the number through the app after deploy).
   - Helper: `npm run webhooks:print` (redacts the shared token by default)
9. Confirm `NEXT_PUBLIC_APP_URL` is set in both `Production` and (if used) `Preview`, and includes `https://`.
10. Optionally set `DEBUG_ENV_ENDPOINT_TOKEN`, then verify app URL resolution:
   - `https://YOUR_DOMAIN/api/debug/env?token=YOUR_DEBUG_ENV_ENDPOINT_TOKEN`

## External Buy Link

Use this URL for the public CallbackCloser CTA:

- `https://YOUR_DOMAIN/buy`

Optional plan-specific links:

- `https://YOUR_DOMAIN/buy?plan=starter`
- `https://YOUR_DOMAIN/buy?plan=pro`

`/buy` handles auth/onboarding redirects and lands the user on `/app/billing`.

## Production Launch Checklist

Use this checklist before sending paid traffic to `callbackcloser.com` or allowing the release to auto-deploy to production.

1. Confirm the production branch release content is complete.
   - Merge and verify the launch branches that are not yet on `main`:
     - `chore/p0-security-roadmap`
     - `chore/product-ux-legal`
     - `hardening/g14-recordings-ux`
2. Run the full verification suite from a clean checkout:
   - `npm run env:check`
   - `npm test`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
3. Confirm Vercel production env vars match `docs/PRODUCTION_ENV.md`.
4. Confirm the deploy path applies Prisma migrations before runtime:
   - repo build command: `npm run vercel-build`
   - exact migration step inside it: `npm run db:deploy`
   - optional smoke: `npm run db:smoke`
5. Confirm Stripe production setup:
   - live products/prices exist
   - live webhook targets `/api/stripe/webhook`
   - billing portal is enabled
6. Confirm Twilio production setup:
   - production number is assigned
   - webhooks point to the production app URL
   - `TWILIO_VALIDATE_SIGNATURE=true`
   - answered, missed, STOP, START, and HELP flows are tested
7. Confirm Clerk production setup:
   - production domain/origins are allowed
   - sign-in and sign-up redirects work
8. Confirm monitoring and operations readiness:
   - `/api/health` returns `200`
   - alerting or error sink is live
   - backup/restore drill evidence is current
9. Confirm customer-facing launch surface:
   - `/terms`, `/privacy`, and `/refund` are public
   - support inbox/contact path is monitored
   - public CTAs point to the approved `callbackcloser.com` production flow

## Useful Routes

- `/` - landing page
- `/buy` - external purchase entry (redirects through auth/onboarding to billing)
- `/terms` - terms of service
- `/privacy` - privacy policy
- `/refund` - refund policy
- `/contact` - public support/contact page
- `/simulator` - public interactive missed-call simulator
- `/sign-in` - Clerk sign-in
- `/sign-up` - Clerk sign-up
- `/app/onboarding` - create business record
- `/app/leads` - dashboard
- `/app/settings` - business settings + Twilio number provisioning
- `/app/billing` - Stripe subscription page
- `/api/health` - readiness probe for deploy and uptime checks
- `/api/twilio/voice` - Twilio voice webhook
- `/api/twilio/status` - Twilio dial action callback
- `/api/twilio/sms` - Twilio SMS webhook
- `/api/leads/[leadId]/recording` - authenticated recording media proxy for lead owners
- `/api/stripe/webhook` - Stripe webhook

## Notes / MVP Constraints

- Twilio webhook verification is env-gated: production enforces signature validation; shared-token checks are for non-production fallback/testing.
- Outbound lead/owner messages are sent via Twilio REST API so their `twilioSid` can be persisted.
- For simplicity, this MVP assumes one owner-managed business per Clerk user.
- Folders matching `upwork_pack*`, `portfolio_*`, and `upwork_gallery_images/` are generated export/demo artifacts and are not part of the app source; they are ignored by Git/TypeScript/ESLint.

## Troubleshooting

### "Invalid environment configuration: NEXT_PUBLIC_APP_URL ..."

- Set `NEXT_PUBLIC_APP_URL` in Vercel -> Project Settings -> Environment Variables (Production and Preview as needed)
- Use a full URL including `https://` (for example `https://callbackcloser.com`)
- After updating env vars, redeploy
- Optional: use `/api/debug/env` (token-protected in production) to confirm which app URL source was resolved

### Twilio webhooks returning 401

- In production: confirm `TWILIO_VALIDATE_SIGNATURE=true`, `TWILIO_AUTH_TOKEN` matches the Twilio account token, and Twilio is calling the exact production URL
- In non-production token-mode tests: confirm `TWILIO_WEBHOOK_AUTH_TOKEN` is set on the app and the same token is in webhook requests (`?webhook_token=...`) or a supported header
- Reprint expected URLs with `npm run webhooks:print`
- Re-sync webhooks from `/app/settings` after changing `NEXT_PUBLIC_APP_URL` or the webhook token

### Prisma CLI says env var is missing

- Keep app envs in `.env.local`
- Create a root `.env` (gitignored) with `DATABASE_URL` and `DIRECT_DATABASE_URL` for Prisma CLI
- See `docs/DB_NEON_PRISMA.md`
