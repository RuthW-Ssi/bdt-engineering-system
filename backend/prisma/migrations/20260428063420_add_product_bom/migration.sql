-- CreateTable
CREATE TABLE "product_bom" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "bom_type" VARCHAR(20) NOT NULL DEFAULT 'manufacture',
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "project_id" INTEGER,
    "revision" VARCHAR(10),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_bom_line" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 10,
    "material_id" INTEGER,
    "qty" DECIMAL(12,3) NOT NULL,
    "uom_id" INTEGER NOT NULL,
    "part_mark" VARCHAR(30),
    "profile" VARCHAR(60),
    "grade" VARCHAR(20),
    "length_mm" DECIMAL(10,2),
    "weight_kg" DECIMAL(10,3),
    "area_m2" DECIMAL(10,4),

    CONSTRAINT "product_bom_line_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "product_bom" ADD CONSTRAINT "product_bom_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom" ADD CONSTRAINT "product_bom_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom_line" ADD CONSTRAINT "product_bom_line_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "product_bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom_line" ADD CONSTRAINT "product_bom_line_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom_line" ADD CONSTRAINT "product_bom_line_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "uom_uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
