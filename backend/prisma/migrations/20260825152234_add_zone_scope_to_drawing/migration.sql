-- Existing drawing rows are disposable staging test data (confirmed
-- 2026-08-25, see wiki: features/drawing-zone-scope-plan.md) — no zone
-- signal exists anywhere to backfill them from (the old shop_drawing table
-- and products.master_drawing_id/shop_drawing_id were already hard-dropped
-- by 20260821000000_replace_shop_drawing_with_simple_drawing), and nothing
-- has a foreign key pointing INTO "drawing", so deleting first is safe.
-- Plain DELETE per user instruction (no TRUNCATE) — id sequence is not reset.
DELETE FROM "drawing";

-- AlterTable
ALTER TABLE "drawing" ADD COLUMN "zone_id" INTEGER NOT NULL;
ALTER TABLE "drawing" ADD COLUMN "sub_zone_id" INTEGER;

-- AddForeignKey
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "project_zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_sub_zone_id_fkey" FOREIGN KEY ("sub_zone_id") REFERENCES "sub_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
