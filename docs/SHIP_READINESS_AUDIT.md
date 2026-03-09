# CallbackCloser Ship Readiness Audit

Date: March 2, 2026  
Scope: `callbackcloser` app readiness to sell via `getrelayworks.com` with working buy flow and post-purchase path.

## Summary

CallbackCloser is close to sellable. Core SaaS plumbing is present: Vercel deploy shape, Clerk auth, Stripe checkout/webhook sync, Twilio webhook automation gates, and legal pages.

This pass implemented high-confidence sell blockers:

1. Added a public purchase entry route: `/buy` (supports optional `?plan=starter|pro`) that routes users through sign-up, onboarding, and then billing.
2. Preserved purchase intent through onboarding via safe `next` redirect handling.
3. Improved post-checkout billing UX with explicit success/pending/canceled states and next-step guidance.
4. Added a public `/contact` page and linked it from landing/legal pages.
5. Documented external buy-link usage in README.

## 1) Deploy Targets, Env, and Auth

### Deploy target(s)

Current deploy target is Vercel.

Evidence:
- `vercel.json` (`framework: nextjs`, `buildCommand: npm run build`)
- `README.md` production section is Vercel-specific
- `docs/PRODUCTION_ENV.md` and `docs/EXTERNAL_SETUP_CHECKLIST.md` are Vercel-scoped
- `RUNBOOK.md` deploy checklist references Vercel

No evidence of alternate active deploy targets (Netlify/Render/Fly/etc.) in app runtime config.

### Required env vars

Required in production (runtime-enforced by `lib/env.server.ts`):

- App/URL:
  - `NEXT_PUBLIC_APP_URL` (absolute https URL in prod; fallback to Vercel system vars only if misconfigured)
- DB:
  - `DATABASE_URL`
  - `DIRECT_DATABASE_URL`
- Clerk:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
- Stripe:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_STARTER`
  - `STRIPE_PRICE_PRO`
- Twilio:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_WEBHOOK_AUTH_TOKEN`
  - `TWILIO_VALIDATE_SIGNATURE=true` in production

Optional but recommended/operational:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `DEBUG_ENV_ENDPOINT_TOKEN`
- rate limit knobs (`RATE_LIMIT_*`)
- alerting (`ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_TOKEN`, `ALERT_WEBHOOK_TIMEOUT_MS`)
- demo guardrail override (`ALLOW_PRODUCTION_DEMO_MODE`) only for explicit break-glass

### Auth model

- Primary auth: Clerk (`@clerk/nextjs`)
- Protected routes:
  - Middleware protects `/app/*`, `/api/stripe/checkout`, `/api/stripe/portal`
- Data-level authz:
  - App pages/actions call `requireBusiness()` and query by `businessId`/`ownerClerkId`
- Twilio/Stripe webhook auth:
  - Twilio: signature validation in prod, fallback token mode only non-prod
  - Stripe: webhook signature validation (`stripe-signature` + `STRIPE_WEBHOOK_SECRET`)

## 2) Stripe Integration Status and Full Flow

Stripe is integrated.

### Checkout -> Webhook -> Entitlement -> UI gating

1. Checkout creation:
- `POST /api/stripe/checkout`
- Requires authenticated Clerk user + existing business
- Validates selected `priceId` against env allowlist (`STRIPE_PRICE_STARTER`/`STRIPE_PRICE_PRO`)
- Creates/updates Stripe customer and starts subscription checkout session
- Success redirect: `/app/billing?checkout=success`
- Cancel redirect: `/app/billing?checkout=canceled`

2. Webhook ingestion:
- `POST /api/stripe/webhook`
- Verifies Stripe signature
- Handles:
  - `checkout.session.completed`
  - `customer.subscription.created|updated|deleted`
  - `invoice.payment_failed|succeeded`
- Syncs `Business`:
  - `stripeCustomerId`
  - `stripeSubscriptionId`
  - `stripePriceId`
  - `subscriptionStatus`
  - `subscriptionStatusUpdatedAt`

3. Entitlement enforcement:
- `app/api/twilio/status/route.ts` blocks SMS automation unless subscription is active
- Leads are still captured when inactive (`billingRequired=true`)
- Usage limits applied by plan tier:
  - Starter: 200 conversations/month
  - Pro: 1000 conversations/month

4. UI gating:
- `/app/billing` shows subscription status, usage tier, usage counts, and automation state
- `/app/leads` shows upgrade banner for blocked leads

### Verification status

- Code-level flow is complete and coherent.
- Automated test coverage for Stripe routes themselves is limited (no dedicated checkout/webhook integration tests in `tests/`).
- Manual sandbox verification remains required before go-live.

## 3) Product Boundary (Free vs Paid)

### Current technical boundary (implemented)

Free/inactive state:
- Missed calls and leads are still captured
- SMS follow-up automation is paused
- Leads marked `billingRequired=true`

