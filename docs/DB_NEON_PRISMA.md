# Neon + Prisma on Vercel (Pooled Runtime + Direct Migrations)

This project is configured to use **two Neon Postgres URLs** with Prisma:

- `DATABASE_URL` -> runtime connections (pooled)
- `DIRECT_DATABASE_URL` -> migrations / schema operations (direct, unpooled)

## Why Two URLs?

Neon provides:

- a **pooled endpoint** (host contains `-pooler`) optimized for serverless/runtime connections
- a **direct endpoint** (non-`-pooler`) for tools that need a direct Postgres connection (Prisma migrations)

Prisma supports this split via:

- `url = env("DATABASE_URL")`
- `directUrl = env("DIRECT_DATABASE_URL")`

## Required Configuration

### 1) Runtime / Serverless (`DATABASE_URL`)

Use the **Neon pooled URL** for:

- Next.js runtime queries
- API routes
- Prisma Client in Vercel/serverless execution

Expected pattern:

- Host includes `-pooler`
- Includes `sslmode=require`

Example shape (do not paste real credentials into docs):

```txt
postgresql://USER:PASSWORD@PROJECT-pooler.REGION.aws.neon.tech/DB_NAME?sslmode=require
```

### 2) Migrations / Prisma CLI (`DIRECT_DATABASE_URL`)

Use the **Neon direct (non-`-pooler`) URL** for:

- `prisma migrate deploy`
- `prisma migrate dev` (local development)
- other Prisma schema operations that require direct DB connectivity

Expected pattern:

- Host does **not** include `-pooler`
- Includes `sslmode=require`

Example shape (do not paste real credentials into docs):

```txt
postgresql://USER:PASSWORD@PROJECT.REGION.aws.neon.tech/DB_NAME?sslmode=require
```

## Vercel Setup

Set both env vars in:

- `Preview`
- `Production`

Recommended:

- Preview uses preview/staging Neon DB URLs (pooled + direct)
- Production uses production Neon DB URLs (pooled + direct)

## Common Mistake to Avoid

Using the pooled `-pooler` URL for Prisma migrations can cause migration problems or connection behavior issues. Keep migrations on `DIRECT_DATABASE_URL` (direct endpoint) and runtime on `DATABASE_URL` (pooled endpoint).

