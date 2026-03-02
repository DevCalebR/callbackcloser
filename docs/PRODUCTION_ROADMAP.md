# CallbackCloser Production Readiness Roadmap

Date: March 2, 2026  
Target: Launch to paying customers in next release

## 1) Current State Snapshot

### Stack + deploy target

- Framework: Next.js 14 App Router + TypeScript
- UI: Tailwind + shadcn-style components
- Auth: Clerk
- Billing: Stripe subscriptions + portal
- Telephony/SMS: Twilio Voice + Messaging webhooks
- Data: Prisma + Postgres (Neon-oriented config)
- Deploy target: Vercel (`vercel.json`, Vercel-specific docs/runbooks)

### Provider integrations in code

- Clerk
  - Protected app shell and Stripe mutation routes via `middleware.ts`
  - Server-side owner/business checks in `lib/auth.ts`
- Stripe
  - Checkout: `app/api/stripe/checkout/route.ts`
  - Webhook: `app/api/stripe/webhook/route.ts`
  - Billing portal: `app/api/stripe/portal/route.ts`
- Twilio
  - Voice webhook: `app/api/twilio/voice/route.ts`
  - Dial status/recording callback: `app/api/twilio/status/route.ts`
  - SMS webhook: `app/api/twilio/sms/route.ts`
  - Signature/token verification: `lib/twilio-webhook.ts`
- Database
  - Prisma schema/migrations: `prisma/schema.prisma`, `prisma/migrations/*`

### Key env vars (shipping-critical)

Required in production (enforced by `lib/env.server.ts` + `scripts/check_env.ts`):

- App/platform
  - `NEXT_PUBLIC_APP_URL`
- Database
  - `DATABASE_URL`
  - `DIRECT_DATABASE_URL`
- Clerk
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
- Stripe
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_STARTER`
  - `STRIPE_PRICE_PRO`
- Twilio
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_WEBHOOK_AUTH_TOKEN`
  - `TWILIO_VALIDATE_SIGNATURE=true` in production

Operationally recommended

- `ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_TOKEN`, `ALERT_WEBHOOK_TIMEOUT_MS`
- Rate limit tuning vars: `RATE_LIMIT_*`
- `DEBUG_ENV_ENDPOINT_TOKEN` (locks `/api/debug/env` in prod)

### Current production posture summary

- Strengths
  - Production env validation present
  - Stripe + Twilio webhook signature checks present
  - Twilio/Stripe rate limiting present
  - Correlation IDs on Twilio/Stripe webhooks
  - Legal pages exist (`/terms`, `/privacy`, `/refund`, `/contact`)
- Gaps (remaining)
  - No Sentry-style external error monitor yet (only alert webhook)
  - No explicit uptime monitor wiring documented
  - Audit logging is lightweight log-only (no durable audit table)
  - Product/commercial boundaries still need owner signoff

## 2) Definition of Production Ready (DoPR)

CallbackCloser is **production ready** when all acceptance criteria below are true:

1. Environment + deployment
- Production and preview envs are configured and validated (`npm run env:check` passes in CI and prod runtime boots without env errors).
- Migration workflow is deterministic (`npx prisma migrate deploy` succeeds on target DB).

2. Security + access control
- All tenant reads/writes are constrained by business ownership checks.
- Twilio webhook requests require valid signature in production.
- Stripe webhooks require valid signature.
- Protected mutation routes (`/api/stripe/checkout`, `/api/stripe/portal`) enforce same-origin in production.
- Security headers are present on app/API responses.

3. Payments + entitlements
- Checkout -> webhook -> subscription state -> feature gating works for Starter and Pro.
- Failed payment and canceled subscription states reliably pause automation.
- Billing portal path works for active customers.

4. Twilio operations
- Voice/status/sms webhook flows are idempotent under retries.
- Missed-call SMS automation only runs when entitled.
- STOP/START/HELP compliance behavior verified.

5. Data safety
- Backups and restore drill are documented and tested.
- Data retention policy for PII/call metadata is explicitly approved.

