/*
  Warnings:

  - You are about to drop the column `equipment_resource_id` on the `operation_template_activity` table. All the data in the column will be lost.
  - You are about to drop the column `equipment_resource_id` on the `routing_activity_template` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "operation_template_activity" DROP CONSTRAINT "operation_template_activity_equipment_resource_id_fkey";

-- DropForeignKey
ALTER TABLE "routing_activity_template" DROP CONSTRAINT "routing_activity_template_equipment_resource_id_fkey";

-- AlterTable
ALTER TABLE "equipment_resource" ALTER COLUMN "type" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "operation_template_activity" DROP COLUMN "equipment_resource_id",
ADD COLUMN     "machine_id" INTEGER;

-- AlterTable
ALTER TABLE "routing_activity_template" DROP COLUMN "equipment_resource_id",
ADD COLUMN     "machine_id" INTEGER;

-- CreateTable
CREATE TABLE "op_act_tool" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "resource_id" INTEGER NOT NULL,

    CONSTRAINT "op_act_tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "op_act_consumable" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "qty" DECIMAL(10,4),
    "unit" VARCHAR(20),

    CONSTRAINT "op_act_consumable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "op_act_tool_activity_id_idx" ON "op_act_tool"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "op_act_tool_activity_id_resource_id_key" ON "op_act_tool"("activity_id", "resource_id");

-- CreateIndex
CREATE INDEX "op_act_consumable_activity_id_idx" ON "op_act_consumable"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "op_act_consumable_activity_id_resource_id_key" ON "op_act_consumable"("activity_id", "resource_id");

-- AddForeignKey
ALTER TABLE "routing_activity_template" ADD CONSTRAINT "routing_activity_template_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "equipment_resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_template_activity" ADD CONSTRAINT "operation_template_activity_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "equipment_resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_act_tool" ADD CONSTRAINT "op_act_tool_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "operation_template_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_act_tool" ADD CONSTRAINT "op_act_tool_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "equipment_resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_act_consumable" ADD CONSTRAINT "op_act_consumable_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "operation_template_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_act_consumable" ADD CONSTRAINT "op_act_consumable_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "equipment_resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
