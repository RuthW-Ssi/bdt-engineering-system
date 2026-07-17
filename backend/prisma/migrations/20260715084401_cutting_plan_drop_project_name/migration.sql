-- AlterTable
ALTER TABLE "cutting_plan_upload" DROP COLUMN "project_name",
ALTER COLUMN "project_code" DROP NOT NULL;
