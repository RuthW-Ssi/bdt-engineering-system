-- work_order_consume becomes whole-units-only (2026-09-21) — shop floor
-- records consume to the nearest whole unit, not fractional kg/pcs. Plain
-- Int rather than Decimal(12,3) so the API never has to reformat away a
-- fixed-scale ".000" suffix on read. No real data existed in this table yet,
-- so a straight type change (with a defensive ROUND) is safe.

ALTER TABLE "work_order_consume"
  ALTER COLUMN "qty_planned" TYPE INTEGER USING ROUND("qty_planned")::INTEGER,
  ALTER COLUMN "qty_actual" TYPE INTEGER USING ROUND("qty_actual")::INTEGER;
