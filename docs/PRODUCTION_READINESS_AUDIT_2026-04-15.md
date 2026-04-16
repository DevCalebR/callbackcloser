# CallbackCloser Production-Readiness Audit

Date: April 15, 2026  
Audited branch: `codex/production-readiness-audit`

## Executive Summary

CallbackCloser is no longer a fragile prototype. The core SaaS spine is real: public site, Clerk auth, onboarding, protected app, Twilio voice/SMS/status webhooks, Stripe checkout/portal/webhook sync, business-scoped data access, admin provisioning pages, simulator/demo surfaces, rate limiting, health checks, CI, and a meaningful automated test suite are all present and currently green locally.

The repo is closest to a strong operator-led pilot platform, not a fully polished paying-customer SaaS. The largest blockers are not "missing app" problems; they are production-operations and trust problems:

1. Twilio provisioning/compliance is still partly manual and partly placeholder-driven.
2. The public site still reads like a pilot/demo funnel, not a pricing-clear professional SaaS.
3. The environment contract was drifting from the code until this audit pass.
4. The repo still carries documentation sprawl and one experimental Prisma artifact that do not belong in a clean production codebase.
5. Security is generally good for the current single-owner-per-business model, but one production Twilio auth fallback and a few admin/debug surfaces still deserve tightening.

Bottom line: this is materially closer to production than the docs imply, but it is not yet "set it live for real paying customers and stop worrying." The fastest safe path is a focused hardening sequence, not a rewrite.

## Audit Scope

### Product Surfaces Found

- Public marketing site: `/`, `/pricing`, `/contact`, `/demo`, `/sms-consent`, `/privacy`, `/terms`, `/refund`, `/buy`
- Auth: Clerk sign-in and sign-up at `app/(auth)/**`
- Customer onboarding: `/app/onboarding`
- Customer app shell: `/app`
- Leads inbox: `/app/leads`
- Lead workspace: `/app/leads/[leadId]`
- Conversations: `/app/conversations`
- Call-flow readiness page: `/app/call-flow`
- Settings / activation / Twilio sync: `/app/settings`
- Billing / usage: `/app/billing`
- Internal admin console: `/admin`, `/admin/[businessId]`
- Public simulator: `/simulator`
- Health/debug APIs: `/api/health`, `/api/debug/env`
- Provider webhooks/APIs: `/api/twilio/voice`, `/api/twilio/status`, `/api/twilio/sms`, `/api/twilio/provision-number`, `/api/stripe/checkout`, `/api/stripe/portal`, `/api/stripe/webhook`, `/api/leads/[leadId]/recording`
- Background/async style flows: webhook-driven only; no queue worker, cron, or durable async processor found

### Technical Architecture Found

- Framework/runtime: Next.js 14 App Router, TypeScript, Node route handlers
- Database: Prisma + Postgres/Neon
- Auth: Clerk
- Billing: Stripe subscriptions
- Telecom: Twilio voice, SMS, subaccounts, messaging services, partial managed-provisioning automation
- Deployment: Vercel-oriented, `vercel.json`, `lib/env.server.ts`, `docs/PRODUCTION_ENV.md`
- Testing: Node test runner via `tsx --test`, 94 passing tests, CI in `.github/workflows/ci.yml`
- Logging/observability: structured `app.error`, Twilio logging helpers, correlation IDs, optional alert webhook, `/api/health`
- Env loading: `.env`, `.env.local`, `.env.example`, `scripts/check_env.ts`, `lib/env.server.ts`
- Build scripts: `typecheck`, `lint`, `build`, `test`, Prisma commands, env/provider preflight scripts
- Demo/test fixtures: `lib/portfolio-demo.ts`, `lib/demo-data.ts`, simulator business/run models

### Business / Domain Model Found

- `Business`: tenant root, owner binding, Twilio config, billing state, provisioning state
- `Lead`: missed-call lead record, qualification state, readiness, summary, usage/billing flags
- `Call`: missed/answered call record, dial status, recording metadata
- `Message`: inbound/outbound SMS transcript with provider IDs
- `OwnerNotification`: SMS/email/in-app owner delivery with idempotent channel uniqueness
- `BusinessNotificationSettings`: owner notification preferences and destinations
- `SimulatorRun`: isolated public simulator flow
- `SmsConsent`: STOP/START/HELP opt-out state by business and normalized number
- Billing persistence: `stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`, `subscriptionStatus`
- Provisioning persistence: `provisioningStatus`, `managedTwilioStatus`, subaccount/message-service/A2P fields
- Red flag artifact: `playing_with_neon` Prisma model in `prisma/schema.prisma` appears unrelated to product behavior

## Ideal Production-Ready CallbackCloser

### A. Public Marketing Website

- Clear positioning above the fold for local service businesses
- Real pricing amounts, plans, inclusions, exclusions, and CTA expectations
- Visible trust pages and support path
- Consistent brand system across homepage, pricing, demo, and contact
- Mobile polish, no misleading forms, no sales copy that overpromises

### B. Auth and Onboarding

