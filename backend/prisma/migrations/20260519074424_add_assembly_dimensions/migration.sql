-- DropForeignKey
ALTER TABLE "dispatch_assembly_paint_config" DROP CONSTRAINT "dispatch_assembly_paint_config_assembly_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_assembly_paint_config" DROP CONSTRAINT "dispatch_assembly_paint_config_dispatch_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_assembly_paint_config" DROP CONSTRAINT "dispatch_assembly_paint_config_material_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_assembly_welding_config" DROP CONSTRAINT "dispatch_assembly_welding_config_assembly_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_assembly_welding_config" DROP CONSTRAINT "dispatch_assembly_welding_config_dispatch_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_assembly_welding_config" DROP CONSTRAINT "dispatch_assembly_welding_config_material_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_material_requirement" DROP CONSTRAINT "dispatch_material_requirement_dispatch_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_material_requirement" DROP CONSTRAINT "dispatch_material_requirement_material_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_welding_requirement" DROP CONSTRAINT "dispatch_welding_requirement_dispatch_id_fkey";

-- DropForeignKey
ALTER TABLE "dispatch_welding_requirement" DROP CONSTRAINT "dispatch_welding_requirement_material_id_fkey";

-- DropIndex
DROP INDEX "idx_products_variant_attrs";

-- AlterTable
ALTER TABLE "bom_assembly" ADD COLUMN     "height_mm" DECIMAL(12,2),
ADD COLUMN     "length_mm" DECIMAL(12,2),
ADD COLUMN     "width_mm" DECIMAL(12,2);

-- AddForeignKey
ALTER TABLE "dispatch_assembly_paint_config" ADD CONSTRAINT "dispatch_assembly_paint_config_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_assembly_paint_config" ADD CONSTRAINT "dispatch_assembly_paint_config_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "bom_assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_assembly_paint_config" ADD CONSTRAINT "dispatch_assembly_paint_config_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_material_requirement" ADD CONSTRAINT "dispatch_material_requirement_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_material_requirement" ADD CONSTRAINT "dispatch_material_requirement_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_assembly_welding_config" ADD CONSTRAINT "dispatch_assembly_welding_config_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_assembly_welding_config" ADD CONSTRAINT "dispatch_assembly_welding_config_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "bom_assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_assembly_welding_config" ADD CONSTRAINT "dispatch_assembly_welding_config_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_welding_requirement" ADD CONSTRAINT "dispatch_welding_requirement_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_welding_requirement" ADD CONSTRAINT "dispatch_welding_requirement_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "dispatch_assembly_welding_config_dispatch_id_assembly_id_idx" RENAME TO "dispatch_assembly_welding_config_dispatch_id_assembly_id_key";

-- RenameIndex
ALTER INDEX "dispatch_material_requirement_dispatch_material_type_key" RENAME TO "dispatch_material_requirement_dispatch_id_material_id_paint_key";

-- RenameIndex
ALTER INDEX "dispatch_welding_requirement_dispatch_id_material_id_idx" RENAME TO "dispatch_welding_requirement_dispatch_id_material_id_key";
