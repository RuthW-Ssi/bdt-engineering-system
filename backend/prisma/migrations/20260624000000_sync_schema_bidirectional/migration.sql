-- Bi-directional sync: align local schema.prisma with Supabase state
-- Applied to Supabase via MCP apply_migration (sync_local_schema_gaps)
-- Applied to local dev DB here

-- activity: add per_minute, formula_code (were in local schema but missing from Supabase)
-- and add kind (was in Supabase but missing from local schema)
ALTER TABLE "activity"
  ADD COLUMN IF NOT EXISTS "per_minute" DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS "formula_code" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'run';

-- work_order: add setup_time_min (was in local schema but missing from Supabase)
-- and add is_pinned, operator_mode, subcontractor_id (Supabase-only additions)
ALTER TABLE "work_order"
  ADD COLUMN IF NOT EXISTS "setup_time_min" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "operator_mode" TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS "subcontractor_id" INTEGER,
  ADD CONSTRAINT "work_order_subcontractor_id_fkey"
    FOREIGN KEY ("subcontractor_id") REFERENCES "subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
