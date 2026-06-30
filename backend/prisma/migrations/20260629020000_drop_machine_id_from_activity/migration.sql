-- Drop machine_id from activity table (machine reference moved to mrp_workcenter)
DROP INDEX IF EXISTS "activity_machine_id_idx";
ALTER TABLE "activity" DROP CONSTRAINT IF EXISTS "activity_machine_id_fkey";
ALTER TABLE "activity" DROP COLUMN IF EXISTS "machine_id";

-- Drop machine_id from operation_template_activity table (machine reference moved to mrp_workcenter)
ALTER TABLE "operation_template_activity" DROP CONSTRAINT IF EXISTS "operation_template_activity_machine_id_fkey";
ALTER TABLE "operation_template_activity" DROP COLUMN IF EXISTS "machine_id";
