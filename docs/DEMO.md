# Demonstration and screenshot inventory

## Safe demo path

Use `/simulator` for public demonstrations. It provides an isolated preview flow without touching a real customer workspace or sending a real message. Do not use production phone numbers, recordings, or message history in portfolio captures.

## Verified captures

The committed captures were produced locally from the self-contained simulator and `PORTFOLIO_DEMO_MODE=1` fixtures:

1. `simulator-qualified-lead-desktop.png` — completed missed-call qualification using a reserved demo phone number.
2. `simulator-qualified-lead-mobile.png` — the same isolated flow at 390 × 844.
3. `dashboard-demo-desktop.png` — owner dashboard populated by repository demo fixtures.
4. `lead-detail-demo-desktop.png` — synthetic lead detail and conversation context.

Desktop captures use a 1440 × 1000 viewport. No Clerk user data, real Twilio identifiers, account IDs, or browser-extension content is visible. The simulator masks the reserved synthetic phone number.

## Evidence script

1. Explain the missed-call business problem.
2. Run the simulator through a complete qualification path.
3. Show the resulting lead state and conversation history.
4. Point out idempotency, signature validation, compliance commands, and tenant tests in the repository.
5. State the limitations in the README; do not claim measured lead recovery without pilot data.
