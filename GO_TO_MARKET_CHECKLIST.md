# CallbackCloser Go-To-Market Checklist

## Domain / DNS / Deployment Items

- [ ] Point `callbackcloser.com` and any app subdomain to the actual production deployment.
- [ ] Set `NEXT_PUBLIC_APP_URL` to the exact live `https://` URL.
- [ ] Verify Clerk redirect URLs match the live domain.
- [ ] Verify production env vars are set for Vercel, Neon, Stripe, Twilio, and Clerk.
- [ ] Run `npm run env:check`.
- [ ] Run `npx prisma validate`.
- [ ] Run `npx prisma migrate status`.
- [ ] Run `npm run build`.
- [ ] Add a simple health/readiness endpoint or equivalent production verification check.
- [ ] Confirm alerting destination is configured and tested.

## Stripe Items

- [ ] Publish real customer-facing plan names, prices, billing interval, and included limits.
- [ ] Align public pricing copy with in-app checkout behavior.
- [ ] Confirm `STRIPE_PRICE_STARTER` and `STRIPE_PRICE_PRO` are live and mapped correctly.
- [ ] Confirm `STRIPE_WEBHOOK_SECRET` matches the production endpoint.
- [ ] Verify `/api/stripe/webhook` receives and processes live-mode events.
- [ ] Test checkout success path on production.
- [ ] Test checkout cancel path on production.
- [ ] Test billing portal access on production.
- [ ] Test `invoice.payment_failed` handling and decide what the customer sees and what founder action follows.
- [ ] Decide and document what happens on `PAST_DUE` and `CANCELED` states.

## Twilio Items

- [ ] Remove or lock down customer visibility into shared Twilio account number inventory.
- [ ] Decide whether number assignment is founder-managed, customer-managed, or subaccount-based.
- [ ] Verify `TWILIO_VALIDATE_SIGNATURE=true` in production.
- [ ] Verify Twilio webhooks point at the exact production URL.
- [ ] Run `npm run webhooks:print` and match it against Twilio configuration.
- [ ] Test answered call path.
- [ ] Test missed call path.
- [ ] Test initial outbound SMS after missed call.
- [ ] Test the full qualification flow through service, urgency, ZIP, best time, and name.
- [ ] Test owner summary SMS after ZIP is collected.
- [ ] Test STOP, START, and HELP behavior.
- [ ] Test recording callback and recording playback path.
- [ ] Fix silent SMS send failures before go-live.

## Legal Items

- [ ] Review `privacy`, `terms`, `refund`, and `sms-consent` pages for live-business accuracy.
- [ ] Add real company/business details and support contact details.
- [ ] Make billing and cancellation language match actual Stripe behavior.
- [ ] Make data-handling and deletion-request language match reality.
- [ ] Review consent posture for missed-call triggered SMS with counsel or qualified reviewer.
- [ ] Ensure public trust pages are linked from the site footer and pricing path.

## Support / Contact Items

- [ ] Confirm `support@callbackcloser.com` is live and monitored.
- [ ] Decide where support requests are tracked.
- [ ] Create a minimum support SOP for signup, Twilio setup failure, billing failure, and webhook failure.
- [ ] Create at least one customer help page or onboarding guide.
- [ ] Decide how customers report urgent issues during early launch.

## Website Copy Items

- [ ] Stop overpromising "booked jobs" unless the product actually books jobs.
- [ ] Explain the true current product scope: missed-call capture, SMS qualification, owner notification, dashboard visibility.
- [ ] Publish real pricing or explicitly remove self-serve checkout until pricing is public.
- [ ] Clarify whether setup is self-serve or founder-assisted.
- [ ] Add a clearer explanation of Twilio setup burden and what the customer needs to provide.
- [ ] Add basic trust signals beyond legal links if you plan to sell to cold traffic.

## Launch-Day Checks

- [ ] Run a real production smoke test with a real customer-like flow.
- [ ] Confirm signup works.
- [ ] Confirm onboarding works.
- [ ] Confirm Twilio number is assigned and webhook sync is current.
- [ ] Confirm missed call creates lead.
- [ ] Confirm automated SMS starts.
- [ ] Confirm owner summary SMS sends.
- [ ] Confirm lead appears correctly in dashboard.
- [ ] Confirm billing checkout works.
- [ ] Confirm Stripe webhook updates subscription status.
- [ ] Confirm logs contain correlation IDs and usable error context.
- [ ] Confirm alerts fire for a forced test failure.

## Post-Launch Monitoring Checks

- [ ] Watch Twilio webhook logs for `401`, `429`, and send failures.
- [ ] Watch Stripe webhook logs for signature failures and handler errors.
- [ ] Watch app errors from `app.error`.
- [ ] Watch for customers stuck in onboarding.
- [ ] Watch for customers stuck with `billing_required` leads.
- [ ] Watch for customers stuck in `PAST_DUE`.
- [ ] Watch support inbox response time.
- [ ] Review first-customer setup friction and update onboarding copy immediately.
