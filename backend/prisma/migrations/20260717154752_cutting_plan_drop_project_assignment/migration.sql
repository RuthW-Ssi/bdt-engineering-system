-- Remove upload-level project/zone assignment entirely from cutting_plan_upload
-- (2026-07-17) — a per-upload assignment was known to be the wrong granularity
-- (one upload/plate can span multiple projects/zones); the redesign that would
-- replace it (BOM part-mark matching) is paused. cutting_plan_order_part's
-- per-part project_code (manual, bulk-assignable) remains the only project
-- link for now.

ALTER TABLE "cutting_plan_upload" DROP CONSTRAINT "cutting_plan_upload_assigned_uid_fkey";
ALTER TABLE "cutting_plan_upload" DROP CONSTRAINT "cutting_plan_upload_project_id_fkey";
ALTER TABLE "cutting_plan_upload" DROP CONSTRAINT "cutting_plan_upload_sub_zone_id_fkey";
ALTER TABLE "cutting_plan_upload" DROP CONSTRAINT "cutting_plan_upload_zone_id_fkey";

DROP INDEX "cutting_plan_upload_project_id_idx";

ALTER TABLE "cutting_plan_upload" DROP COLUMN "assigned_date",
DROP COLUMN "assigned_uid",
DROP COLUMN "project_id",
DROP COLUMN "sub_zone_id",
DROP COLUMN "zone_id";