6. Observability + incident response
- Structured logs include correlation IDs and core entity IDs.
- Alerting is enabled and tested for critical failures.
- `/api/health` is monitored for uptime/readiness.

7. Customer ops
- Legal/support pages are public and accurate.
- Support SLA and incident runbook are documented for first customers.

## Owner Decision Needed (must be resolved before GA)

### Pricing/tier boundaries (Stripe model)

- Option 1 (recommended for current code): Starter vs Pro
  - Starter: 1 owner seat, base monthly conversation cap
  - Pro: higher cap + team features when RBAC ships
- Option 2: Trial -> Paid
  - Trial period or usage-based trial before paid tier required
- Option 3: Single paid tier + usage add-ons
  - Simplest launch messaging, lower packaging complexity

Decision owner inputs required:
- Price points
- Included conversation limits
- Refund policy window language

### Data retention policy

- Option 1 (recommended): 12-month default retention for lead/message metadata; manual deletion path
- Option 2: 6-month rolling retention for cost/privacy minimization
- Option 3: customer-selectable retention tiers (post-launch)

## 3) Phased Roadmap (Specific, Testable, Prioritized)

## P0 Launch Blockers (must-have)

### Environments & config (A)

- [ ] `P0-A1` Production env parity gate in CI
  - File/area: `.github/workflows/ci.yml`, `scripts/check_env.ts`
  - Why it matters: Prevents broken deploys from missing critical env config.
  - Verify:
    - Command: `npm run env:check`
    - Expected: `Result: PASS`

- [ ] `P0-A2` Release checklist requires explicit Preview vs Production var review
  - File/area: `RUNBOOK.md`, `docs/PRODUCTION_ENV.md`
  - Why it matters: Avoids writing Twilio webhooks to preview URLs or wrong keys.
  - Verify:
    - Command: manual checklist execution before deploy
    - Expected: checklist artifact attached to release ticket

### Authn/Authz + security (B)

- [x] `P0-B1` Add global security headers
  - File/area: `lib/security-headers.ts`, `middleware.ts`
  - Why it matters: reduces clickjacking/MIME-sniffing/header-based attack surface.
  - Verify:
    - Command: `curl -I http://localhost:3000 | egrep 'X-Frame-Options|X-Content-Type-Options|Referrer-Policy|Permissions-Policy'`
    - Expected: headers present with configured values

- [x] `P0-B2` Same-origin validation on authenticated Stripe mutation routes (CSRF hardening)
  - File/area: `lib/request-origin.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/portal/route.ts`
  - Why it matters: reduces risk of cross-site POST abuse against billing actions.
  - Verify:
    - Command: `node --test --experimental-strip-types --experimental-specifier-resolution=node tests/request-origin.test.ts`
    - Expected: all tests pass

- [ ] `P0-B3` Tenant authz regression tests for lead access boundaries
  - File/area: `app/app/leads/*`, `app/app/leads/actions.ts`, new integration tests
  - Why it matters: prevents cross-business data leaks (support/legal risk).
  - Verify:
    - Command: add and run tenant-boundary tests
    - Expected: unauthorized cross-tenant reads/writes return 404/redirect/error

- [ ] `P0-B4` Dependency vulnerability gate
  - File/area: `package.json`, CI workflow
  - Why it matters: catches known CVEs before release.
  - Verify:
    - Command: `npm audit --production --audit-level=high`
    - Expected: no high/critical vulnerabilities

### Payments & entitlements (C)

- [x] `P0-C1` Correlation IDs + structured errors for checkout/portal routes
  - File/area: `app/api/stripe/checkout/route.ts`, `app/api/stripe/portal/route.ts`
  - Why it matters: faster incident debugging for billing failures.
  - Verify:
    - Command: run checkout/portal flows locally; inspect server logs
    - Expected: `X-Correlation-Id` on responses and structured `app.error` for failures

- [x] `P0-C2` Audit log events for billing session creation
  - File/area: `lib/audit-log.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/portal/route.ts`
  - Why it matters: support traceability for "I clicked buy/manage billing" tickets.
  - Verify:
    - Command: run billing actions and inspect logs
    - Expected: `app.audit` entries with event + actor + business

