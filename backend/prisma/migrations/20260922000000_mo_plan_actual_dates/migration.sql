-- Replace manufacturing_order.due_date (single deadline) with a plan
-- start/finish window, and add an actual start/finish pair (2026-09-22).
-- No data loss: verified 2026-09-24 via read-only COUNT against staging —
-- 0 of 5 manufacturing_order rows have a non-null due_date.
DROP INDEX "manufacturing_order_due_date_idx";

ALTER TABLE "manufacturing_order" DROP COLUMN "due_date";
ALTER TABLE "manufacturing_order" ADD COLUMN "plan_start" DATE;
ALTER TABLE "manufacturing_order" ADD COLUMN "plan_finish" DATE;
ALTER TABLE "manufacturing_order" ADD COLUMN "actual_start" DATE;
ALTER TABLE "manufacturing_order" ADD COLUMN "actual_finish" DATE;
