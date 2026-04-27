-- CreateTable
CREATE TABLE "res_users" (
    "id" SERIAL NOT NULL,
    "login" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "res_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uom_category" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,

    CONSTRAINT "uom_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uom_uom" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "factor" DECIMAL(12,6) NOT NULL DEFAULT 1,
    "uom_type" VARCHAR(10) NOT NULL DEFAULT 'reference',
    "rounding" DECIMAL(12,6) NOT NULL DEFAULT 0.01,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "odoo_ref_id" VARCHAR(40),

    CONSTRAINT "uom_uom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_account" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "account_type" VARCHAR(40) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "account_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_category" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "parent_id" INTEGER,
    "complete_name" VARCHAR(200),
    "group_no" VARCHAR(10),
    "prefix_5" CHAR(5),
    "account_id" INTEGER,
    "needs_criticality" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "odoo_ref_id" VARCHAR(40),

    CONSTRAINT "product_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" SERIAL NOT NULL,
    "default_code" CHAR(10) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description_sale" VARCHAR(200) NOT NULL,
    "categ_id" INTEGER NOT NULL,
    "uom_id" INTEGER NOT NULL,
    "uom_po_id" INTEGER,
    "type" VARCHAR(20) NOT NULL DEFAULT 'product',
    "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" VARCHAR(10),
    "substitute_for" INTEGER,
    "substitute_seq" SMALLINT,
    "priority" CHAR(1),
    "criticality" VARCHAR(2),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "drawing_ref" VARCHAR(60),
    "bim_object_id" VARCHAR(80),
    "total_weight_kg" DECIMAL(12,3),
    "odoo_ref_id" VARCHAR(40),
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_code_seq" (
    "prefix_5" CHAR(5) NOT NULL,
    "next_run" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "part_code_seq_pkey" PRIMARY KEY ("prefix_5")
);

