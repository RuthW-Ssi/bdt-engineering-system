-- Cutting Plan upload picks Project / Zone / Sub-zone / Lot, and drops Tag (2026-11-06).
-- 4 nullable columns (older uploads have no pick) and 3 FKs (RESTRICT; zones/sub-zones are
-- soft-deleted). DROP tag is the only destructive step: checked on Supabase before shipping,
-- cutting_plan_upload had 0 rows (2026-11-06), so no data is lost.
ALTER TABLE "cutting_plan_upload"
  DROP COLUMN IF EXISTS "tag",
  ADD COLUMN IF NOT EXISTS "project_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "zone_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "sub_zone_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "lot" VARCHAR(60);

ALTER TABLE "cutting_plan_upload"
  ADD CONSTRAINT "cutting_plan_upload_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "cutting_plan_upload_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "project_zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "cutting_plan_upload_sub_zone_id_fkey" FOREIGN KEY ("sub_zone_id") REFERENCES "sub_zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "cutting_plan_upload_project_id_idx" ON "cutting_plan_upload"("project_id");
CREATE INDEX IF NOT EXISTS "cutting_plan_upload_zone_id_idx" ON "cutting_plan_upload"("zone_id");