Paid active state:
- SMS automation runs
- Tier selected from active Stripe price:
  - Starter (`STRIPE_PRICE_STARTER`) -> 200 monthly conversations
  - Pro (`STRIPE_PRICE_PRO`) -> 1000 monthly conversations

### Owner decision needed

Commercial packaging is not fully finalized in code/docs (pricing amounts, team semantics, trial policy).

Two viable packaging options:

1. Starter vs Pro (recommended for current implementation)
- Starter: single owner user, base monthly conversation cap
- Pro: higher cap + team features (future RBAC) + priority support
- Why: aligns directly with existing Stripe price + usage-tier plumbing

2. Trial -> Paid
- Time- or usage-bounded trial, then forced upgrade to paid tier
- Why: can improve conversion, but needs explicit trial lifecycle policy + billing UX updates

## 4) Compliance Basics

### Public policy/contact surfaces

Present:
- `/terms`
- `/privacy`
- `/refund`
- `/contact` (added in this pass)

Landing + legal footers link to policy/contact pages.

### Twilio recording access and authz

Current behavior:
- Recording metadata is captured on call records (`recordingSid`, `recordingUrl`, etc.)
- Dashboard data access is business-scoped (`requireBusiness` + `businessId` query constraints)
- No public recording proxy/download endpoint exists

Security implication:
- Recording playback is not publicly exposed by this app today.
- If playback is added later, keep strict owner/business authz and avoid exposing raw Twilio URLs directly.

## 5) Punch List

### A) Blockers to selling

1. External buy CTA path was missing.
- Status: Fixed (`/buy` route + README guidance)

2. New buyers could lose purchase intent after onboarding.
- Status: Fixed (safe `next` redirect support in onboarding)

3. Post-checkout state messaging was thin for webhook-lag cases.
- Status: Fixed (billing page now distinguishes active vs pending sync vs canceled)

4. Public contact page was missing.
- Status: Fixed (`/contact` + footer links)

5. Published pricing/offer boundaries are not finalized (amounts/terms/team definition).
- Status: Open
- Owner decision needed

6. Production provider wiring must be validated in live sandboxes (Stripe + Twilio + Clerk).
- Status: Open

### B) Important

1. Add dedicated Stripe route/integration tests (checkout and webhook event handling).
2. Add a concise go-live runbook for relayworks-site -> `/buy` campaign link deployment and rollback.
3. Define support mailbox ownership/SLAs (current pages use `support@callbackcloser.com`).
4. Decide and document refund window and explicit policy terms (currently case-by-case language).

### C) Nice-to-have

1. Add explicit onboarding completion success state when arriving from `/buy`.
2. Track attribution (`source`, `campaign`) from `/buy` into analytics.
3. Add optional Stripe trial support if business chooses Trial -> Paid.
4. Add team/RBAC roadmap item before marketing “Pro for teams”.

### D) Verification steps (pre-ship)

Automated:

1. `npm run env:check`
2. `npm test`
3. `npm run lint`
4. `npm run typecheck`
5. `npm run build`

Manual functional:

1. Open `/buy` as signed-out user; verify redirect to sign-up and return path.
2. Complete sign-up + onboarding from `/buy`; verify landing on `/app/billing`.
3. Start checkout from `/app/billing`; complete Stripe test purchase.
4. Confirm `/app/billing?checkout=success` shows pending or active state correctly.
5. Trigger Stripe webhook events and confirm `Business.subscriptionStatus`/`stripePriceId` update.
6. Simulate missed call with inactive billing; verify lead captured + SMS paused.
7. Simulate missed call with active billing; verify SMS starts.
8. Confirm `/terms`, `/privacy`, `/refund`, `/contact` render publicly.

## Implemented in this pass (code changes)

- `app/buy/page.tsx`
  - New purchase entry route for external Buy links.
- `app/app/onboarding/actions.ts`
  - Added safe post-onboarding redirect resolver.
- `app/app/onboarding/page.tsx`
  - Added hidden `next` propagation with safe normalization.
- `app/app/billing/page.tsx`
  - Added plan preselection cue and clearer success/pending/canceled post-checkout UX.
- `app/contact/page.tsx`
  - Added public contact page.
- `app/page.tsx`
  - Added Buy CTA and Contact footer link.
- `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/refund/page.tsx`
  - Added explicit link to `/contact`.
- `tests/legal-pages.test.ts`
  - Added contact page heading assertion.
- `README.md`
  - Added external buy-link documentation and new route references.

## Final Ship Assessment

- Readiness: **Conditional GO** for selling once provider production wiring and business decisions are finalized.
- Remaining hard blockers are mostly non-code/business-ops:
  - publish pricing/package decisions
  - confirm production provider configuration end-to-end
  - launch checklist execution evidence