- [ ] `P0-C3` Stripe live-mode readiness checklist
  - File/area: `docs/EXTERNAL_SETUP_CHECKLIST.md`, new section in `docs/PRODUCTION_ENV.md`
  - Why it matters: avoids mixing test/live keys and webhook endpoints.
  - Verify:
    - Command: manual checklist + Stripe dashboard verification
    - Expected: live keys, live webhook endpoint, expected event set

- [ ] `P0-C4` Owner final decision on tier boundaries + prices
  - File/area: pricing docs + Stripe product config
  - Why it matters: prevents sell/fulfillment mismatch and refund disputes.
  - Verify:
    - Command: owner signoff record
    - Expected: finalized tier doc and matching Stripe Price IDs

### Twilio operational readiness (D)

- [ ] `P0-D1` Twilio signature+retry+idempotency smoke in production-like env
  - File/area: `app/api/twilio/*`, `lib/twilio-webhook.ts`, `lib/twilio-webhook-retry.ts`
  - Why it matters: prevents missed leads and duplicate messaging.
  - Verify:
    - Command: Twilio test call/SMS + replay callback
    - Expected: no duplicate lead/messages, expected 2xx/503 semantics

- [ ] `P0-D2` Twilio webhook URL sync lock procedure
  - File/area: `app/app/settings/actions.ts`, `RUNBOOK.md`
  - Why it matters: prevents accidentally pointing prod number to preview URL.
  - Verify:
    - Command: resync webhooks from production only
    - Expected: Twilio Console URLs match production `NEXT_PUBLIC_APP_URL`

### Data & migrations (E)

- [ ] `P0-E1` Pre-release migration + rollback plan approved
  - File/area: `prisma/migrations/*`, `docs/DB_NEON_PRISMA.md`, `RUNBOOK.md`
  - Why it matters: avoids schema drift and deploy failures.
  - Verify:
    - Command: `npx prisma migrate status` and `npx prisma migrate deploy`
    - Expected: clean migration status; deploy success

- [ ] `P0-E2` Backup/restore drill evidence (most recent <30 days)
  - File/area: `docs/BACKUP_RESTORE_RUNBOOK.md`
  - Why it matters: protects against catastrophic data-loss incidents.
  - Verify:
    - Command: execute restore drill in non-prod and run `npm run db:smoke`
    - Expected: restore success evidence attached to release

### Observability (F)

- [x] `P0-F1` Health/readiness endpoint for uptime probes
  - File/area: `app/api/health/route.ts`
  - Why it matters: gives ops and monitors a deterministic service+DB readiness signal.
  - Verify:
    - Command: `curl -s -o /tmp/health.json -w "%{http_code}\n" http://localhost:3000/api/health && cat /tmp/health.json`
    - Expected: `200` and JSON with `status: ok` when DB/env ready (or `503` + `degraded` when not)

- [x] `P0-F2` Lightweight audit logging for key user actions
  - File/area: `lib/audit-log.ts`, `app/app/onboarding/actions.ts`, `app/app/settings/actions.ts`, `app/app/leads/actions.ts`
  - Why it matters: supports incident response and customer dispute resolution.
  - Verify:
    - Command: run onboarding/settings/lead-status actions
    - Expected: `app.audit` logs emitted with actor/business/target metadata

- [ ] `P0-F3` Alert webhook configured and tested
  - File/area: `lib/observability.ts`, env config
  - Why it matters: critical failures must page humans, not stay in logs.
  - Verify:
    - Command: trigger synthetic error in non-prod
    - Expected: alert delivered to configured destination

### Reliability & performance (G)

- [ ] `P0-G1` Provider outage behavior validation
  - File/area: Twilio/Stripe route handlers, `lib/twilio-webhook-retry.ts`
  - Why it matters: graceful degradation prevents data loss/support spikes.
  - Verify:
    - Command: simulate provider failure and replay callbacks
    - Expected: retryable failures (`503`) where appropriate, no duplicate durable state

### Legal & customer ops (H)

