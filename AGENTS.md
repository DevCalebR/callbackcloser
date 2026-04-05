# CallbackCloser Codex Guide

## Project Context

- CallbackCloser is a production-focused SaaS for small service businesses.
- Core product promise: missed call -> captured lead -> SMS follow-up -> qualified conversation -> owner notification -> protected dashboard visibility.
- Core stack: Next.js App Router, TypeScript, Tailwind, shadcn-style UI, Prisma, Postgres/Neon, Clerk, Stripe, Twilio, Vercel.
- Optimize for correctness, test coverage, safe migrations, clear diffs, and production readiness over cleverness.

## Start Here Before Major Changes

- Prefer narrow, surgical changes over broad rewrites.
- Inspect existing patterns before changing architecture, shared abstractions, or cross-cutting behavior.
- Read the real entrypoints first when the task touches them:
- `app/layout.tsx`
- `app/page.tsx`
- `app/app/layout.tsx`
- `middleware.ts`
- `app/api/twilio/voice/route.ts`
- `app/api/twilio/status/route.ts`
- `app/api/twilio/sms/route.ts`
- `app/api/stripe/checkout/route.ts`
- `app/api/stripe/portal/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/app/onboarding/actions.ts`
- `app/app/leads/actions.ts`
- `app/app/settings/actions.ts`
- `lib/auth.ts`
- `lib/subscription.ts`
- `lib/twilio-webhook.ts`
- `lib/env.server.ts`
- `prisma/schema.prisma`

## Working Style

- Preserve established App Router, server action, and route handler patterns unless there is a clear defect.
- Default to the smallest safe diff that solves the problem.
- Keep production-safe defaults in place. Do not silently loosen auth, webhook verification, rate limits, or rollout guardrails.
- Preserve server/client boundaries. Default to server components unless interactivity requires a client component.
- Keep route handlers and server actions explicit and easy to audit.
- Reuse existing utilities before adding new abstractions.

## High-Risk Areas

- Treat Twilio webhook behavior as high risk. Signature validation, token fallback rules, idempotency, retry semantics, STOP/START/HELP handling, and the missed-call -> lead -> SMS -> dashboard flow all require extra care and tests.
- Treat Stripe billing state and access control as high risk. Verify webhook event handling before changing subscription gating or checkout/portal flows.
- Treat Clerk auth and session-scoped data access as high risk. Preserve tenant boundaries and `requireAuth` or `requireBusiness` behavior.
- Treat Prisma schema changes as high risk. Prefer additive, reversible-safe migrations and call out deployment implications explicitly.
- Treat recording access, phone numbers, message content, and lead data as sensitive surfaces.

## Public Trust Surfaces

- Protect public trust pages and keep them accurate: pricing, privacy, terms, refund, contact, and sms-consent.
- Existing public legal pages live at:
- `app/privacy/page.tsx`
- `app/terms/page.tsx`
- `app/refund/page.tsx`
- If new trust pages are added, keep links, billing behavior, SMS consent language, and public claims aligned.

## Secrets And Environment Safety

- Never expose secrets in code, logs, tests, screenshots, commit messages, or final reports.
- Do not edit `.env`, `.env.local`, Vercel env values, Stripe secrets, Twilio secrets, Clerk keys, or webhook tokens carelessly.
- Never fabricate secret values, IDs, webhook signatures, phone numbers, or production URLs.
- Prefer least-privilege changes and explicit validation over permissive fallbacks.
- If env behavior changes, review `lib/env.server.ts`, `docs/PRODUCTION_ENV.md`, and webhook URL assumptions.

## Validation Expectations

- After each change, run the minimum relevant checks for the touched surface first.
- Before declaring work complete, run a broader validation pass that matches the final diff.
- Favor these commands when relevant:
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npx prisma generate`
- `npx prisma migrate status`
- Also use these when the change touches deployment or provider behavior:
- `npm run env:check`
- `npm run webhooks:print`
- Add focused tests near touched code whenever a high-risk path changes.
- Distinguish between targeted verification and broader ship checks in the final report.

## Repo-Specific Change Rules

- Respect Next.js App Router conventions and preserve route segment structure.
- Avoid breaking `runtime = 'nodejs'` or `dynamic = 'force-dynamic'` settings on webhook handlers unless the task explicitly requires it and the impact is validated.
- Preserve webhook idempotency assumptions around Twilio `CallSid`, `DialCallSid`, `MessageSid`, lead reuse, and SMS start guards.
- Preserve Stripe checkout allowed-price checks, webhook-driven subscription sync, and business-level gating.
- Never make destructive Prisma schema assumptions silently. If a change could lock rows, drop data, or require backfills, say so explicitly.
- Keep customer-facing copy outcome-focused for service businesses. Emphasize recovered leads, booked jobs, and reduced admin burden. Avoid vague AI buzzwords and avoid overclaiming.

## Final Report Format

- Use exactly these sections in this order:
- `Summary`
- `Root cause`
- `Files changed`
- `Validation run`
- `Remaining risks`
- `Next best move`

