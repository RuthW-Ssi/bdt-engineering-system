-- Production scheduler: capture Supabase-side schema drift + rebuild WIP views for multi-mark WOs.
--
-- Background: the scheduler (backend-schedule/) objects below were created directly on Supabase via
-- the MCP, outside Prisma's migration history (see the drift note in 20260917114912_multi_mark_work_orders).
-- This migration brings them into the history.
--
-- IDEMPOTENT by design: every statement is a no-op where the object already exists (the live Supabase DB),
-- and creates it where it does not (a fresh/local DB). Safe for `prisma migrate deploy` on both.
-- FKs are dropped-if-exists and re-added so their ON DELETE/ON UPDATE rules match schema.prisma exactly.

-- ── calendar: daily start-up / shutdown overheads used by the scheduler's factory calendar ──
ALTER TABLE "calendar" ADD COLUMN IF NOT EXISTS "day_start_overhead_min" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "calendar" ADD COLUMN IF NOT EXISTS "day_end_overhead_min" INTEGER NOT NULL DEFAULT 15;

-- ── mrp_workcenter_line: legacy line-level labor (labor now = work_order.team_headcount + team) ──
ALTER TABLE "mrp_workcenter_line" ADD COLUMN IF NOT EXISTS "crew_size" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "mrp_workcenter_line" ADD COLUMN IF NOT EXISTS "labor_mode" TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE "mrp_workcenter_line" ADD COLUMN IF NOT EXISTS "subcontractor_id" INTEGER;

-- ── team (renamed from subcontractor on 2026-09-22): external-team defaults added before the rename ──
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "default_headcount" INTEGER;
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "rate" DECIMAL;
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "rate_unit" VARCHAR(20);

