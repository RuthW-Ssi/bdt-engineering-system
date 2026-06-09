-- Sprint 11b: Activity snapshot fields + op_act_labor + op_act_material

-- AlterTable: add snapshot tracking to operation_template_activity
ALTER TABLE "operation_template_activity"
  ADD COLUMN "source_activity_id" INTEGER,
  ADD COLUMN "snapshot_at"        TIMESTAMPTZ;

-- CreateTable: labor snapshot (mirrors activity_labor, targets equipment_resource)
CREATE TABLE "op_act_labor" (
  "id"                SERIAL  NOT NULL,
  "op_act_id"         INTEGER NOT NULL,
  "labor_resource_id" INTEGER NOT NULL,
  "qty"               INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "op_act_labor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: material snapshot (mirrors activity_consume, targets materials NOT equipment_resource)
CREATE TABLE "op_act_material" (
  "id"          SERIAL  NOT NULL,
  "op_act_id"   INTEGER NOT NULL,
  "material_id" INTEGER NOT NULL,
  CONSTRAINT "op_act_material_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX  "op_act_labor_op_act_id_idx"
  ON "op_act_labor"("op_act_id");
CREATE UNIQUE INDEX "op_act_labor_op_act_id_labor_resource_id_key"
  ON "op_act_labor"("op_act_id", "labor_resource_id");

CREATE INDEX  "op_act_material_op_act_id_idx"
  ON "op_act_material"("op_act_id");
CREATE UNIQUE INDEX "op_act_material_op_act_id_material_id_key"
  ON "op_act_material"("op_act_id", "material_id");

-- Foreign Keys
ALTER TABLE "operation_template_activity"
  ADD CONSTRAINT "operation_template_activity_source_activity_id_fkey"
  FOREIGN KEY ("source_activity_id") REFERENCES "activity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "op_act_labor"
  ADD CONSTRAINT "op_act_labor_op_act_id_fkey"
  FOREIGN KEY ("op_act_id") REFERENCES "operation_template_activity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "op_act_labor"
  ADD CONSTRAINT "op_act_labor_labor_resource_id_fkey"
  FOREIGN KEY ("labor_resource_id") REFERENCES "equipment_resource"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "op_act_material"
  ADD CONSTRAINT "op_act_material_op_act_id_fkey"
  FOREIGN KEY ("op_act_id") REFERENCES "operation_template_activity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "op_act_material"
  ADD CONSTRAINT "op_act_material_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "materials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
