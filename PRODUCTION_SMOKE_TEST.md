# CallbackCloser Production Smoke Test

Run this on the live production deployment before a real pilot goes live.

## Preconditions

- The customer business is created.
- Forwarding number is set.
- Owner notify phone is set.
- A Twilio number is assigned to the business.
- Webhooks are synced to the live production URL.
- Billing shows `ACTIVE`.

## 1. Sign-In And Settings Check

- Sign in as the customer owner.
- Open `/app/settings`.
- Confirm the assigned Twilio number and SID are visible.
- Confirm the live smoke readiness card has no blockers.

## 2. Answered Call Path

- Call the Twilio number.
- Answer the forwarded call.
- Expected result:
- The call forwards successfully.
- No missed-call SMS flow starts.
- No unexpected lead is created for the answered path.

## 3. Missed Call Path

- Call the Twilio number again.
- Do not answer the forwarded call.
- Expected result:
- A new lead appears in `/app/leads`.
- The lead is not marked `billing_required`.
- The first automated SMS arrives quickly.

## 4. Qualification Path

- Reply to the automated SMS.
- Progress through service, urgency, ZIP, best time, and optional name.
- Expected result:
- Transcript updates in the lead detail page.
- Owner summary SMS is sent after ZIP is collected.
- Lead detail shows the captured fields.

## 5. Compliance Path

- From a test phone, send `HELP`.
- Confirm the help reply arrives.
- Send `STOP`.
- Confirm opt-out reply arrives.
- Send `START`.
- Confirm opt-in reply arrives.

## 6. Recording Path

- Complete an answered forwarded call that is long enough to record.
- Open the lead detail page.
- Expected result:
- Recording metadata is present.
- `Open recording` works for the signed-in owner.

## 7. Billing Path

- Open `/app/billing`.
- Start checkout and complete it in Stripe test mode if validating test env.
- Confirm the app returns to billing.
- Confirm subscription status updates via webhook.
- Open billing portal if the customer exists in Stripe.

## 8. Failure Review

If anything fails, check:

- Vercel logs for `twilio.voice`, `twilio.status`, `twilio.sms`, `twilio.messaging`, and `app.error`
- Twilio request logs for webhook auth or delivery failures
- Stripe webhook delivery logs
- Lead transcript for any `Failed` or `Sent via webhook fallback` outbound message states

Do not turn on a live pilot until every failing step above is explained and corrected.
