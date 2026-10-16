-- Schema cleanup, phase 1 of 2 (2026-10-16). Audit + scope: wiki tech/testing/per-feature/schema-cleanup-20261016.
-- Only objects no code reads; everything the prod-scheduler plans to use is left alone (next task).
-- Idempotent (IF [NOT] EXISTS) so it runs on Supabase, local and fresh DBs.
-- Columns removed from schema.prisma in this release are dropped in phase 2, once the backend that
-- no longer selects them is live (Supabase is shared by staging + main).
-- Backup of every dropped value: ~/Documents/bdt-db-backups/schema-cleanup-2026-10-16/ (taken from Supabase).

-- Views over materials that nothing queries.
DROP VIEW IF EXISTS "v_material_consumable";
DROP VIEW IF EXISTS "v_material_product";
DROP VIEW IF EXISTS "v_material_service";

-- Trigger functions that write into tables dropped long ago (no trigger uses them).
DROP FUNCTION IF EXISTS "trg_product_routing_override_delete_fn"();
DROP FUNCTION IF EXISTS "trg_product_routing_override_update_fn"();
DROP FUNCTION IF EXISTS "trg_routing_activity_template_history_fn"();

-- Formula code counter that nothing reads.
DROP TABLE IF EXISTS "formula_code_seq";

-- Drift: routing_formula_param.name / process_category / tags exist on Supabase outside migrations
-- (name is read by activities.service.ts raw SQL); `active` is in old migrations but gone from Supabase.
ALTER TABLE "routing_formula_param" ADD COLUMN IF NOT EXISTS "name" VARCHAR;
ALTER TABLE "routing_formula_param" ADD COLUMN IF NOT EXISTS "process_category" VARCHAR;
ALTER TABLE "routing_formula_param" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}';
UPDATE "routing_formula_param" SET "tags" = '{}' WHERE "tags" IS NULL; -- Prisma lists are non-null (none on Supabase, 2026-10-16)
ALTER TABLE "routing_formula_param" ALTER COLUMN "tags" SET NOT NULL;
ALTER TABLE "routing_formula_param" DROP COLUMN IF EXISTS "active";