- Clean sign-up/sign-in flow
- Business creation tied to owner account
- Clear "new number vs existing number" setup path
- Number provisioning, webhook setup, owner alert setup, billing activation, and first-test checklist
- A real "you are live" completion state

### C. Customer Application

- Leads inbox optimized for triage
- Lead detail optimized for action and follow-up
- Conversations view for reply-first workflows
- Billing, call-flow, settings, notification preferences, empty states, error states, and loading states
- Clear system-status visibility and usage visibility

### D. Internal/Admin Operations

- Searchable business list
- Provisioning detail view
- Owner connection/invite path
- Twilio subaccount, number, messaging service, compliance, and webhook management
- Diagnostics, resync actions, support-safe access, and health/status visibility
- Manual recovery actions without raw DB edits

### E. Telecom / Twilio Correctness

- Fail-closed webhook verification
- Reliable missed-call -> lead -> SMS -> qualification -> owner alert flow
- STOP/START/HELP compliance handling
- Recording capture and protected access
- Status callback coverage, messaging service correctness, branded links/domain plan where applicable
- Safe behavior when Twilio setup is incomplete

### F. Billing / Subscriptions

- Trusted Stripe checkout and portal
- Webhook-driven subscription sync
- Clear plan mapping and usage visibility
- Honest public pricing
- Trial/refund/cancellation behavior consistent across public copy and product behavior

### G. Security / Tenant Isolation

- Business-scoped reads/writes everywhere
- No client-supplied business ID trust
- Protected recordings/media
- Admin-only routes actually restricted
- No demo bypass in production
- No secret leakage or unsafe logs

### H. Reliability / Operations

- Health checks
- Provider preflight tooling
- Observable structured failures
- Alerting/monitoring
- Safe defaults and documented runbooks
- Repeatable deploy validation

### I. Codebase / Repo Quality

- No dead dependencies
- No stale experimental schema or docs
- No misleading demo-only UI shipped as if real
- Minimal duplication
- Clear single source of truth for operational docs

### J. Vercel / Env Setup

- Explicit production env contract
- No undocumented env vars
- Clear production vs preview vs local split
- No dangerous `NEXT_PUBLIC_` leaks
- No legacy env names hanging around unused

## Production-Readiness Scorecard

| Area | Score | Reasoning |
|---|---:|---|
| Public website | 5.5/10 | Positioning is good and trust pages exist, but pricing lacks actual numbers, CTAs are still pilot/demo oriented, and the visual system is competent rather than premium. |
| Onboarding | 5.0/10 | Business creation works, but there is no true self-serve number path, no owner verification flow, and no durable go-live completion state. |
| Customer dashboard | 6.0/10 | Leads, lead detail, conversations, billing, settings, and call-flow pages exist and feel coherent, but the IA still leans on setup checklists and lacks stronger operational views. |
| Internal admin/ops | 6.0/10 | Admin pages are surprisingly real and useful, but there is no impersonation/read-only support view and A2P/compliance automation is incomplete. |
| Twilio readiness | 6.0/10 | Core voice/SMS/status logic, recording access, compliance keywords, and tests are strong; remaining gaps are managed provisioning, branded sending maturity, and one production auth fallback. |
| Billing readiness | 6.0/10 | Stripe checkout/portal/webhook sync work, but public pricing is incomplete and customer billing UX is still more operational than polished. |
| Security | 7.0/10 | Tenant scoping, webhook verification, rate limiting, recording protection, and middleware are solid; residual risk remains around Twilio subaccount fallback and admin/debug surfaces. |
| Test readiness | 8.0/10 | CI exists, 94 tests pass locally, and coverage hits tenant isolation, webhook auth, simulator isolation, legal pages, and routing. Missing layers are browser/E2E and some provider-edge cases. |
| Deployment readiness | 7.0/10 | Build/lint/test/typecheck/env-check/provider-preflight are all green now; deployment discipline is good, but monitoring and production rollout controls are still light. |
| Repo cleanliness | 5.5/10 | Core code is clean, but docs are sprawling, one experimental Prisma model remains, and tracked sales artifacts still sit in the app repo. |
| Professionalism/polish | 5.5/10 | The product is credible, but it still reads and feels like an operator-managed pilot platform rather than a refined subscription SaaS. |

Overall estimate: **6.2/10**. Strong foundation, not yet "hands-off production SaaS."

## Complete Feature Matrix

