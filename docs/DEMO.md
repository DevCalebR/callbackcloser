# Demonstration and screenshot plan

## Safe demo path

Use `/simulator` for public demonstrations. It provides an isolated preview flow without touching a real customer workspace or sending a real message. Do not use production phone numbers, recordings, or message history in portfolio captures.

## Required captures

Capture these only from seeded or synthetic data:

1. `simulator-missed-call.png` — the public missed-call entry state.
2. `simulator-qualification.png` — the in-progress SMS qualification conversation.
3. `dashboard-qualified-lead.png` — a protected dashboard view with synthetic identity and phone data.
4. `lead-conversation.png` — a complete synthetic transcript and outcome controls.

Use a 1440-pixel desktop viewport for repository images and add one 390-pixel mobile simulator capture. Verify that no Clerk user data, Twilio identifiers, email addresses, phone numbers, account IDs, or browser-extension content is visible.

## Evidence script

1. Explain the missed-call business problem.
2. Run the simulator through a complete qualification path.
3. Show the resulting lead state and conversation history.
4. Point out idempotency, signature validation, compliance commands, and tenant tests in the repository.
5. State the limitations in the README; do not claim measured lead recovery without pilot data.
