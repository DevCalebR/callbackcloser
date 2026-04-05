# CallbackCloser Production Master Roadmap

Date: 2026-03-08
Scope: Move CallbackCloser from the current repository state to a fully production-ready SaaS launch for paying businesses coming from `getrelayworks.com`.

## 1. Current State Snapshot

### 1.1 Repository baseline

| Area | Current state | Evidence |
|---|---|---|
| Production-line branch | `main` appears to be the production deploy branch | `origin/HEAD -> origin/main`; local `main` exists and is the default remote branch |
| Current `main` HEAD | `2edb965` - `hardening: G13 usage visibility and automation block reasons (#26)` | `git show --stat --oneline main -1` |
| Deploy target | Vercel | `vercel.json`, `README.md`, `docs/PRODUCTION_ENV.md`, `RUNBOOK.md` |
| Framework | Next.js 14 App Router + TypeScript | `package.json`, `app/**` |
| UI | Tailwind CSS + shadcn-style components | `tailwind.config.ts`, `components/ui/**`, `app/globals.css` |
| Database | Postgres via Prisma, with Neon-oriented docs/config | `prisma/schema.prisma`, `docs/DB_NEON_PRISMA.md`, `docs/PRODUCTION_ENV.md` |
| Authentication | Clerk | `@clerk/nextjs`, `middleware.ts`, `lib/auth.ts`, `app/(auth)/**` |
| Payments | Stripe subscriptions + billing portal + webhook sync | `app/api/stripe/**`, `lib/stripe.ts`, `app/app/billing/page.tsx` |
| Telephony + SMS | Twilio Voice + Messaging + recording metadata callbacks | `app/api/twilio/**`, `lib/twilio.ts`, `lib/twilio-recording.ts` |
| Observability | Structured logs, webhook correlation IDs, optional alert webhook | `lib/observability.ts`, `lib/twilio-logging.ts`, `tests/observability.test.ts` |

### 1.2 Launch-relevant work not yet on `main`

The repository contains launch-critical work on separate branches that is not yet on the production-line branch:

| Branch | Status relative to `main` | What it adds |
|---|---|---|
| `chore/p0-security-roadmap` | Open branch | `docs/PRODUCTION_ROADMAP.md`, `/api/health`, Stripe mutation route hardening, security headers, audit log helpers |
| `chore/product-ux-legal` | Open branch | `/buy`, `/contact`, legal/public flow updates, `docs/SHIP_READINESS_AUDIT.md` |
| `hardening/g14-recordings-ux` | Open branch | authenticated recording access flow and tests |

Practical implication: the repo has already produced useful launch work, but `main` is not yet the sellable release branch.

### 1.3 Providers in use

| Provider | Purpose | Where used |
|---|---|---|
| Vercel | Hosting, runtime, environment management | `vercel.json`, README deploy docs |
| Neon / Postgres | Primary database | `prisma/schema.prisma`, `docs/DB_NEON_PRISMA.md` |
| Clerk | Authentication and session protection | `middleware.ts`, `lib/auth.ts`, `app/(auth)/**` |
| Stripe | Subscription checkout, portal, webhook-based entitlements | `app/api/stripe/**`, `app/app/billing/page.tsx` |
| Twilio | Phone number provisioning, voice forwarding, recording callbacks, SMS automation | `app/api/twilio/**`, `app/app/settings/actions.ts`, `lib/twilio.ts` |

### 1.4 Authentication and authorization model

- Authn: Clerk session auth.
- Protected surfaces: `/app/**`, `/api/stripe/checkout`, `/api/stripe/portal` via `middleware.ts`.
- Tenant model: single-business-per-owner (`Business.ownerClerkId` is unique).
- Current boundary: most app reads/writes are keyed by `businessId` or `ownerClerkId`.
- Current limitation: there is no multi-user team/org RBAC yet; this is still a single-owner SaaS.

### 1.5 Environment variables in use

#### Required for production

- App / Vercel
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

#### Optional but operationally important

- Clerk path config
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- Stripe frontend / future client usage
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Monitoring / alerts
  - `ALERT_WEBHOOK_URL`
  - `ALERT_WEBHOOK_TOKEN`
  - `ALERT_WEBHOOK_TIMEOUT_MS`
