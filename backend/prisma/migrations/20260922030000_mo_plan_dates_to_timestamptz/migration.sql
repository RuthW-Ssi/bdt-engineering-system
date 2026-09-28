-- manufacturing_order.plan_start/plan_finish need a time component too, to
-- match work_order's own plan_start/plan_finish (2026-09-22).
ALTER TABLE "manufacturing_order" ALTER COLUMN "plan_start" TYPE TIMESTAMPTZ USING "plan_start"::timestamptz;
ALTER TABLE "manufacturing_order" ALTER COLUMN "plan_finish" TYPE TIMESTAMPTZ USING "plan_finish"::timestamptz;
