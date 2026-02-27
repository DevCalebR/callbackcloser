# CallbackCloser Runbook

## Deploy Checklist

1. Pull latest code and install deps (`npm ci`).
2. Run local verification:
   - `npm run env:check`
   - `npm test`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
3. Confirm production env vars in Vercel match `docs/PRODUCTION_ENV.md`.
4. Apply Prisma schema changes to the target DB:
   - `npx prisma migrate deploy` (preferred if using migrations)
   - or `npm run db:push` (if you intentionally use `db push`)
5. Deploy to Vercel.
6. Re-check Twilio webhook URLs (especially if `NEXT_PUBLIC_APP_URL` changed):
   - `npm run webhooks:print`
7. Verify Stripe webhook endpoint still points to the correct production URL.
8. Run a live Twilio smoke test (call + missed call + SMS reply + STOP/START).

## Rotate `TWILIO_WEBHOOK_AUTH_TOKEN` (shared webhook token)

1. Generate a new random token (do not reuse old values).
2. Update `TWILIO_WEBHOOK_AUTH_TOKEN` in Vercel.
3. Redeploy (or trigger a fresh deployment) so the app uses the new token.
4. Re-sync Twilio webhooks / update manual Twilio Console URLs to the new `webhook_token`.
   - Use `npm run webhooks:print -- --show-token` only when you intentionally need the full URL/token.
5. Verify Twilio webhooks return `200` and no `401` errors.
6. Remove any temporary notes/messages containing the token.

## Rotate `TWILIO_AUTH_TOKEN` (Twilio account auth token)

1. Rotate the auth token in the Twilio Console.
2. Update `TWILIO_AUTH_TOKEN` in Vercel immediately.
3. Redeploy the app.
4. If `TWILIO_VALIDATE_SIGNATURE=true`, run a webhook smoke test right away (signature validation depends on the auth token).
5. Validate outbound SMS send + Twilio number webhook handling.

## Where to See Logs

- Vercel runtime logs:
  - API route logs for `/api/twilio/voice`, `/api/twilio/status`, `/api/twilio/sms`
  - Look for structured prefixes: `twilio.voice`, `twilio.status`, `twilio.sms`, `twilio.messaging`, `twilio.webhook-auth`
- Twilio Console:
  - Phone Number webhook logs / Debugger
  - Call Logs and Recordings
  - Messaging logs
- Neon:
  - Query activity / connection issues (if DB errors occur)

## Common Failure Modes

- Twilio webhooks return `401`
  - Shared-token mode mismatch (`TWILIO_WEBHOOK_AUTH_TOKEN` or URL query token wrong)
  - Signature mode enabled but invalid/missing `X-Twilio-Signature`
  - Twilio calling a different URL than `NEXT_PUBLIC_APP_URL` (signature validation mismatch)
- Missed call recorded but no SMS sent
  - Subscription inactive (`billingRequired=true`)
  - Monthly conversation limit reached
  - Recipient previously sent `STOP` and is opted out
- Recording metadata missing on `Call`
  - Twilio recording callback not reaching `/api/twilio/status`
  - Call was not answered/recorded
  - Twilio recording callback delivered before `Call` row existed (rare; retry typically resolves)
- Prisma/Neon deployment issues
  - `DATABASE_URL` / `DIRECT_DATABASE_URL` swapped
  - Missing `sslmode=require`
  - `DIRECT_DATABASE_URL` accidentally using Neon pooler host