- Debug / controlled prod diagnostics
  - `DEBUG_ENV_ENDPOINT_TOKEN`
- Demo guardrail
  - `PORTFOLIO_DEMO_MODE`
  - `ALLOW_PRODUCTION_DEMO_MODE`
- Rate limiting
  - `RATE_LIMIT_WINDOW_MS`
  - `RATE_LIMIT_TWILIO_AUTH_MAX`
  - `RATE_LIMIT_TWILIO_UNAUTH_MAX`
  - `RATE_LIMIT_STRIPE_AUTH_MAX`
  - `RATE_LIMIT_STRIPE_UNAUTH_MAX`
  - `RATE_LIMIT_PROTECTED_API_MAX`
- Vercel system fallbacks
  - `VERCEL_ENV`
  - `VERCEL_URL`
  - `VERCEL_PROJECT_PRODUCTION_URL`

### 1.6 Current readiness summary

#### Already present on `main`

- Core app stack is functional.
- Stripe subscription plumbing exists.
- Twilio webhook auth, retry semantics, usage gating, and SMS compliance exist.
- Legal pages `/terms`, `/privacy`, `/refund` exist.
- Correlation IDs already exist on Twilio and Stripe webhook routes.
- Environment validation exists and is production-aware.

#### Still missing from the production branch

- Public `/buy` and `/contact` surfaces.
- `/api/health` readiness endpoint.
- G14 recording access flow.
- Earlier roadmap/audit docs that live only on open branches.
- Final live provider setup and launch operations.

## 2. Definition of Production Ready

CallbackCloser is production ready only when every category below is true.

| Category | Acceptance criteria |
|---|---|
| Application | `main` contains the intended release scope; `/`, `/buy`, `/contact`, `/terms`, `/privacy`, `/refund`, `/app/onboarding`, `/app/billing`, `/app/leads` all render correctly in production. |
| Deployment | Production deploy comes from `main`; `npm run env:check`, `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` pass from a clean checkout; `npx prisma migrate deploy` succeeds against production DB. |
| Security | Production enforces `TWILIO_VALIDATE_SIGNATURE=true`; Stripe webhook signatures validate; protected routes require auth; cross-business reads/writes are denied; no raw secret values are logged. |
| Payments | Starter and Pro live prices exist; checkout completes in live mode; Stripe webhook events update `Business.subscriptionStatus`; billing portal works; failed payment and cancellation pause automation within one webhook cycle. |
| Billing lifecycle | Active, past due, canceled, and downgraded states are visible on the billing page and correctly affect SMS automation/usage gating. |
| Twilio operations | Answered call, missed call, HELP, STOP, START, and retry/replay scenarios work against the production number; call recording metadata persists; if G14 ships, authorized recording access works end-to-end. |
| Observability | `/api/health` is monitored; critical failures produce searchable logs with `X-Correlation-Id`; error alerting reaches a human-owned channel; uptime monitor and deploy smoke checks are configured. |
| Data safety | Production DB has backups/PITR enabled; restore drill evidence exists from the last 30 days; migration workflow and rollback notes are documented. |
| Legal + support | Public Terms, Privacy, Refund, and Contact surfaces are reachable; support inbox is monitored; support SLA/response expectations are documented. |
| Onboarding UX | A new buyer can go from marketing site to sign-up, onboarding, billing, and first successful missed-call automation without manual database intervention. |
| Incident response | There is an owner-known runbook for Twilio outage, Stripe webhook failure, DB outage, and bad deploy rollback; alert recipients know where to act. |

## 3. Phased Roadmap

Execution labels:

- `Codex`: repository/code/doc work that can be implemented locally.
- `Owner`: external setup, product/legal/business decisions, or third-party console work.
- `Shared`: Codex prepares code/docs/tests; owner completes console changes or approval/signoff.

### P0 - Launch Blockers

#### [ ] P0-1 Merge launch-critical branches into `main`

