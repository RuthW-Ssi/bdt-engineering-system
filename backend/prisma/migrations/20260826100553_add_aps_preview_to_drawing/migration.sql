-- AlterTable
ALTER TABLE "drawing" ADD COLUMN "aps_urn" VARCHAR(200);
ALTER TABLE "drawing" ADD COLUMN "aps_translation_status" VARCHAR(20);
ALTER TABLE "drawing" ADD COLUMN "aps_translation_error" TEXT;
