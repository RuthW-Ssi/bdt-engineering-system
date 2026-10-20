-- Drawing per-mark revision, phase 1 (wiki features/drawing-revision-plan.md).
ALTER TABLE "drawing" ADD COLUMN "mark" VARCHAR(100);
ALTER TABLE "drawing" ADD COLUMN "rev" INTEGER;
ALTER TABLE "drawing" ALTER COLUMN "version" DROP NOT NULL;
CREATE INDEX "drawing_zone_id_sub_zone_id_mark_rev_idx" ON "drawing"("zone_id", "sub_zone_id", "mark", "rev");

-- Backfill — twin of src/lib/drawingFileName.ts (keep in sync).
WITH p AS (
  SELECT id,
    CASE WHEN position(' - ' IN file_name) > 0
         THEN NULLIF(btrim(split_part(file_name, ' - ', 1)), '') END AS mark,
    substring(lower(regexp_replace(file_name, '\.[^.]+$', ''))
              FROM '(?:^|[\s-])rev\.?\s*(?:rev\.?\s*)?(\d*)\s*$') AS rev_txt
  FROM "drawing"
)
UPDATE "drawing" d
SET mark = p.mark,
    rev  = CASE WHEN p.rev_txt IS NULL THEN NULL WHEN p.rev_txt = '' THEN 0 ELSE p.rev_txt::int END
FROM p WHERE p.id = d.id;
