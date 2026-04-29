-- Sprint 4.2: Routing Option 3 — Hybrid Template + Override + Custom
-- Migrates from per-product-clone schema to shared template + sparse override model.

-- ─────────────────────────────────────────────────────────────────
-- Step 1: Modify products table
--   DROP active_routing_id (replaced by routing_template_id)
--   ADD routing_template_id, has_custom_routing
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "products" DROP COLUMN IF EXISTS "active_routing_id";
ALTER TABLE "products" ADD COLUMN "routing_template_id" INTEGER;
ALTER TABLE "products" ADD COLUMN "has_custom_routing" BOOLEAN NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────
-- Step 2: Modify mrp_routing_workcenter
--   DROP product_id, routing_template (string)
--   ADD template_id FK (NOT NULL — migration safe because table is empty after reset)
-- ─────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "mrp_routing_workcenter_product_id_idx";
DROP INDEX IF EXISTS "mrp_routing_workcenter_routing_template_idx";
ALTER TABLE "mrp_routing_workcenter" DROP CONSTRAINT IF EXISTS "ux_routing_op_seq_per_product";
ALTER TABLE "mrp_routing_workcenter" DROP COLUMN IF EXISTS "product_id";
ALTER TABLE "mrp_routing_workcenter" DROP COLUMN IF EXISTS "routing_template";
ALTER TABLE "mrp_routing_workcenter" DROP COLUMN IF EXISTS "state";
ALTER TABLE "mrp_routing_workcenter" ADD COLUMN "template_id" INTEGER NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- Step 3: Drop routing_step_activity (replaced by routing_op_activity + product_routing_override)
-- ─────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "routing_step_activity";

-- ─────────────────────────────────────────────────────────────────
-- Step 4: Create routing_template
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "routing_template" (
    "id"                      SERIAL PRIMARY KEY,
    "code"                    VARCHAR(20) NOT NULL,
    "name"                    VARCHAR(60) NOT NULL,
    "description"             TEXT,
    "version"                 VARCHAR(10) NOT NULL DEFAULT '1.0',
    "state"                   VARCHAR(20) NOT NULL DEFAULT 'active',
    "active"                  BOOLEAN NOT NULL DEFAULT true,
    "applies_to_product_type" VARCHAR(20),
    "applies_to_categ_id"     INTEGER,
    "create_uid"              INTEGER NOT NULL,
    "create_date"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "write_uid"               INTEGER NOT NULL,
    "write_date"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "routing_template_code_key" ON "routing_template"("code");
CREATE INDEX "routing_template_state_idx"      ON "routing_template"("state");

ALTER TABLE "routing_template" ADD CONSTRAINT "routing_template_applies_to_categ_id_fkey"
    FOREIGN KEY ("applies_to_categ_id") REFERENCES "product_category"("id") ON DELETE SET NULL;
ALTER TABLE "routing_template" ADD CONSTRAINT "routing_template_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id");
ALTER TABLE "routing_template" ADD CONSTRAINT "routing_template_write_uid_fkey"
    FOREIGN KEY ("write_uid") REFERENCES "res_users"("id");

-- ─────────────────────────────────────────────────────────────────
-- Step 5: Add FK on mrp_routing_workcenter.template_id + new unique index
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "mrp_routing_workcenter" ADD CONSTRAINT "mrp_routing_workcenter_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "routing_template"("id") ON DELETE CASCADE;
CREATE INDEX "mrp_routing_workcenter_template_id_idx" ON "mrp_routing_workcenter"("template_id");
CREATE UNIQUE INDEX "ux_routing_op_seq_per_template" ON "mrp_routing_workcenter"("template_id", "sequence");

-- ─────────────────────────────────────────────────────────────────
-- Step 6: Add FK on products.routing_template_id
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "products" ADD CONSTRAINT "products_routing_template_id_fkey"
    FOREIGN KEY ("routing_template_id") REFERENCES "routing_template"("id") ON DELETE SET NULL;
CREATE INDEX "products_routing_template_id_idx" ON "products"("routing_template_id");

-- ─────────────────────────────────────────────────────────────────
-- Step 7: Create routing_op_activity (junction: template op → activity template)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "routing_op_activity" (
    "id"                    SERIAL PRIMARY KEY,
    "routing_workcenter_id" INTEGER NOT NULL,
    "activity_template_id"  INTEGER NOT NULL,
    "sequence"              INTEGER NOT NULL DEFAULT 10
);
CREATE UNIQUE INDEX "routing_op_activity_rwc_seq_key"    ON "routing_op_activity"("routing_workcenter_id", "sequence");
CREATE        INDEX "routing_op_activity_act_tmpl_idx"   ON "routing_op_activity"("activity_template_id");
ALTER TABLE "routing_op_activity" ADD CONSTRAINT "routing_op_activity_routing_workcenter_id_fkey"
    FOREIGN KEY ("routing_workcenter_id") REFERENCES "mrp_routing_workcenter"("id") ON DELETE CASCADE;
