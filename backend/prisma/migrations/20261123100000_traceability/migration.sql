-- Traceability: heat lot <-> plate <-> nesting sheet <-> parts.
-- Additive only: three new tables, no change to existing tables or data.
CREATE TABLE IF NOT EXISTS "heat_lot" (
  "id" SERIAL NOT NULL,
  "heat_no" VARCHAR(60) NOT NULL,
  "mill" VARCHAR(120) NOT NULL DEFAULT '',
  "grade" VARCHAR(30),
  "thick_mm" DECIMAL(10,2),
  "cert_no" VARCHAR(100),
  "cert_file_key" VARCHAR(500),
  "supplier" VARCHAR(200),
  "received_date" DATE,
  "note" VARCHAR(500),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "create_uid" INTEGER NOT NULL,
  "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "write_uid" INTEGER NOT NULL,
  "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "heat_lot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "heat_lot_heat_no_mill_key" ON "heat_lot"("heat_no", "mill");
CREATE INDEX IF NOT EXISTS "heat_lot_heat_no_idx" ON "heat_lot"("heat_no");

CREATE TABLE IF NOT EXISTS "plate_cut_record" (
  "id" SERIAL NOT NULL,
  "nesting_id" INTEGER,
  "heat_lot_id" INTEGER NOT NULL,
  "plate_seq" INTEGER NOT NULL DEFAULT 1,
  "plate_no" VARCHAR(60),
  "upload_id" INTEGER,
  "cuttingplan_number" VARCHAR(100) NOT NULL,
  "nc_file" VARCHAR(100),
  "quality" VARCHAR(30),
  "thick_mm" DECIMAL(10,2),
  "cut_date" DATE,
  "machine" VARCHAR(60),
  "note" VARCHAR(500),
  "status" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  "void_reason" VARCHAR(300),
  "create_uid" INTEGER NOT NULL,
  "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "write_uid" INTEGER NOT NULL,
  "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plate_cut_record_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "plate_cut_record_nesting_id_idx" ON "plate_cut_record"("nesting_id");
CREATE INDEX IF NOT EXISTS "plate_cut_record_heat_lot_id_idx" ON "plate_cut_record"("heat_lot_id");
CREATE INDEX IF NOT EXISTS "plate_cut_record_nc_file_idx" ON "plate_cut_record"("nc_file");
CREATE INDEX IF NOT EXISTS "plate_cut_record_cuttingplan_number_idx" ON "plate_cut_record"("cuttingplan_number");
CREATE INDEX IF NOT EXISTS "plate_cut_record_status_idx" ON "plate_cut_record"("status");
-- At most one ACTIVE record per plate of a sheet (a re-assignment voids the old one first).
-- Partial index: hand-written, not expressible in the Prisma schema.
CREATE UNIQUE INDEX IF NOT EXISTS "plate_cut_record_active_sheet_plate_key"
  ON "plate_cut_record"("nesting_id", "plate_seq") WHERE "status" = 'ACTIVE' AND "nesting_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "part_trace" (
  "id" SERIAL NOT NULL,
  "plate_cut_id" INTEGER NOT NULL,
  "heat_lot_id" INTEGER NOT NULL,
  "order_part_id" INTEGER,
  "bom_part_id" INTEGER,
  "part_mark" VARCHAR(100) NOT NULL,
  "project_code" VARCHAR(20),
  "qty" INTEGER,
  "weight_kg" DECIMAL(12,3),
  "is_main_part" BOOLEAN,
  "source" VARCHAR(10) NOT NULL DEFAULT 'AUTO',
  "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "part_trace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "part_trace_plate_cut_id_order_part_id_key" ON "part_trace"("plate_cut_id", "order_part_id");
CREATE INDEX IF NOT EXISTS "part_trace_plate_cut_id_idx" ON "part_trace"("plate_cut_id");
CREATE INDEX IF NOT EXISTS "part_trace_heat_lot_id_idx" ON "part_trace"("heat_lot_id");
CREATE INDEX IF NOT EXISTS "part_trace_order_part_id_idx" ON "part_trace"("order_part_id");
CREATE INDEX IF NOT EXISTS "part_trace_bom_part_id_idx" ON "part_trace"("bom_part_id");
CREATE INDEX IF NOT EXISTS "part_trace_part_mark_idx" ON "part_trace"("part_mark");
CREATE INDEX IF NOT EXISTS "part_trace_project_code_idx" ON "part_trace"("project_code");

ALTER TABLE "heat_lot" ADD CONSTRAINT "heat_lot_create_uid_fkey"
  FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "heat_lot" ADD CONSTRAINT "heat_lot_write_uid_fkey"
  FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "plate_cut_record" ADD CONSTRAINT "plate_cut_record_nesting_id_fkey"
  FOREIGN KEY ("nesting_id") REFERENCES "cutting_plan_nesting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plate_cut_record" ADD CONSTRAINT "plate_cut_record_heat_lot_id_fkey"
  FOREIGN KEY ("heat_lot_id") REFERENCES "heat_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plate_cut_record" ADD CONSTRAINT "plate_cut_record_create_uid_fkey"
  FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plate_cut_record" ADD CONSTRAINT "plate_cut_record_write_uid_fkey"
  FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "part_trace" ADD CONSTRAINT "part_trace_plate_cut_id_fkey"
  FOREIGN KEY ("plate_cut_id") REFERENCES "plate_cut_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "part_trace" ADD CONSTRAINT "part_trace_heat_lot_id_fkey"
  FOREIGN KEY ("heat_lot_id") REFERENCES "heat_lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "part_trace" ADD CONSTRAINT "part_trace_order_part_id_fkey"
  FOREIGN KEY ("order_part_id") REFERENCES "cutting_plan_order_part"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "part_trace" ADD CONSTRAINT "part_trace_bom_part_id_fkey"
  FOREIGN KEY ("bom_part_id") REFERENCES "bom_part"("id") ON DELETE SET NULL ON UPDATE CASCADE;
