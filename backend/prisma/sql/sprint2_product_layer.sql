-- Sprint 2: Product Layer — manual SQL (applied after Prisma migration)
-- Run: npx prisma db execute --file prisma/sql/sprint2_product_layer.sql

-- ── Computed standard_cost_total (rolled up from 4 components) ──
ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "standard_cost_total" NUMERIC(12,2)
  GENERATED ALWAYS AS (
    COALESCE(cost_raw_material,0) + COALESCE(cost_transport,0)
    + COALESCE(cost_production,0) + COALESCE(cost_warehouse,0)
  ) STORED;

ALTER TABLE "project_product_cost"
  ADD COLUMN IF NOT EXISTS "cost_total" NUMERIC(12,2)
  GENERATED ALWAYS AS (
    COALESCE(cost_raw_material,0) + COALESCE(cost_transport,0)
    + COALESCE(cost_production,0) + COALESCE(cost_warehouse,0)
  ) STORED;

-- ── product_code_seq counter (concurrency-safe — F4 PD-02) ──
CREATE TABLE IF NOT EXISTS "product_code_seq" (
  "kind"     CHAR(3) PRIMARY KEY,
  "next_run" INT NOT NULL DEFAULT 1
);
INSERT INTO "product_code_seq"(kind, next_run)
VALUES ('STD', 1), ('CUS', 1)
ON CONFLICT (kind) DO NOTHING;

-- ── CHECK: product_type fields (PD-28) ──
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "chk_product_type_fields" CHECK (
    (product_type = 'standard'
      AND project_id IS NULL AND erection_zone_id IS NULL
      AND mark_prefix IS NULL AND mark_number IS NULL)
    OR
    (product_type = 'custom'
      AND project_id IS NOT NULL AND mark_prefix IS NOT NULL AND mark_number IS NOT NULL
      AND master_drawing_id IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─��� CHECK: product_code prefix matches type ──
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "chk_product_code_prefix" CHECK (
    (product_type = 'standard' AND product_code LIKE 'STD-%')
    OR (product_type = 'custom' AND product_code LIKE 'CUS-%')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── CHECK: item_code required when commercial (PD-28) ──
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "chk_item_code_required" CHECK (
    product_type = 'custom'
    OR (sale_ok = false AND purchase_ok = false)
    OR item_code IS NOT NULL
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── CHECK: item_code = exactly 10 chars when present ──
DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "chk_item_code_length" CHECK (
    item_code IS NULL OR LENGTH(item_code) = 10
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── UNIQUE: custom mark within (project, zone) ──
CREATE UNIQUE INDEX IF NOT EXISTS "idx_custom_mark_per_project_zone"
  ON "products"(project_id, COALESCE(erection_zone_id, 0), mark_prefix, mark_number)
  WHERE product_type = 'custom';

-- ── GIN: legacy_codes array search ──
CREATE INDEX IF NOT EXISTS "idx_products_legacy"
  ON "products" USING GIN (legacy_codes);

-- ── Trigger: prevent mark_prefix/number change after release (PD-23 F15 layer 4) ──
CREATE OR REPLACE FUNCTION prevent_mark_change_after_release()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state IN ('released','obsolete')
     AND (OLD.mark_prefix IS DISTINCT FROM NEW.mark_prefix
          OR OLD.mark_number IS DISTINCT FROM NEW.mark_number) THEN
    RAISE EXCEPTION 'mark_prefix/number cannot change after release (state=%)', OLD.state;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_mark_immutable" ON "products";
CREATE TRIGGER "trg_mark_immutable"
  BEFORE UPDATE ON "products"
  FOR EACH ROW EXECUTE FUNCTION prevent_mark_change_after_release();

-- ── Performance indexes ──
CREATE INDEX IF NOT EXISTS "idx_products_categ"     ON "products"(categ_id);
CREATE INDEX IF NOT EXISTS "idx_products_state"     ON "products"(state) WHERE active;
CREATE INDEX IF NOT EXISTS "idx_products_project"   ON "products"(project_id) WHERE product_type = 'custom';
CREATE INDEX IF NOT EXISTS "idx_products_attr_gin"  ON "products" USING GIN (attributes);
CREATE INDEX IF NOT EXISTS "idx_products_promoted"  ON "products"(promoted_from_id) WHERE promoted_from_id IS NOT NULL;
