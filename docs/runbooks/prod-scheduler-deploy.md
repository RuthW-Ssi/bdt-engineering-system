# Prod Scheduler Deploy Runbook — Cloud Run `prod-scheduler`

> **Decision:** [ADR-0015](../adr/0015-prod-scheduler-cloud-run.md) — the Python scheduler (`backend-schedule/`)
> runs as its own Cloud Run service, reachable **only** by NestJS through Cloud Run IAM. The browser never
> calls it. It reads its inputs and writes `prod_schedule_version` + `prod_schedule` with a least-privilege
> DB role; Prisma migrations stay the only schema authority (the container never runs DDL).

## At a glance

| Item | Value |
|------|-------|
| Service | `prod-scheduler` · Cloud Run `asia-northeast1` · project `building-technology-493907` |
| URL | `https://prod-scheduler-489818756412.asia-northeast1.run.app` |
| Image | `asia-southeast1-docker.pkg.dev/building-technology-493907/bdt-backend/prod-scheduler:<sha>` (+ `:latest`) |
| Built from | `backend-schedule/Dockerfile` (Python 3.13, non-root, `uvicorn app.main:app` on `$PORT`) |
| Deployed by | `.github/workflows/deploy-scheduler.yml` — push to `staging` touching `backend-schedule/**` |
| Access | IAM only (`--no-allow-unauthenticated`); `roles/run.invoker` = NestJS runtime service account |
| DB | Supavisor **transaction** pooler (6543) as role `sched_writer` · secret `prod-scheduler-database-url` |
| Caller | NestJS `SchedulerApiClient` via `SCHEDULER_API_URL` (`POST /schedule/runs`) |

---

## 0. First rollout — order matters

Do the one-time setup and the first deploy **before** merging the NestJS change that sets
`SCHEDULER_API_URL`, otherwise `POST /schedule/runs` calls a service that does not exist yet or
that NestJS may not invoke.

```
§1 DB role sched_writer ─► §2 secret + secretAccessor ─► §3 merge backend-schedule/** to staging
   (first deploy) ─► §4 invoker grant for NestJS SA ─► §6 verify with an ID token
   ─► merge the NestJS change (deploy-backend.yml sets SCHEDULER_API_URL, §5) ─► §6 end-to-end run
```

§4 needs the service to exist, so it always comes after the first deploy. If the scheduler and NestJS
changes reach `staging` in the same push, both workflows run in parallel and NestJS runs fail until §4
is done — merge them as two separate PRs.

---

## 1. DB role `sched_writer` (one-time)

Run in the Supabase SQL Editor (project `eebubyfkzeqhzwzqrqfz`) as `postgres`. Generate the password with
`openssl rand -hex 32` (hex needs no URL-encoding in §2).

```sql
-- Login role with no elevated attributes.
-- CONNECTION LIMIT >= the Supabase pooler Pool Size (see note below), NOT Cloud Run instances x concurrency.
CREATE ROLE sched_writer WITH LOGIN PASSWORD '<openssl rand -hex 32>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT <pooler Pool Size>;

GRANT USAGE ON SCHEMA public TO sched_writer;

-- Inputs: exactly the tables app/solver/loader.py reads
GRANT SELECT ON TABLE
  public.work_order,
  public.mrp_workcenter,
  public.mrp_workcenter_line,
  public.calendar,
  public.calendar_exception,
  public.scheduler_config
TO sched_writer;

-- Outputs: app/solver/writer.py updates the version row in place (SELECT ... FOR UPDATE,
-- UPDATE; INSERT ... RETURNING id the first time) and replaces that version's schedule rows.
-- SELECT is needed as well: the writer filters on columns and reads ids back.
GRANT SELECT, INSERT, UPDATE ON TABLE public.prod_schedule_version TO sched_writer;
GRANT SELECT, INSERT, DELETE ON TABLE public.prod_schedule TO sched_writer;

-- SERIAL ids of the two output tables
GRANT USAGE, SELECT ON SEQUENCE
  public.prod_schedule_version_id_seq,
  public.prod_schedule_id_seq
TO sched_writer;
```

