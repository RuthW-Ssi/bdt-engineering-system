# backend-schedule — HANDOFF (cowork → Claude Code)

> Context for continuing this work in Claude Code. The cowork session's memory is
> NOT visible here — this file + `docs/` carry everything you need. Read this first.
> Date: 2026-06-24. Supabase project ref: **eebubyfkzeqhzwzqrqfz** ("bdt-engineer-system").

---

## 0. ⚠️ READ BEFORE TOUCHING THE DB
- The **APS layer lives in Supabase**, built via the **Supabase MCP** (`apply_migration` /
  `execute_sql`) — **NOT** through this repo's Prisma migrations. So `backend/prisma/schema.prisma`
  is **behind** the live DB (schema drift, see §4).
- **DO NOT run `prisma migrate reset` / `migrate dev` against this DB.** A full data wipe earlier
  in the project was caused by an external Prisma migrate-reset+seed. To sync Prisma to reality use
  **`prisma db pull`** (introspect), never reset.
- Safe backups exist in the **`bak.*` schema** (e.g. `bak.materials`, `bak.work_order`,
  `bak.*_0624`). Don't drop them.

---

## 1. What this folder is
Stand-alone **finite-capacity scheduler** service (Python/FastAPI) for SSI steel fab,
separate from the NestJS `backend/` so it can later host an OR-Tools optimizer.
Status: **v1 heuristic works end-to-end + validated** (see `README.md`).
- `app/solver/` — calendar engine + 2 schedulers (event-based, backward) + loader/writer/kpi/engine
- `app/main.py` — FastAPI (`POST /schedule`, `/schedule/compare`)
- `cockpit/cockpit.html` — live dashboard (Gantt by line + capacity), reads Supabase REST (anon)
- `scripts/run_local.py` (DB) · `scripts/run_local_embedded.py` (offline 125-WO demo)
- `docs/` — research + design specs + the WC/line + op/activity draft xlsx the model derives from

## 2. Run / verify
```bash
cd backend-schedule
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# fill .env (see §6)
python scripts/run_local_embedded.py          # offline, no DB — should print feasible KPIs
DATABASE_URL=... python scripts/run_local.py --compare   # against live DB -> writes prod_schedule
uvicorn app.main:app --reload --port 8100
open cockpit/cockpit.html                       # live cockpit (browser)
```

## 3. Current DB state (Supabase, as of handoff)
- **Spine** (the new standardized model, loaded from `docs/APS_WC_LINE_LAYOUT.xlsx` +
  `docs/APS_OP_ACTIVITY_DRAFT.xlsx`): `mrp_op_type` 18 · **`mrp_workcenter` 15 active**
  (+inactive incl. WC-FAB-BEAM/PIPE, WC-BU) · **`mrp_workcenter_line` 24 active**
  (+`crew_size`,`labor_mode`,`subcontractor_id`) · `activity` 123 · `operation_template` 20 ·
  `operation_template_activity` 123 · `activity_skill` 46.
- **Labor model**: skills/`operator_workcenter` are **deprecated for scheduling**; labor = line
  `crew_size` + `labor_mode` (internal/subcontract). `subcontractor` = SUB-WELD-A/B on WC-FIT-WELD
  weld lines. Single calendar `FACTORY-STD` (+daily overhead 30/15 min). View `work_center_line_labor`.
- **Transactional (mock/test)**: `manufacturing_order` 11 · `work_order` **125** (restored from
  `bak.work_order`, all NOT_STARTED, mock due/release dates, on active WCs). `mrp_routing_workcenter` 45.
- **Schedules written**: `prod_schedule_version` **EVENTBASED-V1** + **BACKWARD-V1**,
  `prod_schedule` 125 rows each (0 line-overlap = feasible). Bottleneck = **WC-PAINT** (1 line).
- **Material master**: `materials` 2634 (Odoo) + `stock_quant` 411 + 3 type views. BOM untouched.
- **anon SELECT granted** on scheduling tables (for the cockpit). RLS is disabled DB-wide (demo).

## 4. Schema changes applied this session (drift vs Prisma — run `prisma db pull` to capture)
`calendar.day_start/day_end_overhead_min` · `mrp_workcenter_line.crew_size/labor_mode/subcontractor_id` ·
`subcontractor.default_headcount/rate/rate_unit` · unique constraints on business keys
(`mrp_op_type.key`,`mrp_workcenter.code`,`activity.activity_code`,`operation_template.op_code`) ·
`materials` Odoo columns + `stock_quant` table + `v_material_*` views · `activity.per_minute/formula_code`
+ `work_order.setup_time_min` (these 3 came from BDT's own `sync_local_schema_gaps`, currently NULL).

## 5. Pending / backlog (priority order)
1. **routing-formula** (compute time at gen-WO, BOM-only). 🔴 Blocker: DB BOM marks plates as `p`
   (no web/flange `w`/`f`); width is inside `bom_part.profile` string. See `docs/APS_ROUTING_FORMULA_SPEC.md`.
   `routing_formula_param` already has 27 canonical codes; `activity.formula_code/per_minute` NULL → populate.
2. **activity_consume / activity_tool / activity_required_consumable** — link mapping drafted (consumable+
   `consume_formula`, machine/tool from `equipment_resource`); not loaded. Lean rule: consumable+formula at
   activity, machine=WC (don't duplicate), tools/cranes at activity.
3. **Scheduler v2**: OR-Tools/CP-SAT (true optimization / "algorithmic" mode) — BDT roadmap Sprint 8.
4. **What-if/scenarios**: flip line `labor_mode` (internal↔subcontract) or add lines → new
   `prod_schedule_version` → compare KPIs in cockpit. (subcontract-toggle = the key lever.)
5. **PAINT** internal vs subcontract = a per-line toggle (undecided — your call).
6. Cockpit polish: dispatch-rule selector, scenario compare side-by-side, real holidays in capacity calc.

## 6. Manual prep before continuing (do these)
- [ ] **Fill `.env`**: `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → Settings → API → service_role, Reveal)
      and the **DB password** in `DATABASE_URL` (Settings → Database). `.env` is gitignored. anon+URL already set.
- [ ] **Delete the stray duplicate** I created in the wrong clone (sandbox couldn't remove it):
      `rm -rf "/Users/ssi/BDT/engineer-system-management/bdt-engineering-system/backend-schedule"`
- [ ] `pip install -r requirements.txt` (psycopg2, fastapi…). Optional: `git add backend-schedule && commit`.
- [ ] `prisma db pull` if you want Prisma models to reflect §4 (do not reset).
- [ ] Verify offline demo runs: `python scripts/run_local_embedded.py` (prints feasible KPIs).

## 7. Key decisions (so you don't re-litigate)
- Resource grain = **work-center LINE** (1 line = 1 job). WC = 1 machine (Layout-driven).
- Labor = **headcount per line** (not skill-matched), internal/subcontract per line, **one calendar**.
- Time model = **per_minute × measure(BOM)**, materialize to `work_order.expected_duration_min` at gen-WO
  (lazy), BOM-attribute-only contract. Scheduler reads the materialized minutes (snapshot).
- Schedule modes to support: forward / **backward** / algorithmic / **event-based** (v1 does backward + event).
- Overhead-crane / traffic = NOT a work center (→ equipment_resource). BOM stays out of item master.

*Generated at cowork→Claude Code handoff. Design docs: `docs/APS_*.md`.*
