-- Add nullable first so any pre-existing rows (dev/test uploads made before
-- this feature existed) don't break the migration.
ALTER TABLE "bim_model" ADD COLUMN "project_id" INTEGER;
ALTER TABLE "bim_model" ADD COLUMN "zone_id" INTEGER;
ALTER TABLE "bim_model" ADD COLUMN "sub_zone_id" INTEGER;
ALTER TABLE "bim_model" ADD COLUMN "major_version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bim_model" ADD COLUMN "minor_version" INTEGER NOT NULL DEFAULT 0;

-- Backfill any existing rows to the first project/zone so the NOT NULL
-- constraint below can be applied — dev/test data only, no real upload flow
-- existed to assign these before now.
UPDATE "bim_model" SET "project_id" = (SELECT "id" FROM "project" ORDER BY "id" ASC LIMIT 1)
  WHERE "project_id" IS NULL;
UPDATE "bim_model" SET "zone_id" = (SELECT "id" FROM "project_zone" ORDER BY "id" ASC LIMIT 1)
  WHERE "zone_id" IS NULL;

ALTER TABLE "bim_model" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "bim_model" ALTER COLUMN "zone_id" SET NOT NULL;

ALTER TABLE "bim_model" ADD CONSTRAINT "bim_model_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bim_model" ADD CONSTRAINT "bim_model_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "project_zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bim_model" ADD CONSTRAINT "bim_model_sub_zone_id_fkey"
  FOREIGN KEY ("sub_zone_id") REFERENCES "sub_zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "bim_model_project_id_zone_id_sub_zone_id_idx" ON "bim_model"("project_id", "zone_id", "sub_zone_id");
