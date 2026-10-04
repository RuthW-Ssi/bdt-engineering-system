# ADR-0015 — Production Scheduler as a Separate Cloud Run Service

**Date:** 2026-10-03
**Status:** Accepted (D1–D4)
**Sprint:** TBD (prod-scheduler integration, branch `dev-t-prod-scheduler`)

---

## Context

`backend-schedule/` is a Python (FastAPI) finite-capacity scheduler. It reads work orders,
work-center lines and the factory calendar, and writes `prod_schedule_version` + `prod_schedule`.
NestJS (`ScheduleService`) only reads those tables (`GET /schedule/versions`, `/versions/active`,
`/wo/:id/schedule`). Until now the scheduler has not been deployed anywhere: it is run by hand
(`scripts/run_local.py`) with no authentication on its HTTP routes, and nothing in the app can
trigger a run.

Facts that shaped the decision (checked 2026-10-03):

- NestJS already calls one Python service on Cloud Run, `bdt-cutting-plan-service`, using Cloud Run
  IAM (Google ID token from `google-auth-library`) — see `backend/src/modules/cutting-plan/cutting-plan-api.client.ts`.
- NestJS runs on Cloud Run `asia-northeast1`; Supabase Postgres is in `ap-northeast-1` (same metro).
- The Vercel team is on the Hobby plan (300 s function limit, single region, non-commercial use only),
  and every branch push creates a Vercel preview deployment.
- Solver runtime measured locally: 0.005–0.45 s for 125–1,000 WOs, ~9 s at 4,000 WOs (event-based is O(n²)).

---

## Decision

**D1 (Accepted) — Host the scheduler as its own Cloud Run service, called only by NestJS.**

- Service `prod-scheduler` (FastAPI) on Cloud Run `asia-northeast1`, built from `backend-schedule/`,
  deployed by a new workflow on push to `staging` (path `backend-schedule/**`), like `deploy-backend.yml`.
- No public access: deploy without `--allow-unauthenticated`; grant `roles/run.invoker` only to the
  NestJS service account. NestJS calls it with a Google ID token — same pattern as `CuttingPlanApiClient`.
- The browser talks only to NestJS (JWT). NestJS owns authorization, audit (`MailMessageService`) and
  reads results with Prisma. HTTP between the services carries only the run command and a summary
  (`version_id`, `version_code`, `is_active`, `kpi`); schedule rows travel through the database.
- Prisma migrations remain the only schema authority. The scheduler never runs DDL and connects with a
  least-privilege DB role that can read its inputs and write only `prod_schedule*`.
- Runs are synchronous for now (NestJS fetch timeout 60 s). Concurrent runs are serialized with a
  transaction-scoped Postgres advisory lock (`pg_try_advisory_xact_lock(5999718590924016709)`, ASCII
  "SCHEDULE"); the second caller gets `409 run_in_progress`. NestJS `POST /schedule/versions/:id/activate`
  takes the same key, so a manual activation cannot race a run's `is_active` writes. The key is defined in
  `engine.py` (`LOCK_KEY`) and `schedule.service.ts` (`SCHEDULER_LOCK_KEY`); both are pinned by tests.
  Missing input data returns `422 data_not_ready`; internal errors return a generic `500` (no raw exception
  text). A Cloud Run IAM 401/403 is our misconfiguration and surfaces as `500`, not `400`.
- The writer updates the version row in place, so `version_id` is stable across runs and
  `scheduler_config.prod_schedule_version_id` (FK `ON DELETE NO ACTION`) can never block a run.
- NestJS passes `now` (Asia/Bangkok) and `requested_by` (JWT `login`) so runs do not depend on the
  host clock and are attributable.

**D2 (Accepted 2026-10-03)** — Who may run / activate: reuse `@RequiresPermission('orders', 'update')`.
**D3 (Accepted 2026-10-03)** — Keep overwriting the two fixed versions (`EVENTBASED-V1`, `BACKWARD-V1`) for now;
move to append-only runs when what-if scenarios arrive.
**D4 (Accepted 2026-10-03, done 2026-10-04)** — Replace the standalone HTML cockpit with a page in the React app that reads through NestJS
(`/production-schedule`; the HTML cockpit and `build_demo_snapshot.py` were removed).

---

## Alternatives considered

| Option | Why not |
|---|---|
| Separate Vercel project (Root Directory `backend-schedule`) | Hobby plan: non-commercial only, 300 s cap, one region (default `iad1`); needs a shared secret instead of IAM; every branch preview could reach the real DB unless env vars are scoped. |
| Vercel Services (Vite + FastAPI in one project) | Same Hobby limits; Beta; NestJS sits outside Vercel so the service still needs a public route + secret. |
| Fold the scheduler into NestJS (TypeScript) | Loses the Python path to OR-Tools / CP-SAT, which is why `backend-schedule/` was kept separate. |

---

## Consequences

- New: `backend-schedule/Dockerfile` (python:3.13-slim, matches the tested venv), `.github/workflows/deploy-scheduler.yml`,
  one-time setup in `docs/runbooks/prod-scheduler-deploy.md` (DB role `sched_writer`, Secret Manager entry for the
  scheduler `DATABASE_URL`, invoker grant), `SCHEDULER_API_URL` in NestJS config (`configuration.ts`, `.env.example`,
  `deploy-backend.yml` — `--set-env-vars` replaces the whole list on every deploy).
- Python must change before it is deployed: request contract (JSON body with `now`, `requested_by`),
  advisory lock, typed errors, keep `is_active` when a run overwrites the active version, guard work
  centers without active lines, drop or make non-persisting `/schedule/compare`, pin dependencies.
- NestJS gains `POST /schedule/runs` and `POST /schedule/versions/:id/activate` with DTO validation and Jest specs.
- When CP-SAT is introduced, switch to an async job (`202` + run id + polling) instead of raising timeouts.

---

## See also

- `backend/src/modules/cutting-plan/cutting-plan-api.client.ts` — service-to-service pattern to copy
- `backend/src/modules/work-orders/schedule.service.ts` — read side
- `backend-schedule/README.md`, `backend-schedule/HANDOFF.md`, `docs/runbooks/prod-scheduler-deploy.md`
- `MICROSERVICES_PLAN.md` (deferred) — earlier service-boundary thinking
