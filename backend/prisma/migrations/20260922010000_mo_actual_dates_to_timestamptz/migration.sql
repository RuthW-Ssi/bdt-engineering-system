-- manufacturing_order.actual_start/actual_finish need a time component (shop
-- floor logs the minute), unlike plan_start/plan_finish which stay date-only
-- (2026-09-22).
ALTER TABLE "manufacturing_order" ALTER COLUMN "actual_start" TYPE TIMESTAMPTZ USING "actual_start"::timestamptz;
ALTER TABLE "manufacturing_order" ALTER COLUMN "actual_finish" TYPE TIMESTAMPTZ USING "actual_finish"::timestamptz;
