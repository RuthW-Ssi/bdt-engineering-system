-- BIM models are uploaded at the whole-project level, not per zone/sub-zone
-- (confirmed 2026-07-21 — the earlier per-(project, zone, sub_zone) scoping
-- was based on a mistaken assumption). bim_model has 0 rows at the time of
-- this migration (test data wiped earlier in the same session), so no
-- backfill is needed before dropping the columns.
ALTER TABLE "bim_model" DROP CONSTRAINT "bim_model_zone_id_fkey";
ALTER TABLE "bim_model" DROP CONSTRAINT "bim_model_sub_zone_id_fkey";
DROP INDEX "bim_model_project_id_zone_id_sub_zone_id_idx";
ALTER TABLE "bim_model" DROP COLUMN "zone_id";
ALTER TABLE "bim_model" DROP COLUMN "sub_zone_id";
CREATE INDEX "bim_model_project_id_idx" ON "bim_model"("project_id");