-- CreateTable
CREATE TABLE "mail_message" (
    "id" BIGSERIAL NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "res_id" INTEGER NOT NULL,
    "message_type" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(200),
    "body" TEXT,
    "tracking" JSONB,
    "author_id" INTEGER,
    "date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" SERIAL NOT NULL,
    "project_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "customer_id" INTEGER,
    "start_date" DATE,
    "target_handover" DATE,
    "state" VARCHAR(20) NOT NULL DEFAULT 'lead',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "odoo_ref_id" VARCHAR(40),
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_zone" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "zone_type" VARCHAR(20) NOT NULL,
    "erection_sequence" INTEGER,
    "target_erection_start" DATE,
    "target_erection_end" DATE,
    "crane_assignment" VARCHAR(60),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "project_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mark_prefix_master" (
    "code" VARCHAR(10) NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "part_type_code" CHAR(1) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mark_prefix_master_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "tekla_prefix_mapping" (
    "tekla_type" VARCHAR(10) NOT NULL,
    "bdt_mark_prefix" VARCHAR(10) NOT NULL,
    "confidence" VARCHAR(10) NOT NULL,
    "source" VARCHAR(80),
    "notes" TEXT,

    CONSTRAINT "tekla_prefix_mapping_pkey" PRIMARY KEY ("tekla_type")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "product_code" VARCHAR(20) NOT NULL,
    "engineering_code" VARCHAR(20),
    "item_code" CHAR(10),
    "odoo_compliance_status" VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "name" VARCHAR(200) NOT NULL,
    "categ_id" INTEGER NOT NULL,
    "product_type" VARCHAR(20) NOT NULL,
    "odoo_type" VARCHAR(10) NOT NULL DEFAULT 'product',
    "procure_method" VARCHAR(20) NOT NULL DEFAULT 'make_to_order',
    "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sale_ok" BOOLEAN NOT NULL DEFAULT false,
    "purchase_ok" BOOLEAN NOT NULL DEFAULT false,
    "sales_price" DECIMAL(12,2) NOT NULL DEFAULT 1.0,
    "cost_raw_material" DECIMAL(12,2),
    "cost_transport" DECIMAL(12,2),
    "cost_production" DECIMAL(12,2),
    "cost_warehouse" DECIMAL(12,2),
    "master_drawing_id" INTEGER,
    "variant_attributes" JSONB,
    "stock_policy" VARCHAR(20),
    "reorder_min" DECIMAL(12,3),
    "reorder_max" DECIMAL(12,3),
    "project_id" INTEGER,
    "erection_zone_id" INTEGER,
    "mark_prefix" VARCHAR(10),
    "mark_number" VARCHAR(20),
    "shop_drawing_id" INTEGER,
    "revision" VARCHAR(10),
    "engineer_hours_est" DECIMAL(8,2),
    "engineer_hours_act" DECIMAL(8,2),
    "promoted_from_id" INTEGER,
    "promoted_date" TIMESTAMPTZ,
    "legacy_codes" TEXT[],
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "odoo_ref_id" VARCHAR(40),
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant" (
    "id" SERIAL NOT NULL,
    "parent_product_id" INTEGER NOT NULL,
    "variant_code" VARCHAR(40) NOT NULL,
    "attribute_values" JSONB NOT NULL,
    "cost_extra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_product_cost" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "project_id" INTEGER NOT NULL,
    "cost_raw_material" DECIMAL(12,2),
    "cost_transport" DECIMAL(12,2),
    "cost_production" DECIMAL(12,2),
    "cost_warehouse" DECIMAL(12,2),
    "variance_vs_standard" DECIMAL(8,4),
    "snapshotted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_product_cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_request" (
    "id" SERIAL NOT NULL,
    "source_custom_product_id" INTEGER NOT NULL,
    "target_standard_product_id" INTEGER,
    "requestor_id" INTEGER NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "promotion_mode" VARCHAR(20),
    "reason" TEXT,
    "reuse_evidence_count" INTEGER,
    "similar_product_ids" INTEGER[],
    "proposed_variant_matrix" JSONB,
    "proposed_standard_cost" JSONB,
    "proposed_sale_ok" BOOLEAN,
    "proposed_purchase_ok" BOOLEAN,
    "cost_reviewer_id" INTEGER,
    "cost_reviewed_at" TIMESTAMPTZ,
    "approver_id" INTEGER,
    "approved_at" TIMESTAMPTZ,
    "done_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "steel_grade" (
    "code" VARCHAR(20) NOT NULL,
    "standard" VARCHAR(20),
    "yield_mpa" DECIMAL(6,1),
    "tensile_mpa" DECIMAL(6,1),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "steel_grade_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "res_users_login_key" ON "res_users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "account_account_code_key" ON "account_account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_category_prefix_5_key" ON "product_category"("prefix_5");

-- CreateIndex
CREATE UNIQUE INDEX "materials_default_code_key" ON "materials"("default_code");

-- CreateIndex
CREATE INDEX "mail_message_model_res_id_idx" ON "mail_message"("model", "res_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_project_code_key" ON "project"("project_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_zone_project_id_code_key" ON "project_zone"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "products_product_code_key" ON "products"("product_code");

-- CreateIndex
CREATE UNIQUE INDEX "products_engineering_code_key" ON "products"("engineering_code");

-- CreateIndex
CREATE UNIQUE INDEX "products_item_code_key" ON "products"("item_code");

-- CreateIndex
CREATE UNIQUE INDEX "product_variant_variant_code_key" ON "product_variant"("variant_code");

-- CreateIndex
CREATE UNIQUE INDEX "project_product_cost_product_id_project_id_key" ON "project_product_cost"("product_id", "project_id");

-- AddForeignKey
ALTER TABLE "uom_uom" ADD CONSTRAINT "uom_uom_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "uom_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_categ_id_fkey" FOREIGN KEY ("categ_id") REFERENCES "product_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uom_uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_uom_po_id_fkey" FOREIGN KEY ("uom_po_id") REFERENCES "uom_uom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_substitute_for_fkey" FOREIGN KEY ("substitute_for") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_message" ADD CONSTRAINT "mail_message_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "res_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_zone" ADD CONSTRAINT "project_zone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tekla_prefix_mapping" ADD CONSTRAINT "tekla_prefix_mapping_bdt_mark_prefix_fkey" FOREIGN KEY ("bdt_mark_prefix") REFERENCES "mark_prefix_master"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categ_id_fkey" FOREIGN KEY ("categ_id") REFERENCES "product_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_erection_zone_id_fkey" FOREIGN KEY ("erection_zone_id") REFERENCES "project_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_mark_prefix_fkey" FOREIGN KEY ("mark_prefix") REFERENCES "mark_prefix_master"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_promoted_from_id_fkey" FOREIGN KEY ("promoted_from_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_product_cost" ADD CONSTRAINT "project_product_cost_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_product_cost" ADD CONSTRAINT "project_product_cost_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_request" ADD CONSTRAINT "promotion_request_source_custom_product_id_fkey" FOREIGN KEY ("source_custom_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_request" ADD CONSTRAINT "promotion_request_target_standard_product_id_fkey" FOREIGN KEY ("target_standard_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
