-- Drop Sprint 4 routing chain
-- Tables dropped in child-first order to avoid FK conflicts

BEGIN;

-- Remove FK from operation_template_activity before dropping its target
ALTER TABLE "operation_template_activity"
  DROP CONSTRAINT IF EXISTS "operation_template_activity_source_activity_template_id_fkey";
ALTER TABLE "operation_template_activity"
  DROP COLUMN IF EXISTS "source_activity_template_id";

-- Remove columns from products referencing custom_routing
ALTER TABLE "products"
  DROP COLUMN IF EXISTS "has_custom_routing";

-- Children of routing_op_activity
DROP TABLE IF EXISTS "routing_op_act_tool";
DROP TABLE IF EXISTS "routing_op_act_consumable";

-- Children of routing_activity_template / mrp_routing_workcenter
DROP TABLE IF EXISTS "routing_op_activity";
DROP TABLE IF EXISTS "routing_activity_template_history";

-- Children of product and routing_activity_template
DROP TABLE IF EXISTS "product_routing_override_history";
DROP TABLE IF EXISTS "product_routing_override";

-- Children of custom_routing_op → custom_routing → products
DROP TABLE IF EXISTS "custom_routing_activity";
DROP TABLE IF EXISTS "custom_routing_op";
DROP TABLE IF EXISTS "custom_routing";

-- Parent — drop last after all children gone
DROP TABLE IF EXISTS "routing_activity_template";

COMMIT;