| Capability | Should have | Currently has | Status | Notes |
|---|---|---|---|---|
| Homepage | Yes | Yes | Partial | Good positioning, weak premium polish, no hard pricing. |
| Pricing page with actual amounts | Yes | Yes | Partial | Plans exist, dollar pricing does not. |
| Trust/legal pages | Yes | Yes | Complete | Privacy, terms, refund, SMS consent, contact are present. |
| Public demo | Yes | Yes | Complete | `/demo` is isolated and sales-useful. |
| Public simulator | Optional | Yes | Partial | Good demo tool, but should remain tightly isolated and usually off. |
| Sign-up / sign-in | Yes | Yes | Complete | Clerk routes are explicit and tested. |
| Business workspace creation | Yes | Yes | Complete | `/app/onboarding` creates business tied to owner. |
| New number setup path | Yes | Yes | Partial | Purchase exists, but operational maturity is not done. |
| Existing number connection path | Yes | No | Missing | Customer path is explicitly blocked in settings. |
| Billing activation path | Yes | Yes | Complete | Checkout + portal + webhook sync exist. |
| Live go-live confirmation | Yes | Yes | Partial | Readiness pages exist, but no single authoritative completion checkpoint. |
| Leads inbox | Yes | Yes | Complete | Clean list view, business-scoped. |
| Lead workspace | Yes | Yes | Complete | Stronger than inbox; good main action page. |
| Conversations view | Yes | Yes | Partial | Useful, but secondary and still summary-heavy. |
| Owner notification preferences | Yes | Yes | Complete | SMS/email/in-app toggles persist. |
| Usage visibility | Yes | Yes | Complete | Billing page shows usage and automation blocks. |
| Customer operational status | Yes | Yes | Partial | Status badges/checklists exist; no richer diagnostics. |
| Admin business list/search | Yes | Yes | Complete | Search by name, email, ID, Twilio number/SID. |
| Admin provisioning detail | Yes | Yes | Complete | Present and useful. |
| Admin owner connect/invite | Yes | Yes | Complete | Present. |
| Admin impersonation/read-only support | Yes | No | Missing | No safe support view. |
| Twilio webhook sync/re-sync | Yes | Yes | Complete | Present in admin and settings. |
| Twilio A2P/compliance automation | Yes | Yes | Partial | Placeholder flow only; not truly automated. |
| Recording access protection | Yes | Yes | Complete | Business-scoped proxy route with allowlist. |
| Message status callbacks | Yes | No | Missing | No separate outbound message status callback route. |
| Queue/worker for retries | Optional | No | Missing | All async work is inline/webhook-driven. |
| Health endpoint | Yes | Yes | Complete | `/api/health` present. |
| Structured alerting | Yes | Yes | Partial | Optional webhook alerts only; no full monitoring stack. |
| CI | Yes | Yes | Complete | GitHub Actions runs env/db/test/lint/typecheck/build. |

## Current Repo vs Ideal: Gap Analysis

### Public Site

- Exists now:
  - Strong missed-call positioning, public demo, trust pages, contact path, `/buy` handoff.
- Missing:
  - Actual public prices, deeper trust proof, stronger FAQ/support content, stronger brand polish.
- Weak/unprofessional:
  - Pricing reads like packaging notes instead of a commercial SaaS offer.
  - Too much pilot/demo language for a production sales funnel.
- Broken/risky:
  - The SMS consent page previously looked like a real signup form but did not submit anywhere.
- Should remove:
  - Misleading fake consent capture behavior. Fixed in this audit.
- Rebuild/refactor:
  - Replace checklist-style marketing sections with sharper value proof and actual pricing.
- Priority: High

### Auth

- Exists now:
  - Clerk auth, protected routes, middleware fallback behavior, explicit sign-in/up paths.
- Missing:
  - Role model beyond single owner and admin allowlist.
- Weak/unprofessional:
  - Admin auth depends on env allowlist/founder ID rather than a first-class role model.
- Broken/risky:
  - None found in the current single-owner-per-business model.
- Rebuild/refactor:
  - Introduce explicit admin role or internal org in Clerk instead of env-only admin policy.
- Priority: Medium

### Onboarding

- Exists now:
  - Business creation, post-onboarding redirect, auto-provision attempt, clear next-step cards.
- Missing:
  - Existing-number path, owner verification, business creation from internal admin to customer acceptance handoff, durable completion state.
- Weak/unprofessional:
  - Too much "we will help later" energy for flows that should be explicit product states.
- Broken/risky:
  - Auto-provision errors are swallowed into logs, leaving onboarding technically complete even when Twilio setup fails.
- Rebuild/refactor:
  - Convert onboarding into staged activation with explicit blocking states and completion criteria.
- Priority: High

### Leads UX

- Exists now:
  - List-only inbox, filters, link to lead detail, billing block banner.
- Missing:
  - Bulk triage, assignment model, richer search/sort, unread/new signaling.
- Weak/unprofessional:
  - Still more operator dashboard than polished inbox.
- Broken/risky:
  - None obvious.
- Rebuild/refactor:
  - Keep inbox narrow and operational; push all work into lead detail.
- Priority: Medium

### Lead Detail UX

- Exists now:
  - Strong lead workspace with call button, status transitions, transcript, recording access, owner-alert visibility.
- Missing:
  - Internal notes, next-step tasks, callback outcome capture beyond coarse statuses.
- Weak/unprofessional:
  - Limited workflow depth after the initial callback.
- Broken/risky:
  - None obvious.
- Rebuild/refactor:
  - Make this the true workspace: notes, follow-up tasks, callback outcome reasons, and activity history.
- Priority: Medium

### Conversations

- Exists now:
  - List/detail conversation view.
- Missing:
  - Reply controls, reply-state warnings, delivery-state drilldowns.
- Weak/unprofessional:
  - Feels like a read-only side screen, not a true operator console.
