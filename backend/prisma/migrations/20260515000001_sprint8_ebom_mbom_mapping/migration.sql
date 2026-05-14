-- Sprint 8: eBOM ↔ mBOM Mapping
-- T-BE-1.1: Add product_kind to products
ALTER TABLE "products" ADD COLUMN "product_kind" VARCHAR(20);
CREATE INDEX "products_product_kind_product_type_name_idx" ON "products"("product_kind", "product_type", "name");

-- Backfill product_kind for pre-existing standard products
UPDATE "products" SET "product_kind" = 'assembly'
WHERE "product_type" = 'standard' AND "name" != 'Steel Structure';

-- Unique constraint: prevent duplicate custom products per project+kind+name
CREATE UNIQUE INDEX "idx_unique_custom_product_per_project"
  ON "products"("project_id", "product_kind", "name")
  WHERE "product_type" = 'custom';

-- T-BE-1.2: Add product mapping to bom_assembly
ALTER TABLE "bom_assembly" ADD COLUMN "product_id" INTEGER;
ALTER TABLE "bom_assembly" ADD COLUMN "match_status" VARCHAR(20);
ALTER TABLE "bom_assembly" ADD CONSTRAINT "bom_assembly_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "bom_assembly_product_id_idx" ON "bom_assembly"("product_id");

-- T-BE-1.3: Add product mapping to bom_part
ALTER TABLE "bom_part" ADD COLUMN "product_id" INTEGER;
ALTER TABLE "bom_part" ADD COLUMN "match_status" VARCHAR(20);
ALTER TABLE "bom_part" ADD CONSTRAINT "bom_part_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "bom_part_product_id_idx" ON "bom_part"("product_id");
