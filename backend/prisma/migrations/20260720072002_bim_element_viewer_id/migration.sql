-- AlterTable
ALTER TABLE "bim_element" ADD COLUMN "viewer_id" INTEGER;

-- CreateIndex
CREATE INDEX "bim_element_viewer_id_idx" ON "bim_element"("viewer_id");
