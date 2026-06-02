# Connection Pool Runbook — Cloud SQL + Prisma

> [!warning] Historical (Cloud SQL retired 2026-05-20)
> The dev Cloud SQL instance was deleted. Local dev now uses Docker Compose Postgres;
> staging uses **Supabase** with its **transaction pooler** (`DATABASE_URL`, port 6543)
> + a **direct connection** (`DIRECT_URL`, port 5432) for migrations — you do NOT tune
> instance `max_connections` the way you did on Cloud SQL. The numbers below applied to
> the old Cloud SQL `db-f1-micro` dev DB only. Current model: wiki `ops/infra.md`.

## Current settings

| Setting | Value | Where |
|---------|-------|-------|
| Cloud SQL `max_connections` | 25 | GCP Console → Cloud SQL → Edit instance → Flags |
| Prisma `connection_limit` | 5 per dev process | `DATABASE_URL` query param |

## Why these numbers

Cloud SQL `db-f1-micro` (dev instance) defaults to 25 max connections.
Expected concurrent load: 4–6 devs × 1 process each + 2 CI slots + 3 buffer = 25.

Prisma default connection pool = `num_cpus × 2 + 1` which can be 9–17 on modern machines.
With 6 devs that would exhaust Cloud SQL's 25 limit. `connection_limit=5` keeps
each dev process bounded.

## How to apply the setting

The `connection_limit` param lives in `DATABASE_URL`:

```
postgresql://postgres:<pw>@127.0.0.1:5432/dev-bdt-engineering-db?schema=public&connection_limit=5
```

`scripts/setup-env.sh` writes the URL from Secret Manager into `backend/.env`.
Update the secret value in GCP Secret Manager if the limit needs changing project-wide.

## Monitor active connections

Connect via proxy and run:

```sql
SELECT count(*), state
FROM pg_stat_activity
WHERE datname = 'dev-bdt-engineering-db'
GROUP BY state;
```

Healthy: `active` count stays well below 25. Alert if approaching 20+.

## Adjust limits

**Raise Prisma limit** (per-dev): update `connection_limit` param in `bdt-dev-database-url` secret.

**Raise Cloud SQL limit**: GCP Console → Cloud SQL → `dev-bdt-engineering-db` → Edit →
Database flags → `max_connections` → save → instance restarts (~60 s).

Note: raising `max_connections` increases memory usage. `db-f1-micro` has 614 MB RAM —
stay below 50 connections to avoid OOM.
