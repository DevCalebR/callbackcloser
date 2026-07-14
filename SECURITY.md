# Security policy

## Supported version

Only the latest commit on `main` is supported.

## Reporting a vulnerability

Do not open a public issue. Contact the owner through the [DevCalebR GitHub profile](https://github.com/DevCalebR) with reproduction steps, affected routes, and impact. Remove phone numbers, message content, provider credentials, session tokens, recordings, and customer identifiers from the report.

## Security expectations

- Twilio signature validation must remain enabled in production.
- Stripe events must be verified with the endpoint signing secret.
- Customer data must always be scoped to the authenticated business.
- Demo and founder bypasses must remain explicit, narrow, and disabled by default.
- Logs must use the existing sanitization helpers.
