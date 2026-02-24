# CallbackCloser

CallbackCloser is a Next.js SaaS MVP for the workflow: **Missed Call -> Booked Job**.

When a customer calls a business's Twilio number and the forwarded call is missed, the app:

- records the call and lead in Postgres
- starts an SMS qualification flow (subscription-gated)
- stores all inbound/outbound messages in Prisma
- notifies the owner by SMS after ZIP is collected
- lets the owner manage leads in a protected dashboard

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
- Twilio voice webhook (`/api/twilio/voice`) and dial status callback (`/api/twilio/status`)
- Missed-call lead creation + idempotent callback handling
- Persisted SMS state machine per lead (`smsState` in DB)
- Twilio SMS webhook (`/api/twilio/sms`) with lead qualification steps
- Lead dashboard + filters + lead detail transcript + status updates
- Stripe billing page + checkout + billing portal
- Stripe webhook sync for subscription status gating
- Shared-secret Twilio webhook protection (header check, plus query fallback for MVP)

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
- Database URL

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
- `TWILIO_WEBHOOK_AUTH_TOKEN` (your shared secret used by this app)

### Twilio number provisioning (recommended)

1. Complete Business Settings in the app.
2. Open `/app/settings`.
3. Click **Buy Twilio number**.
4. The app purchases a US local number and sets the Twilio Voice + Messaging webhook URLs automatically.

### Manual Twilio number webhook settings (if using Twilio Console)

If you configure a Twilio number manually in the Twilio Console, use:

- **Voice webhook (A CALL COMES IN)**
  - Method: `POST`
  - URL: `https://YOUR_DOMAIN/api/twilio/voice?webhook_token=YOUR_TWILIO_WEBHOOK_AUTH_TOKEN`
- **Messaging webhook (A MESSAGE COMES IN)**
  - Method: `POST`
  - URL: `https://YOUR_DOMAIN/api/twilio/sms?webhook_token=YOUR_TWILIO_WEBHOOK_AUTH_TOKEN`

Notes:

- The app also supports a shared-secret **header** check (`x-callbackcloser-webhook-token`) for MVP verification.
- Some Twilio Console surfaces do not expose custom header configuration, so query param fallback is supported for direct console setup.
- `/api/twilio/status` is called automatically by the TwiML generated from `/api/twilio/voice`.

## Twilio Webhook Flow

### Voice: `/api/twilio/voice`

- Looks up the `Business` by called Twilio number (`To`)
- Returns TwiML `<Dial>` to `business.forwardingNumber`
- Uses `timeout = business.missedCallSeconds`
- Sets dial action callback to `/api/twilio/status`

### Dial status: `/api/twilio/status`

- Records/upserts `Call`
- Marks answered vs missed using `DialCallStatus`
- Creates missed-call `Lead` if needed (idempotent)
- Starts SMS flow only when billing is active
- If billing inactive: lead is still recorded and `billingRequired=true`

### SMS: `/api/twilio/sms`

State machine steps (persisted on `Lead.smsState`):

1. Service (1/2/3 or free text)
2. Urgency (1 Emergency / 2 Today / 3 This week / 4 Quote)
3. ZIP
4. Best time (morning/afternoon/evening)
5. Optional name

After ZIP is collected, the owner receives a summary SMS + lead link (if `notifyPhone` is set).

## Billing Gating Behavior

- Missed calls and leads are always recorded.
- If Stripe subscription status is not active, the app does **not** send SMS to leads.
- These leads are marked `billingRequired=true` and flagged in the dashboard.
- New missed calls begin SMS follow-up automatically once subscription status becomes active again.

## Database Models

Prisma models included:

- `Business`
- `Lead`
- `Message`
- `Call`

## Deploying to Vercel

1. Push repo to Git.
2. Import project in Vercel.
3. Add all environment variables from `.env.local` (or from your secret manager).
4. Set `NEXT_PUBLIC_APP_URL` to your production origin, e.g. `https://app.example.com`.
5. Run Prisma migrations against your production database:
   - Either via CI/CD step: `npx prisma migrate deploy`
   - Or manually once after deploy
6. Configure Stripe webhook to the Vercel domain.
7. Configure Twilio phone number webhooks (or buy the number through the app after deploy).

## Useful Routes

- `/` - landing page
- `/sign-in` - Clerk sign-in
- `/sign-up` - Clerk sign-up
- `/app/onboarding` - create business record
- `/app/leads` - dashboard
- `/app/settings` - business settings + Twilio number provisioning
- `/app/billing` - Stripe subscription page
- `/api/twilio/voice` - Twilio voice webhook
- `/api/twilio/status` - Twilio dial action callback
- `/api/twilio/sms` - Twilio SMS webhook
- `/api/stripe/webhook` - Stripe webhook

## Notes / MVP Constraints

- Twilio webhook verification is a shared-secret check (header + query fallback), not full `X-Twilio-Signature` verification.
- Outbound lead/owner messages are sent via Twilio REST API so their `twilioSid` can be persisted.
- For simplicity, this MVP assumes one owner-managed business per Clerk user.
- Folders matching `upwork_pack*`, `portfolio_*`, and `upwork_gallery_images/` are generated export/demo artifacts and are not part of the app source; they are ignored by Git/TypeScript/ESLint.
