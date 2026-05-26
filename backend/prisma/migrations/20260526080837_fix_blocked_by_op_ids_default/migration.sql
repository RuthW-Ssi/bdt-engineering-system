-- AlterTable
ALTER TABLE "custom_routing_op" ALTER COLUMN "blocked_by_op_ids" SET DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "mrp_routing_workcenter" ALTER COLUMN "blocked_by_op_ids" SET DEFAULT ARRAY[]::INTEGER[];
