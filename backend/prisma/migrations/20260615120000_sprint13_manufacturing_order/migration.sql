-- Sprint 13 · F-MO Manufacturing Order pilot (T-MO.01)
-- Idempotent: enum guards + IF NOT EXISTS + ON CONFLICT so re-runs are safe.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MoStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MoPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "MoOperationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── routing_template · P7 bottleneck anchor (soft ref) ───────────────────────
ALTER TABLE "routing_template" ADD COLUMN IF NOT EXISTS "bottleneck_op_id" INTEGER;

-- ── manufacturing_order ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "manufacturing_order" (
    "id" SERIAL NOT NULL,
    "mo_code" VARCHAR(20) NOT NULL,
    "primary_mark_prefix_code" VARCHAR(10) NOT NULL,
    "routing_template_id" INTEGER NOT NULL,
    "status" "MoStatus" NOT NULL DEFAULT 'DRAFT',
    "earliest_start_at" TIMESTAMPTZ,
    "due_date" TIMESTAMPTZ,
    "priority" "MoPriority" NOT NULL DEFAULT 'MEDIUM',
    "bottleneck_op_id" INTEGER,
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "manufacturing_order_pkey" PRIMARY KEY ("id")
);

-- ── mo_assembly_line (P13/P15/P17) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mo_assembly_line" (
    "id" SERIAL NOT NULL,
    "mo_id" INTEGER NOT NULL,
    "bom_assembly_id" INTEGER NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "line_seq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "mo_assembly_line_pkey" PRIMARY KEY ("id")
);

-- ── mo_operation (P22 · structure-only snapshot) ─────────────────────────────
CREATE TABLE IF NOT EXISTS "mo_operation" (
    "id" SERIAL NOT NULL,
    "mo_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "source_routing_op_id" INTEGER,
    "work_center_id" INTEGER NOT NULL,
    "expected_duration_min" INTEGER NOT NULL DEFAULT 0,
    "setup_time_min" INTEGER NOT NULL DEFAULT 0,
    "op_attributes" JSONB NOT NULL DEFAULT '{}',
    "status" "MoOperationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    CONSTRAINT "mo_operation_pkey" PRIMARY KEY ("id")
);

-- ── mo_status_history ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "mo_status_history" (
    "id" SERIAL NOT NULL,
    "mo_id" INTEGER NOT NULL,
    "from_status" "MoStatus" NOT NULL,
    "to_status" "MoStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" VARCHAR(120) NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mo_status_history_pkey" PRIMARY KEY ("id")
);

-- ── mo_code_seq (MO-NNNNN · SELECT FOR UPDATE, P5) ───────────────────────────
CREATE TABLE IF NOT EXISTS "mo_code_seq" (
    "id" INTEGER NOT NULL,
    "next_val" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "mo_code_seq_pkey" PRIMARY KEY ("id")
);
INSERT INTO "mo_code_seq" (id, next_val) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "manufacturing_order_mo_code_key" ON "manufacturing_order"("mo_code");
CREATE INDEX IF NOT EXISTS "manufacturing_order_status_idx" ON "manufacturing_order"("status");
CREATE INDEX IF NOT EXISTS "manufacturing_order_primary_mark_prefix_code_idx" ON "manufacturing_order"("primary_mark_prefix_code");
CREATE INDEX IF NOT EXISTS "manufacturing_order_routing_template_id_idx" ON "manufacturing_order"("routing_template_id");
CREATE INDEX IF NOT EXISTS "manufacturing_order_due_date_idx" ON "manufacturing_order"("due_date");
CREATE UNIQUE INDEX IF NOT EXISTS "mo_assembly_line_mo_id_bom_assembly_id_key" ON "mo_assembly_line"("mo_id", "bom_assembly_id");
CREATE INDEX IF NOT EXISTS "mo_assembly_line_bom_assembly_id_idx" ON "mo_assembly_line"("bom_assembly_id");
CREATE INDEX IF NOT EXISTS "mo_operation_mo_id_idx" ON "mo_operation"("mo_id");
CREATE INDEX IF NOT EXISTS "mo_status_history_mo_id_idx" ON "mo_status_history"("mo_id");

-- ── Foreign keys (guarded — ADD CONSTRAINT has no IF NOT EXISTS) ──────────────
DO $$ BEGIN
  ALTER TABLE "manufacturing_order" ADD CONSTRAINT "manufacturing_order_primary_mark_prefix_code_fkey"
    FOREIGN KEY ("primary_mark_prefix_code") REFERENCES "mark_prefix_master"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "manufacturing_order" ADD CONSTRAINT "manufacturing_order_routing_template_id_fkey"
    FOREIGN KEY ("routing_template_id") REFERENCES "routing_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "manufacturing_order" ADD CONSTRAINT "manufacturing_order_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "manufacturing_order" ADD CONSTRAINT "manufacturing_order_write_uid_fkey"
    FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mo_assembly_line" ADD CONSTRAINT "mo_assembly_line_mo_id_fkey"
    FOREIGN KEY ("mo_id") REFERENCES "manufacturing_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mo_assembly_line" ADD CONSTRAINT "mo_assembly_line_bom_assembly_id_fkey"
    FOREIGN KEY ("bom_assembly_id") REFERENCES "bom_assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mo_operation" ADD CONSTRAINT "mo_operation_mo_id_fkey"
    FOREIGN KEY ("mo_id") REFERENCES "manufacturing_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mo_operation" ADD CONSTRAINT "mo_operation_work_center_id_fkey"
    FOREIGN KEY ("work_center_id") REFERENCES "mrp_workcenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mo_status_history" ADD CONSTRAINT "mo_status_history_mo_id_fkey"
    FOREIGN KEY ("mo_id") REFERENCES "manufacturing_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
