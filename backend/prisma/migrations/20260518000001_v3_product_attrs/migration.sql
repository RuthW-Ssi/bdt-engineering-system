-- Sprint 10 Track B: Product Library V3 — add derivation columns + GIN index + extend match_status

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS derivation_flags JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS confidence       VARCHAR(10) NOT NULL DEFAULT 'high';

-- GIN index for JSONB attribute queries (e.g. WHERE variant_attributes @> '{"shape":"H"}')
CREATE INDEX IF NOT EXISTS idx_products_variant_attrs ON products USING GIN (variant_attributes);

-- Extend bom_assembly.match_status CHECK to include V3 values (preserves legacy values)
ALTER TABLE bom_assembly DROP CONSTRAINT IF EXISTS chk_match_status;
ALTER TABLE bom_assembly ADD CONSTRAINT chk_match_status
  CHECK (match_status IN (
    'MATCHED_STANDARD', 'MATCHED_CUSTOM', 'AUTO_CREATED',
    'auto_high_conf', 'auto_verify', 'needs_review', 'unmatched'
  ));