- Execution: `Shared`
- Description: Merge and verify `chore/p0-security-roadmap`, `chore/product-ux-legal`, and the hardened recording branch before any production sell-through.
- Why it matters: `main` is the likely production deploy branch, and it currently does not contain the sell flow, health endpoint, or recording work.
- File or area impacted: `main`; open branches `chore/p0-security-roadmap`, `chore/product-ux-legal`, `hardening/g14-recordings-ux`
- Verification commands:
  - `git diff --name-only main..chore/p0-security-roadmap`
  - `git diff --name-only main..chore/product-ux-legal`
  - `git diff --name-only main..hardening/g14-recordings-ux`
  - after merge: `npm run env:check && npm test && npm run lint && npm run typecheck && npm run build`
- Risk if not implemented: production deploys from `main` will miss key sellability and ops hardening.

#### [ ] P0-2 Finalize pricing, packaging, refund, and support policy

- Execution: `Owner`
- Description: Lock Starter vs Pro boundaries, monthly price points, refund language, support inbox, and any recording retention commitments.
- Why it matters: the code can sell only what the business has explicitly decided to fulfill.
- File or area impacted: Stripe Dashboard product catalog; public legal copy; `README.md`; marketing copy on `getrelayworks.com`
- Verification commands:
  - no repo-only command; owner signoff required
  - confirm `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PRO` point to final live products
- Risk if not implemented: refund disputes, mismatched plan promises, support ambiguity.

#### [ ] P0-3 Complete Vercel production environment and domain setup

- Execution: `Owner`
- Description: Configure production env vars, custom domain, and confirm production deploy branch behavior in Vercel.
- Why it matters: incorrect env or branch wiring breaks auth, webhooks, redirects, and billing.
- File or area impacted: Vercel Project Settings; `vercel.json`; `docs/PRODUCTION_ENV.md`
- Verification commands:
  - `npm run env:check`
  - `curl -i https://YOUR_PRODUCTION_DOMAIN/api/health`
- Risk if not implemented: bad deploys, broken redirects, failed webhooks, or traffic going to the wrong environment.

#### [ ] P0-4 Complete Neon production DB cutover and restore drill

- Execution: `Owner`
- Description: Use the pooled runtime URL and direct migration URL, run migrations, enable PITR/backups, and document a fresh restore drill.
- Why it matters: production SaaS without proven recovery is not launch safe.
- File or area impacted: Neon console; `prisma/schema.prisma`; `docs/DB_NEON_PRISMA.md`; `docs/BACKUP_RESTORE_RUNBOOK.md`
- Verification commands:
  - `npx prisma migrate status`
  - `npx prisma migrate deploy`
  - `npm run db:smoke`
- Risk if not implemented: irreversible data loss or failed deploys during schema changes.

#### [ ] P0-5 Complete Clerk production auth setup

- Execution: `Owner`
- Description: Add the real production origin, redirects, and email settings in Clerk; verify real sign-up/sign-in flows.
- Why it matters: if Clerk origins/redirects are wrong, customers cannot buy or access the app.
- File or area impacted: Clerk Dashboard; `app/(auth)/**`; `middleware.ts`
- Verification commands:
  - manual browser test: sign up from production domain
  - manual browser test: sign out and sign back in
- Risk if not implemented: login failures and support escalations immediately at launch.

#### [ ] P0-6 Complete Stripe live-mode launch verification

- Execution: `Shared`
- Description: Create final live products/prices, enable billing portal, configure live webhook endpoint, and verify checkout through cancellation/downgrade.
- Why it matters: incorrect billing configuration means lost money, broken entitlements, or automation for unpaid accounts.
- File or area impacted: Stripe Dashboard; `app/api/stripe/checkout/route.ts`; `app/api/stripe/portal/route.ts`; `app/api/stripe/webhook/route.ts`; `app/app/billing/page.tsx`
- Verification commands:
  - `npm test`
  - manual test plan scenarios 1 and 7 in Section 6
- Risk if not implemented: live checkout fails, portal is broken, or billing status does not map to automation behavior.

#### [ ] P0-7 Complete Twilio production launch verification and messaging compliance

- Execution: `Shared`
- Description: provision the production number, sync correct production webhook URLs, complete required A2P/toll-free compliance path, and test real answered/missed/SMS flows.
- Why it matters: Twilio is the core acquisition-to-lead automation path; misconfiguration directly causes lost leads or carrier violations.
- File or area impacted: Twilio Console; `app/api/twilio/**`; `app/app/settings/actions.ts`; `lib/twilio.ts`
- Verification commands:
  - `npm run webhooks:print`
  - manual test plan scenarios 2 through 6 in Section 6
