-- Add machine_id to routing_op_activity
ALTER TABLE "routing_op_activity"
  ADD COLUMN "machine_id" INTEGER;

ALTER TABLE "routing_op_activity"
  ADD CONSTRAINT "routing_op_activity_machine_id_fkey"
  FOREIGN KEY ("machine_id") REFERENCES "equipment_resource"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Create routing_op_act_tool junction table
CREATE TABLE "routing_op_act_tool" (
    "id"          SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "resource_id" INTEGER NOT NULL,
    CONSTRAINT "routing_op_act_tool_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "routing_op_act_tool_activity_id_idx"
  ON "routing_op_act_tool"("activity_id");

CREATE UNIQUE INDEX "routing_op_act_tool_activity_id_resource_id_key"
  ON "routing_op_act_tool"("activity_id", "resource_id");

ALTER TABLE "routing_op_act_tool"
  ADD CONSTRAINT "routing_op_act_tool_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "routing_op_activity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routing_op_act_tool"
  ADD CONSTRAINT "routing_op_act_tool_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "equipment_resource"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Create routing_op_act_consumable junction table
CREATE TABLE "routing_op_act_consumable" (
    "id"          SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "qty"         DECIMAL(10,4),
    "unit"        VARCHAR(20),
    CONSTRAINT "routing_op_act_consumable_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "routing_op_act_consumable_activity_id_idx"
  ON "routing_op_act_consumable"("activity_id");

CREATE UNIQUE INDEX "routing_op_act_consumable_activity_id_resource_id_key"
  ON "routing_op_act_consumable"("activity_id", "resource_id");

ALTER TABLE "routing_op_act_consumable"
  ADD CONSTRAINT "routing_op_act_consumable_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "routing_op_activity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "routing_op_act_consumable"
  ADD CONSTRAINT "routing_op_act_consumable_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "equipment_resource"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
