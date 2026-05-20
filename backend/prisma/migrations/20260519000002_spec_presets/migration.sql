-- ProductTemplate: paint and welding spec presets
ALTER TABLE "product_template"
  ADD COLUMN "default_paint_spec"   JSONB,
  ADD COLUMN "default_welding_spec" JSONB;

-- Welding config: per-assembly weld parameters (override template defaults)
ALTER TABLE "dispatch_assembly_welding_config"
  ADD COLUMN "fillet_mm"   DECIMAL(4,1),
  ADD COLUMN "sides"       INTEGER,
  ADD COLUMN "weld_layers" INTEGER;
