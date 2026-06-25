# backend-schedule

Finite-capacity **production scheduler** service for the SSI APS (steel fabrication).
Reads scheduling inputs from Postgres/Supabase, runs a heuristic scheduler, and
writes the result to `prod_schedule_version` + `prod_schedule`.

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
    run_local.py            CLI runner (uses DATABASE_URL)
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
# -> POST http://localhost:8100/schedule?direction=backward&dispatch_rule=EDD
# -> POST http://localhost:8100/schedule/compare

# or CLI
DATABASE_URL=... python scripts/run_local.py --compare
# offline demo (no DB):
python scripts/run_local_embedded.py
```

## Cockpit (live UI)
`cockpit/cockpit.html` — self-contained dashboard. **Open directly in a browser**.
Fetches `prod_schedule` + work-order/line/WC live from Supabase REST (anon key) and renders:
- **Gantt by work-center line** (rows = lines incl. idle; bars colored internal /
  subcontract / late) with version toggle (Event-based ↔ Backward).
- **Capacity / load per WC** (busy real-duration vs available; bottleneck highlighted)
  + KPI cards (makespan, late, feasible). Re-run the solver then hit **Reload**.

## Inputs (from DB)
`work_order` (status NOT_STARTED/RELEASED, duration>0, due+release set) ·
`mrp_workcenter_line` (crew_size, labor_mode internal/subcontract) ·
`calendar`/`calendar_exception` (FACTORY-STD + holidays + overheads) ·
`scheduler_config` (direction, dispatch_rule, allow_ot, horizon).

## Output
`prod_schedule_version` (`BACKWARD-V1`, `EVENTBASED-V1`, …) +
`prod_schedule` (work_order_id, start/end, workcenter_line_id). One version per scenario.

## Design notes
- All scheduling math is in **naive local time** (UTC+7); DB timestamptz converted at edges.
- The schedule is a **snapshot**: the scheduler computes start/end; the solver does not
  re-evaluate routing formulas (those materialize `work_order.expected_duration_min` upstream).
- **What-if** = flip a line's `labor_mode` (internal↔subcontract) or add lines, then re-run a
  new version and compare KPIs. Same calendar; only cost/pool change.
- KPI utilization must use **real op duration** (`line_load`), not elapsed end-start
  (elapsed spans overnight gaps).
```
