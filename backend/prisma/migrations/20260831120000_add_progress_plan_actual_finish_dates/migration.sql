-- Fabrication phase-level Plan/Actual Finish (distinct from the 10 per-stage
-- percent columns) + Erection Plan Finish (pairs with existing
-- erection_actual_finish_date). All nullable, additive, no data loss.
ALTER TABLE "bom_assembly_progress" ADD COLUMN "fab_plan_finish_date" DATE;
ALTER TABLE "bom_assembly_progress" ADD COLUMN "fab_actual_finish_date" DATE;
ALTER TABLE "bom_assembly_progress" ADD COLUMN "erection_plan_finish_date" DATE;
