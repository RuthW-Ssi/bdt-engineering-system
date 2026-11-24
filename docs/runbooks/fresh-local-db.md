# Fresh local database from migrations

`prisma migrate deploy` on an **empty** database used to stop at two historical migrations that
assume rows or constraints which only exist on the shared staging database:

| Migration | Problem on an empty DB | Fix |
|---|---|---|
| `20260622060000_mock_activity_labor` | Inserts mock `activity_labor` rows whose `activity_id` 1–34 point at `activity` rows that no migration creates (FK error 23503). | `backend/scripts/migrate-fresh-db.sh` marks it as applied (skipped) when the database has no migration history yet. |
| `20260922040000_team_and_operator_team_id` | Renames the **constraint** `subcontractor_code_key`, but a migrations-only database has a unique **index** of that name (error 42704). | New migration `20260922035900_fresh_db_subcontractor_code_constraint` turns the index into the constraint first. It is a no-op on staging (table already renamed to `team`). |

Existing migration files are not edited (they are immutable once merged).

## Use

```bash
cd backend
# DATABASE_URL and DIRECT_URL point at an EMPTY database (e.g. docker compose up -d postgres)
bash scripts/migrate-fresh-db.sh
pnpm prisma:seed            # needs ADMIN_SEED_PASSWORD
```

Verified 2026-11-24 on PostgreSQL 16: empty database → all migrations applied; second run → "No pending migrations".
Staging and CI keep using `prisma migrate deploy` unchanged.
