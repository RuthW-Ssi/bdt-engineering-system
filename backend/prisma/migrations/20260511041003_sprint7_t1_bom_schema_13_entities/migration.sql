-- CreateEnum
CREATE TYPE "DispatchState" AS ENUM ('draft', 'released', 'superseded');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('DISPATCH_NOTE', 'ASSEMBLY_LIST', 'ASSEMBLY_PART_LIST', 'PART_LIST');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('BASE', 'VO', 'FIX');

-- CreateEnum
CREATE TYPE "LineStatus" AS ENUM ('add', 'update', 'delete');

-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('PL', 'L', 'H', 'C', 'CHS', 'PIPE', 'RHS', 'SHS', 'ROD');

-- CreateEnum
CREATE TYPE "TemplateState" AS ENUM ('draft', 'active', 'deprecated');

-- CreateEnum
CREATE TYPE "StdProductState" AS ENUM ('active', 'obsolete');

-- CreateTable
CREATE TABLE "bom_category" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "name_th" VARCHAR(80),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bom_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_project" (
    "id" TEXT NOT NULL,
    "contract_no" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "customer_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bom_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_zone" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bom_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch" (
    "id" TEXT NOT NULL,
    "dispatch_no" VARCHAR(40) NOT NULL,
    "project_id" TEXT NOT NULL,
    "zone_id" TEXT,
    "category_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "state" "DispatchState" NOT NULL DEFAULT 'draft',
    "superseded_by" TEXT,
    "issued_at" DATE,
    "author_name" VARCHAR(200),
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_revision" (
    "id" TEXT NOT NULL,
    "dispatch_id" TEXT NOT NULL,
    "doc_type" "DocType" NOT NULL,
    "rev_no" INTEGER NOT NULL DEFAULT 0,
    "change_type" "ChangeType" NOT NULL DEFAULT 'BASE',
    "rev_tag" VARCHAR(40),
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "file_storage_id" TEXT,
    "uploaded_at" TIMESTAMPTZ,
    "uploaded_by" VARCHAR(200),
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "doc_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly" (
    "id" TEXT NOT NULL,
    "doc_revision_id" TEXT NOT NULL,
    "assembly_mark" VARCHAR(80) NOT NULL,
    "assembly_full_mark" VARCHAR(120),
    "name" VARCHAR(80),
    "drawing_number" VARCHAR(40),
    "weight_kg" DECIMAL(12,3),
    "paint_area_m2" DECIMAL(10,4),
    "length_mm" DECIMAL(10,1),
    "width_mm" DECIMAL(10,1),
    "height_mm" DECIMAL(10,1),
    "qty" INTEGER,
    "qty_all" INTEGER,
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_line" (
    "id" TEXT NOT NULL,
    "doc_revision_id" TEXT NOT NULL,
    "assembly_id" TEXT NOT NULL,
    "status" "LineStatus" NOT NULL DEFAULT 'add',
    "remark" TEXT,
    "paint_type" VARCHAR(80),
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dispatch_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assembly_part" (
    "id" TEXT NOT NULL,
    "doc_revision_id" TEXT NOT NULL,
    "assembly_id" TEXT NOT NULL,
    "part_id" TEXT NOT NULL,
    "qty" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "assembly_part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part" (
    "id" TEXT NOT NULL,
    "doc_revision_id" TEXT NOT NULL,
    "part_mark" VARCHAR(60) NOT NULL,
    "template_id" TEXT NOT NULL,
    "attribute_values" JSONB NOT NULL,
    "grade_id" TEXT,
    "std_product_id" TEXT,
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_doc_revision" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "rev_no" INTEGER NOT NULL DEFAULT 0,
    "change_type" "ChangeType" NOT NULL DEFAULT 'BASE',
    "rev_tag" VARCHAR(40),
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "file_storage_id" TEXT,
    "uploaded_at" TIMESTAMPTZ,
    "uploaded_by" VARCHAR(200),
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "material_doc_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_line" (
    "id" TEXT NOT NULL,
    "material_doc_rev_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "attribute_values" JSONB NOT NULL,
    "grade_id" TEXT,
    "std_product_id" TEXT,
    "create_uid" INTEGER,
    "write_uid" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "material_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_template" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "prefix" VARCHAR(20) NOT NULL,
    "section_type" "SectionType" NOT NULL,
    "name_en" VARCHAR(80) NOT NULL,
    "name_th" VARCHAR(80),
    "attribute_schema" JSONB NOT NULL,
    "profile_aliases" JSONB,
    "parser_regex" VARCHAR(500),
    "state" "TemplateState" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_grade" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "standard" VARCHAR(20),
    "yield_mpa" DECIMAL(6,1),
    "tensile_mpa" DECIMAL(6,1),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bom_grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "std_product" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "template_id" TEXT NOT NULL,
    "attribute_values" JSONB NOT NULL,
    "grade_id" TEXT NOT NULL,
    "unit_weight_kg" DECIMAL(12,3),
    "stock_uom" VARCHAR(20),
    "cost_raw_material" DECIMAL(12,2),
    "cost_transport" DECIMAL(12,2),
    "cost_production" DECIMAL(12,2),
    "cost_warehouse" DECIMAL(12,2),
    "legacy_codes" TEXT[],
    "state" "StdProductState" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "std_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_mark_prefix" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "description" VARCHAR(80),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bom_mark_prefix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_storage" (
    "id" TEXT NOT NULL,
    "original_filename" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(20) NOT NULL,
    "file_size" BIGINT,
    "gcs_uri" VARCHAR(1000) NOT NULL,
    "checksum_md5" VARCHAR(32),
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" VARCHAR(200),

    CONSTRAINT "file_storage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bom_category_code_key" ON "bom_category"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bom_project_contract_no_key" ON "bom_project"("contract_no");

-- CreateIndex
CREATE UNIQUE INDEX "bom_zone_project_id_code_key" ON "bom_zone"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_dispatch_no_key" ON "dispatch"("dispatch_no");

-- CreateIndex
CREATE INDEX "doc_revision_dispatch_id_idx" ON "doc_revision"("dispatch_id");

-- CreateIndex
CREATE INDEX "doc_revision_dispatch_id_doc_type_is_current_idx" ON "doc_revision"("dispatch_id", "doc_type", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "doc_revision_dispatch_id_doc_type_rev_no_key" ON "doc_revision"("dispatch_id", "doc_type", "rev_no");

-- CreateIndex
CREATE INDEX "assembly_doc_revision_id_idx" ON "assembly"("doc_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_line_assembly_id_key" ON "dispatch_line"("assembly_id");

-- CreateIndex
CREATE INDEX "dispatch_line_doc_revision_id_idx" ON "dispatch_line"("doc_revision_id");

-- CreateIndex
CREATE INDEX "assembly_part_assembly_id_idx" ON "assembly_part"("assembly_id");

-- CreateIndex
CREATE INDEX "assembly_part_part_id_idx" ON "assembly_part"("part_id");

-- CreateIndex
CREATE UNIQUE INDEX "assembly_part_doc_revision_id_assembly_id_part_id_key" ON "assembly_part"("doc_revision_id", "assembly_id", "part_id");

-- CreateIndex
CREATE INDEX "part_doc_revision_id_idx" ON "part"("doc_revision_id");

-- CreateIndex
CREATE INDEX "part_template_id_idx" ON "part"("template_id");

-- CreateIndex
CREATE INDEX "part_grade_id_idx" ON "part"("grade_id");

-- CreateIndex
CREATE INDEX "part_attribute_values_idx" ON "part" USING GIN ("attribute_values");

-- CreateIndex
CREATE INDEX "material_doc_revision_zone_id_is_current_idx" ON "material_doc_revision"("zone_id", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "material_doc_revision_zone_id_rev_no_key" ON "material_doc_revision"("zone_id", "rev_no");

-- CreateIndex
CREATE INDEX "material_line_material_doc_rev_id_idx" ON "material_line"("material_doc_rev_id");

-- CreateIndex
CREATE INDEX "material_line_template_id_idx" ON "material_line"("template_id");

-- CreateIndex
CREATE INDEX "material_line_grade_id_idx" ON "material_line"("grade_id");

-- CreateIndex
CREATE INDEX "material_line_attribute_values_idx" ON "material_line" USING GIN ("attribute_values");

-- CreateIndex
CREATE UNIQUE INDEX "product_template_code_key" ON "product_template"("code");

-- CreateIndex
CREATE INDEX "product_template_attribute_schema_idx" ON "product_template" USING GIN ("attribute_schema");

-- CreateIndex
CREATE INDEX "product_template_profile_aliases_idx" ON "product_template" USING GIN ("profile_aliases");

-- CreateIndex
CREATE UNIQUE INDEX "bom_grade_code_key" ON "bom_grade"("code");

-- CreateIndex
CREATE UNIQUE INDEX "std_product_code_key" ON "std_product"("code");

-- CreateIndex
CREATE INDEX "std_product_template_id_grade_id_idx" ON "std_product"("template_id", "grade_id");

-- CreateIndex
CREATE INDEX "std_product_attribute_values_idx" ON "std_product" USING GIN ("attribute_values");

-- CreateIndex
CREATE UNIQUE INDEX "bom_mark_prefix_code_key" ON "bom_mark_prefix"("code");

-- CreateIndex
CREATE UNIQUE INDEX "file_storage_gcs_uri_key" ON "file_storage"("gcs_uri");

-- AddForeignKey
ALTER TABLE "bom_project" ADD CONSTRAINT "bom_project_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "res_partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_zone" ADD CONSTRAINT "bom_zone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "bom_project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "bom_project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "bom_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "bom_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch" ADD CONSTRAINT "dispatch_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_revision" ADD CONSTRAINT "doc_revision_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_revision" ADD CONSTRAINT "doc_revision_file_storage_id_fkey" FOREIGN KEY ("file_storage_id") REFERENCES "file_storage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly" ADD CONSTRAINT "assembly_doc_revision_id_fkey" FOREIGN KEY ("doc_revision_id") REFERENCES "doc_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_line" ADD CONSTRAINT "dispatch_line_doc_revision_id_fkey" FOREIGN KEY ("doc_revision_id") REFERENCES "doc_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_line" ADD CONSTRAINT "dispatch_line_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_part" ADD CONSTRAINT "assembly_part_doc_revision_id_fkey" FOREIGN KEY ("doc_revision_id") REFERENCES "doc_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_part" ADD CONSTRAINT "assembly_part_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assembly_part" ADD CONSTRAINT "assembly_part_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part" ADD CONSTRAINT "part_doc_revision_id_fkey" FOREIGN KEY ("doc_revision_id") REFERENCES "doc_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part" ADD CONSTRAINT "part_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "product_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part" ADD CONSTRAINT "part_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "bom_grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part" ADD CONSTRAINT "part_std_product_id_fkey" FOREIGN KEY ("std_product_id") REFERENCES "std_product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_doc_revision" ADD CONSTRAINT "material_doc_revision_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "bom_zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_doc_revision" ADD CONSTRAINT "material_doc_revision_file_storage_id_fkey" FOREIGN KEY ("file_storage_id") REFERENCES "file_storage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_line" ADD CONSTRAINT "material_line_material_doc_rev_id_fkey" FOREIGN KEY ("material_doc_rev_id") REFERENCES "material_doc_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_line" ADD CONSTRAINT "material_line_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "product_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_line" ADD CONSTRAINT "material_line_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "bom_grade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_line" ADD CONSTRAINT "material_line_std_product_id_fkey" FOREIGN KEY ("std_product_id") REFERENCES "std_product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "std_product" ADD CONSTRAINT "std_product_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "product_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "std_product" ADD CONSTRAINT "std_product_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "bom_grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
