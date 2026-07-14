# Contributing

CallbackCloser handles authentication, billing, customer data, and communications-provider webhooks. Keep changes narrow and preserve those boundaries.

1. Branch from `main` and install with `npm ci`.
2. Copy `.env.example` to `.env.local`; use test provider accounts only.
3. Add or update tests for domain logic, route behavior, tenancy, and webhook retries.
4. Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
5. Describe configuration or migration impact in the pull request.

Do not commit credentials, provider payloads containing personal data, recordings, database exports, or production identifiers. Do not weaken webhook signature validation or tenant scoping to simplify local testing.
