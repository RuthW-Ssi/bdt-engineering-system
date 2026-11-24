-- Fresh-database fix for 20260922040000_team_and_operator_team_id.
-- That migration renames the CONSTRAINT "subcontractor_code_key", which exists on staging
-- (created outside migrations), but a database built from migrations only has a UNIQUE INDEX
-- of that name (20260623000000_sync_supabase_extra_tables), so a fresh `migrate deploy` failed.
-- Turn the index into the constraint when needed. No-op where the constraint already exists
-- or where the table has already been renamed to "team".
DO $$
BEGIN
  IF to_regclass('public.subcontractor') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcontractor_code_key')
     AND to_regclass('public.subcontractor_code_key') IS NOT NULL THEN
    ALTER TABLE "subcontractor" ADD CONSTRAINT "subcontractor_code_key" UNIQUE USING INDEX "subcontractor_code_key";
  END IF;
END $$;
