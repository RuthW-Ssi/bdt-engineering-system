-- Work Order: how many people from the assigned team are on this WO.
-- Existing rows predate this field — backfill as 1 (placeholder, no real
-- historical headcount to derive), then drop the default so every future
-- insert must specify it explicitly (matches CreateWoDto's required field).
ALTER TABLE "work_order" ADD COLUMN "team_headcount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "work_order" ALTER COLUMN "team_headcount" DROP DEFAULT;
