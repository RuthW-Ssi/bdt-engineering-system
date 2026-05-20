-- Move spec presets from product_template (T1.x) → products (engineer catalog)
ALTER TABLE "product_template"
  DROP COLUMN IF EXISTS "default_paint_spec",
  DROP COLUMN IF EXISTS "default_welding_spec";

ALTER TABLE "products"
  ADD COLUMN "default_paint_spec"   JSONB,
  ADD COLUMN "default_welding_spec" JSONB;