`pg_try_advisory_xact_lock` (the run lock) is executable by `PUBLIC`, so it needs no grant.

**Connection limit:** through the transaction pooler (§2), the server connections that count against
`sched_writer`'s limit are opened by Supavisor's own pool for (`sched_writer`, `postgres`). That pool can grow
up to the project's pooler **Pool Size** (Supabase Dashboard → database settings → Connection pooling).
Cloud Run `--max-instances` × `--concurrency` (2 × 4) only caps client connections to Supavisor. Set the
limit to at least Pool Size. If Pool Size is raised later, raise the limit too
(`ALTER ROLE sched_writer CONNECTION LIMIT <n>;`). To check: `SELECT rolconnlimit FROM pg_roles WHERE rolname = 'sched_writer';`.

> [!warning] `sched_writer` must never get DDL rights
> No `CREATE` on the schema or database, never the owner of any table, never a member of `postgres` /
> `service_role` / `authenticated`, no `ALTER DEFAULT PRIVILEGES` for it, never used for `prisma migrate`.
> When a migration adds a table the loader starts reading, add its `GRANT SELECT` to this runbook and run it
> in the same release — new tables are **not** granted automatically.

**Check** (as `postgres`):

```sql
-- every column must be false
SELECT has_schema_privilege('sched_writer', 'public', 'CREATE')              AS create_in_public,
       has_database_privilege('sched_writer', current_database(), 'CREATE')  AS create_schema,
       has_table_privilege('sched_writer', 'public.work_order', 'UPDATE')     AS write_inputs,
       (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls
          FROM pg_roles WHERE rolname = 'sched_writer')                       AS elevated;

-- must return no rows (an owner can ALTER / DROP)
SELECT c.relname FROM pg_class c WHERE c.relowner = 'sched_writer'::regrole;

-- sequence names must match the GRANT above
SELECT pg_get_serial_sequence('public.prod_schedule_version', 'id'),
       pg_get_serial_sequence('public.prod_schedule', 'id');

-- RLS: if any of these is true, sched_writer sees 0 rows there unless a policy allows it
SELECT relname, relrowsecurity FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('work_order', 'mrp_workcenter', 'mrp_workcenter_line', 'calendar',
                  'calendar_exception', 'scheduler_config', 'prod_schedule_version', 'prod_schedule');
```

If `create_in_public` is `true`, `PUBLIC` still holds `CREATE` on `public` (pre-PG15 default) — stop and fix
that with the DB owner before deploying.

---

## 2. Secret `prod-scheduler-database-url` (one-time)

Value — Supavisor **transaction** pooler, tenant-qualified user, TLS on:

```
postgresql://sched_writer.eebubyfkzeqhzwzqrqfz:<password>@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require
```

(`<ref>` = `eebubyfkzeqhzwzqrqfz`. "tenant or user not found" means the cluster prefix is wrong — try `aws-0`.)

```bash
read -rs SCHED_DB_URL        # paste the URL above, Enter (not echoed, not in shell history)
printf '%s' "$SCHED_DB_URL" | gcloud secrets create prod-scheduler-database-url \
  --project building-technology-493907 --data-file=-
unset SCHED_DB_URL

# prod-scheduler runs as the default compute SA (the workflow sets no --service-account)
gcloud secrets add-iam-policy-binding prod-scheduler-database-url \
  --project building-technology-493907 \
  --member serviceAccount:489818756412-compute@developer.gserviceaccount.com \
  --role roles/secretmanager.secretAccessor
```

**Why transaction mode is fine:** a run is one connection and **one transaction** — advisory lock first,
then the loader reads, then the writer writes, then commit and close. Transaction mode pins one server
connection for exactly that transaction, so the run sees one consistent session. The lock is
`pg_try_advisory_xact_lock`, released at commit/rollback, so nothing leaks to the next client of that
server connection (a session-level `pg_advisory_lock` would — never use it here). psycopg2 does not use
server-side prepared statements, and the scheduler sets no session state across transactions. This is the
same mode NestJS `DATABASE_URL` already uses.

