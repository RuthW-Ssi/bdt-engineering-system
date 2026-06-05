-- Add consumption_basis to routing_op_act_consumable
-- Values: 'per_m2' | 'per_kg' | 'per_unit' | null (null = per_unit default)
ALTER TABLE "routing_op_act_consumable" ADD COLUMN "consumption_basis" VARCHAR(20);
