# Troubleshooting

## Environment validation fails

Run `npm run env:check`. Use Clerk development keys for localhost and keep production demo overrides unset. The script reports missing configuration without printing secret values.

## Prisma cannot connect

Confirm `DATABASE_URL`, run `npm run db:generate`, then `npx prisma migrate deploy`. Use `npm run db:smoke` only when the configured database is safe for the repository's smoke procedure.

## Twilio returns 401

Confirm the public request URL exactly matches Twilio's configured URL and that `TWILIO_AUTH_TOKEN` belongs to the account or subaccount signing the webhook. Keep `TWILIO_VALIDATE_SIGNATURE=true` in production.

## SMS does not start after a missed call

Check the dial status, subscription state, opt-out state, assigned messaging number, and A2P status. The lead is still persisted when billing blocks automation.

## Stripe state does not update

Confirm the endpoint signing secret and subscribed event list. For local testing, run the Stripe CLI forwarder against `/api/stripe/webhook` and use test-mode events.

## Production build fails during setup

Run the component checks separately: `npm run db:validate`, `npm test`, `npm run lint`, `npm run typecheck`, then `npm run build`. Provider preflight requires live credentials and should not be treated as an offline build step.
