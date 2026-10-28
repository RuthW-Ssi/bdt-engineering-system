-- Per-mark BOM revision (wiki features/bom-mark-revision-plan.md). Additive:
-- existing rows become rev 0 (spec decision 4), rev_source/dn_status null.
ALTER TABLE "bom_assembly" ADD COLUMN "rev" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bom_assembly" ADD COLUMN "rev_source" VARCHAR(16);
ALTER TABLE "bom_assembly" ADD COLUMN "dn_status" VARCHAR(30);
