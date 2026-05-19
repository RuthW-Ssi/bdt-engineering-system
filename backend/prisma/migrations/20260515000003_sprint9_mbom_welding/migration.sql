-- Sprint 9: dispatch_part_welding_config
CREATE TABLE "dispatch_part_welding_config" (
  "id"          SERIAL PRIMARY KEY,
  "dispatch_id" INTEGER NOT NULL REFERENCES "bom_dispatch"("id") ON DELETE CASCADE,
  "part_id"     INTEGER NOT NULL REFERENCES "bom_part"("id") ON DELETE CASCADE,
  "material_id" INTEGER REFERENCES "materials"("id") ON DELETE SET NULL,
  "create_uid"  INTEGER NOT NULL,
  "create_date" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "write_uid"   INTEGER NOT NULL,
  "write_date"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON "dispatch_part_welding_config"("dispatch_id","part_id");
CREATE INDEX ON "dispatch_part_welding_config"("dispatch_id");
CREATE INDEX ON "dispatch_part_welding_config"("part_id");
CREATE INDEX ON "dispatch_part_welding_config"("material_id");

-- Sprint 9: dispatch_welding_requirement
CREATE TABLE "dispatch_welding_requirement" (
  "id"                   SERIAL PRIMARY KEY,
  "dispatch_id"          INTEGER NOT NULL REFERENCES "bom_dispatch"("id") ON DELETE CASCADE,
  "material_id"          INTEGER NOT NULL REFERENCES "materials"("id"),
  "total_path_m"         DECIMAL(14,4) NOT NULL,
  "total_consumption_kg" DECIMAL(14,4) NOT NULL,
  "total_packages"       INTEGER NOT NULL,
  "computed_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON "dispatch_welding_requirement"("dispatch_id","material_id");
CREATE INDEX ON "dispatch_welding_requirement"("dispatch_id");
CREATE INDEX ON "dispatch_welding_requirement"("material_id");
