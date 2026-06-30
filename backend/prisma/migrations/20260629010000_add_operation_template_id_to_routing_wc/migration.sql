-- Add operation_template_id FK to mrp_routing_workcenter
-- Links each routing operation directly to an operation_template (Operation Library)
ALTER TABLE "mrp_routing_workcenter"
  ADD COLUMN "operation_template_id" INTEGER;

ALTER TABLE "mrp_routing_workcenter"
  ADD CONSTRAINT "mrp_routing_workcenter_operation_template_id_fkey"
  FOREIGN KEY ("operation_template_id")
  REFERENCES "operation_template"("id")
  ON DELETE SET NULL;

CREATE INDEX "mrp_routing_workcenter_operation_template_id_idx"
  ON "mrp_routing_workcenter"("operation_template_id");
