-- Rename op_act_labor → op_act_skills
ALTER TABLE "op_act_labor" RENAME TO "op_act_skills";

-- Rename the constraint/index names to match new table
ALTER INDEX IF EXISTS "op_act_labor_op_act_id_skill_key" RENAME TO "op_act_skills_op_act_id_skill_key";
ALTER INDEX IF EXISTS "op_act_labor_op_act_id_idx" RENAME TO "op_act_skills_op_act_id_idx";

-- Rename the primary key sequence
ALTER SEQUENCE IF EXISTS "op_act_labor_id_seq" RENAME TO "op_act_skills_id_seq";
