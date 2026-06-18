-- CreateTable
CREATE TABLE "mbom_assembly_paint" (
    "id" SERIAL NOT NULL,
    "dispatch_id" INTEGER NOT NULL,
    "assembly_id" INTEGER NOT NULL,
    "paint_type" VARCHAR(20) NOT NULL,
    "material_id" INTEGER,
    "layers" INTEGER NOT NULL DEFAULT 1,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mbom_assembly_paint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mbom_assembly_paint_assembly_id_paint_type_key" ON "mbom_assembly_paint"("assembly_id", "paint_type");

-- CreateIndex
CREATE INDEX "mbom_assembly_paint_dispatch_id_idx" ON "mbom_assembly_paint"("dispatch_id");

-- AddForeignKey
ALTER TABLE "mbom_assembly_paint" ADD CONSTRAINT "mbom_assembly_paint_dispatch_id_fkey"
    FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mbom_assembly_paint" ADD CONSTRAINT "mbom_assembly_paint_assembly_id_fkey"
    FOREIGN KEY ("assembly_id") REFERENCES "bom_assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mbom_assembly_paint" ADD CONSTRAINT "mbom_assembly_paint_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
