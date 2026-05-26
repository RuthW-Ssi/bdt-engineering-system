-- AlterTable
ALTER TABLE "operation_template_activity" ADD COLUMN     "equipment_resource_id" INTEGER;

-- AlterTable
ALTER TABLE "routing_activity_template" ADD COLUMN     "equipment_resource_id" INTEGER;

-- CreateTable
CREATE TABLE "equipment_resource" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "rate" DECIMAL(10,4),
    "rate_unit" VARCHAR(20),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_date" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "equipment_resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_resource_code_key" ON "equipment_resource"("code");

-- AddForeignKey
ALTER TABLE "routing_activity_template" ADD CONSTRAINT "routing_activity_template_equipment_resource_id_fkey" FOREIGN KEY ("equipment_resource_id") REFERENCES "equipment_resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_template_activity" ADD CONSTRAINT "operation_template_activity_equipment_resource_id_fkey" FOREIGN KEY ("equipment_resource_id") REFERENCES "equipment_resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
