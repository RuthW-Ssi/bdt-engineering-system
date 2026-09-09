-- BIM-first progress entry (2026-09) — distinguishes INACTIVE-by-user-delete
-- (deletePlaceholderAssembly, restorable) from INACTIVE-by-reconciliation
-- (carryForwardProgress matched this placeholder into a real BOM upload —
-- not restorable, since its progress already lives under a different, real
-- assembly_id). Always false for non-placeholder (real BOM) rows.
ALTER TABLE "bom_assembly" ADD COLUMN "deleted_by_user" BOOLEAN NOT NULL DEFAULT false;
