# Cockpit 4M + WIP analysis — design spec

> Date: 2026-06-26 · Status: approved design, pre-implementation
> Target: `backend-schedule/cockpit/cockpit.html` (read-only dashboard, Supabase REST anon)

## 1. Goal

Add a **4M + WIP analysis section** to the scheduling cockpit that, for the
selected schedule version, shows two things per dimension:

1. **Data readiness** — how complete the master data is (chips).
2. **Load breakdown over time** — the load/occupancy **per shift bucket**
   (เช้า / บ่าย / โอที) across the schedule horizon, so the user sees *when*
   each dimension is stressed, not just an aggregate total.

"4M" = Man · Machine · Material · Method. WIP/Storage is added as a fifth
dimension (buffer occupancy), at the user's request.

The driving requirement, repeated by the user for Material and Machine: every
dimension must be **time-granular per shift** — aggregates over the whole
horizon hide the real pattern (e.g. WC-PAINT only saturates in the OT shift).

## 2. Scope & non-goals

In scope:
- A new section appended **below the existing capacity panel** in `cockpit.html`.
- 5 full-width rows (one per dimension), each = readiness chips + a shift-bucket
  bar chart. Load follows the **currently selected schedule version** (the
  existing `VER` toggle); readiness is master-data (version-independent).
- Read-only. No solver re-run, no writes. Pure Supabase REST (anon) + client JS.

Non-goals:
- No live re-scheduling or dispatch-rule re-run (cockpit stays read-only).
- No operator/skill-level Man analysis (labor model = line crew, per handoff).
- No real material issue/return ("เบิก-คืน") visualization — there is no
  transaction table for it (see §7). Material flow is proxied by `wip_event`.

## 3. Shift-bucket model

Source: `calendar_block` for calendar `FACTORY-STD` (Mon–Sat, dow 1–6):

| bucket | window | kind |
|---|---|---|
| เช้า (morning) | 08:00–12:00 | normal |
| บ่าย (afternoon) | 13:00–17:30 | normal |
| โอที (OT) | 18:00–22:00 | ot |

Gaps (lunch 12:00–13:00, break 17:30–18:00) are non-working and excluded.
The x-axis of every row is **day × 3 buckets**, spanning the version's horizon.
All times handled in Asia/Bangkok (UTC+7), consistent with the rest of the cockpit.

## 4. The five dimensions

Every row: a header (icon + name + sublabel), a row of readiness chips, then a
shift-bucket bar chart with a short legend. Bars colored: normal shifts vs OT
distinct; over-capacity / overflow in red.

### 4.1 Man — crew utilization % per shift
- **Metric**: per shift bucket, `busy crew-minutes / available crew-minutes`,
  where busy = Σ(WO duration clipped to the shift × line `crew_size`) and
  available = shift-minutes × Σ active-line `crew_size`.
- **Readiness chips**: active lines · lines with `crew_size` defined ·
  internal vs subcontract line count · total crew headcount.
- **Data**: `prod_schedule` (start/end), `mrp_workcenter_line`
  (crew_size, labor_mode), `calendar_block`. All anon-readable already.

### 4.2 Machine — work-center utilization % per shift
- **Metric**: per shift bucket, `busy line-minutes / available line-minutes`
  (busy = Σ WO duration clipped to the shift; available = shift-minutes ×
  active lines), shown per WC with the **bottleneck WC highlighted**.
- **Readiness chips**: active WCs · total active lines · bottleneck WC ·
  equipment_resource count.
- **Note**: the existing aggregate "Capacity / Load by Work Center" panel stays
  (horizon-wide view). This row adds the **per-shift** profile that the
  aggregate hides (e.g. WC-PAINT = 100% of the OT shift while other WCs idle).
- **Data**: `prod_schedule`, `mrp_workcenter(_line)`, `equipment_resource`.
  Anon-readable already.

### 4.3 Material — throughput per shift + consumable overlay
- **Primary metric (dense)**: material throughput per shift = parts count,
  weight (kg) and area (m²) of parts whose `in_time` falls in the bucket, from
  `wip_event`. Every part contributes, so every shift has real depth.
- **Overlay (sparse)**: consumable usage (welding wire / paint) from
  `activity_consume` + `consume_formula` — shown where activities that consume
  run; explicitly sparse (only 11 links: weld + paint).
- **Readiness chips**: materials total · % with `stock_quant` rows · consumable
  links · stock shortfall count (reserved > on-hand).
- **Data**: `wip_event` (throughput), `activity_consume`, `consume_formula`
  (overlay), `stock_quant` (chips). New anon grants needed (§5).

### 4.4 Method — op-type mix % per shift
- **Metric**: per shift bucket, scheduled minutes split by op-type (stacked %).
  Op-type per WO via `work_order.source_routing_op_id` →
  `mrp_routing_workcenter.op_type_id` → `mrp_op_type` (populated for all 165
  WOs — accurate). Do **not** use `mrp_op_type.default_wc_id` (only 8/18 mapped).
