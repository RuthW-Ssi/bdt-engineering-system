-- Per-mark finish date (2026-10-14): user-typed once QC Passed = Quantity.
ALTER TABLE "work_order_mark" ADD COLUMN "actual_finish" TIMESTAMPTZ;
