-- Sprint 14 · F-WO Work Order pilot (T-WO.01)
-- Idempotent: enum guards + IF NOT EXISTS + ON CONFLICT so re-runs are safe.
-- Additive only — no drops/renames. Soft refs (mo_operation_id, bom_dispatch_id_snapshot) carry NO FK.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "WoStatus" AS ENUM ('NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "WoEventType" AS ENUM ('START', 'PAUSE', 'RESUME', 'DONE', 'CANCEL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── work_order (Q1=D · 1 WO = 1 operation snapshot) ──────────────────────────
CREATE TABLE IF NOT EXISTS "work_order" (
    "id" SERIAL NOT NULL,
    "wo_code" VARCHAR(20) NOT NULL,
    "mo_id" INTEGER NOT NULL,
    "mo_operation_id" INTEGER,
    "sequence" INTEGER NOT NULL,
    "work_center_id" INTEGER NOT NULL,
    "expected_duration_min" INTEGER NOT NULL,
    "setup_time_min" INTEGER NOT NULL,
    "op_attributes" JSONB NOT NULL DEFAULT '{}',
    "bom_assembly_id" INTEGER NOT NULL,
    "bom_dispatch_id_snapshot" INTEGER NOT NULL,
    "status" "WoStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "earliest_start_at" TIMESTAMPTZ,
    "actual_start_at" TIMESTAMPTZ,
    "actual_end_at" TIMESTAMPTZ,
    "target_end_at" TIMESTAMPTZ,
    "qty_done" DECIMAL(12,3),
    "qty_scrapped" DECIMAL(12,3),
    "assigned_to" VARCHAR(120),
    "notes" TEXT,
    "released_at" TIMESTAMPTZ,
    "released_by" VARCHAR(120),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" VARCHAR(120) NOT NULL,
    "updated_by" VARCHAR(120),
    CONSTRAINT "work_order_pkey" PRIMARY KEY ("id")
);

-- ── work_order_event (execution log · actuals foundation) ────────────────────
CREATE TABLE IF NOT EXISTS "work_order_event" (
    "id" SERIAL NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "event_type" "WoEventType" NOT NULL,
    "notes" TEXT,
    "recorded_by" VARCHAR(120) NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_order_event_pkey" PRIMARY KEY ("id")
);

-- ── work_order_code_seq (WO-NNNNNNNN · SELECT FOR UPDATE, Q18) ───────────────
CREATE TABLE IF NOT EXISTS "work_order_code_seq" (
    "id" INTEGER NOT NULL,
    "next_val" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "work_order_code_seq_pkey" PRIMARY KEY ("id")
);
INSERT INTO "work_order_code_seq" (id, next_val) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;

-- ── prod_schedule_version (Q14=B · scenario container · mockup-only) ─────────
CREATE TABLE IF NOT EXISTS "prod_schedule_version" (
    "id" SERIAL NOT NULL,
    "version_code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "scheduler_source" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(120) NOT NULL,
    CONSTRAINT "prod_schedule_version_pkey" PRIMARY KEY ("id")
);

-- ── prod_schedule (Q14b=C · workcenter_line → equipment_resource) ────────────
CREATE TABLE IF NOT EXISTS "prod_schedule" (
    "id" SERIAL NOT NULL,
    "prod_schedule_version_id" INTEGER NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "start_datetime" TIMESTAMPTZ NOT NULL,
    "end_datetime" TIMESTAMPTZ NOT NULL,
    "workcenter_line_id" INTEGER,
    CONSTRAINT "prod_schedule_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "work_order_wo_code_key" ON "work_order"("wo_code");
CREATE INDEX IF NOT EXISTS "work_order_mo_id_idx" ON "work_order"("mo_id");
CREATE INDEX IF NOT EXISTS "work_order_status_idx" ON "work_order"("status");
CREATE INDEX IF NOT EXISTS "work_order_work_center_id_idx" ON "work_order"("work_center_id");
CREATE INDEX IF NOT EXISTS "work_order_event_work_order_id_recorded_at_idx" ON "work_order_event"("work_order_id", "recorded_at");
CREATE UNIQUE INDEX IF NOT EXISTS "prod_schedule_version_version_code_key" ON "prod_schedule_version"("version_code");
CREATE INDEX IF NOT EXISTS "prod_schedule_version_is_active_idx" ON "prod_schedule_version"("is_active");
CREATE INDEX IF NOT EXISTS "prod_schedule_prod_schedule_version_id_idx" ON "prod_schedule"("prod_schedule_version_id");
CREATE INDEX IF NOT EXISTS "prod_schedule_work_order_id_idx" ON "prod_schedule"("work_order_id");

-- ── Foreign keys (guarded — ADD CONSTRAINT has no IF NOT EXISTS) ──────────────
-- NOTE: mo_operation_id + bom_dispatch_id_snapshot are intentionally soft refs (NO FK).
DO $$ BEGIN
  ALTER TABLE "work_order" ADD CONSTRAINT "work_order_mo_id_fkey"
    FOREIGN KEY ("mo_id") REFERENCES "manufacturing_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "work_order" ADD CONSTRAINT "work_order_work_center_id_fkey"
    FOREIGN KEY ("work_center_id") REFERENCES "mrp_workcenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "work_order" ADD CONSTRAINT "work_order_bom_assembly_id_fkey"
    FOREIGN KEY ("bom_assembly_id") REFERENCES "bom_assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "work_order_event" ADD CONSTRAINT "work_order_event_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "prod_schedule" ADD CONSTRAINT "prod_schedule_prod_schedule_version_id_fkey"
    FOREIGN KEY ("prod_schedule_version_id") REFERENCES "prod_schedule_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "prod_schedule" ADD CONSTRAINT "prod_schedule_work_order_id_fkey"
    FOREIGN KEY ("work_order_id") REFERENCES "work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "prod_schedule" ADD CONSTRAINT "prod_schedule_workcenter_line_id_fkey"
    FOREIGN KEY ("workcenter_line_id") REFERENCES "equipment_resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
