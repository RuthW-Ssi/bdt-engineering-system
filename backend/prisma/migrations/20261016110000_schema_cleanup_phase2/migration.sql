-- Schema cleanup, phase 2 of 2 (2026-10-16): drop the columns phase 1 removed from schema.prisma.
-- Ship ONLY after phase 1's backend is live (it no longer selects these). Idempotent.
-- Backup of every value: ~/Documents/bdt-db-backups/schema-cleanup-2026-10-16/ (drawing APS 232 rows; the rest were empty or defaults).
ALTER TABLE "drawing"
  DROP COLUMN IF EXISTS "aps_urn",
  DROP COLUMN IF EXISTS "aps_translation_status",
  DROP COLUMN IF EXISTS "aps_translation_error";
ALTER TABLE "bom_dispatch"             DROP COLUMN IF EXISTS "welding_coverage_json";
ALTER TABLE "mrp_routing_workcenter"   DROP COLUMN IF EXISTS "routing_view";
ALTER TABLE "routing_formula_param"    DROP COLUMN IF EXISTS "applies_to_groups";
ALTER TABLE "routing_template_history" DROP COLUMN IF EXISTS "eco_id";
ALTER TABLE "products"
  DROP COLUMN IF EXISTS "procure_method",
  DROP COLUMN IF EXISTS "engineer_hours_act",
  DROP COLUMN IF EXISTS "promoted_from_id",
  DROP COLUMN IF EXISTS "promoted_date";
ALTER TABLE "res_partner"
  DROP COLUMN IF EXISTS "country_id",
  DROP COLUMN IF EXISTS "is_company",
  DROP COLUMN IF EXISTS "customer_rank";
ALTER TABLE "uom_uom"
  DROP COLUMN IF EXISTS "factor",
  DROP COLUMN IF EXISTS "uom_type";