-- ── stock_quant: Odoo on-hand inventory ──
CREATE TABLE IF NOT EXISTS "stock_quant" (
    "id" SERIAL NOT NULL,
    "material_id" INTEGER NOT NULL,
    "location" VARCHAR NOT NULL DEFAULT 'WH/Stock',
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL NOT NULL DEFAULT 0,
    "forecasted_quantity" DECIMAL,
    "create_date" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "write_date" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_quant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "stock_quant_material_id_location_key" ON "stock_quant"("material_id", "location");

-- ── Foreign keys (re-added to match schema.prisma) ──
ALTER TABLE "stock_quant" DROP CONSTRAINT IF EXISTS "stock_quant_material_id_fkey";
ALTER TABLE "stock_quant" ADD CONSTRAINT "stock_quant_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mrp_workcenter_line" DROP CONSTRAINT IF EXISTS "mrp_workcenter_line_subcontractor_id_fkey";
ALTER TABLE "mrp_workcenter_line" ADD CONSTRAINT "mrp_workcenter_line_subcontractor_id_fkey"
    FOREIGN KEY ("subcontractor_id") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- prod_schedule.workcenter_line_id pointed at equipment_resource in the migration history; the scheduler
-- writes mrp_workcenter_line ids (live DB FK already re-pointed on 2026-07-06).
ALTER TABLE "prod_schedule" DROP CONSTRAINT IF EXISTS "prod_schedule_workcenter_line_id_fkey";
ALTER TABLE "prod_schedule" ADD CONSTRAINT "prod_schedule_workcenter_line_id_fkey"
    FOREIGN KEY ("workcenter_line_id") REFERENCES "mrp_workcenter_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── WIP buffer views (rebuilt for multi-mark work orders) ──
-- The originals (Supabase MCP migration 20260622073454) keyed on work_order.bom_assembly_id, which
-- 20260917114912_multi_mark_work_orders removed. A WO now carries parts from one or more assemblies
-- (work_order_part → bom_assembly_part → bom_assembly), so the flow unit is (WO × assembly):
--   weight = Σ work_order_part.weight_kg of that assembly's parts in the WO
--   area   = assembly surface area pro-rated by the WO's share of the assembly weight
-- A producer WC (wip_storage_io direction 'in') puts the parts into the buffer; they leave when the NEXT
-- consumer WC of the same assembly (direction 'out', higher sequence) takes them.
DROP VIEW IF EXISTS "wip_balance";
DROP VIEW IF EXISTS "wip_event";

CREATE VIEW "wip_event" AS
WITH wo_asm AS (
    SELECT wop."work_order_id", bap."assembly_id", SUM(COALESCE(wop."weight_kg", 0)) AS weight
    FROM "work_order_part" wop
    JOIN "bom_assembly_part" bap ON bap."id" = wop."bom_assembly_part_id"
    GROUP BY wop."work_order_id", bap."assembly_id"
),
sched AS (
    SELECT ps."prod_schedule_version_id" AS ver, ps."start_datetime", ps."end_datetime",
           wo."work_center_id", wo."sequence", wa."assembly_id", wa.weight,
           CASE WHEN COALESCE(ba."weight_kg", 0) > 0
                THEN COALESCE(ba."surface_area_m2", 0) * LEAST(wa.weight / ba."weight_kg", 1)
                ELSE COALESCE(ba."surface_area_m2", 0) END AS area
    FROM "prod_schedule" ps
    JOIN "work_order" wo ON wo."id" = ps."work_order_id"
    JOIN wo_asm wa ON wa."work_order_id" = wo."id"
    LEFT JOIN "bom_assembly" ba ON ba."id" = wa."assembly_id"
),
prod AS (
    SELECT io."storage_id", s.ver, s."assembly_id", s.area, s.weight,
           s."start_datetime" AS p_start, s."end_datetime" AS p_end, s."sequence" AS p_seq
    FROM sched s JOIN "wip_storage_io" io ON io."wc_id" = s."work_center_id" AND io."direction" = 'in'
),
cons AS (
    SELECT io."storage_id", s.ver, s."assembly_id",
           s."start_datetime" AS c_start, s."end_datetime" AS c_end, s."sequence" AS c_seq
    FROM sched s JOIN "wip_storage_io" io ON io."wc_id" = s."work_center_id" AND io."direction" = 'out'
)
SELECT p."storage_id", w."code" AS storage_code, p.ver, p."assembly_id" AS bom_assembly_id, p.area, p.weight,
       CASE WHEN w."buffer_mode" = 'buffered' THEN p.p_start ELSE p.p_end END AS in_time,
       CASE WHEN w."buffer_mode" = 'buffered' THEN c.c_end ELSE c.c_start END AS out_time
FROM prod p
JOIN LATERAL (
    SELECT cn.* FROM cons cn
    WHERE cn."storage_id" = p."storage_id" AND cn.ver = p.ver AND cn."assembly_id" = p."assembly_id" AND cn.c_seq > p.p_seq
    ORDER BY cn.c_seq, cn.c_start
    LIMIT 1
) c ON TRUE
JOIN "wip_storage" w ON w."id" = p."storage_id";

CREATE VIEW "wip_balance" AS
-- Running level per buffer. Default RANGE frame: rows at the same instant t (a multi-mark WO's assemblies,
-- or an out and an in at a hand-off) all get the level after that instant, so row order never matters.
WITH ev AS (
    SELECT "storage_id", ver, in_time AS t, area AS d_area, weight AS d_weight FROM "wip_event"
    UNION ALL
    SELECT "storage_id", ver, out_time AS t, -area AS d_area, -weight AS d_weight FROM "wip_event"
),
run AS (
    SELECT "storage_id", ver, t,
           SUM(d_area)   OVER (PARTITION BY "storage_id", ver ORDER BY t) AS area_used,
           SUM(d_weight) OVER (PARTITION BY "storage_id", ver ORDER BY t) AS weight_used
    FROM ev
)
SELECT r."storage_id", w."code" AS storage_code, r.ver, r.t,
       r.area_used, r.weight_used, w."area_cap_m2", w."weight_cap_kg",
       ROUND(r.area_used / NULLIF(w."area_cap_m2", 0) * 100, 1) AS area_pct,
       ROUND(r.weight_used / NULLIF(w."weight_cap_kg", 0) * 100, 1) AS weight_pct,
       (r.area_used > w."area_cap_m2" OR r.weight_used > w."weight_cap_kg") AS overflow
FROM run r JOIN "wip_storage" w ON w."id" = r."storage_id";