ALTER TABLE "routing_op_activity" ADD CONSTRAINT "routing_op_activity_activity_template_id_fkey"
    FOREIGN KEY ("activity_template_id") REFERENCES "routing_activity_template"("id");

-- ─────────────────────────────────────────────────────────────────
-- Step 8: Create product_routing_override (sparse per-product override)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "product_routing_override" (
    "id"                     SERIAL PRIMARY KEY,
    "product_id"             INTEGER NOT NULL,
    "activity_template_id"   INTEGER NOT NULL,
    "override_per_minute"    DECIMAL(10,4),
    "override_std_measure"   DECIMAL(12,4),
    "override_manpower"      DECIMAL(4,2),
    "override_workcenter_id" INTEGER,
    "reason"                 TEXT,
    "eco_id"                 INTEGER,
    "create_uid"             INTEGER NOT NULL,
    "create_date"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "write_uid"              INTEGER NOT NULL,
    "write_date"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "ux_one_override_per_pair"           ON "product_routing_override"("product_id", "activity_template_id");
CREATE        INDEX "product_routing_override_prod_idx"  ON "product_routing_override"("product_id");
CREATE        INDEX "product_routing_override_act_idx"   ON "product_routing_override"("activity_template_id");
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_activity_template_id_fkey"
    FOREIGN KEY ("activity_template_id") REFERENCES "routing_activity_template"("id");
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_override_workcenter_id_fkey"
    FOREIGN KEY ("override_workcenter_id") REFERENCES "mrp_workcenter"("id") ON DELETE SET NULL;
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id");
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_write_uid_fkey"
    FOREIGN KEY ("write_uid") REFERENCES "res_users"("id");

-- ─────────────────────────────────────────────────────────────────
-- Step 9: Create custom_routing (escape hatch for Class C products)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "custom_routing" (
    "id"                      SERIAL PRIMARY KEY,
    "product_id"              INTEGER NOT NULL,
    "name"                    VARCHAR(60) NOT NULL,
    "description"             TEXT,
    "version"                 VARCHAR(10) NOT NULL DEFAULT '1.0',
    "state"                   VARCHAR(20) NOT NULL DEFAULT 'draft',
    "cloned_from_template_id" INTEGER,
    "eco_id"                  INTEGER,
    "create_uid"              INTEGER NOT NULL,
    "create_date"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "write_uid"               INTEGER NOT NULL,
    "write_date"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "custom_routing_product_id_key"        ON "custom_routing"("product_id");
CREATE UNIQUE INDEX "ux_active_custom_routing"             ON "custom_routing"("product_id") WHERE state = 'active';
CREATE        INDEX "custom_routing_template_idx"          ON "custom_routing"("cloned_from_template_id");
CREATE        INDEX "custom_routing_state_idx"             ON "custom_routing"("state");
ALTER TABLE "custom_routing" ADD CONSTRAINT "custom_routing_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
ALTER TABLE "custom_routing" ADD CONSTRAINT "custom_routing_cloned_from_template_id_fkey"
    FOREIGN KEY ("cloned_from_template_id") REFERENCES "routing_template"("id") ON DELETE SET NULL;
ALTER TABLE "custom_routing" ADD CONSTRAINT "custom_routing_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id");
ALTER TABLE "custom_routing" ADD CONSTRAINT "custom_routing_write_uid_fkey"
    FOREIGN KEY ("write_uid") REFERENCES "res_users"("id");

-- ─────────────────────────────────────────────────────────────────
-- Step 10: Create custom_routing_op
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "custom_routing_op" (
    "id"                SERIAL PRIMARY KEY,
    "custom_routing_id" INTEGER NOT NULL,
    "sequence"          INTEGER NOT NULL,
    "name"              VARCHAR(60) NOT NULL,
    "op_code"           VARCHAR(30) NOT NULL,
    "workcenter_id"     INTEGER NOT NULL,
    "time_mode"         VARCHAR(10) NOT NULL DEFAULT 'formula',
    "time_cycle_manual" DECIMAL(10,4),
    "blocked_by_op_ids" INTEGER[] NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX "custom_routing_op_seq_key" ON "custom_routing_op"("custom_routing_id", "sequence");
CREATE        INDEX "custom_routing_op_wc_idx"  ON "custom_routing_op"("workcenter_id");
ALTER TABLE "custom_routing_op" ADD CONSTRAINT "custom_routing_op_custom_routing_id_fkey"
    FOREIGN KEY ("custom_routing_id") REFERENCES "custom_routing"("id") ON DELETE CASCADE;
ALTER TABLE "custom_routing_op" ADD CONSTRAINT "custom_routing_op_workcenter_id_fkey"
    FOREIGN KEY ("workcenter_id") REFERENCES "mrp_workcenter"("id");

-- ─────────────────────────────────────────────────────────────────
-- Step 11: Create custom_routing_activity
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "custom_routing_activity" (
    "id"                  SERIAL PRIMARY KEY,
    "op_id"               INTEGER NOT NULL,
    "sequence"            INTEGER NOT NULL DEFAULT 10,
    "description"         VARCHAR(200) NOT NULL,
    "include_idle"        BOOLEAN NOT NULL DEFAULT false,
    "per_minute"          DECIMAL(10,4) NOT NULL,
    "formula_param_code"  VARCHAR(40) NOT NULL,
    "std_measure"         DECIMAL(12,4) NOT NULL,
    "unit"                VARCHAR(20) NOT NULL,
    "formula_param_code2" VARCHAR(40),
    "std_measure2"        DECIMAL(12,4),
    "unit2"               VARCHAR(20),
    "manpower"            DECIMAL(4,2) NOT NULL DEFAULT 1,
    "workcenter_id"       INTEGER NOT NULL,
    "equipment_ref"       VARCHAR(120),
    "consumable_note"     VARCHAR(200),
    "utilities_note"      VARCHAR(40)
);
CREATE UNIQUE INDEX "custom_routing_activity_seq_key" ON "custom_routing_activity"("op_id", "sequence");
CREATE        INDEX "custom_routing_activity_wc_idx"  ON "custom_routing_activity"("workcenter_id");
ALTER TABLE "custom_routing_activity" ADD CONSTRAINT "custom_routing_activity_op_id_fkey"
    FOREIGN KEY ("op_id") REFERENCES "custom_routing_op"("id") ON DELETE CASCADE;
ALTER TABLE "custom_routing_activity" ADD CONSTRAINT "custom_routing_activity_formula_param_code_fkey"
    FOREIGN KEY ("formula_param_code") REFERENCES "routing_formula_param"("code");
ALTER TABLE "custom_routing_activity" ADD CONSTRAINT "custom_routing_activity_formula_param_code2_fkey"
    FOREIGN KEY ("formula_param_code2") REFERENCES "routing_formula_param"("code");
ALTER TABLE "custom_routing_activity" ADD CONSTRAINT "custom_routing_activity_workcenter_id_fkey"
    FOREIGN KEY ("workcenter_id") REFERENCES "mrp_workcenter"("id");

-- ─────────────────────────────────────────────────────────────────
-- Step 12: Create routing_template_binding_rule
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE "routing_template_binding_rule" (
    "id"                  SERIAL PRIMARY KEY,
    "priority"            INTEGER NOT NULL DEFAULT 100,
    "description"         TEXT,
    "match_product_type"  VARCHAR(20),
    "match_mark_prefix"   VARCHAR(10),
    "match_categ_id"      INTEGER,
    "match_attr_path"     VARCHAR(60),
    "match_attr_value"    VARCHAR(60),
    "routing_template_id" INTEGER NOT NULL,
    "active"              BOOLEAN NOT NULL DEFAULT true,
    "create_uid"          INTEGER NOT NULL DEFAULT 1,
    "create_date"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "write_uid"           INTEGER NOT NULL DEFAULT 1,
    "write_date"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "routing_template_binding_rule_priority_idx" ON "routing_template_binding_rule"("priority", "active");
CREATE INDEX "routing_template_binding_rule_tmpl_idx"     ON "routing_template_binding_rule"("routing_template_id");
ALTER TABLE "routing_template_binding_rule" ADD CONSTRAINT "routing_template_binding_rule_routing_template_id_fkey"
    FOREIGN KEY ("routing_template_id") REFERENCES "routing_template"("id");

-- ─────────────────────────────────────────────────────────────────
-- Step 13: XOR constraint on products
--   products must be in one of 3 states:
--     a) Unbound: routing_template_id IS NULL AND has_custom_routing = false (new product, not yet bound)
--     b) Template-bound: routing_template_id IS NOT NULL AND has_custom_routing = false
--     c) Custom routing: routing_template_id IS NULL AND has_custom_routing = true
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "products" ADD CONSTRAINT "ck_routing_xor" CHECK (
    (has_custom_routing = false) OR
    (has_custom_routing = true AND routing_template_id IS NULL)
);
