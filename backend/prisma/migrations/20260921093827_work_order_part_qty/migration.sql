-- work_order_part becomes qty-primary (2026-09-21): parts are discrete
-- physical items withdrawn by piece count, not weighed out by hand, so the
-- user-editable field is `qty` (pieces) — `weight_kg` becomes a stored
-- derived value (qty * bom_part.weight_kg) kept in sync by the app whenever
-- qty is written, kept only so readers don't need to join back to bom_part.
-- No real data existed in this table yet, so a plain NOT NULL add is safe.

ALTER TABLE "work_order_part" ADD COLUMN "qty" DECIMAL(12,3) NOT NULL;
