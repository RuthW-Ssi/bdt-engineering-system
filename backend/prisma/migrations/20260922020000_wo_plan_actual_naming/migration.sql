-- Rename work_order's date columns to match manufacturing_order's
-- plan_start/plan_finish/actual_start/actual_finish naming exactly — same
-- concepts, was two different names for the same thing (2026-09-22).
ALTER TABLE "work_order" RENAME COLUMN "earliest_start_at" TO "plan_start";
ALTER TABLE "work_order" RENAME COLUMN "target_end_at" TO "plan_finish";
ALTER TABLE "work_order" RENAME COLUMN "actual_start_at" TO "actual_start";
ALTER TABLE "work_order" RENAME COLUMN "actual_end_at" TO "actual_finish";
