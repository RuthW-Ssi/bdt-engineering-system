-- Add ratio/ratio_unit/per_time to activity (nullable, B-option: fallback to per_minute)
ALTER TABLE "activity"
  ADD COLUMN IF NOT EXISTS "ratio"      DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS "ratio_unit" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "per_time"   DECIMAL(10,4);
