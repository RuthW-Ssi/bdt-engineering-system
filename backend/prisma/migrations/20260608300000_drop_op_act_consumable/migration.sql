-- Drop op_act_consumable: replaced by op_act_material (Sprint 11b)
-- This table targeted equipment_resource (wrong FK) and had 0 rows.
DROP TABLE IF EXISTS "op_act_consumable";
