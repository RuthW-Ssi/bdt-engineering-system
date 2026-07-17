-- AlterTable
ALTER TABLE "cutting_plan_upload" ADD COLUMN     "assigned_date" TIMESTAMPTZ,
ADD COLUMN     "assigned_uid" INTEGER,
ADD COLUMN     "project_id" INTEGER,
ADD COLUMN     "sub_zone_id" INTEGER,
ADD COLUMN     "zone_id" INTEGER;

-- CreateIndex
CREATE INDEX "cutting_plan_upload_project_id_idx" ON "cutting_plan_upload"("project_id");

-- AddForeignKey
ALTER TABLE "cutting_plan_upload" ADD CONSTRAINT "cutting_plan_upload_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_upload" ADD CONSTRAINT "cutting_plan_upload_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "project_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_upload" ADD CONSTRAINT "cutting_plan_upload_sub_zone_id_fkey" FOREIGN KEY ("sub_zone_id") REFERENCES "sub_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_upload" ADD CONSTRAINT "cutting_plan_upload_assigned_uid_fkey" FOREIGN KEY ("assigned_uid") REFERENCES "res_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
