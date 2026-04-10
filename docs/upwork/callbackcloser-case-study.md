# CallbackCloser

*Product by CallbackCloser*

CallbackCloser is a backend-heavy SaaS product that captures missed-call leads, launches automated follow-up, and gives service businesses a protected workflow for reviewing conversations, recordings, and subscription-controlled automation.

## Problem

Service businesses lose high-intent leads when calls go unanswered. The operational problem is not just the missed call itself, but the broken follow-up path afterward: lead details live in scattered call logs, manual text threads, and ad hoc callbacks, with no consistent system for capture, qualification, or owner visibility.

## Solution

I built CallbackCloser as an end-to-end missed-call recovery workflow. When an inbound call to a Twilio number is not answered, the app records the call event, creates a lead in the database, starts an SMS qualification sequence when billing is active, stores the resulting conversation history, and surfaces everything inside a protected dashboard for the business owner.

## What I built

- Clerk-authenticated onboarding and a protected app workspace tied to an owner-specific `Business` record used across the product.
- Twilio voice handling that forwards incoming calls, tracks dial status, captures call metadata, and creates missed-call lead records when a forwarded call is not answered.
- A persisted SMS qualification flow that stores inbound and outbound messages and collects structured lead details such as service type, urgency, ZIP code, preferred callback time, and contact name.
- Lead management screens for reviewing captured details, conversation transcripts, call records, and internal status updates across the sales pipeline.
- Stripe checkout, billing portal, and webhook-driven subscription syncing so automation behavior is controlled by real billing state rather than front-end flags.
- Business settings flows to buy or attach a Twilio number and sync the correct webhook URLs from inside the application.

## Tech stack

Next.js 14 App Router, TypeScript, Prisma, Postgres with Neon-compatible configuration, Clerk, Stripe, Twilio, Vercel, Tailwind CSS.

## Key backend/integration work

- Built webhook-first backend flows for Twilio voice, Twilio SMS, and Stripe billing events.
- Added idempotent persistence patterns for call and message handling so retries do not create duplicate leads or duplicate conversation records.
- Synced Stripe customers, subscriptions, and price data back into the product database, then used subscription and usage state to gate automated SMS follow-up.
- Captured Twilio recording metadata and exposed recordings through an authenticated server-side route so playback stays scoped to the correct business owner.
- Added production-minded hardening around webhook validation, rate limiting, correlation IDs, and environment checks for Vercel and Neon deployment.

## Outcome

CallbackCloser demonstrates a complete product engineering build for a real SaaS workflow: protected dashboard on the surface, but substantial backend logic underneath. The repo shows practical experience with auth, billing, database modeling, webhook orchestration, messaging automation, and third-party service integration in a production-oriented application.

Built by Caleb Rogers / CallbackCloser