- Broken/risky:
  - None obvious.
- Rebuild/refactor:
  - Either deepen it or merge more of this value into lead detail.
- Priority: Medium

### Settings

- Exists now:
  - Business profile, routing, service labels, owner notifications, Twilio sync, activation checklist.
- Missing:
  - Real existing-number connect path, clearer separation between customer-safe settings and admin-only overrides.
- Weak/unprofessional:
  - Customer settings still carry white-glove/manual launch language.
- Broken/risky:
  - Existing number connect path intentionally redirects with an error.
- Rebuild/refactor:
  - Split customer-safe self-serve setup from internal rollout controls more cleanly.
- Priority: High

### Billing

- Exists now:
  - Stripe checkout, portal, webhook sync, plan mapping, usage counters, billing-state messaging.
- Missing:
  - Real public price transparency, trials, invoice history, cancellation/status timeline.
- Weak/unprofessional:
  - Public pricing does not match what a paying SaaS customer expects to see before purchase.
- Broken/risky:
  - None obvious in code flow.
- Rebuild/refactor:
  - Align public pricing, billing page, and refund language into one consistent billing story.
- Priority: High

### Twilio Flows

- Exists now:
  - Voice webhook, dial status callback, missed-call lead creation, SMS intake, STOP/START/HELP, recording metadata, owner alerts, webhook sync, subaccount/message-service support.
- Missing:
  - True A2P automation, branded links/domain handling, outbound message status webhook, durable async retries/queue.
- Weak/unprofessional:
  - Compliance/A2P state is partly real, partly placeholder.
- Broken/risky:
  - `lib/managed-twilio.ts` contains an explicit placeholder A2P implementation.
  - `lib/twilio-webhook.ts` allows shared-token fallback for production subaccount webhooks when signature validation does not match.
- Rebuild/refactor:
  - Finish TrustHub/A2P flows, add message-status callbacks, remove token fallback in production once subaccount signature validation is solved correctly.
- Priority: Critical blocker

### Admin Tooling

- Exists now:
  - Business list/search, create business, create demo business, owner connect/invite, provisioning, webhook resync, Twilio mapping overrides, status controls.
- Missing:
  - Impersonation/read-only support mode, richer diagnostics, audit views, retry history, message-status insights.
- Weak/unprofessional:
  - Good operator tool, but still founder-console quality rather than mature backoffice.
- Broken/risky:
  - Admin access is env-config dependent; no in-product role management.
- Rebuild/refactor:
  - Add explicit support tooling and health diagnostics before scale.
- Priority: High

### Legal / Compliance Pages

- Exists now:
  - Privacy, terms, refund, SMS consent, contact.
- Missing:
  - Deeper support, complaint, and carrier-review clarity.
- Weak/unprofessional:
  - Consent page previously implied storage/submission where none existed. Fixed in this audit.
- Broken/risky:
  - None after fix.
- Rebuild/refactor:
  - Keep trust copy synced with exact production behavior and pricing.
- Priority: Medium

### Environment Setup

- Exists now:
  - Strong runtime validation, env check script, provider preflight, production docs.
- Missing:
  - Previously missing documentation for admin/email/simulator env vars.
- Weak/unprofessional:
  - Env contract was not fully mirrored in `.env.example` and docs.
- Broken/risky:
  - `npm run preflight:providers` was broken until this audit. Fixed in this audit.
- Rebuild/refactor:
  - Keep one source of truth for env docs and wire it into CI if possible.
- Priority: High

### Tests

- Exists now:
  - 94 passing tests, CI, tenant-isolation tests, Twilio security tests, legal-page tests.
- Missing:
  - Browser/E2E, admin UI flow tests, message-status callback tests, production deploy smoke automation.
- Weak/unprofessional:
  - Tests are code-heavy integration/unit checks, not end-to-end story validation.
- Broken/risky:
  - Earlier test-runner note appears resolved locally now; current state is green.
- Rebuild/refactor:
  - Add browser smoke checks for public site, onboarding, billing, and a simulated lead flow.
- Priority: Medium

### Security

- Exists now:
  - Business-scoped access helpers, protected routes, recording proxy restrictions, rate limiting, env validation, prod demo guardrail.
- Missing:
  - Stronger admin role model, stricter production debug surface policy, broader tenant isolation regression coverage across future multi-user changes.
- Weak/unprofessional:
  - Admin and demo controls still rely heavily on env policy.
- Broken/risky:
  - Production Twilio subaccount shared-token fallback is the main security exception.
- Rebuild/refactor:
  - Remove the fallback, lock admin to first-class roles, consider removing `/api/debug/env` from production entirely.
- Priority: Critical blocker

### Repo Hygiene

- Exists now:
  - Reasonably tidy source tree, strong naming in core code, minimal dependency set after cleanup.
- Missing:
  - One source of truth for launch/production docs.
- Weak/unprofessional:
  - Multiple overlapping roadmap/readiness docs.
  - Tracked Upwork/export artifacts inside product repo.
- Broken/risky:
  - `playing_with_neon` model in Prisma schema is dead-looking experimental residue.
