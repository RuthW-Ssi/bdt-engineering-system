-- AlterTable
ALTER TABLE "manufacturing_order" ADD COLUMN     "sub_zone_id" INTEGER,
ADD COLUMN     "zone_id" INTEGER;

-- AddForeignKey
ALTER TABLE "manufacturing_order" ADD CONSTRAINT "manufacturing_order_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "project_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manufacturing_order" ADD CONSTRAINT "manufacturing_order_sub_zone_id_fkey" FOREIGN KEY ("sub_zone_id") REFERENCES "sub_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

