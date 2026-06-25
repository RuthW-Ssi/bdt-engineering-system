-- Fix activity_consume: rename resource_id → material_id, change FK from equipment_resource → materials
-- Safe: table has 0 rows at migration time

ALTER TABLE "activity_consume"
  DROP CONSTRAINT "activity_consume_pkey",
  DROP CONSTRAINT "activity_consume_resource_id_fkey";

DROP INDEX IF EXISTS "activity_consume_resource_id_idx";

ALTER TABLE "activity_consume" RENAME COLUMN "resource_id" TO "material_id";

ALTER TABLE "activity_consume"
  ADD CONSTRAINT "activity_consume_pkey" PRIMARY KEY ("activity_id", "material_id"),
  ADD CONSTRAINT "activity_consume_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE;

CREATE INDEX "activity_consume_material_id_idx" ON "activity_consume"("material_id");