**Rotate the password:** `ALTER ROLE sched_writer WITH PASSWORD '<new>';` → add a secret version
(`gcloud secrets versions add prod-scheduler-database-url --data-file=-`, same `read -rs` pattern) → start a
new revision so instances re-read `:latest`:
`gcloud run services update prod-scheduler --region asia-northeast1 --project building-technology-493907 --update-env-vars SECRET_ROTATED_AT=$(date +%s)`.
Runs fail between the `ALTER ROLE` and the new revision — do it outside working hours.

---

## 3. Deploy

Normal path: push to `staging` with a change under `backend-schedule/**` (or to the workflow file).
The workflow builds `backend-schedule/`, pushes `:<sha>` + `:latest`, and deploys:

| Flag | Value | Why |
|------|-------|-----|
| `--no-allow-unauthenticated` | — | IAM only (ADR-0015 D1) |
| `--set-secrets` | `DATABASE_URL=prod-scheduler-database-url:latest` | §2 |
| `--port` | `8080` | Dockerfile listens on `$PORT` (default 8080) |
| `--min-instances` / `--max-instances` | `0` / `2` | scale to zero; caps concurrent runs (client connections to the pooler) and cost |
| `--memory` / `--cpu` | `1Gi` / `1` | event-based solve is ~9 s at 4,000 WOs |
| `--timeout` | `300` | headroom above the NestJS 60 s fetch timeout |
| `--concurrency` | `4` | runs are serialized by the advisory lock anyway |

Then it routes 100 % to the latest revision and checks — without an ID token — that the service has a URL,
the newest revision is Ready, and the IAM policy has no `allUsers` / `allAuthenticatedUsers` (it only warns
if the deployer cannot read the policy). `/health` is checked by hand in §6.

The deployer is the same `GCP_SA_KEY` as `deploy-backend.yml` (Artifact Registry write on `bdt-backend`,
Cloud Run deploy, act-as on the default compute SA) — no new grant expected.

---

## 4. IAM — let NestJS invoke the scheduler (one-time, after the first deploy)

```bash
NEST_SA=$(gcloud run services describe staging-bdt-engineering-service \
  --region asia-northeast1 --project building-technology-493907 \
  --format='value(spec.template.spec.serviceAccountName)')
NEST_SA=${NEST_SA:-489818756412-compute@developer.gserviceaccount.com}   # empty = default compute SA
echo "$NEST_SA"

gcloud run services add-iam-policy-binding prod-scheduler \
  --region asia-northeast1 --project building-technology-493907 \
  --member "serviceAccount:$NEST_SA" \
  --role roles/run.invoker

gcloud run services get-iam-policy prod-scheduler \
  --region asia-northeast1 --project building-technology-493907
```

Expected: one `roles/run.invoker` binding with `$NEST_SA`; no `allUsers` / `allAuthenticatedUsers`.

> [!note] Default compute SA is shared
> If NestJS runs as the default compute SA, every other Cloud Run service in the project that also runs as
> it can invoke `prod-scheduler`. Hardening later: give NestJS its own runtime SA and grant the invoker to that.

---

## 5. `SCHEDULER_API_URL` (NestJS)

Set in `.github/workflows/deploy-backend.yml` `--set-env-vars`:

```
SCHEDULER_API_URL=https://prod-scheduler-489818756412.asia-northeast1.run.app
```

It must live in the workflow, not the Cloud Run console: `--set-env-vars` replaces the whole env list on
every backend deploy. The value is also the ID-token audience (`getIdTokenClient(SCHEDULER_API_URL)`) —
no trailing slash, no path. Cloud Run accepts both URL forms (`…run.app` above and the
`prod-scheduler-<hash>-an.a.run.app` that `status.url` may print). Unset → `POST /schedule/runs` returns
`500 Scheduler service is not configured`.

