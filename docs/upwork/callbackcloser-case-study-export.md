# CallbackCloser
**CallbackCloser | Backend SaaS Case Study**

**Summary:** CallbackCloser is a missed-call lead capture and follow-up SaaS product built around protected operations tooling, webhook-driven automation, and subscription-aware backend workflows.

## Problem
Service businesses lose qualified opportunities when inbound calls go unanswered. Without a structured system, missed calls, follow-up messages, lead data, and owner visibility get fragmented across disconnected tools and manual processes.

## Solution
CallbackCloser turns that failure point into a workflow: a missed call is captured from Twilio, stored as a lead, routed into an SMS qualification sequence when billing is active, and surfaced in a protected dashboard with call, message, and status history in one place.

## What I built
- Clerk-authenticated onboarding and protected dashboard access tied to an owner-linked business record.
- Twilio voice routing, missed-call detection, call persistence, and call-record metadata capture.
- SMS conversation tracking with persisted state transitions and structured lead qualification fields.
- Lead detail workflows for transcript review, pipeline status updates, and recording access.
- Stripe checkout, billing portal, and webhook reconciliation for subscription-controlled automation.
- In-app Twilio number connection and webhook sync flows for real deployment setup.

## Tech stack
Next.js 14, TypeScript, Prisma, Postgres/Neon, Clerk, Stripe, Twilio, Vercel, Tailwind CSS.

## Key backend/integration work
- Implemented Twilio voice and SMS webhook handlers with authorization checks, rate limiting, and retry-safe persistence.
- Used database-backed state to control lead creation, SMS progress, owner notifications, and billing-required fallbacks.
- Synced Stripe customer and subscription state into the app database and enforced plan-aware automation behavior.
- Added secure server-mediated access to call recordings instead of exposing third-party recording URLs directly.
- Included deployment-minded environment validation for app URLs, webhook security, and Neon database configuration.

## Outcome
This sample shows product engineering work that goes well beyond UI: authenticated SaaS architecture, webhook orchestration, payments integration, conversation state management, and operational backend logic tied to a clear business workflow.

Built by Caleb Rogers / CallbackCloser