- Rebuild/refactor:
  - Consolidate docs, remove non-product artifacts, clean schema leftovers with a planned migration.
- Priority: High

## Missing / Incomplete Items Report

### Critical before real customers

1. Finish real Twilio A2P/compliance workflow; remove placeholder behavior in `lib/managed-twilio.ts`.
2. Remove production subaccount shared-token fallback in `lib/twilio-webhook.ts` and solve signature validation correctly for subaccounts.
3. Publish real pricing numbers and plan terms; align `/pricing`, billing UI, refund copy, and checkout story.
4. Add a real customer setup path for existing numbers or explicitly keep it admin-only and stop implying self-serve parity.
5. Decide whether owner email alerts are a real product promise; if yes, configure Resend in production and document it as recommended env.

### High priority soon after

1. Add outbound message status callback handling and surface delivery failures in the product.
2. Add support-safe admin view or impersonation alternative.
3. Consolidate launch/readiness docs into one operational source of truth.
4. Remove schema artifact `playing_with_neon` with a safe migration.
5. Add browser/E2E smoke coverage for public site, onboarding, billing, and simulator or demo flows.

### Later polish

1. Stronger premium visual system on the public site.
2. More powerful lead workspace with notes/tasks/callback outcomes.
3. Notification center and richer business diagnostics.
4. Better FAQ/help/support surfaces.

## Vercel Environment Variable Report

