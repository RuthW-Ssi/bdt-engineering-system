-- Replace (project_id, product_kind, name) unique constraint on custom products
-- with (project_id, erection_zone_id, mark_prefix, mark_number) which correctly
-- reflects that each mark is unique within a project/zone, not each name.

DROP INDEX IF EXISTS "idx_unique_custom_product_per_project";

CREATE UNIQUE INDEX "idx_unique_custom_mark_per_zone"
  ON "products" (project_id, erection_zone_id, mark_prefix, mark_number)
  WHERE product_type = 'custom'
    AND mark_prefix IS NOT NULL
    AND mark_number IS NOT NULL;