- [x] `P0-H1` Public legal/support pages available
  - File/area: `app/terms/page.tsx`, `app/privacy/page.tsx`, `app/refund/page.tsx`, `app/contact/page.tsx`, `app/page.tsx`
  - Why it matters: minimum legal/customer trust baseline for paid launch.
  - Verify:
    - Command: `npm test` (includes legal page assertions) + manual URL checks
    - Expected: all pages render publicly and are linked from landing page/footer

- [ ] `P0-H2` Minimal support SLA and escalation policy published
  - File/area: docs/customer-facing support policy (new)
  - Why it matters: reduces support ambiguity and churn risk.
  - Verify:
    - Command: policy review signoff
    - Expected: published SLA language + contact path

## P1 Launch Enhancers (strongly recommended)

### Environments & config (A)

- [ ] `P1-A1` Environment matrix doc (dev/staging/prod values and owners)
  - File/area: new `docs/ENV_MATRIX.md`
  - Why it matters: decreases configuration drift and onboarding errors.
  - Verify:
    - Command: docs review against Vercel/Neon/Stripe/Twilio dashboards
    - Expected: all required vars mapped to source of truth

### Security posture (B)

- [ ] `P1-B1` Add explicit CSP (report-only first)
  - File/area: middleware or Next config headers
  - Why it matters: mitigates XSS/script-injection risk.
  - Verify:
    - Command: inspect response headers + browser console
    - Expected: valid CSP header with no breaking violations in report-only

- [ ] `P1-B2` Add brute-force/rate-limit coverage for debug endpoint
  - File/area: `app/api/debug/env/route.ts`, middleware matcher/rate limits
  - Why it matters: hardens low-traffic admin-style endpoints.
  - Verify:
    - Command: burst requests to endpoint
    - Expected: bounded responses (429/404 as configured)

### Payments & entitlements (C)

- [ ] `P1-C1` Dedicated Stripe integration tests
  - File/area: new `tests/stripe-*.test.ts`
  - Why it matters: reduces regressions in entitlement sync logic.
  - Verify:
    - Command: `npm test`
    - Expected: checkout/webhook mapping tests pass

- [ ] `P1-C2` Improve billing UX for downgrade/cancel explanatory states
  - File/area: `app/app/billing/page.tsx`
  - Why it matters: lowers support tickets from ambiguous account state.
  - Verify:
    - Command: simulate status transitions (`ACTIVE`, `PAST_DUE`, `CANCELED`)
    - Expected: clear state-specific copy + next-step CTA

### Twilio operations (D)

- [ ] `P1-D1` Twilio runbook for edge cases (carrier errors, opt-out, invalid numbers)
  - File/area: `RUNBOOK.md`
  - Why it matters: faster triage of SMS delivery issues.
  - Verify:
    - Command: manual runbook simulation
    - Expected: deterministic operator steps for each failure class

### Data & migrations (E)

- [ ] `P1-E1` Retention + deletion policy implementation plan
  - File/area: policy doc + future migration/backfill scripts
  - Why it matters: controls storage cost/privacy exposure.
  - Verify:
    - Command: policy signoff
    - Expected: explicit retention windows + deletion procedures

### Observability (F)

- [ ] `P1-F1` External error monitoring (Sentry or equivalent)
  - File/area: app bootstrap + error pipeline
  - Why it matters: captures stack traces/context beyond raw logs.
  - Verify:
    - Command: trigger controlled exception
    - Expected: event appears in monitoring tool with correlation metadata

- [ ] `P1-F2` Uptime monitor + synthetic transaction
  - File/area: external monitor config + `/api/health`
  - Why it matters: catches silent outages before customers report.
  - Verify:
    - Command: monitor dashboard check
    - Expected: uptime checks green + alert on forced failure

### Reliability & performance (G)

- [ ] `P1-G1` Baseline load test for webhook endpoints
  - File/area: new load test scripts under `scripts/`
  - Why it matters: identifies bottlenecks before real traffic bursts.
  - Verify:
    - Command: run load script in staging
    - Expected: acceptable p95 latency/error rates under target load

### Legal/customer ops (H)

