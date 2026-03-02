# CallbackCloser Production Readiness Gaps (G1-G15)

Date: 2026-03-02
Scope: Audit and planning only (no implementation changes in this document).

## Executive Summary

- Core MVP flow is implemented: auth, onboarding, Twilio voice/SMS webhook handling, lead dashboard, and Stripe subscription plumbing.
- The product is close to launchable for controlled pilots, but not yet at full production hardening for reliability, security, and operations.
- Highest-risk launch blockers are webhook resilience semantics, security hardening defaults, observability/alerts, and preflight/CI rigor.
- Data model and migrations are in good shape, but operational data safeguards (backup/restore drills) are not yet codified.
- Billing and usage logic exists in backend flows, but owner-facing usage visibility and dedupe behavior still need improvement.
- Compliance is partially covered (SMS STOP/START/HELP) but public legal pages (terms/privacy/refund) are still missing.
- Demo mode is useful for portfolio workflows but needs stricter production guardrails.
- Most remaining work is straightforward and can be staged by milestone with clear dependencies.

## Gap Register

| Gap ID | Title | Severity | Owner Area | Evidence Paths | Acceptance Criteria |
|---|---|---|---|---|---|
| G1 | Enforce stronger Twilio webhook auth posture | High | Security / Integrations | `lib/twilio-webhook.ts`, `app/api/twilio/voice/route.ts`, `docs/PRODUCTION_ENV.md` | Production defaults to strict Twilio verification mode; invalid signatures/tokens are rejected; insecure fallback modes are explicitly disabled or gated in prod. |
| G2 | Fix webhook retry semantics on transient failures | High | Reliability / Integrations | `app/api/twilio/status/route.ts`, `app/api/twilio/sms/route.ts` | Transient DB/network failures return retryable non-2xx responses; successful idempotent retries do not duplicate side effects. |
| G3 | Deduplicate usage-limit owner notifications | Medium | Billing / Reliability | `app/api/twilio/status/route.ts`, `lib/usage.ts` | Replayed callbacks cannot trigger repeated owner "limit reached" SMS for the same missed-call event. |
| G4 | Add multi-user RBAC model | Medium | Auth / Product | `prisma/schema.prisma`, `lib/auth.ts`, `README.md` (single-owner note) | Role model exists (owner/admin/agent), enforced on sensitive reads/writes, with tests covering authorization boundaries. |
| G5 | Add request rate limiting / abuse controls | High | Security / Platform | `middleware.ts`, `app/api/twilio/*`, `app/api/stripe/*` | Abusive bursts are throttled (429) without blocking valid Twilio/Stripe traffic patterns. |
| G6 | Add audit trail for privileged changes | Medium | Security / Ops | `app/app/settings/actions.ts`, `app/app/leads/actions.ts`, `prisma/schema.prisma` | Security-sensitive actions write immutable audit records (actor, action, target, timestamp, metadata). |
| G7 | Move side effects to queue/outbox for scale | Medium | Reliability / Platform | `app/api/twilio/status/route.ts`, `app/api/twilio/sms/route.ts`, `lib/twilio-messaging.ts` | Webhook handlers persist intent and enqueue work; async worker executes retries/backoff with dead-letter visibility. |
| G8 | Add centralized monitoring, error reporting, alerts | High | Ops / Observability | `lib/twilio-logging.ts`, `RUNBOOK.md`, `app/api/stripe/webhook/route.ts` | Errors and SLO-relevant events flow to a monitoring system with actionable alerts and dashboards. |
| G9 | Define backup/restore policy and runbook drill | High | Data / Ops | `RUNBOOK.md`, `docs/PRODUCTION_ENV.md`, `docs/DB_NEON_PRISMA.md` | Backup cadence, retention, restore steps, RPO/RTO, and periodic restore drill evidence are documented and validated. |
| G10 | Harden CI/test strategy and deterministic preflight | High | DX / QA / Ops | `.github/workflows/ci.yml`, `package.json`, `tsconfig.json` | CI verifies full test scope, migration consistency, and deterministic typecheck/build from clean checkout. |
| G11 | Prevent accidental production demo-mode bypass | High | Security / Release | `middleware.ts`, `lib/portfolio-demo.ts`, `docs/PRODUCTION_ENV.md` | Production fails safe if `PORTFOLIO_DEMO_MODE` is enabled without explicit break-glass override. |
| G12 | Add public legal pages (Terms/Privacy/Refund) | Medium | Compliance / Product | `app/page.tsx`, current route set in `README.md` | `/terms`, `/privacy`, and `/refund` routes exist, are linked, and reflect business policy requirements. |
| G13 | Improve billing/usage transparency in UI | Medium | Billing / Product UX | `lib/usage.ts`, `app/app/billing/page.tsx`, `app/app/leads/page.tsx` | Owner can see plan tier, current period usage/limits, and exact reason automation is paused. |
| G14 | Expose recording access in app UI | Low | Product UX / Integrations | `lib/twilio-recording.ts`, `app/api/twilio/status/route.ts`, `README.md` recording notes | Lead detail shows recording metadata and secure playback/download path (with auth controls) when available. |
| G15 | Add provider preflight verification workflow | Medium | Ops / Release | `docs/EXTERNAL_SETUP_CHECKLIST.md`, `scripts/check_env.ts`, `scripts/print_webhook_urls.ts` | Preflight process validates Clerk/Stripe/Twilio/DB setup and fails fast before release cutover. |