| Variable | Required? | Environments | Purpose | Where used | Safe as `NEXT_PUBLIC`? | Presently used correctly? | Action needed |
|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Production, Preview, Development | Canonical app URL for redirects and webhook URL generation | `lib/env.server.ts`, `lib/app-url.ts`, Stripe/Twilio URL builders | Yes | Yes | Keep explicit in all deployed envs. |
| `DATABASE_URL` | Yes | Production, Preview, Development | Runtime DB connection | Prisma schema, health checks, db smoke | No | Yes | Use Neon pooled URL with `sslmode=require` in prod. |
| `DIRECT_DATABASE_URL` | Yes | Production, Preview, Development | Prisma direct connection for migrate/deploy | Prisma schema, env validation | No | Yes | Use Neon non-pooler URL with `sslmode=require`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Production, Preview, Development | Clerk frontend auth | `app/layout.tsx`, middleware, preflight | Yes | Yes | Keep explicit; avoid preview fallback reliance. |
| `CLERK_SECRET_KEY` | Yes | Production, Preview, Development | Clerk backend auth | `middleware.ts`, auth helpers, env checks | No | Yes | Required everywhere the protected app runs. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | No | Production, Preview, Development | Explicit Clerk sign-in route | `lib/clerk-config.ts`, provider preflight | Yes | Yes | Recommended to keep set to `/sign-in`. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | No | Production, Preview, Development | Explicit Clerk sign-up route | `lib/clerk-config.ts`, provider preflight | Yes | Yes | Recommended to keep set to `/sign-up`. |
| `ADMIN_EMAIL_ALLOWLIST` | Conditional | Production, Preview, Development | Admin access allowlist | `lib/admin.ts` | No | Yes after docs fix | Set for any environment where `/admin` should work. |
| `ALLOW_FOUNDER_BILLING_BYPASS` | No | Development or tightly controlled Production only | Founder-only billing bypass | `lib/subscription.ts`, env checks | No | Yes | Keep unset in real customer production. |
| `FOUNDER_CLERK_USER_ID` | Conditional | Development or tightly controlled Production only | Founder bypass identity and optional admin fallback | `lib/subscription.ts`, `lib/admin.ts` | No | Mostly | Set only if founder bypass is intentionally enabled. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | No | Any | Future client-side Stripe usage | Docs only; no runtime usage found | Yes | No | Remove from Vercel if unused, or implement client-side use. |
| `STRIPE_SECRET_KEY` | Yes | Production, Preview, Development | Server Stripe API access | `lib/stripe.ts`, billing page, checkout/portal, health | No | Yes | Keep separate preview/test and prod/live values. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Production, Preview, Development | Stripe webhook verification | `app/api/stripe/webhook/route.ts`, env/preflight | No | Yes | Must match deployed endpoint. |
| `STRIPE_PRICE_STARTER` | Yes | Production, Preview, Development | Starter plan allowlist and usage tier mapping | checkout route, billing page, usage logic | No | Yes | Keep aligned with real public pricing. |
| `STRIPE_PRICE_PRO` | Yes | Production, Preview, Development | Growth/Pro plan allowlist and usage tier mapping | checkout route, billing page, usage logic | No | Yes | Rename to `STRIPE_PRICE_GROWTH` later if you want naming consistency, but do not churn now without migration across docs/code. |
| `TWILIO_ACCOUNT_SID` | Yes | Production, Preview, Development | Twilio API account and webhook verification | Twilio clients, health checks, recording proxy | No | Yes | Keep synced with parent account used for webhooks. |
| `TWILIO_AUTH_TOKEN` | Yes | Production, Preview, Development | Twilio API auth and signature verification | Twilio clients, webhook auth, recording proxy | No | Yes | Rotate carefully; production signatures depend on it. |
| `TWILIO_WEBHOOK_AUTH_TOKEN` | Yes | Production, Preview, Development | Shared token for webhook tooling and non-prod fallback | webhook URL builder, token auth, sync scripts | No | Partly | Keep set, but eliminate production reliance beyond tooling. |
| `TWILIO_VALIDATE_SIGNATURE` | Yes | Production; recommended Preview/Development | Enforce `X-Twilio-Signature` validation | `lib/twilio-webhook.ts`, env checks | No | Yes | Keep `true` in production; also preferred in preview. |
| `RESEND_API_KEY` | No, but recommended if promising email alerts | Production, Preview, Development | Owner email delivery | `lib/email.ts` | No | Yes after docs fix | Add if email alerts are part of the customer promise. |
| `CALLBACKCLOSER_FROM_EMAIL` | No, but recommended if promising email alerts | Production, Preview, Development | Verified sender for owner emails | `lib/email.ts` | No | Yes after docs fix | Add with a verified domain/sender. |
| `DEBUG_ENV_ENDPOINT_TOKEN` | No | Production only if endpoint retained | Protect `/api/debug/env` | `app/api/debug/env/route.ts` | No | Yes | Remove env and/or route if you do not need prod debugging. |
| `PORTFOLIO_DEMO_MODE` | No | Development only | Portfolio demo auth/data bypass | `lib/portfolio-demo.ts`, guardrail | No | Yes | Keep unset in production. |
| `ALLOW_PRODUCTION_DEMO_MODE` | No | Production break-glass only | Override demo guardrail | `lib/portfolio-demo-guardrail.ts` | No | Yes | Leave unset normally. |
| `ENABLE_PUBLIC_MISSED_CALL_SIMULATOR` | No | Optional Preview/Production | Enable public simulator | `lib/simulator.ts` | No | Yes after docs fix | Keep off unless demo workspace is intentionally configured. |
| `SIMULATOR_BUSINESS_ID` | No | Optional Preview/Production | Simulator tenant binding | `lib/simulator.ts`, admin demo workflow | No | Yes after docs fix | Must always point to a dedicated demo business. |
| `ENABLE_PUBLIC_SIMULATOR_REAL_SMS` | No | Optional Preview/Production | Allow simulator to send real caller-side SMS | `lib/simulator.ts`, simulator UI copy | No | Yes after docs fix | Keep off by default. |
| `RATE_LIMIT_WINDOW_MS` | No | Optional | Shared rate-limit window | `lib/rate-limit-config.ts` | No | Yes | Tune only with data. |
| `RATE_LIMIT_TWILIO_AUTH_MAX` | No | Optional | Authorized Twilio traffic rate limit | `lib/rate-limit-config.ts`, Twilio routes | No | Yes | Leave default unless false positives appear. |
| `RATE_LIMIT_TWILIO_UNAUTH_MAX` | No | Optional | Unauthorized Twilio traffic limit | `lib/rate-limit-config.ts`, Twilio routes | No | Yes | Leave default unless needed. |
| `RATE_LIMIT_STRIPE_AUTH_MAX` | No | Optional | Authorized Stripe webhook limit | `lib/rate-limit-config.ts`, Stripe webhook | No | Yes | Leave default unless needed. |
| `RATE_LIMIT_STRIPE_UNAUTH_MAX` | No | Optional | Unauthorized Stripe webhook limit | `lib/rate-limit-config.ts`, Stripe webhook | No | Yes | Leave default unless needed. |
| `RATE_LIMIT_PROTECTED_API_MAX` | No | Optional | Protected checkout/portal mutation limit | `lib/rate-limit-config.ts`, middleware | No | Yes | Leave default unless needed. |
| `ALERT_WEBHOOK_URL` | No | Optional Production/Preview | Push structured errors to Slack/Pager/etc. | `lib/observability.ts` | No | Yes | Recommended if on-call visibility matters. |
| `ALERT_WEBHOOK_TOKEN` | No | Optional | Bearer token for alert destination | `lib/observability.ts` | No | Yes | Set only if receiver requires auth. |
| `ALERT_WEBHOOK_TIMEOUT_MS` | No | Optional | Alert dispatch timeout | `lib/observability.ts` | No | Yes | Keep default unless needed. |
| `TWILIO_WEBHOOK_VOICE_URL` | No | Optional | Preflight parity check only | `lib/provider-preflight.ts` | No | Yes | Remove from Vercel if you are not using parity checks. |
| `TWILIO_WEBHOOK_SMS_URL` | No | Optional | Preflight parity check only | `lib/provider-preflight.ts` | No | Yes | Remove from Vercel if unused. |
| `TWILIO_WEBHOOK_STATUS_URL` | No | Optional | Preflight parity check only | `lib/provider-preflight.ts` | No | Yes | Remove from Vercel if unused. |
| `VERCEL_ENV` | Auto | Vercel only | Runtime environment label | app URL resolution, guardrails | No | Yes | Do not set manually. |
| `VERCEL_URL` | Auto | Vercel only | Preview URL fallback | `lib/app-url.ts` | No | Yes | Do not set manually. |
| `VERCEL_PROJECT_PRODUCTION_URL` | Auto | Vercel only | Production URL fallback | `lib/app-url.ts` | No | Yes | Do not set manually. |
| `NODE_ENV` | Auto | All | Runtime mode | multiple files | No | Yes | Do not manually override on Vercel. |
| `NEXT_PHASE` | Auto | Build only | Skip env validation during prerender build phase | `lib/env.server.ts` | No | Yes | Do not set manually. |

