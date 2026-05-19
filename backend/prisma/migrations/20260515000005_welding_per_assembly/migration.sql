-- Replace per-part welding config with per-assembly (simpler, more practical)
DROP TABLE IF EXISTS "dispatch_part_welding_config";

CREATE TABLE "dispatch_assembly_welding_config" (
  "id"          SERIAL PRIMARY KEY,
  "dispatch_id" INTEGER NOT NULL REFERENCES "bom_dispatch"("id") ON DELETE CASCADE,
  "assembly_id" INTEGER NOT NULL REFERENCES "bom_assembly"("id") ON DELETE CASCADE,
  "material_id" INTEGER REFERENCES "materials"("id") ON DELETE SET NULL,
  "create_uid"  INTEGER NOT NULL,
  "create_date" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "write_uid"   INTEGER NOT NULL,
  "write_date"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX ON "dispatch_assembly_welding_config"("dispatch_id","assembly_id");
CREATE INDEX ON "dispatch_assembly_welding_config"("dispatch_id");
CREATE INDEX ON "dispatch_assembly_welding_config"("assembly_id");
CREATE INDEX ON "dispatch_assembly_welding_config"("material_id");
