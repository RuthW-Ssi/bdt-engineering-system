-- Add activity_tool junction table (mirrors op_act_tool but for Activity Library)
CREATE TABLE "activity_tool" (
  "activity_id" INTEGER NOT NULL,
  "resource_id" INTEGER NOT NULL,
  CONSTRAINT "activity_tool_pkey" PRIMARY KEY ("activity_id", "resource_id")
);

CREATE INDEX "activity_tool_resource_id_idx" ON "activity_tool"("resource_id");

ALTER TABLE "activity_tool"
  ADD CONSTRAINT "activity_tool_activity_id_fkey"
  FOREIGN KEY ("activity_id") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_tool"
  ADD CONSTRAINT "activity_tool_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "equipment_resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
