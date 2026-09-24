-- Not Started / In Progress breakdown columns on work_order_mark (2026-09-23)
ALTER TABLE "work_order_mark" ADD COLUMN "qty_not_started" DECIMAL(12,3);
ALTER TABLE "work_order_mark" ADD COLUMN "qty_in_progress" DECIMAL(12,3);