## Milestone Plan

### M0: Must-Have for Safe Production Launch

1. Baseline release quality gates (G10)  
Dependencies: none  
Outcome: deterministic CI and local preflight confidence before hardening changes.

2. Lock production security modes (G1, G11)  
Dependencies: step 1  
Outcome: production starts in fail-safe auth mode; demo bypass cannot be accidentally live.

3. Correct webhook reliability semantics (G2, G3)  
Dependencies: steps 1-2  
Outcome: retry-safe Twilio processing without duplicate owner alerts.

4. Add platform abuse controls (G5)  
Dependencies: step 2  
Outcome: core endpoints protected against spikes/misuse.

5. Install observability + alerting baseline (G8)  
Dependencies: steps 1-3  
Outcome: production incidents are detectable and actionable in minutes.

6. Formalize and test data recovery plan (G9)  
Dependencies: step 1  
Outcome: documented and tested restore path before go-live.

### M1: Revenue, Trust, and External Readiness

1. Public legal surface (G12)  
Dependencies: none (can run in parallel with M0 final steps)

2. Billing transparency and usage UX (G13)  
Dependencies: M0 step 3 (for stable usage behavior)

3. Recording UX closure (G14)  
Dependencies: M0 step 3

4. Provider preflight workflow (G15)  
Dependencies: M0 step 1 and M0 step 2

### M2: Scale and Team Operations

1. Queue/outbox architecture for async side effects (G7)  
Dependencies: M0 steps 3 and 5

2. Multi-user RBAC foundation (G4)  
Dependencies: none strict, but easier after M0 stabilization

3. Audit trail layer on top of RBAC and key actions (G6)  
Dependencies: G4 (recommended)

## Verification Plan

