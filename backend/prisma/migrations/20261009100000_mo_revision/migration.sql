-- MO version (2026-10-09): bumped when printed assembly / part data changes after Confirm.
ALTER TABLE "manufacturing_order" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0;