- **Readiness chips**: routing templates · op-types · routing coverage
  (% of scheduled WOs with a routing op) · WOs missing op.
- **Data**: `prod_schedule`, `work_order.source_routing_op_id`,
  `mrp_routing_workcenter`, `mrp_op_type`. Anon-readable already.

### 4.5 WIP / Storage — buffer occupancy % per shift
- **Metric**: per shift bucket, peak (max) `area_pct` per buffer from
  `wip_balance` (it carries a `ver` column → follows the selected version).
  Area is the binding constraint (steel is dense: area% ≫ weight%). Bars over
  100% are flagged red (overflow); a dashed 100% cap line is drawn.
- **Readiness chips**: buffers defined · buffers with capacity · io links ·
  peak occupancy / overflow count.
- **Data**: `wip_balance`, `wip_storage`, `wip_storage_io`. New anon grants (§5).

## 5. Data access — anon grants

The cockpit reads via the Supabase REST anon role. The following tables/views
are **not yet** anon-readable and must be granted `SELECT` (RLS is disabled
DB-wide for the demo; this matches how the existing scheduling tables were
exposed):

```
grant select on activity_consume, consume_formula,
  wip_storage, wip_storage_io, wip_balance, wip_event to anon;
```

Already anon-readable (confirmed, no change): `prod_schedule(_version)`,
`work_order`, `mrp_workcenter`, `mrp_workcenter_line`, `subcontractor`,
`materials`, `stock_quant`, `mrp_op_type`, `operation_template`,
`mrp_routing_workcenter`, `equipment_resource`, `calendar_exception`,
`calendar_block`.

## 6. Architecture

`cockpit.html` is a single self-contained file (vanilla JS, no framework). The
section is added consistent with existing patterns:

- **Fetch**: extend the `Promise.all` in `load()` to also pull `calendar_block`,
  `wip_balance`, `wip_event` (filtered to the loaded versions), `activity_consume`,
  `stock_quant` aggregates. Store on `DATA`.
- **Shift bucketing helper**: `shiftBuckets(t0, t1)` → ordered list of
  `{day, shift, start, end}` from the calendar blocks over the horizon;
  `bucketOf(date)` → the bucket a timestamp falls in.
- **Per-dimension aggregators** (pure functions over the version's rows):
  `manLoad`, `machineLoad`, `methodMix`, `materialFlow`, `wipOccupancy` — each
  returns per-bucket values.
- **Render**: a `render4M()` called from the existing `render()`, drawing 5 rows
  into a new `#fourm` container. Reuse `rowsForVersion(VER)` for load;
  master-data for readiness. Re-renders on version toggle.
- **Style**: match the cockpit dark theme (existing CSS vars), same card/bar
  idiom as the capacity panel.

### 6.1 Bucketing algorithm
- **Utilization rows (Man, Machine)**: for each WO assignment, clip its
  `[start, end]` to each shift window and sum the overlap minutes into that
  bucket. Available = bucket length × resource count (lines, or crew). util% =
  busy / available, capped display at 100% (note overflow if > 100%).
- **Flow row (Material)**: attribute each `wip_event` part's weight/area/count
  to the bucket of its `in_time`.
- **Occupancy row (WIP)**: take max `area_pct` per buffer within each bucket
  from `wip_balance` (event-level → reduced to a per-bucket peak).

## 7. Caveats & data limitations

- **No real material issue/return data.** There is no stock-move / issue-return
  transaction table; `stock_quant` is a snapshot. Material throughput uses
  `wip_event` part-flow as a proxy. Real per-shift เบิก-คืน is future work,
  pending a stock-movement source.
- **Consumable links are sparse** (11 `activity_consume` rows, weld + paint
  only) → the consumable overlay is thin by nature; the dense signal is
  `wip_event` throughput.
- **WIP/Material come from event-level views** (`wip_balance`/`wip_event`,
  multiple rows per timestamp) → must be reduced per shift bucket (max for
  occupancy, sum for flow).
- **`wip_balance` covers 4 of 6 buffers** in the current schedules (STG-PLATE /
  STG-PIPE have no part events); rows render only for buffers with data.
- The current schedules show **severe buffer overflow** (STG-FAB area_pct peaks
  ~525%) — this is a real finding the WIP row is meant to surface, not a bug.

## 8. Verification

- Open `cockpit/cockpit.html` in a browser; confirm all 5 rows render with live
  data for both EVENTBASED-V1 and BACKWARD-V1, and re-render on version toggle.
- Cross-check a few bucket values against MCP SQL (e.g. Material throughput
  per shift, Machine busy-min per shift — both already validated during design).
- Degrade gracefully if a fetch is unauthorized (missing grant) → show the row
  with an "ungranted" note rather than breaking the page.

## 9. Future

- Real material issue/return per shift once a stock-movement source exists.
- Broaden `activity_consume` coverage beyond weld/paint for a richer consumable
  overlay (also enables `activity_required_consumable`).
- Drill-down (click a bucket → list its WOs) via a detail panel.

---
*Design approved by user 2026-06-26. Next: implementation plan (writing-plans).*
