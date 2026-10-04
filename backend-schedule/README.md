# backend-schedule

Finite-capacity **production scheduler** service for SSI steel fabrication.
Reads scheduling inputs from Postgres/Supabase, runs a heuristic scheduler, and
writes the result to `prod_schedule_version` + `prod_schedule`. The NestJS
`ScheduleService` (`backend/src/modules/work-orders/schedule.service.ts`) only reads them.

> **Naming:** older docs (`docs/APS_*.md`) say "APS" (Advanced Planning & Scheduling).
> Elsewhere in this repo **APS = Autodesk Platform Services** (BIM viewer), so this
> feature is called **prod-scheduler** from here on.

Stand-alone Python service (FastAPI) — separate from the NestJS `backend/` so it can
later host the optimization engine (OR-Tools/CP-SAT) without bloating the main API.

## Status (v1 — 2026-06-24)
- ✅ Heuristic schedulers: **backward (ALAP)** + **event-based (forward dispatch)**
- ✅ Finite capacity at **work-center line** grain (1 line = 1 job at a time)
- ✅ Single factory calendar + **daily overheads** (morning 30 min, shutdown 15 min), lunch, OT, holidays
- ✅ Precedence by `work_order.sequence` within an MO (v1 linear / stage)
- ✅ Dispatch rules: **EDD** (default), CR, SPT, FIFO
- ✅ Validated on the 125-WO test set: **0 line-overlap (feasible)**, paint = bottleneck
- ⏳ v2: OR-Tools/CP-SAT optimization (true "algorithmic sequencing"), what-if scenarios, cockpit API

## v0.2 — merged onto main's schema (2026-10-03, branch `dev-t-prod-scheduler`)
- WO dates: `earliest_start_at`/`target_end_at` → **`plan_start`/`plan_finish`** (main rename).
- WO ↔ assembly is **multi-mark**: `work_order_part` (qty, `weight_kg`) → `bom_assembly_part` → `bom_assembly`.
- Labor follows main: **`team`** (internal/external) + **`work_order.team_headcount`** per WO.
  Line `crew_size`/`labor_mode`/`subcontractor_id` are kept as legacy columns only.
- `--activate` (CLI) / `"activate": true` (API body) makes the written version the single `is_active` one
  (what the BDT app shows via `GET /schedule/versions/active`). Default = not active.
- `prod_schedule.workcenter_line_id` → FK to `mrp_workcenter_line` (was mis-wired to `equipment_resource`).
- `wip_event`/`wip_balance` views rebuilt on the multi-mark model.
- Migration `backend/prisma/migrations/20261003000000_prod_scheduler_drift_and_wip_views`
  is **idempotent** (IF NOT EXISTS / DROP-IF-EXISTS + ADD): a no-op on live, creates the
  objects on a fresh DB, and contains no DROP/RENAME COLUMN|TABLE.

## Layout
```
backend-schedule/
  app/
    main.py              FastAPI (POST /schedule, /schedule/compare, GET /health)
    db.py                psycopg2 conn + local<->tz conversion (Asia/Bangkok +7)
    solver/
      factory_calendar.py  productive-time windows: advance/recede/overhead (calendar engine)
      models.py            WorkOrder / Line / Assignment / SchedulerConfig
      loader.py            load WOs, lines, calendar, config from DB
      schedulers.py        Scheduler: event_based() + backward()  (the algorithms)
      kpi.py               feasibility (line-overlap) + KPIs + per-line load
      writer.py            persist version + rows
      engine.py            orchestrate: load -> solve -> validate -> persist -> KPIs
  scripts/
    run_local.py            CLI runner (uses DATABASE_URL; --activate, --compare)
    seed_wo_dates.py        fill missing plan_start/plan_finish per MO (--lead-days 21, --dry-run)
    run_local_embedded.py   offline demo (125-WO dataset embedded; no DB needed)
  sql/last_test_output.sql  generated INSERTs from the validated test run
  docs/APS_SCHEDULING_RESEARCH.md   world APS principles + design rationale
  requirements.txt  .env.example
```

## Run
```bash
cd backend-schedule
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # set DATABASE_URL

# API
uvicorn app.main:app --reload --port 8100
# -> POST http://localhost:8100/schedule  -H 'Content-Type: application/json'
#      -d '{"direction":"backward","dispatch_rule":"EDD","activate":false,"requested_by":"me"}'
#    200 {version_id, kpi, ...} · 409 run_in_progress · 422 data_not_ready · 500 {code:internal}
# -> POST http://localhost:8100/schedule/compare   (body {dispatch_rule?, now?}; never writes)
# In staging this runs on Cloud Run (IAM only) and NestJS calls it — see ADR-0015 and
# docs/runbooks/prod-scheduler-deploy.md. Tests: pip install -r requirements-dev.txt && pytest

# or CLI
DATABASE_URL=... python scripts/run_local.py --compare
DATABASE_URL=... python scripts/run_local.py --direction event --activate   # publish to the app
DATABASE_URL=... python scripts/seed_wo_dates.py --lead-days 21 --dry-run    # plan dates (writes only missing)
# offline demo (no DB):
python scripts/run_local_embedded.py
```

## UI — Production Schedule page (BDT app)
The schedule is viewed and run from **Production Schedule** in the BDT app sidebar
(`/production-schedule`, React, `src/pages/ProductionSchedule.tsx`), behind login. It reads
`GET /api/v1/schedule/board` and `/schedule/board/fourm` from NestJS (`orders:view`) and runs or
activates through `POST /schedule/runs` / `/schedule/versions/:id/activate` (`orders:update`), so
the browser never holds a database key. Layout follows `docs/prod-scheduler-mockup.html`: KPI tiles,
Backlog | Resource Gantt | detail + order list, Utilization Heatmap, Bottleneck Load, 4M + WIP.

The standalone HTML cockpit (`backend-schedule/cockpit/`, Supabase REST with the anon key) was
retired on 2026-10-04 (ADR-0015 D4); its logic lives on in `src/lib/schedule/` — see git history.

## Inputs (from DB)
`work_order` (status NOT_STARTED/RELEASED, duration>0, `plan_start` + `plan_finish` set) ·
`mrp_workcenter_line` (active lines = finite resources) ·
`calendar`/`calendar_exception` (FACTORY-STD + holidays + overheads) ·
`scheduler_config` (direction, dispatch_rule, allow_ot, horizon).

## Output
`prod_schedule_version` (`BACKWARD-V1`, `EVENTBASED-V1`, …) +
`prod_schedule` (work_order_id, start/end, workcenter_line_id). One version per scenario.

## Design notes
- All scheduling math is in **naive local time** (UTC+7); DB timestamptz converted at edges.
- The schedule is a **snapshot**: the scheduler computes start/end; the solver does not
  re-evaluate routing formulas (those materialize `work_order.expected_duration_min` upstream).
- **What-if** = change a WO's `team` (internal↔external) or add lines, then re-run a
  new version and compare KPIs. Same calendar; only cost/pool change.
- KPI utilization must use **real op duration** (`line_load`), not elapsed end-start
  (elapsed spans overnight gaps).