---

## 6. Verify

With your own identity (your account needs `roles/run.invoker` or higher on the service):

```bash
URL=https://prod-scheduler-489818756412.asia-northeast1.run.app

curl -sS -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL/health"
# {"status":"ok","service":"prod-scheduler"}

curl -sS -o /dev/null -w '%{http_code}\n' "$URL/health"
# 403 (or 401) — no token: proves the service is not public

# DB connectivity + grants, NO write: /schedule/compare always runs with persist=false
curl -sS -X POST "$URL/schedule/compare" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H 'Content-Type: application/json' -d '{}'
# 200 with backward/event_based KPIs, or 422 data_not_ready — both prove connect + SELECT grants
```

On `500`, read the logs (the response body is generic by design):

```bash
gcloud run services logs read prod-scheduler \
  --region asia-northeast1 --project building-technology-493907 --limit 50
```

End to end (after §5 is deployed) — **writes** `BACKWARD-V1`:
`POST /api/v1/schedule/runs` with `{"direction":"backward"}` as a user with `orders:update`; expect `200`
with `version_id`, and an audit row on `prod_schedule_version`.

---

## 7. Rollback

```bash
gcloud run revisions list --service prod-scheduler \
  --region asia-northeast1 --project building-technology-493907 --limit 5

gcloud run services update-traffic prod-scheduler \
  --region asia-northeast1 --project building-technology-493907 \
  --to-revisions <previous-revision>=100
```

- The next push deploy runs `update-traffic --to-latest` and moves traffic back to the newest revision —
  revert or fix the commit on `staging` before pushing again.
- Rollback does not touch data. Versions are overwritten in place (ADR-0015 D3), so a bad schedule is fixed
  by re-running from the good revision (`POST /schedule/runs`), not by restoring rows.

**Emergency stop** (no redeploy): remove the invoker binding
(`gcloud run services remove-iam-policy-binding prod-scheduler --member "serviceAccount:$NEST_SA" --role roles/run.invoker …`)
so NestJS can no longer call it, and/or block DB writes with `ALTER ROLE sched_writer NOLOGIN;`
(undo: `LOGIN`).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| NestJS `500 Scheduler service is not configured` | `SCHEDULER_API_URL` not set | §5 |
| NestJS `400`, scheduler log shows no request | NestJS SA lacks `run.invoker`, or audience ≠ service URL | §4, §5 |
| Deploy: revision not ready, "permission denied on secret" | runtime SA lacks `secretAccessor` | §2 |
| Log: `password authentication failed` / `tenant or user not found` | user must be `sched_writer.<ref>`; wrong `aws-0`/`aws-1` prefix | §2 |
| Log: `permission denied for table …` | loader/writer touches a table not granted | §1 |
| Intermittent `500`, log: `too many connections for role "sched_writer"` | role `CONNECTION LIMIT` is below the pooler Pool Size (or Pool Size was raised later) | `ALTER ROLE sched_writer CONNECTION LIMIT <Pool Size>;` as `postgres` — §1 connection limit |
| `422 data_not_ready` although WOs exist | RLS on an input table without a policy for `sched_writer` | §1 RLS check |
| `409 run_in_progress` that does not clear | another run holds the xact lock; it is released at commit/rollback or when its connection drops | `SELECT * FROM pg_locks WHERE locktype = 'advisory';` + `pg_stat_activity` for `sched_writer` |
| NestJS `504` but the version changed | NestJS stops waiting at 60 s; the run keeps going (Cloud Run timeout 300 s) and commits | expected — reload versions |

---

## See also

- [ADR-0015](../adr/0015-prod-scheduler-cloud-run.md) — hosting decision and service contract
- [connection-pool.md](connection-pool.md) — Supabase pooler vs direct URL
- `backend/src/modules/cutting-plan/cutting-plan-api.client.ts` — same Cloud Run IAM call pattern