### Minimum Viable Production Env Set

- `NEXT_PUBLIC_APP_URL`
- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WEBHOOK_AUTH_TOKEN`
- `TWILIO_VALIDATE_SIGNATURE=true`
- One admin mechanism:
  - `ADMIN_EMAIL_ALLOWLIST`, or
  - `FOUNDER_CLERK_USER_ID` only if you are intentionally using founder access

### Recommended Full Production Env Set

- Minimum set above
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
- `ADMIN_EMAIL_ALLOWLIST`
- `RESEND_API_KEY`
- `CALLBACKCLOSER_FROM_EMAIL`
- `ALERT_WEBHOOK_URL`
- `ALERT_WEBHOOK_TOKEN` if needed
- `ALERT_WEBHOOK_TIMEOUT_MS`
- Optional rate-limit overrides only if you have observed traffic patterns that justify tuning

### Remove From Vercel If Unused

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `PORTFOLIO_DEMO_MODE`
- `ALLOW_PRODUCTION_DEMO_MODE`
- `ALLOW_FOUNDER_BILLING_BYPASS`
- `FOUNDER_CLERK_USER_ID` if bypass is off
- `ENABLE_PUBLIC_MISSED_CALL_SIMULATOR`
- `SIMULATOR_BUSINESS_ID`
- `ENABLE_PUBLIC_SIMULATOR_REAL_SMS`
- `TWILIO_WEBHOOK_VOICE_URL`
- `TWILIO_WEBHOOK_SMS_URL`
- `TWILIO_WEBHOOK_STATUS_URL`
- `DEBUG_ENV_ENDPOINT_TOKEN` if you remove or stop using `/api/debug/env`

## Repo Cleanup Report

| Path / package / script | Why it is unnecessary or risky | Action | Safe now? | Exact recommendation |
|---|---|---|---|---|
| `package.json` / `package-lock.json` `lucide-react` | Installed but unused anywhere in source/tests | Delete | Yes | Removed in this audit. |
| `prisma/schema.prisma` `model playing_with_neon` | Looks like leftover experimentation, not product data | Delete via migration | No, not blindly | Verify table is unused in the live DB, then add a cleanup migration to drop it. |
| `docs/upwork/*` | Sales/export artifacts, not product operations | Move or delete | Likely | Move to a separate sales/reference repo or archive folder outside the app repo. |
| Root/doc readiness files: `FINISHING_REPORT.md`, `LAUNCH_*`, `PILOT_LAUNCH_CHECKLIST.md`, `PRODUCTION_SMOKE_TEST.md`, `docs/PRODUCTION_*`, `docs/SHIP_READINESS_AUDIT.md`, `GO_TO_MARKET_CHECKLIST.md` | Overlapping operational truth; hard to know which doc is canonical | Merge / archive | Yes, with care | Consolidate into `docs/operations/` with one runbook, one env guide, one rollout checklist, one audit. |
| `/api/debug/env` | Useful but easy to forget and unnecessary in steady-state production | Document or delete | Conditional | Keep token-protected only if used operationally; otherwise remove. |
| Public simulator envs and demo business | Valuable for demos, risky if left casually enabled | Document / disable | Yes | Keep off by default; never point at a real customer business. |
| Ignored local artifact dirs: `portfolio_demo_video`, `portfolio_screenshots*`, `upwork_gallery_images` | Large local clutter; not part of git | Delete locally if no longer needed | Yes | Safe local cleanup only, not a git change. |

## Security / Risk Report

### Confirmed-safe areas

- Tenant isolation is correct for the current single-owner-per-business model:
  - `requireBusiness()` resolves the business from the signed-in owner
  - lead, conversation, settings, billing, and recording lookups scope by `businessId` or `ownerClerkId`
- Recording access is protected:
  - `/api/leads/[leadId]/recording` requires auth, verifies ownership, allowlists Twilio hosts, proxies media privately
- Protected routes are behind middleware with Clerk protection
- Production env validation fails closed for missing critical env and demo-mode misuse
- Stripe webhook verification is real and rate-limited
- Twilio STOP/START/HELP handling is persisted and tested

### Findings

1. `lib/twilio-webhook.ts`: production subaccount requests can fall back to shared-token auth if signature validation fails and the request account SID differs from the parent SID. This is a real security exception and should be removed once subaccount signature handling is solved properly.
2. `lib/managed-twilio.ts`: A2P/compliance provisioning is still placeholder logic, which means compliance state is not fully trustworthy as an automated ops surface.
3. `/api/debug/env`: token-protected in production, but still an avoidable surface. Keep only if truly useful.
4. Admin authorization is env-driven rather than role-driven. That is workable today, but brittle over time.

### Test coverage status

- Current state: tests truly run locally now. `npm run test` passes with 94 tests.
- Tenant-isolation coverage is materially better than the prior note suggested:
  - `tests/tenant-isolation.test.ts`
  - `tests/tenant-isolation-wiring.test.ts`
  - `tests/business-admin-lookup.test.ts`
  - `tests/recording-access.test.ts`
- Still missing:
  - Browser/E2E proof that owner alerts deep-link and customer flows behave correctly in the running app
  - Coverage for future multi-user or staff-per-business models
  - Coverage for outbound message delivery callbacks because that route does not exist yet

## Professional Polish Report

### What still feels unfinished or amateur

1. Public pricing has no actual prices.
2. The public site still sells a "pilot" more than a stable subscription product.
3. Settings and call-flow pages feel like launch checklists rather than a calm production app.
4. There is no strong support/operator mode for internal troubleshooting.
5. The repo still carries too many overlapping launch/readiness docs.
6. The Prisma schema still contains one obvious experimental leftover.
7. The product lacks richer operational visibility once leads start flowing at real volume.

### What already feels credible

1. The core missed-call recovery loop is well represented in code.
2. The lead inbox and lead workspace split is directionally right.
3. The admin pages are more advanced than typical MVP backoffices.
4. Tenant isolation discipline is much better than average early SaaS work.
5. Validation tooling and CI are real, not decorative.

## Recommended Fix-It Plan

### Critical before real customers

1. Twilio auth hardening
   - Remove production shared-token fallback for subaccount webhooks.
   - Add the correct subaccount signature-verification approach and tests.
2. Managed Twilio completion
   - Replace A2P placeholder logic with real TrustHub/A2P workflow and status reconciliation.
3. Public pricing + trust alignment
   - Publish actual plan prices and align marketing, billing, refund, and checkout copy.
4. Setup-path clarity
   - Decide whether existing-number setup is supported self-serve or admin-only, then make UI and copy match reality.

### High priority soon after

1. Outbound SMS delivery observability
   - Add Twilio message-status callback route and dashboard surfacing for failed/delayed sends.
2. Admin/support hardening
   - Add support-safe read-only view or impersonation alternative plus business diagnostics.
3. Repo cleanup PR
   - Remove schema artifact, move sales assets, consolidate docs.
4. End-to-end validation
   - Add browser smoke suite for public site, onboarding, billing, and simulator/demo flow.

### Later polish

1. Premium design pass on the public site
2. Lead workspace depth: notes, callback outcomes, tasks
3. Support/help center and richer customer diagnostics

## Recommended PR Plan

1. `ops/env-contract-and-preflight-hardening`
   - Env docs, `.env.example`, provider preflight, CI/env consistency
2. `security/twilio-webhook-verification-hardening`
   - Remove production token fallback, strengthen tests
3. `twilio/managed-provisioning-and-a2p-completion`
   - Finish managed Twilio compliance workflow
4. `billing/public-pricing-and-subscription-clarity`
   - Real pricing numbers, billing copy, trust alignment
5. `onboarding/activation-flow-and-number-setup-clarity`
   - Explicit setup paths and authoritative go-live states
6. `app/lead-workspace-and-operator-ux`
   - Push action depth into lead detail; improve inbox/workspace coherence
7. `admin/support-console-and-diagnostics`
   - Read-only support tooling, business health checks, recovery actions
8. `repo/cleanup-and-doc-consolidation`
   - Remove dead schema/docs/assets, tighten repo hygiene
9. `qa/e2e-smoke-and-production-verification`
   - Browser/E2E smoke tests and deploy verification story

## Changes Applied In This Audit

- Fixed `npm run preflight:providers` by removing the top-level-await/CJS incompatibility in `scripts/provider_preflight.ts`.
- Expanded `.env.example` so it now reflects the real env surface for admin access, email alerts, and simulator controls.
- Expanded `docs/PRODUCTION_ENV.md` to document the previously missing env vars.
- Removed unused dependency `lucide-react`.
- Converted the public SMS consent component from a misleading fake submission flow into an explicit consent-language reference.
- Updated legal-page test coverage to match the corrected consent component behavior.

## Validation Run

Commands run and current result:

- `npm install` -> PASS
- `npm run env:check` -> PASS
- `npm run preflight:providers` -> FAILED before fix due top-level-await/CJS issue; PASS after fix
- `npm run db:validate` -> PASS
- `npx prisma migrate status` -> PASS, schema up to date
- `npm run typecheck` -> PASS
- `npm run lint` -> PASS
- `npm run test` -> PASS, 94 tests
- `npm run build` -> PASS
- `npm audit --omit=dev` -> FAIL, remaining transitive vulnerabilities in `twilio`/`axios` and `next`

Dependency security note:

- `npm audit --omit=dev` currently reports 5 production vulnerabilities:
  - `twilio` via `axios` / `follow-redirects`
  - `next`
- Audit output reported no automatic fix path from the currently installed dependency graph.
