-- F-MO · drop earliest_start_at + priority from manufacturing_order (no longer used).
ALTER TABLE "manufacturing_order" DROP COLUMN IF EXISTS "earliest_start_at";
ALTER TABLE "manufacturing_order" DROP COLUMN IF EXISTS "priority";
DROP TYPE IF EXISTS "MoPriority";
