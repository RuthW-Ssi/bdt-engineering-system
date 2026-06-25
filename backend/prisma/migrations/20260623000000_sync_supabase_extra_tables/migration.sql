-- Sync 12 tables that exist in Supabase but were created via raw SQL (not Prisma migrations).
-- Run on local dev: prisma migrate deploy
-- On Supabase: prisma migrate resolve --applied 20260623000000_sync_supabase_extra_tables

-- CreateTable: calendar
CREATE TABLE "calendar" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "calendar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "calendar_code_key" ON "calendar"("code");

-- CreateTable: calendar_block
CREATE TABLE "calendar_block" (
    "id" SERIAL NOT NULL,
    "calendar_id" INTEGER NOT NULL,
    "dow" SMALLINT NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "kind" VARCHAR(10) NOT NULL DEFAULT 'normal',
    CONSTRAINT "calendar_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable: calendar_exception
CREATE TABLE "calendar_exception" (
    "id" SERIAL NOT NULL,
    "calendar_id" INTEGER,
    "date" DATE NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "start_time" TIME,
    "end_time" TIME,
    "is_working" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "calendar_exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable: work_center_calendar
CREATE TABLE "work_center_calendar" (
    "id" SERIAL NOT NULL,
    "work_center_id" INTEGER NOT NULL,
    "calendar_id" INTEGER NOT NULL,
    "effective_from" DATE,
    "effective_to" DATE,
    CONSTRAINT "work_center_calendar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "work_center_calendar_work_center_id_calendar_id_key" ON "work_center_calendar"("work_center_id", "calendar_id");

-- CreateTable: mrp_workcenter_line
CREATE TABLE "mrp_workcenter_line" (
    "id" SERIAL NOT NULL,
    "workcenter_id" INTEGER NOT NULL,
    "line_no" SMALLINT NOT NULL,
    "name" VARCHAR(80),
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "mrp_workcenter_line_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mrp_workcenter_line_workcenter_id_line_no_key" ON "mrp_workcenter_line"("workcenter_id", "line_no");

-- CreateTable: operator_workcenter
CREATE TABLE "operator_workcenter" (
    "id" SERIAL NOT NULL,
    "operator_id" INTEGER NOT NULL,
    "work_center_id" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT DEFAULT 'derived:skill-usage',
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "workcenter_line_id" INTEGER,
    CONSTRAINT "operator_workcenter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operator_workcenter_operator_id_work_center_id_key" ON "operator_workcenter"("operator_id", "work_center_id");

-- CreateTable: scheduler_config
CREATE TABLE "scheduler_config" (
    "id" SERIAL NOT NULL,
    "prod_schedule_version_id" INTEGER,
    "objective_tardiness" DECIMAL NOT NULL DEFAULT 0.6,
    "objective_makespan" DECIMAL NOT NULL DEFAULT 0.2,
    "objective_setup" DECIMAL NOT NULL DEFAULT 0.1,
    "objective_wip" DECIMAL NOT NULL DEFAULT 0.1,
    "horizon_days" INTEGER NOT NULL DEFAULT 14,
    "granularity_min" INTEGER NOT NULL DEFAULT 15,
    "direction" TEXT NOT NULL DEFAULT 'backward',
    "dispatch_rule" TEXT NOT NULL DEFAULT 'EDD',
    "allow_ot" BOOLEAN NOT NULL DEFAULT true,
    "ot_weight" DECIMAL NOT NULL DEFAULT 1.0,
    "reschedule_mode" TEXT NOT NULL DEFAULT 'regenerative',
    "solver_time_limit_s" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW(),
    "operator_constraint_mode" TEXT NOT NULL DEFAULT 'soft',
    CONSTRAINT "scheduler_config_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scheduler_config_prod_schedule_version_id_key" ON "scheduler_config"("prod_schedule_version_id");

-- CreateTable: wip_storage
CREATE TABLE "wip_storage" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "bay" VARCHAR(10),
    "col_from" SMALLINT,
    "col_to" SMALLINT,
    "width_m" DECIMAL,
    "depth_m" DECIMAL,
    "area_cap_m2" DECIMAL,
    "weight_cap_kg" DECIMAL,
    "manager_wc_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "buffer_mode" VARCHAR(10) NOT NULL DEFAULT 'buffered',
    CONSTRAINT "wip_storage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wip_storage_code_key" ON "wip_storage"("code");

-- CreateTable: wip_storage_io
CREATE TABLE "wip_storage_io" (
    "id" SERIAL NOT NULL,
    "storage_id" INTEGER NOT NULL,
    "wc_id" INTEGER NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    CONSTRAINT "wip_storage_io_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wip_storage_io_storage_id_wc_id_direction_key" ON "wip_storage_io"("storage_id", "wc_id", "direction");

-- CreateTable: subcontractor
CREATE TABLE "subcontractor" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "subcontractor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subcontractor_code_key" ON "subcontractor"("code");

-- CreateTable: formula_code_seq
CREATE TABLE "formula_code_seq" (
    "id" INTEGER NOT NULL,
    "next_val" INTEGER NOT NULL DEFAULT 100,
    CONSTRAINT "formula_code_seq_pkey" PRIMARY KEY ("id")
);

-- CreateTable: activity_required_consumable
CREATE TABLE "activity_required_consumable" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    CONSTRAINT "activity_required_consumable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "activity_required_consumable_activity_id_category_id_key" ON "activity_required_consumable"("activity_id", "category_id");

-- AddForeignKey
ALTER TABLE "calendar_block" ADD CONSTRAINT "calendar_block_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_exception" ADD CONSTRAINT "calendar_exception_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_center_calendar" ADD CONSTRAINT "work_center_calendar_work_center_id_fkey" FOREIGN KEY ("work_center_id") REFERENCES "mrp_workcenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_center_calendar" ADD CONSTRAINT "work_center_calendar_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mrp_workcenter_line" ADD CONSTRAINT "mrp_workcenter_line_workcenter_id_fkey" FOREIGN KEY ("workcenter_id") REFERENCES "mrp_workcenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operator_workcenter" ADD CONSTRAINT "operator_workcenter_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operator"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "operator_workcenter" ADD CONSTRAINT "operator_workcenter_work_center_id_fkey" FOREIGN KEY ("work_center_id") REFERENCES "mrp_workcenter"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "operator_workcenter" ADD CONSTRAINT "operator_workcenter_workcenter_line_id_fkey" FOREIGN KEY ("workcenter_line_id") REFERENCES "mrp_workcenter_line"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "scheduler_config" ADD CONSTRAINT "scheduler_config_prod_schedule_version_id_fkey" FOREIGN KEY ("prod_schedule_version_id") REFERENCES "prod_schedule_version"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "wip_storage" ADD CONSTRAINT "wip_storage_manager_wc_id_fkey" FOREIGN KEY ("manager_wc_id") REFERENCES "mrp_workcenter"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "wip_storage_io" ADD CONSTRAINT "wip_storage_io_storage_id_fkey" FOREIGN KEY ("storage_id") REFERENCES "wip_storage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wip_storage_io" ADD CONSTRAINT "wip_storage_io_wc_id_fkey" FOREIGN KEY ("wc_id") REFERENCES "mrp_workcenter"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "activity_required_consumable" ADD CONSTRAINT "activity_required_consumable_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_required_consumable" ADD CONSTRAINT "activity_required_consumable_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_category"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