- Risk if not implemented: calls are not forwarded, leads are dropped, SMS gets blocked, or compliance issues shut messaging down.

#### [ ] P0-8 Wire monitoring, uptime, and alert ownership

- Execution: `Shared`
- Description: connect structured app errors to a human-owned alert path and configure `/api/health` uptime probes.
- Why it matters: production incidents must be visible quickly, not discovered by customers.
- File or area impacted: `app/api/health/route.ts`; `lib/observability.ts`; Vercel logs; external monitoring tool
- Verification commands:
  - `curl -i http://localhost:3000/api/health`
  - induce a safe synthetic application error and confirm alert delivery
- Risk if not implemented: silent outages and long mean time to detection.

#### [ ] P0-9 Publish and verify the external buy flow from `getrelayworks.com`

- Execution: `Shared`
- Description: merge the product/legal branch, publish the approved Buy CTA target, and test the full visitor -> account -> onboarding -> billing path.
- Why it matters: the marketing site is the entry point for paying customers.
- File or area impacted: `app/buy/page.tsx` on the open product branch; `getrelayworks.com` CTA config; `app/app/onboarding/**`; `app/app/billing/page.tsx`
- Verification commands:
  - manual browser flow from `getrelayworks.com`
  - confirm target route and final billing state in production
- Risk if not implemented: paid traffic lands on a broken or incomplete purchase flow.

#### [ ] P0-10 Establish support and incident response ownership

- Execution: `Owner`
- Description: assign who monitors support, where alerts go, what the first-response SLA is, and how incidents are escalated.
- Why it matters: production SaaS without support ownership becomes a support nightmare immediately.
- File or area impacted: `RUNBOOK.md`; public contact/legal pages; support inbox/tooling
- Verification commands:
  - send a test email to the production support address
  - confirm alert recipients and escalation path
- Risk if not implemented: customer issues go unanswered and operational incidents stall.

### P1 - Launch Enhancers

#### [ ] P1-1 Persist audit logs in the database

- Execution: `Codex`
- Description: move beyond console-only audit events to a durable `AuditLog` table for privileged actions and billing/session events.
- Why it matters: durable audit records improve support, security investigations, and customer dispute handling.
- File or area impacted: `prisma/schema.prisma`; privileged server actions; Stripe routes; future admin views
- Verification commands:
  - `npm test`
  - verify audit rows exist after settings/billing mutations
- Risk if not implemented: limited forensic history and weaker support evidence.

#### [ ] P1-2 Add tenant-boundary regression tests

- Execution: `Codex`
- Description: add explicit tests around lead access, settings mutations, and recording access boundaries.
- Why it matters: auth code currently assumes a single owner model and needs regression coverage against data leaks.
- File or area impacted: `app/app/leads/**`; `app/app/settings/actions.ts`; `app/api/leads/[leadId]/recording/route.ts` if G14 ships; new tests
- Verification commands:
  - `npm test`
- Risk if not implemented: accidental cross-business access regressions may ship unnoticed.

#### [ ] P1-3 Merge and verify G14 only in its hardened form

- Execution: `Shared`
- Description: if recording access is part of launch scope, merge only the hardened proxy/allowlist version from `hardening/g14-recordings-ux`.
- Why it matters: recordings are sensitive and should never redirect to arbitrary stored URLs.
- File or area impacted: `app/api/leads/[leadId]/recording/route.ts`; `lib/recording-access.ts`; `tests/recording-access.test.ts`
- Verification commands:
  - `npm test`
  - manual recording access test in Section 6
- Risk if not implemented: recordings remain inaccessible, or a weaker implementation could expose an open-redirect/security issue.

#### [ ] P1-4 Improve billing lifecycle UX copy

- Execution: `Codex`
- Description: make cancel, past-due, downgrade, and usage-limit states more explicit in the billing and leads UI.
- Why it matters: better self-service reduces support load and confusion.
- File or area impacted: `app/app/billing/page.tsx`; `app/app/leads/page.tsx`; `components/upgrade-banner.tsx`
- Verification commands:
  - `npm run build`
  - manual UI checks under active, past-due, and canceled states
