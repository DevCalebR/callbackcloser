# CallbackCloser Preflight Checklist (Documentation Only)

Purpose: release-preflight checklist using current repo commands.  
Note: this file does not add or require new scripts.

## 1) Local Quality Gates (Existing Commands)

- [ ] Install deps cleanly: `npm ci`
- [ ] Environment sanity: `npm run env:check`
- [ ] Unit tests (current scope): `npm test`
- [ ] Lint: `npm run lint`
- [ ] Typecheck: `npm run typecheck`
- [ ] Production build: `npm run build`
- [ ] Optional combined run: `npm run preflight`

## 2) Prisma / Database Checks

- [ ] Prisma schema validation: `npx prisma validate`
- [ ] Migration status review: `npx prisma migrate status`
- [ ] DB smoke query (if DB network is reachable): `npm run db:smoke`
- [ ] Before deploy, apply migrations to target DB: `npx prisma migrate deploy`

## 3) Twilio / Stripe Preflight (Using Existing Commands + Provider Consoles)

- [ ] Print expected Twilio webhook URLs: `npm run webhooks:print`
- [ ] Run consolidated provider preflight report: `npm run preflight:providers`
- [ ] Verify Twilio Console webhook targets match printed URLs.
- [ ] Verify Stripe webhook endpoint points to `/api/stripe/webhook` on the target environment.
- [ ] Replay or trigger Stripe test events (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`) in Stripe test mode.
- [ ] Run Twilio sandbox/manual smoke: answered call, missed call, inbound SMS, STOP/START/HELP.

## 4) Release Evidence to Capture

- [ ] CI run URL/artifacts showing green checks.
- [ ] Logs for Twilio route prefixes: `twilio.voice`, `twilio.status`, `twilio.sms`, `twilio.messaging`, `twilio.webhook-auth`.
- [ ] Stripe webhook delivery logs (success + signature verification).
- [ ] Any incidents and resolutions recorded in runbook/release notes.

## 5) G10 Missing Checks (Documented Gaps, No New Scripts Added Here)

- [ ] Integration/E2E test command is missing (no dedicated script today).
- [ ] CI migration consistency/drift gate is missing as a first-class required check.

Recommended tracking: implement these as backlog items under G10 in `docs/PRODUCTION_READINESS_GAPS.md`.
