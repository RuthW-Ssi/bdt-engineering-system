-- Refactor activity_labor: replace labor_resource_id FK with skill (string)
ALTER TABLE "activity_labor" DROP CONSTRAINT IF EXISTS "activity_labor_labor_resource_id_fkey";
ALTER TABLE "activity_labor" DROP CONSTRAINT IF EXISTS "activity_labor_pkey";
ALTER TABLE "activity_labor" DROP COLUMN IF EXISTS "labor_resource_id";
ALTER TABLE "activity_labor" ADD COLUMN IF NOT EXISTS "skill" VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE "activity_labor" ADD PRIMARY KEY ("activity_id", "skill");
CREATE INDEX IF NOT EXISTS "activity_labor_skill_idx" ON "activity_labor"("skill");

-- Refactor op_act_labor: replace labor_resource_id FK with skill (string)
ALTER TABLE "op_act_labor" DROP CONSTRAINT IF EXISTS "op_act_labor_labor_resource_id_fkey";
ALTER TABLE "op_act_labor" DROP CONSTRAINT IF EXISTS "op_act_labor_op_act_id_labor_resource_id_key";
ALTER TABLE "op_act_labor" DROP COLUMN IF EXISTS "labor_resource_id";
ALTER TABLE "op_act_labor" ADD COLUMN IF NOT EXISTS "skill" VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE "op_act_labor" ADD CONSTRAINT "op_act_labor_op_act_id_skill_key" UNIQUE ("op_act_id", "skill");
