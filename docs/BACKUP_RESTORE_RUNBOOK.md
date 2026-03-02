# Backup + Restore Runbook (Neon + Prisma)

Date: 2026-03-02  
Owner: Ops / Engineering

## Objectives

- Keep production customer data recoverable from accidental deletion, schema mistakes, and provider incidents.
- Define explicit recovery targets:
  - **RPO**: <= 15 minutes (via Neon point-in-time recovery)
  - **RTO**: <= 60 minutes for partial incident, <= 120 minutes for full environment recovery
- Run and record a restore drill at least **monthly**.

## Backup Policy

1. Primary protection: Neon managed backups / point-in-time recovery enabled on production project.
2. Secondary protection: periodic logical exports for independent restoreability checks.
3. Retention targets:
   - Neon PITR window: keep provider default or higher, never below 7 days.
   - Logical backup artifacts: retain at least 30 days in secure storage.

## Required Environment

- `DATABASE_URL` (pooled runtime)
- `DIRECT_DATABASE_URL` (direct connection for Prisma + admin tooling)
- PostgreSQL CLI tools installed locally/CI (`pg_dump`, `psql`, `pg_restore` if custom format is used)

## Logical Backup Procedure (Non-Destructive)

Use a direct Postgres connection for dump operations.

```bash
export BACKUP_TS=$(date -u +%Y%m%dT%H%M%SZ)
export BACKUP_FILE="outputs/backups/callbackcloser-${BACKUP_TS}.sql.gz"
mkdir -p outputs/backups

pg_dump "$DIRECT_DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip > "$BACKUP_FILE"

gzip -t "$BACKUP_FILE"
ls -lh "$BACKUP_FILE"
```

## Restore Drill Procedure (Monthly)

Run against a non-production restore target only.

1. Provision an empty restore target database (`RESTORE_DATABASE_URL`).
2. Restore the latest backup artifact.

```bash
gunzip -c "$BACKUP_FILE" | psql "$RESTORE_DATABASE_URL"
```

3. Run Prisma and app-level sanity checks against the restored DB:

```bash
DIRECT_DATABASE_URL="$RESTORE_DATABASE_URL" npx prisma validate
DATABASE_URL="$RESTORE_DATABASE_URL" npm run db:smoke
```

4. Validate key tables and counts manually:

```bash
psql "$RESTORE_DATABASE_URL" -c 'select count(*) as businesses from "Business";'
psql "$RESTORE_DATABASE_URL" -c 'select count(*) as leads from "Lead";'
psql "$RESTORE_DATABASE_URL" -c 'select count(*) as messages from "Message";'
psql "$RESTORE_DATABASE_URL" -c 'select count(*) as calls from "Call";'
```

5. Record outcome in drill log (template below).

## Incident Restore Procedure (Production Event)

1. Declare incident and freeze deploys/write traffic.
2. Pick restore point timestamp (UTC) based on incident timeline.
3. Restore using Neon PITR/branch restore into a clean recovery target.
4. Run Prisma validation + app smoke checks on recovery target.
5. Cut over app env vars (`DATABASE_URL`, `DIRECT_DATABASE_URL`) to recovered target.
6. Run post-cutover smoke:
   - `npm run env:check`
   - `npm run db:smoke`
   - Twilio inbound/outbound smoke
   - Stripe webhook smoke
7. Announce recovery and keep incident watch for at least 1 hour.

## Alerts + Evidence

- Track backup job success/failure in CI logs or scheduler logs.
- Alert on:
  - failed backup run
  - restore drill failure
  - missing drill evidence older than 35 days
- Store drill artifacts:
  - command transcript (or CI job URL)
  - DB count snapshots
  - elapsed restore time
  - operator + reviewer sign-off

## Drill Log Template

| Date (UTC) | Operator | Backup Artifact | Restore Target | Result | Restore Duration | Notes / Follow-ups |
|---|---|---|---|---|---|---|
| YYYY-MM-DD | name | path or object key | env/db name | PASS/FAIL | Xm Ys | links to logs + remediation ticket |