- Risk if not implemented: more support tickets about why automation stopped.

#### [ ] P1-5 Add dependency and security scanning to the release gate

- Execution: `Codex`
- Description: add `npm audit` or equivalent dependency scanning to CI/release docs.
- Why it matters: known CVEs should not be discovered after launch.
- File or area impacted: `.github/workflows/ci.yml`; `package.json`; release checklist docs
- Verification commands:
  - `npm audit --production --audit-level=high`
- Risk if not implemented: vulnerable dependency issues may ship unnoticed.

#### [ ] P1-6 Publish customer onboarding docs and welcome steps

- Execution: `Shared`
- Description: create a minimal getting-started guide for new customers covering Twilio number setup, forwarding number, notify phone, and first test call.
- Why it matters: onboarding friction becomes a support queue immediately after launch.
- File or area impacted: public docs or help center; `/app/onboarding`; `/app/settings`
- Verification commands:
  - owner walkthrough with a new test account
- Risk if not implemented: slow activation and manual hand-holding for every customer.

#### [ ] P1-7 Add source attribution from `getrelayworks.com`

- Execution: `Codex`
- Description: preserve plan/source/campaign intent from the marketing site through sign-up and onboarding.
- Why it matters: launch marketing spend needs attribution and funnel visibility.
- File or area impacted: `/buy` flow on the product branch; onboarding actions; billing page; analytics layer
- Verification commands:
  - manual browser test with query params such as `?plan=starter&source=relayworks`
- Risk if not implemented: weak conversion analytics and harder pricing/channel decisions.

### P2 - Scale and Reliability

#### [ ] P2-1 Move Twilio side effects to a queue or outbox

- Execution: `Codex`
- Description: persist webhook intent first, then send SMS/owner notifications asynchronously with retries and dead-letter visibility.
- Why it matters: synchronous webhook side effects do not scale cleanly and are harder to recover.
- File or area impacted: `app/api/twilio/status/route.ts`; `app/api/twilio/sms/route.ts`; `lib/twilio-messaging.ts`
- Verification commands:
  - queue worker test suite
  - replay Twilio callback load against staging
- Risk if not implemented: higher latency, brittle retries, and operational pain under load.

#### [ ] P2-2 Add multi-user organization/RBAC support

- Execution: `Codex`
- Description: expand from one owner per business to owner/admin/agent roles with explicit authorization checks.
- Why it matters: real SaaS accounts often need multiple team members.
- File or area impacted: `prisma/schema.prisma`; `lib/auth.ts`; protected pages/actions; tests
- Verification commands:
  - new authz test matrix covering each role
- Risk if not implemented: limited market fit for teams and ad hoc permission workarounds.

#### [ ] P2-3 Automate retention and deletion policies

- Execution: `Shared`
- Description: define and implement retention/deletion rules for lead/message/call metadata and recordings references.
- Why it matters: privacy compliance and storage costs grow with customer count.
- File or area impacted: docs; background jobs; Prisma models; Twilio recording handling
- Verification commands:
  - documented policy
  - non-production retention job dry run
- Risk if not implemented: privacy ambiguity, higher storage costs, and messy customer deletion requests.

#### [ ] P2-4 Add performance/load validation and provider degradation handling

- Execution: `Codex`
- Description: load test webhook and billing hotspots, and add graceful degradation rules for Twilio/Stripe/DB failures.
- Why it matters: production stability needs more than correctness under single-request flows.
- File or area impacted: webhook routes; rate limits; observability; new load-test scripts/docs
- Verification commands:
  - load-test scripts against staging
  - failure injection runbook
- Risk if not implemented: outages or degraded performance under spikes.

#### [ ] P2-5 Expand customer/account operations tooling

- Execution: `Codex`
- Description: build durable admin/support tooling for account history, audit lookup, and manual recovery flows.
- Why it matters: operational complexity grows after launch even at modest scale.
- File or area impacted: future admin tools; audit logs; support docs
- Verification commands:
  - support drill using a staging customer account
- Risk if not implemented: manual DB edits become the only recovery path.

## 4. Owner Manual Tasks

