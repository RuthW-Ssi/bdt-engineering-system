-- DropForeignKey
ALTER TABLE "manufacturing_order" DROP CONSTRAINT "manufacturing_order_routing_template_id_fkey";

-- AlterTable — PART MOs may have no routing; ASSEMBLY MOs still require one (DTO).
-- Keep ON DELETE RESTRICT so a template in use can't be deleted (unchanged behaviour).
ALTER TABLE "manufacturing_order" ALTER COLUMN "routing_template_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "manufacturing_order" ADD CONSTRAINT "manufacturing_order_routing_template_id_fkey" FOREIGN KEY ("routing_template_id") REFERENCES "routing_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

