# Migration Rollback Runbook

> **DB as of 2026-06-02:** Supabase Postgres 16 (staging). Local dev uses Docker Compose Postgres 16.
> Cloud SQL (`dev-bdt-engineering-db`) retired 2026-05-20. Methods A/B below reference Cloud SQL history — update URLs/commands for Supabase if needed.

## When to use which method

```
Migration failed or data corrupted?
├─ Supabase staging · Prisma P3009 / P3018 (failed migration blocking startup)?
│   └─ YES → Method C (_prisma_migrations direct fix) — fastest for Supabase
├─ Can you restore from PITR? (< 7 days ago, no data loss acceptable)
│   └─ YES → Method A (PITR restore) — fastest, cleanest [Cloud SQL / Supabase PITR]
└─ Need surgical fix without full restore?
    └─ YES → Method B (Manual SQL revert) — more control, more risk
```

---

## Method A — Point-in-Time Recovery (PITR)

Fastest option. Restores the entire DB to a point before the bad migration.
Use when: migration applied and caused data loss or corruption.

**Steps (GCP Console):**

1. Go to [Cloud SQL → dev-bdt-engineering-db → Backups](https://console.cloud.google.com/sql/instances/dev-bdt-engineering-db/backups?project=building-technology-493907)
2. Click **Restore** → choose **Point in time**
3. Set timestamp to ~2 min before the bad migration deployed
4. Choose restore target: **same instance** (overwrites current DB)
5. Confirm → wait ~3–5 min for restore to complete
6. Verify with `prisma migrate status` (see §Verify below)

**Expected time:** < 5 min

> **Warning:** PITR overwrites the live DB. Coordinate with team — no dev should write during restore window.

---

## Method B — Manual SQL Revert

Use when PITR is unavailable or the issue is isolated to schema (not data).

### Step 1 — Identify the bad migration

```bash
cd backend
DATABASE_URL="<your-url>" npx prisma migrate status
```

Note the migration name that was applied incorrectly (e.g., `20260508_add_foo`).

### Step 2 — Generate reverse SQL

```bash
DATABASE_URL="<your-url>" npx prisma migrate diff \
  --from-schema-datamodel ./prisma/schema.prisma \
  --to-migrations ./prisma/migrations \
  --script
```

This outputs the SQL to revert the current schema to the migrations state.
Review carefully before running.

### Step 3 — Apply reverse SQL via proxy

```bash
# Ensure proxy is running
bash scripts/proxy-up.sh

# Connect and apply reverse SQL
psql "postgresql://postgres:<password>@127.0.0.1:5432/dev-bdt-engineering-db" \
  -f revert.sql
```

### Step 4 — Remove migration record from `_prisma_migrations`

```sql
DELETE FROM _prisma_migrations
WHERE migration_name = '20260508_add_foo';
```

### Step 5 — Verify

```bash
DATABASE_URL="<your-url>" npx prisma migrate status
```

Expected output: `Database schema is up to date!`

---

## Sprint 4 history tables — special handling

Sprint 4 introduced 8 history tables with triggers (e.g., `routing_history`, `bom_history`).
If reverting a migration that touches these:

1. Drop triggers **before** dropping history tables:
   ```sql
   DROP TRIGGER IF EXISTS trg_routing_history ON routings;
   -- repeat for each affected trigger
   ```
2. Then drop the history table:
   ```sql
   DROP TABLE IF EXISTS routing_history;
   ```
3. Remove the corresponding row from `_prisma_migrations`

---

## Verify after any rollback

```bash
cd backend
DATABASE_URL="<your-url>" npx prisma migrate status
```

Green output: `Database schema is up to date!`

If pending migrations remain, apply them:
```bash
DATABASE_URL="<your-url>" npx prisma migrate deploy
```

---

---

## Method C — Supabase `_prisma_migrations` direct fix (P3009 / P3018)

Use when: Prisma reports P3009 ("found failed migrations") or P3018 ("failed to apply") on **Supabase staging** and you need to unblock startup without running DDL. This happens when a migration's SQL references a table that was already renamed/dropped in the live DB.

**Symptoms:**
- Cloud Run health check fails → HTTP 500 on all endpoints
- `prisma migrate status` shows a migration with `finished_at = NULL`
- Prisma log: `Error: P3009` or `Error: P3018`

### Step 1 — Identify the stuck migration

In Supabase SQL Editor (`eebubyfkzeqhzwzqrqfz` project):
```sql
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs
FROM _prisma_migrations
ORDER BY started_at DESC
LIMIT 10;
```

A failed migration has `finished_at = NULL` and `rolled_back_at = NULL`.

### Step 2 — Verify the live schema already matches intent

Check that the table/column the migration was trying to create/rename **already exists** in the correct final state. If the live schema is correct, skip DDL and just fix the migration record.

### Step 3 — Mark migration as APPLIED (NOT rolled back)

> ⚠️ Do NOT set `rolled_back_at` — that triggers P3018 (Prisma re-tries the migration). Set `finished_at` instead.

```sql
-- Mark the stuck migration as successfully applied
UPDATE _prisma_migrations
SET
  finished_at = NOW(),
  applied_steps_count = 1,
  rolled_back_at = NULL,
  logs = NULL
WHERE migration_name = '20260622010000_refactor_activity_labor_skill';  -- replace with actual name
```

### Step 4 — Delete duplicate rows (if P3018 created one)

If Prisma attempted a re-apply, it may have inserted a second row for the same migration:
```sql
-- Find duplicates
SELECT migration_name, checksum, COUNT(*) FROM _prisma_migrations
GROUP BY migration_name, checksum HAVING COUNT(*) > 1;

-- Delete the extra row (keep the one with finished_at set)
DELETE FROM _prisma_migrations
WHERE id = '<duplicate-uuid>';
```

### Step 5 — Insert pending migrations as APPLIED (if needed)

If there are migrations that Prisma hasn't seen but the schema already reflects them:
```sql
INSERT INTO _prisma_migrations
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid(), '<sha256-checksum>', NOW(), '20260622020000_next_migration', NULL, NULL, NOW(), 1);
```

Get the checksum from `backend/prisma/migrations/<name>/migration.sql` — SHA-256 of the file content.

### Step 6 — Redeploy Cloud Run

Trigger a fresh Cloud Run deploy (push a `backend/**` change to `staging` branch) or manually route traffic to the latest Ready revision:
```bash
gcloud run services update-traffic staging-bdt-engineering-service \
  --region=asia-southeast1 \
  --to-revisions=<revision-name>=100
```

### Step 7 — Verify

```bash
curl -X POST https://<staging-url>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"BdtDev2026!"}'
# Expected: HTTP 200 + access_token
```

**Real incident (2026-06-22):** Migration `20260622010000_refactor_activity_labor_skill` tried `ALTER TABLE activity_labor` but the table was already renamed `activity_skill` in the live Supabase DB. Fixed by marking the migration + 11 subsequent migrations as APPLIED directly. Backend returned HTTP 200 after redeploy.

---

## pnpm+Prisma symlink incident (2026-06-22) {#pnpm-prisma-incident}

**Symptom:** Login returns 200 but specific endpoints return 500 after a Prisma schema change (e.g., model rename).

**Root cause:** pnpm resolves `@prisma/client` through `.pnpm` symlinks to a **stale** generated client in the pnpm store, ignoring the freshly-generated `node_modules/.prisma/client/`.

**Fix:** `backend/.npmrc` with `shamefully-hoist=true`. Do NOT remove this file.

**Diagnosis steps:**
1. Check Cloud Run logs for `TypeError: Unknown field` or `PrismaClientValidationError`
2. If the error references a field that was recently renamed/added → pnpm symlink issue
3. Confirm `backend/.npmrc` exists with `shamefully-hoist=true`
4. If `.npmrc` is missing → add it, commit, push to `staging` → CI/CD rebuilds Docker image

See also: [[../../wiki/tech/backend/decisions#backendnpmrc-shamefully-hoisttrue--required-for-pnpmprisma-in-docker-2026-06-22]]

---

## Contact

Issues: @bdt-lead in Slack / GitHub issue in `RuthW-Ssi/bdt-engineering-system`
