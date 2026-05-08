# Migration Rollback Runbook

GCP Cloud SQL dev DB (`dev-bdt-engineering-db`, project `building-technology-493907`)

## When to use which method

```
Migration failed or data corrupted?
├─ Can you restore from PITR? (< 7 days ago, no data loss acceptable)
│   └─ YES → Method A (PITR restore) — fastest, cleanest
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

## Contact

Issues: @bdt-lead in Slack / GitHub issue in `RuthW-Ssi/bdt-engineering-system`