- [ ] `P1-H1` Customer onboarding/getting-started guide
  - File/area: new `docs/CUSTOMER_GETTING_STARTED.md`
  - Why it matters: reduces setup-related churn and support volume.
  - Verify:
    - Command: dogfood setup from blank account
    - Expected: guide enables successful first missed-call workflow

## P2 Scale & Reliability (post-launch)

### Security + authz (B)

- [ ] `P2-B1` Multi-user RBAC model (owner/admin/agent)
  - File/area: `prisma/schema.prisma`, `lib/auth.ts`, app route guards
  - Why it matters: required for teams and safer internal delegation.
  - Verify:
    - Command: role-based auth tests
    - Expected: role restrictions enforced for all sensitive actions

### Payments (C)

- [ ] `P2-C1` Durable webhook event ledger/idempotency store
  - File/area: new DB model + webhook handlers
  - Why it matters: exact-once processing guarantees under replay storms.
  - Verify:
    - Command: replay identical Stripe events
    - Expected: one durable state transition per unique event

### Twilio operations (D)

- [ ] `P2-D1` Queue/outbox for outbound SMS side effects
  - File/area: webhook handlers + queue worker
  - Why it matters: decouples provider latency from webhook response path.
  - Verify:
    - Command: chaos test provider slowdowns
    - Expected: webhook ack remains fast, queued retries succeed

### Data (E)

- [ ] `P2-E1` Archival and purge jobs for old metadata/log records
  - File/area: scheduled jobs + retention implementation
  - Why it matters: controls long-term storage growth and compliance risk.
  - Verify:
    - Command: run purge job in staging
    - Expected: only out-of-policy records removed, audit output retained

### Observability (F)

- [ ] `P2-F1` Durable audit trail storage (DB-backed)
  - File/area: new `AuditEvent` model + write path
  - Why it matters: supports forensic and compliance requirements beyond ephemeral logs.
  - Verify:
    - Command: execute audited actions and query audit table
    - Expected: immutable audit rows with actor/action/target/timestamp

### Reliability/performance (G)

- [ ] `P2-G1` Circuit-breaker/backoff policies for provider calls
  - File/area: Twilio/Stripe client wrappers
  - Why it matters: reduces cascading failures during provider incidents.
  - Verify:
    - Command: induce repeated provider failures
    - Expected: bounded retries, no request storms, graceful fallback

### Customer ops (H)

- [ ] `P2-H1` Public status page + incident communication templates
  - File/area: ops docs + external status tooling
  - Why it matters: lowers trust damage during incidents.
  - Verify:
    - Command: incident dry run
    - Expected: status update + customer comms sent within SLA target

## 4) Implemented in this pass (top P0 items)

1. Added security headers middleware support
- Files: `lib/security-headers.ts`, `middleware.ts`

2. Added same-origin request validation utility and applied to Stripe mutation routes (production-only)
- Files: `lib/request-origin.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/portal/route.ts`

3. Added checkout/portal observability instrumentation (correlation-aware errors)
- Files: `app/api/stripe/checkout/route.ts`, `app/api/stripe/portal/route.ts`

4. Added lightweight audit logging for critical user actions
- Files: `lib/audit-log.ts`, `app/app/onboarding/actions.ts`, `app/app/settings/actions.ts`, `app/app/leads/actions.ts`, Stripe mutation routes

5. Added health/readiness endpoint
- File: `app/api/health/route.ts`

## 5) Validation Commands

Run from repo root:

1. `npm test`
- Expected: all tests pass (including new `request-origin` and `security-headers` tests)

2. `npm run lint`
- Expected: no lint errors/warnings

3. `npm run typecheck`
- Expected: TypeScript passes with no errors

4. `npm run build`
- Expected: production build completes successfully

5. `curl -s -o /tmp/health.json -w "%{http_code}\n" http://localhost:3000/api/health && cat /tmp/health.json`
- Expected: `200` with `status: ok` (or `503` with `status: degraded` if DB/env intentionally unavailable)

6. `curl -I http://localhost:3000 | egrep 'X-Frame-Options|X-Content-Type-Options|Referrer-Policy|Permissions-Policy'`
- Expected: required security headers present
