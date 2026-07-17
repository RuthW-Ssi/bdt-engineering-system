-- DropIndex
DROP INDEX "cutting_plan_upload_project_code_idx";

-- AlterTable
ALTER TABLE "cutting_plan_order_part" ADD COLUMN     "project_code" VARCHAR(20);

-- AlterTable
ALTER TABLE "cutting_plan_upload" DROP COLUMN "project_code";

-- CreateIndex
CREATE INDEX "cutting_plan_order_part_project_code_idx" ON "cutting_plan_order_part"("project_code");
