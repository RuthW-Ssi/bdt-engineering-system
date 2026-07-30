-- Sprint 26: Progress Form v2 — phase tracking. Rebuilds
-- bom_assembly_progress from the 5-field milestone model to the site
-- team's real 3-phase structure (REV1 Excel): 10 weighted fabrication
-- stage percents, transport (plan/actual load + pieces loaded), erection
-- (pieces erected). Data mapping runs BEFORE the old columns drop.

-- 1) Add v2 columns (defaults keep existing rows valid)
ALTER TABLE "bom_assembly_progress"
  ADD COLUMN "cut" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "buildup" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "weld1" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fitup_drill" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "weld2" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "qc_inspection" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "primer" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fireproof" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "top_coat" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "qc_final" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "plan_load_date" DATE,
  ADD COLUMN "loaded_pcs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "erected_pcs" INTEGER NOT NULL DEFAULT 0;

-- 2) Data migration — while v1 columns are still readable.
-- QC booleans become their stage percents.
UPDATE "bom_assembly_progress" SET "qc_inspection" = 100 WHERE "qc_inspection_pass" = true;
UPDATE "bom_assembly_progress" SET "qc_final" = 100 WHERE "qc_final_pass" = true;

-- A recorded load date under v1 meant the load milestone was done →
-- loaded_pcs = full qty. bom_assembly.qty is Decimal(12,3) nullable;
-- GREATEST(1, COALESCE(ROUND(qty)::int, 1)) matches the service's
-- effectiveQty() helper (an assembly is at least one physical piece).
UPDATE "bom_assembly_progress" p
SET "loaded_pcs" = GREATEST(1, COALESCE(ROUND(a."qty")::int, 1))
FROM "bom_assembly" a
WHERE a."id" = p."assembly_id" AND p."actual_load_date" IS NOT NULL;

-- v1 install/qc_install dates meant erection reached/finished →
-- erected_pcs = full qty (furthest-milestone semantics).
UPDATE "bom_assembly_progress" p
SET "erected_pcs" = GREATEST(1, COALESCE(ROUND(a."qty")::int, 1))
FROM "bom_assembly" a
WHERE a."id" = p."assembly_id"
  AND (p."install_date" IS NOT NULL OR p."qc_install_date" IS NOT NULL);

-- 3) Drop v1 columns
ALTER TABLE "bom_assembly_progress"
  DROP COLUMN "qc_inspection_pass",
  DROP COLUMN "qc_final_pass",
  DROP COLUMN "install_date",
  DROP COLUMN "qc_install_date";