| Gap ID | Local Verification (commands) | Twilio/Stripe Sandbox Verification | Logs/Alerts That Prove Success |
|---|---|---|---|
| G1 | `npm run env:check`; `npm test`; manual `curl` with invalid/valid Twilio auth headers/tokens against local webhook routes | Twilio test webhook calls with valid signature should pass; tampered payload/signature should fail with 401 | Vercel logs: `twilio.webhook-auth` reject/allow events with explicit decision fields; no unexpected accepts on invalid signatures |
| G2 | `npm run build`; run local DB then simulate DB outage during webhook handling and inspect HTTP status behavior | Twilio sandbox retries failed webhooks; confirm retries happen and eventually settle once dependency recovers | Twilio Console delivery attempt history + Vercel API logs show non-2xx on transient failures and success on retry |
| G3 | Replay same Twilio status payload multiple times locally | In Twilio sandbox, trigger duplicate callback delivery/replay for same call | Only one owner limit-notification message persisted (`Message` table) and one corresponding send event in logs |
| G4 | Add auth-unit/integration tests then run `npm test`; validate route guards under multiple user roles | N/A (not provider-specific) | Authorization-denied events are logged; no cross-tenant reads/writes observed |
| G5 | Load-test local endpoints (controlled bursts) and confirm 429 behavior; `npm run build` | Twilio and Stripe sandbox requests still succeed under normal traffic patterns while abusive synthetic traffic is throttled | Rate-limit metrics/alerts show throttled requests and low false-positive block rate |
| G6 | Run action paths locally (settings update, lead status update) and verify audit records written | N/A | Audit log entries exist per privileged action with actor/action/target/time metadata |
| G7 | Run webhook handlers locally and verify they enqueue work instead of doing all side effects inline | Twilio sandbox calls should return quickly while queued sends complete asynchronously | Queue metrics show enqueue/dequeue/retry/dead-letter counts; worker error alerts configured |
| G8 | Trigger synthetic errors locally; verify telemetry ingestion | Twilio/Stripe sandbox failure injection should generate observable incidents | Centralized error dashboard entries + alert notifications (Slack/Pager/email) |
| G9 | Run DB restore rehearsal commands in non-prod; verify app query sanity with `npm run db:smoke` | N/A | Restore drill artifact and timestamped runbook evidence; backup success/failure alerts |
| G10 | `npm ci`; `npm run env:check`; `npm test`; `npm run lint`; `npm run typecheck`; `npm run build`; `npx prisma validate`; `npx prisma migrate status` | Stripe CLI replay + Twilio webhook replay as integration smoke | CI run artifacts show all checks green; explicit migration/preflight job status is PASS |
| G11 | Start app with production env simulation and `PORTFOLIO_DEMO_MODE=1`; verify startup/guardrail behavior | N/A | Startup logs show fail-safe block or explicit break-glass trace (if intentionally allowed) |
| G12 | `npm run build`; navigate `/terms`, `/privacy`, `/refund` locally | N/A | Access logs confirm pages served; legal link click-through metrics (if instrumented) |
| G13 | Local UI verification of usage counters and block reasons on billing/leads pages | Stripe sandbox: switch plans and generate missed calls to see usage/limit states | Billing logs show plan mapping and usage counters; no ambiguity in blocked-reason logs |
| G14 | Local lead detail page renders recording metadata and guarded access controls | Twilio sandbox answered call + recording callback populates metadata and UI state | `twilio.status` recording events + UI access logs show successful authorized retrieval |
| G15 | Run documented preflight sequence: `npm run env:check`, `npm run webhooks:print`, `npx prisma migrate status`, quality gates | Stripe test checkout/webhook replay; Twilio test call/SMS webhook path checks | Preflight report/checklist shows all provider checks PASS before launch approval |

## Go/No-Go Checklist

### No-Go If Any Item Is Unchecked

