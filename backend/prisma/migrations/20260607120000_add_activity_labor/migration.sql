-- CreateTable
CREATE TABLE "activity_labor" (
    "activity_id" INTEGER NOT NULL,
    "labor_resource_id" INTEGER NOT NULL,

    CONSTRAINT "activity_labor_pkey" PRIMARY KEY ("activity_id","labor_resource_id")
);

-- CreateIndex
CREATE INDEX "activity_labor_labor_resource_id_idx" ON "activity_labor"("labor_resource_id");

-- AddForeignKey
ALTER TABLE "activity_labor" ADD CONSTRAINT "activity_labor_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_labor" ADD CONSTRAINT "activity_labor_labor_resource_id_fkey" FOREIGN KEY ("labor_resource_id") REFERENCES "equipment_resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