These tasks must be completed outside the repository. Codex can document them and validate the app-side behavior, but cannot complete the third-party account actions.

### 4.1 Vercel

Service: Vercel

Exact settings to configure:

- Production environment variables from `docs/PRODUCTION_ENV.md`
- Custom production domain
- Production branch confirmation (`main`)
- Automatic production deployments for the intended branch

Step-by-step:

1. Open the Vercel project for CallbackCloser.
2. Set all production env vars, including `NEXT_PUBLIC_APP_URL`, DB URLs, Clerk keys, Stripe keys, and Twilio secrets.
3. Confirm the production domain resolves to the app and `NEXT_PUBLIC_APP_URL` matches it exactly.
4. Confirm the production branch is `main`.
5. Trigger a fresh production deployment after env changes.

How to verify success:

- `curl -i https://YOUR_PRODUCTION_DOMAIN/api/health`
- Vercel dashboard shows the deployment as Production
- auth, billing, and Twilio webhook URLs use the same origin

### 4.2 Neon / Postgres

Service: Neon

Exact settings to configure:

- pooled runtime connection string in `DATABASE_URL`
- direct connection string in `DIRECT_DATABASE_URL`
- PITR/backups enabled
- retention window documented

Step-by-step:

1. In Neon, copy the pooled connection string and add `sslmode=require` if needed.
2. Copy the direct non-pooler connection string for `DIRECT_DATABASE_URL`.
3. Enable PITR/backups according to the paid plan.
4. Run `npx prisma migrate deploy` against production.
5. Run a restore drill into a non-production database and capture evidence.

How to verify success:

- `npx prisma migrate status`
- `npm run db:smoke`
- restore drill produces a working clone that the app can query

### 4.3 Clerk

Service: Clerk

Exact settings to configure:

- allowed origins for the production domain
- sign-in redirect URL
- sign-up redirect URL
- email delivery/domain settings if production email is used

Step-by-step:

1. Open the Clerk dashboard for the production application.
2. Add the production app origin.
3. Add sign-in and sign-up redirect URLs for the production domain.
4. If email verification or email templates are used, confirm production sender/domain configuration.
5. Test a fresh sign-up and a returning sign-in.

How to verify success:

- production sign-up completes successfully
- production sign-in returns to `/app`
- no Clerk origin/redirect errors appear

### 4.4 Stripe

Service: Stripe

Exact settings to configure:

- live-mode Starter and Pro products/prices
- live secret and publishable keys in Vercel
- billing portal enabled
- live webhook endpoint for `/api/stripe/webhook`
- event subscription:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`

Step-by-step:

1. In live mode, create the final Starter and Pro subscription prices.
2. Copy live `price_...` IDs into Vercel env vars.
3. Enable the billing portal.
4. Create a live webhook endpoint pointing to `https://YOUR_PRODUCTION_DOMAIN/api/stripe/webhook`.
5. Copy the live webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
6. Run a live-mode smoke purchase with a real internal payment method if policy allows, or complete end-to-end in test mode and separately verify live setup configuration.

How to verify success:

- checkout redirects to Stripe and completes
- webhook events appear in Stripe and update the app
- `/app/billing` shows the expected status and plan
- portal session opens successfully

### 4.5 Twilio

Service: Twilio

Exact settings to configure:

- production voice/SMS number
- webhook URLs targeting the production app URL
- local-number A2P 10DLC registration, or toll-free verification if using a toll-free number
- recording behavior and retention settings reviewed

Step-by-step:

1. Decide whether launch uses a US local number or toll-free number.
2. If using a US local number, complete A2P 10DLC brand/campaign registration before real automation traffic.
3. If using toll-free, complete toll-free verification before sending production traffic.
4. Purchase or assign the production number.
5. In the app or Twilio Console, point voice, SMS, and status callbacks at the production URLs.
6. Confirm recording behavior matches your customer/legal expectations.
7. Run answered-call, missed-call, HELP, STOP, and START tests from real phones.

How to verify success:

- Twilio debugger shows successful webhook deliveries
- answered calls forward correctly
- missed calls create leads and trigger SMS when entitled
- STOP suppresses future outbound automation
- START re-enables outbound automation

### 4.6 `getrelayworks.com`

Service: relayworks marketing site / CMS / hosting

