-- Sprint 14 · drop mo_operation (redundant snapshot · 1 WO = 1 op pattern).
-- work_order already carries the full operation snapshot; WOs now snapshot directly
-- from routing_template.operations at confirm time. Idempotent (IF EXISTS guards).
--
-- ⚠ DESTRUCTIVE (DROP TABLE/TYPE/COLUMN): pushing to staging requires
--   'migrate-allow-destructive: true' in the commit message (migrate-deploy.yml guard).

-- work_order: replace soft ref mo_operation_id → source_routing_op_id (routing op breadcrumb)
ALTER TABLE "work_order" DROP COLUMN IF EXISTS "mo_operation_id";
ALTER TABLE "work_order" ADD COLUMN IF NOT EXISTS "source_routing_op_id" INTEGER;

-- manufacturing_order: drop forward-looking soft ref that pointed at mo_operation.id
ALTER TABLE "manufacturing_order" DROP COLUMN IF EXISTS "bottleneck_op_id";

-- drop the table (its FKs to manufacturing_order + mrp_workcenter are dropped with it)
DROP TABLE IF EXISTS "mo_operation";

-- drop the now-unused enum
DROP TYPE IF EXISTS "MoOperationStatus";
