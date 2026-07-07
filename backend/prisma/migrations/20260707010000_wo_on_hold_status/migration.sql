-- WO BOM-Version Hold (US-WO.07). Additive only.
-- ADD VALUE IF NOT EXISTS is idempotent (PG12+); must NOT be wrapped in a
-- DO/PL-pgSQL block (ALTER TYPE ADD VALUE cannot run inside a function body).
ALTER TYPE "WoStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';
ALTER TYPE "WoEventType" ADD VALUE IF NOT EXISTS 'HOLD';

ALTER TABLE "work_order" ADD COLUMN "qty_reusable" DECIMAL(12,3);
ALTER TABLE "work_order" ADD COLUMN "pre_hold_status" "WoStatus";