Exact settings to configure:

- Buy CTA target URL
- Contact/support links
- legal/footer links
- any campaign tracking parameters

Step-by-step:

1. After the product/legal branch is merged, decide the canonical production buy URL.
2. Update the Buy CTA on `getrelayworks.com` to that route.
3. Update Contact, Terms, Privacy, and Refund links if the marketing site hosts copies or deep links.
4. If using attribution params, append them consistently to the CTA.
5. Test the full purchase journey from the live marketing page.

How to verify success:

- clicking Buy on `getrelayworks.com` lands on the intended app route
- the user can create an account, onboard, and reach billing without broken redirects

### 4.7 Support and legal operations

Service: support inbox, legal review, customer communications

Exact settings to configure:

- real monitored support inbox
- support ownership and first-response SLA
- approved Terms / Privacy / Refund copy

Step-by-step:

1. Decide the real support mailbox and who monitors it.
2. Update public contact/legal copy if the launch brand or mailbox changes.
3. Decide the refund window and any supported cancellation expectations.
4. Perform one internal support drill from a customer email.

How to verify success:

- support email receives and can reply
- legal pages match approved policy
- owner can answer “what happens on cancel/refund/support request” without improvising

## 5. Operational Readiness

### Logging

Current state:

- structured console logs exist
- Twilio and Stripe webhooks already emit correlation IDs
- `app.error` is centralized in `lib/observability.ts`

Recommended next step:

- send Vercel logs to a searchable sink such as Better Stack, Axiom, Datadog, or similar

Minimum launch bar:

- an operator can search by correlation ID, `callSid`, `messageSid`, or Stripe event context

### Monitoring

Current state:

- optional alert webhook exists
- no external uptime monitor or error monitoring tool is committed in the repo

Recommended tools:

- uptime monitor: Better Stack / Pingdom / UptimeRobot
- error monitoring: Sentry or another alert-capable error tracker

Minimum launch bar:

- `/api/health` is probed every minute
- critical errors page a human-owned channel

### Incident response

Current state:

- `RUNBOOK.md` and `docs/BACKUP_RESTORE_RUNBOOK.md` exist
- no explicit incident severity/owner matrix is documented

Recommended next step:

- add a simple incident matrix covering Twilio outage, Stripe webhook failure, bad deploy, and DB outage

Minimum launch bar:

- one person owns incident triage during launch week
- rollback path is known

### Support workflow

Current state:

- public legal pages exist on `main`
- `/contact` exists only on the product/legal branch

Recommended tools:

- shared inbox or helpdesk such as Help Scout, Zendesk, Front, or a monitored group inbox

Minimum launch bar:

- support mailbox is monitored
- escalation path exists for billing and telephony issues

### Customer onboarding documentation

Current state:

- the app has onboarding and settings screens
- there is no dedicated customer-facing getting-started guide on `main`

Recommended next step:

- publish a short “first 15 minutes” guide with screenshots

Minimum launch bar:

- new customers know how to enter forwarding number, buy/connect a Twilio number, and run the first test call

## 6. Launch Test Plan

Run the full test plan in a production-like environment after all P0 code is merged into `main`.

### 6.1 Stripe purchase flow

Preconditions:

- production or staging app deployed
- valid Stripe prices configured
- billing portal enabled

Steps:

1. Open the public Buy flow or sign in and go to `/app/billing`.
2. Start a Starter checkout.
3. Complete checkout with a valid Stripe card for the current mode.
4. Wait for redirect back to `/app/billing`.
5. Confirm `checkout=success` state appears.
6. Confirm webhook events arrive in Stripe.
7. Reload the billing page.

Expected result:

- checkout succeeds
- `Business.subscriptionStatus` becomes `ACTIVE`
- billing page shows the correct plan/tier

Evidence to capture:

- Stripe event log
- billing page screenshot
- app log snippet with correlation ID if debugging is needed

### 6.2 Twilio missed-call flow

Preconditions:

- production/staging Twilio number configured
- forwarding number set on the business
- business subscription active

Steps:

1. Call the Twilio number from a real phone.
2. Do not answer the forwarded call.
3. Wait for Twilio status callback and SMS automation.
4. Open `/app/leads`.

Expected result:

