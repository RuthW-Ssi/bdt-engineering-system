-- ════════════════════════════════════════════════════════
-- Sprint 3 Manual SQL: CHECK constraints + triggers + indexes
-- Apply after: npx prisma migrate dev --name sprint3_bom_drawings
-- Run: docker exec -i bdt-postgres psql -U bdt -d bdt < prisma/migrations/20260428065130_sprint3_bom_drawings/manual.sql
-- ════════════════════════════════════════════════════════

-- ── BOM enums ─────────────────────────────────────────────────────
ALTER TABLE "product_bom" ADD CONSTRAINT "chk_bom_view"
  CHECK (bom_view IN ('eBOM','mBOM','sBOM'));

ALTER TABLE "product_bom" ADD CONSTRAINT "chk_bom_owner_role"
  CHECK (owner_role IN ('engineering','production','supply_chain'));

ALTER TABLE "product_bom" ADD CONSTRAINT "chk_bom_state"
  CHECK (state IN ('draft','active','obsolete'));

ALTER TABLE "product_bom" ADD CONSTRAINT "chk_bom_type"
  CHECK (bom_type IN ('normal','phantom','kit'));

-- ── BOM: only 1 active BOM per product per bom_view ──────────────
CREATE UNIQUE INDEX "idx_bom_one_active_per_view"
  ON "product_bom"(product_id, bom_view)
  WHERE state = 'active';

-- ── BOM line: exactly one of material_id / sub_product_id (XOR) ──
ALTER TABLE "product_bom_line" ADD CONSTRAINT "chk_bom_line_xor" CHECK (
  (material_id IS NOT NULL AND sub_product_id IS NULL)
  OR (material_id IS NULL AND sub_product_id IS NOT NULL)
);

-- Note: circular-ref detection (sub_product_id != parent product) is enforced
-- at the service layer (BomExplosionService visited-set) — not possible as CHECK constraint in PG.

-- ── BOM line: immutable when BOM is active or obsolete ───────────
CREATE OR REPLACE FUNCTION prevent_bom_line_change_on_locked_bom()
RETURNS TRIGGER AS $$
DECLARE
  bom_state VARCHAR(20);
BEGIN
  SELECT state INTO bom_state FROM product_bom
    WHERE id = COALESCE(NEW.bom_id, OLD.bom_id);
  IF bom_state IN ('active','obsolete') THEN
    RAISE EXCEPTION 'Cannot % lines of % BOM (state=%). Requires ECO (Sprint 4).',
      TG_OP, TG_OP, bom_state;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_bom_line_immutable_after_active"
  BEFORE INSERT OR UPDATE OR DELETE ON "product_bom_line"
  FOR EACH ROW EXECUTE FUNCTION prevent_bom_line_change_on_locked_bom();

-- ── Drawing enums ─────────────────────────────────────────────────
ALTER TABLE "shop_drawing" ADD CONSTRAINT "chk_drawing_type"
  CHECK (drawing_type IN ('master','project'));

ALTER TABLE "shop_drawing" ADD CONSTRAINT "chk_cad_source"
  CHECK (cad_source IN ('tekla','autocad','advance','other'));

ALTER TABLE "shop_drawing" ADD CONSTRAINT "chk_drawing_state"
  CHECK (state IN ('draft','in_review','approved','released','superseded','obsolete'));

-- master drawing has no project_id; project drawing requires project_id
ALTER TABLE "shop_drawing" ADD CONSTRAINT "chk_drawing_type_project" CHECK (
  (drawing_type = 'master' AND project_id IS NULL)
  OR (drawing_type = 'project' AND project_id IS NOT NULL)
);

-- ── Drawing revision constraints ──────────────────────────────────
-- Only one is_current=true per drawing
CREATE UNIQUE INDEX "idx_drawing_one_current_revision"
  ON "drawing_revision"(drawing_id)
  WHERE is_current = true;

-- File size cap: 50 MB
ALTER TABLE "drawing_revision" ADD CONSTRAINT "chk_file_size_max"
  CHECK (file_size_bytes IS NULL OR file_size_bytes <= 52428800);

-- Auto-set retention_until when drawing state changes to released
CREATE OR REPLACE FUNCTION set_retention_on_release()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.state = 'released' AND OLD.state != 'released' THEN
    NEW.retention_until := CURRENT_DATE + INTERVAL '7 years';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_drawing_retention"
  BEFORE UPDATE ON "shop_drawing"
  FOR EACH ROW EXECUTE FUNCTION set_retention_on_release();

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX "idx_bom_product"          ON "product_bom"(product_id);
CREATE INDEX "idx_bom_state"            ON "product_bom"(state) WHERE state IN ('draft','active');
CREATE INDEX "idx_bom_line_bom"         ON "product_bom_line"(bom_id);
CREATE INDEX "idx_bom_line_material"    ON "product_bom_line"(material_id) WHERE material_id IS NOT NULL;
CREATE INDEX "idx_bom_line_sub_product" ON "product_bom_line"(sub_product_id) WHERE sub_product_id IS NOT NULL;
CREATE INDEX "idx_drawing_product"      ON "shop_drawing"(product_id);
CREATE INDEX "idx_drawing_project"      ON "shop_drawing"(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX "idx_drawing_state"        ON "shop_drawing"(state) WHERE state != 'obsolete';
CREATE INDEX "idx_revision_drawing"     ON "drawing_revision"(drawing_id);
