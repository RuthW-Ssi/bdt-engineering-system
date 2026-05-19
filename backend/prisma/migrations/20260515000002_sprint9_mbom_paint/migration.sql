-- Sprint 9: dispatch_assembly_paint_config
CREATE TABLE "dispatch_assembly_paint_config" (
  "id"          SERIAL PRIMARY KEY,
  "dispatch_id" INTEGER NOT NULL,
  "assembly_id" INTEGER NOT NULL,
  "paint_type"  VARCHAR(20) NOT NULL,
  "material_id" INTEGER,
  "layers"      INTEGER NOT NULL DEFAULT 1,
  "create_uid"  INTEGER NOT NULL,
  "create_date" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "write_uid"   INTEGER NOT NULL,
  "write_date"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "dispatch_assembly_paint_config_dispatch_id_fkey"
    FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE,
  CONSTRAINT "dispatch_assembly_paint_config_assembly_id_fkey"
    FOREIGN KEY ("assembly_id") REFERENCES "bom_assembly"("id") ON DELETE CASCADE,
  CONSTRAINT "dispatch_assembly_paint_config_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "dispatch_assembly_paint_config_assembly_id_paint_type_key"
  ON "dispatch_assembly_paint_config"("assembly_id", "paint_type");
CREATE INDEX "dispatch_assembly_paint_config_dispatch_id_idx"
  ON "dispatch_assembly_paint_config"("dispatch_id");
CREATE INDEX "dispatch_assembly_paint_config_assembly_id_idx"
  ON "dispatch_assembly_paint_config"("assembly_id");
CREATE INDEX "dispatch_assembly_paint_config_material_id_idx"
  ON "dispatch_assembly_paint_config"("material_id");

-- Sprint 9: dispatch_material_requirement
CREATE TABLE "dispatch_material_requirement" (
  "id"               SERIAL PRIMARY KEY,
  "dispatch_id"      INTEGER NOT NULL,
  "material_id"      INTEGER NOT NULL,
  "paint_type"       VARCHAR(20) NOT NULL,
  "total_area_m2"    DECIMAL(14,4) NOT NULL,
  "total_qty_gallon" DECIMAL(14,4) NOT NULL,
  "computed_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "dispatch_material_requirement_dispatch_id_fkey"
    FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE,
  CONSTRAINT "dispatch_material_requirement_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id")
);

CREATE UNIQUE INDEX "dispatch_material_requirement_dispatch_material_type_key"
  ON "dispatch_material_requirement"("dispatch_id", "material_id", "paint_type");
CREATE INDEX "dispatch_material_requirement_dispatch_id_idx"
  ON "dispatch_material_requirement"("dispatch_id");
CREATE INDEX "dispatch_material_requirement_material_id_idx"
  ON "dispatch_material_requirement"("material_id");
