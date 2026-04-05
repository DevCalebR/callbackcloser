# CallbackCloser Pilot Launch Checklist

## Before Inviting The First Customer

- [ ] Confirm the live domain resolves to the correct production deployment.
- [ ] Confirm `NEXT_PUBLIC_APP_URL` matches the exact live `https://` URL.
- [ ] Confirm production env vars are set for Clerk, Stripe, Twilio, and Neon.
- [ ] Confirm `TWILIO_VALIDATE_SIGNATURE=true` in production.
- [ ] Confirm `PORTFOLIO_DEMO_MODE` is disabled in production.
- [ ] Run `npm run env:check`.
- [ ] Run `npx prisma validate`.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.

## Before Turning On Live Calls

- [ ] Create the customer business record.
- [ ] Set the real forwarding number.
- [ ] Set the owner notification phone.
- [ ] Assign a Twilio number safely:
- [ ] Buy a new number in-app, or
- [ ] Attach the customer&apos;s existing number manually without exposing shared account inventory.
- [ ] Re-sync webhooks after the final production URL is confirmed.
- [ ] Confirm the assigned Twilio number and SID are stored on the business.
- [ ] Activate billing and wait for `ACTIVE` status in the app.

## Trust Surfaces

- [ ] Public home page matches actual product behavior.
- [ ] Public pricing page matches the in-app billing flow.
- [ ] Contact page clearly points to `support@callbackcloser.com`.
- [ ] Terms, privacy, refund, and SMS consent pages are live and linked.

## Founder Ops

- [ ] Alerting destination is configured and tested.
- [ ] You know where to read Vercel logs.
- [ ] You know where to inspect Twilio request logs.
- [ ] You know where to inspect Stripe webhook deliveries.
- [ ] You have a manual fallback plan if automated SMS breaks during a pilot.

## First-Customer Rules

- [ ] Do not onboard multiple customers onto a shared Twilio inventory workflow from self-serve settings.
- [ ] Do not call the product automated booking if the workflow still requires manual owner follow-up.
- [ ] Do not skip the production smoke test before live rollout.