- one new lead is created
- the lead is marked as missed-call driven
- the first automation SMS is sent once

Evidence to capture:

- Twilio call log
- lead dashboard screenshot
- Twilio message log

### 6.3 SMS auto-response and compliance flow

Preconditions:

- a lead exists for the calling phone number
- business has an active subscription

Steps:

1. Reply to the automation SMS with a valid service response.
2. Continue through urgency, ZIP, and best-time steps.
3. Send `HELP`.
4. Send `STOP`.
5. Trigger another missed call and confirm outbound SMS is suppressed.
6. Send `START`.
7. Trigger another missed call and confirm automation resumes.

Expected result:

- state machine advances correctly
- HELP returns help text
- STOP opts out the sender
- START opts the sender back in

Evidence to capture:

- Twilio messaging transcript
- lead detail transcript in the app

### 6.4 Lead creation and owner notification

Preconditions:

- `notifyPhone` set for the business
- active subscription

Steps:

1. Run the missed-call flow.
2. Complete enough SMS steps to collect ZIP.
3. Confirm owner notification SMS is delivered.
4. Open the new lead in `/app/leads`.

Expected result:

- lead detail contains captured fields
- owner receives the summary notification once

Evidence to capture:

- owner SMS screenshot
- lead detail screenshot

### 6.5 Recording access

Preconditions:

- only applicable if `hardening/g14-recordings-ux` is merged
- forwarded call is answered long enough to produce recording data

Steps:

1. Place an answered call through the Twilio number.
2. Wait for recording callback completion.
3. Open the lead detail page.
4. Use the recording access action.
5. Repeat while signed in as the wrong user or with a tampered URL if testing in staging.

Expected result:

- authorized owner can access the recording through the app proxy
- unauthorized or invalid URL access returns `404`

Evidence to capture:

- Twilio recording metadata
- browser network result for the recording route

### 6.6 Usage limit enforcement

Preconditions:

- business set to Starter tier
- test/staging database access available

Steps:

1. Set the business to Starter in Stripe/app state.
2. In staging, create or update enough leads so `smsStartedAt` reflects the current-month limit.
3. Trigger one additional missed call.
4. Open `/app/billing` and `/app/leads`.

Expected result:

- automation is blocked once the limit is reached
- billing/leads UI explain why automation is paused
- owner limit notification is not duplicated on replay

Evidence to capture:

- billing page usage state
- lead blocked-state UI

### 6.7 Subscription cancel / downgrade / payment failure

Preconditions:

- active subscription exists

Steps:

1. Use Stripe to cancel the subscription or mark it past due in the active test environment.
2. Replay or wait for webhook delivery.
3. Reload `/app/billing`.
4. Trigger a missed call after the status change.
5. If downgrading, change from Pro to Starter and repeat.

Expected result:

- `subscriptionStatus` updates correctly
- automation pauses for canceled or past-due accounts
- downgraded accounts remain active but use the lower tier/limit

Evidence to capture:

- Stripe event log
- billing page state
- missed-call behavior after state change

## 7. Safe Items Implemented On This Branch

This branch implements only the low-risk readiness items that were still missing on `main`.

### Implemented

- Added `/api/health` readiness endpoint with env + DB checks and `X-Correlation-Id`
  - file: `app/api/health/route.ts`
- Added correlation/error instrumentation to Stripe checkout and portal routes
  - files:
    - `app/api/stripe/checkout/route.ts`
    - `app/api/stripe/portal/route.ts`
- Tightened env validation for:
  - invalid `NEXT_PUBLIC_APP_URL`
  - invalid `ALERT_WEBHOOK_URL`
  - bad Neon URL shapes
  - duplicate Stripe price IDs
  - malformed optional rate-limit and timeout env vars
  - files:
    - `lib/env.server.ts`
    - `scripts/check_env.ts`
- Added app-level error boundaries
  - files:
    - `app/app/error.tsx`
    - `app/global-error.tsx`
- Added a production launch checklist to the README
  - file: `README.md`

### Intentionally not implemented here

- pricing decisions
- live Vercel/Stripe/Twilio/Clerk/Neon account setup
- legal/business policy approvals
- branch merges or PR actions

Those remain owner tasks or shared release tasks.
