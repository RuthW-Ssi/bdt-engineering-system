-- Allow multiple work_order rows per (mo_id, source_routing_op_id) — an
-- operation can now be split across several WOs (different teams working
-- the same op in parallel); a mark may deliberately appear on more than one
-- of them. Was @@unique([mo_id, source_routing_op_id]) ("one WO per
-- operation per MO", 2026-09-17), replaced with a plain index for the same
-- lookup's query performance, no longer unique.
DROP INDEX "work_order_mo_id_source_routing_op_id_key";
CREATE INDEX "work_order_mo_id_source_routing_op_id_idx" ON "work_order"("mo_id", "source_routing_op_id");