- [ ] All M0 gaps (G1, G2, G3, G5, G8, G9, G10, G11) are closed and verified.
- [ ] `npm run env:check`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` all pass from a clean checkout.
- [ ] Prisma state is healthy (`npx prisma validate`, `npx prisma migrate status`) and production migrations are deployed.
- [ ] Twilio sandbox verifies voice, missed-call SMS automation, STOP/START/HELP behavior, and retry handling.
- [ ] Stripe sandbox verifies checkout, portal, and webhook subscription transitions.
- [ ] Alerting is live for webhook failures, DB connectivity issues, and send failures.
- [ ] Backup/restore runbook has at least one successful restore drill in a non-prod environment.
- [ ] Demo mode is disabled in production and protected by fail-safe guardrails.

### Go Criteria (Launch Decision)

- [ ] All no-go items above are green.
- [ ] M1 items required by business/legal stakeholders are complete or explicitly waived.
- [ ] Release owner signs off with evidence links to CI run, sandbox test logs, and preflight checklist.

## Execution Changelog

- 2026-03-02 - G10 (DONE)
  - Branch: `hardening/g10-deterministic-preflight`
  - What changed:
    - Expanded `npm test` to run all `tests/*.test.ts` and kept `test:twilio` as a focused variant.
    - Added `db:validate` and `preflight` scripts in `package.json`.
    - Added CI preflight checks for `env:check` and `db:validate` in `.github/workflows/ci.yml`.
    - Fixed Node ESM test imports in `tests/env.server.test.ts` and `tests/usage.test.ts` to use explicit `.ts` paths.
    - Updated `lib/usage.ts` internal import to `.ts` extension for Node test runner compatibility.
    - Updated `scripts/preflight_checklist.md` to reflect implemented G10 checks and current remaining gaps.
    - Added production-hardening tracking doc and checklist files:
      - `docs/PRODUCTION_READINESS_GAPS.md`
      - `scripts/preflight_checklist.md`
  - Commands run + results:
    - `npm ci` -> PASS
    - `npm test` -> PASS (18/18)
    - `npm run lint` -> PASS
    - `npm run build` -> PASS
    - `npm run typecheck` -> PASS
    - `npm run env:check` -> PASS
    - `npm run db:validate` -> PASS
  - Files touched:
    - `.github/workflows/ci.yml`
    - `lib/usage.ts`
    - `package.json`
    - `tests/env.server.test.ts`
    - `tests/usage.test.ts`
    - `docs/PRODUCTION_READINESS_GAPS.md`
    - `scripts/preflight_checklist.md`
  - Commit SHA:
    - `3e09628`

- 2026-03-02 - G1 (DONE)
  - Branch: `hardening/g1-strict-twilio-verification`
  - What changed:
    - Enforced strict production Twilio webhook verification in `lib/twilio-webhook.ts`:
      - production now rejects webhook requests when `TWILIO_VALIDATE_SIGNATURE` is not enabled
      - production no longer allows token-only fallback when signature validation fails
    - Added production startup guard in `lib/env.server.ts` requiring `TWILIO_VALIDATE_SIGNATURE=true`.
    - Expanded webhook verification tests in `tests/twilio-signature-validation.test.ts` for:
      - rejecting shared-token mode in production when signature mode is disabled
      - rejecting token fallback in production when signature header is missing
    - Updated docs to match strict production behavior:
      - `README.md`
      - `docs/PRODUCTION_ENV.md`
      - `docs/EXTERNAL_SETUP_CHECKLIST.md`
    - Updated `scripts/check_env.ts` to align env checks with strict production signature policy.
  - Commands run + results:
    - `npm test` -> PASS (20/20)
    - `npm run lint` -> PASS
    - `npm run build` -> PASS
    - `npm run typecheck` -> PASS
    - `npm run env:check` -> PASS
    - `npm run db:validate` -> PASS
  - Files touched:
    - `lib/twilio-webhook.ts`
    - `lib/env.server.ts`
    - `tests/twilio-signature-validation.test.ts`
    - `scripts/check_env.ts`
    - `README.md`
    - `docs/PRODUCTION_ENV.md`
    - `docs/EXTERNAL_SETUP_CHECKLIST.md`
    - `docs/PRODUCTION_READINESS_GAPS.md`
  - Commit SHA:
    - `433cd34`

- 2026-03-02 - G2 (DONE)
  - Branch: `hardening/g2-webhook-retry-semantics`
  - What changed:
    - Updated Twilio webhook route fatal-error behavior:
      - `app/api/twilio/status/route.ts` now returns retryable `503` on fatal route errors and on initial missed-call SMS send failures.
      - `app/api/twilio/sms/route.ts` now returns retryable `503` on fatal route errors.
    - Added shared helper `lib/twilio-webhook-retry.ts` to standardize retryable response shape/status.
    - Added replay-oriented tests in `tests/twilio-webhook-retry.test.ts` to verify deterministic retry response semantics for both status and sms paths.
  - Idempotency notes:
    - Existing idempotent guards remain in place (`Call` upsert by `twilioCallSid`, `Lead` reuse by `callId`, inbound message dedupe by `Message.twilioSid`).
    - Returning `503` on fatal/transient failures allows provider retries without introducing duplicate durable records.
  - Commands run + results:
    - `npm test` -> PASS (22/22)
    - `npm run lint` -> PASS
    - `npm run build` -> PASS
    - `npm run typecheck` -> PASS
    - `npm run env:check` -> PASS
    - `npm run db:validate` -> PASS
  - Files touched:
    - `app/api/twilio/status/route.ts`
    - `app/api/twilio/sms/route.ts`
    - `lib/twilio-webhook-retry.ts`
    - `tests/twilio-webhook-retry.test.ts`
    - `docs/PRODUCTION_READINESS_GAPS.md`
  - Commit SHA:
    - `d0dff5e`
