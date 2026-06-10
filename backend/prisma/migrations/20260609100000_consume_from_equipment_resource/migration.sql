-- Change activity_consume and op_act_material to reference equipment_resource instead of materials
-- Clear existing rows first (old data pointed to materials.id, incompatible with new FK)
DELETE FROM "op_act_material";
DELETE FROM "activity_consume";

-- ── activity_consume ─────────────────────────────────────────────────────────

ALTER TABLE "activity_consume" DROP CONSTRAINT "activity_consume_material_id_fkey";
DROP INDEX IF EXISTS "activity_consume_material_id_idx";
ALTER TABLE "activity_consume" DROP CONSTRAINT "activity_consume_pkey";

ALTER TABLE "activity_consume" RENAME COLUMN "material_id" TO "resource_id";

ALTER TABLE "activity_consume"
  ADD CONSTRAINT "activity_consume_pkey" PRIMARY KEY ("activity_id", "resource_id");
ALTER TABLE "activity_consume"
  ADD CONSTRAINT "activity_consume_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "equipment_resource"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "activity_consume_resource_id_idx" ON "activity_consume"("resource_id");

-- ── op_act_material ───────────────────────────────────────────────────────────

ALTER TABLE "op_act_material" DROP CONSTRAINT "op_act_material_material_id_fkey";
DROP INDEX IF EXISTS "op_act_material_op_act_id_material_id_key";
DROP INDEX IF EXISTS "op_act_material_op_act_id_idx";

ALTER TABLE "op_act_material" RENAME COLUMN "material_id" TO "resource_id";

CREATE UNIQUE INDEX "op_act_material_op_act_id_resource_id_key"
  ON "op_act_material"("op_act_id", "resource_id");
CREATE INDEX "op_act_material_op_act_id_idx"
  ON "op_act_material"("op_act_id");
ALTER TABLE "op_act_material"
  ADD CONSTRAINT "op_act_material_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "equipment_resource"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
