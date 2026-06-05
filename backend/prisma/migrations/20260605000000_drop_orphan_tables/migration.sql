-- DropForeignKey
ALTER TABLE "assembly" DROP CONSTRAINT "assembly_doc_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "assembly_part" DROP CONSTRAINT "assembly_part_assembly_id_fkey";

-- DropForeignKey
ALTER TABLE "assembly_part" DROP CONSTRAINT "assembly_part_doc_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "assembly_part" DROP CONSTRAINT "assembly_part_part_id_fkey";

-- DropForeignKey
ALTER TABLE "bom_project" DROP CONSTRAINT "bom_project_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "bom_zone" DROP CONSTRAINT "bom_zone_project_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch" DROP CONSTRAINT "dispatch_category_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch" DROP CONSTRAINT "dispatch_project_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch" DROP CONSTRAINT "dispatch_superseded_by_fkey";

-- DropForeignKey
ALTER TABLE "dispatch" DROP CONSTRAINT "dispatch_zone_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_line" DROP CONSTRAINT "dispatch_line_assembly_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_line" DROP CONSTRAINT "dispatch_line_doc_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "doc_revision" DROP CONSTRAINT "doc_revision_dispatch_id_fkey";

-- DropForeignKey
ALTER TABLE "doc_revision" DROP CONSTRAINT "doc_revision_file_storage_id_fkey";

-- DropForeignKey
ALTER TABLE "material_doc_revision" DROP CONSTRAINT "material_doc_revision_file_storage_id_fkey";

-- DropForeignKey
ALTER TABLE "material_doc_revision" DROP CONSTRAINT "material_doc_revision_zone_id_fkey";

-- DropForeignKey
ALTER TABLE "material_line" DROP CONSTRAINT "material_line_grade_id_fkey";

-- DropForeignKey
ALTER TABLE "material_line" DROP CONSTRAINT "material_line_material_doc_rev_id_fkey";

-- DropForeignKey
ALTER TABLE "material_line" DROP CONSTRAINT "material_line_std_product_id_fkey";

-- DropForeignKey
ALTER TABLE "material_line" DROP CONSTRAINT "material_line_template_id_fkey";

-- DropForeignKey
ALTER TABLE "part" DROP CONSTRAINT "part_doc_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "part" DROP CONSTRAINT "part_grade_id_fkey";

-- DropForeignKey
ALTER TABLE "part" DROP CONSTRAINT "part_std_product_id_fkey";

-- DropForeignKey
ALTER TABLE "part" DROP CONSTRAINT "part_template_id_fkey";

-- DropForeignKey
ALTER TABLE "product_category" DROP CONSTRAINT "product_category_account_id_fkey";

-- DropForeignKey
ALTER TABLE "product_variant" DROP CONSTRAINT "product_variant_parent_product_id_fkey";

-- DropForeignKey
ALTER TABLE "project_product_cost" DROP CONSTRAINT "project_product_cost_product_id_fkey";

-- DropForeignKey
ALTER TABLE "project_product_cost" DROP CONSTRAINT "project_product_cost_project_id_fkey";

-- DropForeignKey
ALTER TABLE "promotion_request" DROP CONSTRAINT "promotion_request_source_custom_product_id_fkey";

-- DropForeignKey
ALTER TABLE "promotion_request" DROP CONSTRAINT "promotion_request_target_standard_product_id_fkey";

-- DropForeignKey
ALTER TABLE "std_product" DROP CONSTRAINT "std_product_grade_id_fkey";

-- DropForeignKey
ALTER TABLE "std_product" DROP CONSTRAINT "std_product_template_id_fkey";

-- DropForeignKey
ALTER TABLE "tekla_prefix_mapping" DROP CONSTRAINT "tekla_prefix_mapping_bdt_mark_prefix_fkey";

-- DropForeignKey
ALTER TABLE "uom_uom" DROP CONSTRAINT "uom_uom_category_id_fkey";

-- AlterTable
ALTER TABLE "product_category" DROP COLUMN "account_id";

-- AlterTable
ALTER TABLE "uom_uom" DROP COLUMN "category_id";

-- DropTable
DROP TABLE "account_account";

-- DropTable
DROP TABLE "assembly";

-- DropTable
DROP TABLE "assembly_part";

-- DropTable
DROP TABLE "bom_category";

-- DropTable
DROP TABLE "bom_grade";

-- DropTable
DROP TABLE "bom_mark_prefix";

-- DropTable
DROP TABLE "bom_project";

-- DropTable
DROP TABLE "bom_zone";

-- DropTable
DROP TABLE "dispatch";

-- DropTable
DROP TABLE "dispatch_line";

-- DropTable
DROP TABLE "doc_revision";

-- DropTable
DROP TABLE "file_storage";

-- DropTable
DROP TABLE "material_doc_revision";

-- DropTable
DROP TABLE "material_line";

-- DropTable
DROP TABLE "part";

-- DropTable
DROP TABLE "product_template";

-- DropTable
DROP TABLE "product_variant";

-- DropTable
DROP TABLE "project_product_cost";

-- DropTable
DROP TABLE "promotion_request";

-- DropTable
DROP TABLE "std_product";

-- DropTable
DROP TABLE "steel_grade";

-- DropTable
DROP TABLE "tekla_prefix_mapping";

-- DropTable
DROP TABLE "uom_category";

-- DropEnum
DROP TYPE "ChangeType";

-- DropEnum
DROP TYPE "DispatchState";

-- DropEnum
DROP TYPE "DocType";

-- DropEnum
DROP TYPE "LineStatus";

-- DropEnum
DROP TYPE "SectionType";

-- DropEnum
DROP TYPE "StdProductState";

-- DropEnum
DROP TYPE "TemplateState";

-- CreateIndex (skipped — index already exists from prior migration)
-- CREATE UNIQUE INDEX "product_library_name_key" ON "product_library"("name");
