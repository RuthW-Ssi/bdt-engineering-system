-- Replace qty_scrapped/qty_reusable with a 3-way QC breakdown
-- (qty_qc_passed / qty_rework / qty_renew), used both alongside qty_done
-- during normal work and for disposition on remove-mark/accept-new-version/
-- cancel. No data loss: both dropped columns are all-NULL in every environment
-- this migration has been checked against.
ALTER TABLE "work_order_mark" DROP COLUMN "qty_scrapped";
ALTER TABLE "work_order_mark" DROP COLUMN "qty_reusable";
ALTER TABLE "work_order_mark" ADD COLUMN "qty_qc_passed" DECIMAL(12,3);
ALTER TABLE "work_order_mark" ADD COLUMN "qty_rework" DECIMAL(12,3);
ALTER TABLE "work_order_mark" ADD COLUMN "qty_renew" DECIMAL(12,3);
