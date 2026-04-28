/*
  Warnings:

  - You are about to drop the column `active` on the `product_bom` table. All the data in the column will be lost.
  - You are about to drop the column `qty` on the `product_bom` table. All the data in the column will be lost.
  - You are about to drop the column `revision` on the `product_bom` table. All the data in the column will be lost.
  - You are about to drop the column `qty` on the `product_bom_line` table. All the data in the column will be lost.
  - You are about to drop the column `uom_id` on the `product_bom_line` table. All the data in the column will be lost.
  - You are about to drop the column `weight_kg` on the `product_bom_line` table. All the data in the column will be lost.
  - Added the required column `create_uid` to the `product_bom` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_uom_id` to the `product_bom` table without a default value. This is not possible if the table is not empty.
  - Added the required column `write_uid` to the `product_bom` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_qty` to the `product_bom_line` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_uom_id` to the `product_bom_line` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "product_bom_line" DROP CONSTRAINT "product_bom_line_bom_id_fkey";

-- DropForeignKey
ALTER TABLE "product_bom_line" DROP CONSTRAINT "product_bom_line_uom_id_fkey";

-- AlterTable
ALTER TABLE "product_bom" DROP COLUMN "active",
DROP COLUMN "qty",
DROP COLUMN "revision",
ADD COLUMN     "bom_view" VARCHAR(10) NOT NULL DEFAULT 'eBOM',
ADD COLUMN     "cloned_from_bom_id" INTEGER,
ADD COLUMN     "create_uid" INTEGER NOT NULL,
ADD COLUMN     "eco_id" INTEGER,
ADD COLUMN     "effective_from" DATE,
ADD COLUMN     "effective_to" DATE,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "odoo_ref_id" VARCHAR(40),
ADD COLUMN     "owner_role" VARCHAR(20) NOT NULL DEFAULT 'engineering',
ADD COLUMN     "product_qty" DECIMAL(12,3) NOT NULL DEFAULT 1.0,
ADD COLUMN     "product_uom_id" INTEGER NOT NULL,
ADD COLUMN     "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
ADD COLUMN     "version" VARCHAR(20) NOT NULL DEFAULT '1.0.0',
ADD COLUMN     "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "write_uid" INTEGER NOT NULL,
ALTER COLUMN "bom_type" SET DEFAULT 'normal';

-- AlterTable
ALTER TABLE "product_bom_line" DROP COLUMN "qty",
DROP COLUMN "uom_id",
DROP COLUMN "weight_kg",
ADD COLUMN     "attribute_value_ids" JSONB,
ADD COLUMN     "cutting_length_mm" DECIMAL(10,1),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "product_qty" DECIMAL(12,3) NOT NULL,
ADD COLUMN     "product_uom_id" INTEGER NOT NULL,
ADD COLUMN     "scrap_pct" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sub_product_id" INTEGER,
ADD COLUMN     "weight_per_unit_kg" DECIMAL(10,3);

-- CreateTable
CREATE TABLE "shop_drawing" (
    "id" SERIAL NOT NULL,
    "drawing_number" VARCHAR(40) NOT NULL,
    "drawing_type" VARCHAR(10) NOT NULL,
    "product_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "current_revision" VARCHAR(5),
    "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "cad_source" VARCHAR(20) NOT NULL DEFAULT 'other',
    "generalized_from_id" INTEGER,
    "retention_until" DATE,
    "odoo_ref_id" VARCHAR(40),
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_drawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_revision" (
    "id" SERIAL NOT NULL,
    "drawing_id" INTEGER NOT NULL,
    "revision" VARCHAR(5) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "change_summary" TEXT,
    "file_url" VARCHAR(500) NOT NULL,
    "file_size_bytes" BIGINT,
    "file_mime_type" VARCHAR(60),
    "file_checksum_sha256" VARCHAR(64),
    "approved_uid" INTEGER,
    "approved_date" TIMESTAMPTZ,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_drawing_drawing_number_key" ON "shop_drawing"("drawing_number");

-- CreateIndex
CREATE UNIQUE INDEX "drawing_revision_drawing_id_revision_key" ON "drawing_revision"("drawing_id", "revision");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_master_drawing_id_fkey" FOREIGN KEY ("master_drawing_id") REFERENCES "shop_drawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_shop_drawing_id_fkey" FOREIGN KEY ("shop_drawing_id") REFERENCES "shop_drawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom" ADD CONSTRAINT "product_bom_product_uom_id_fkey" FOREIGN KEY ("product_uom_id") REFERENCES "uom_uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom" ADD CONSTRAINT "product_bom_cloned_from_bom_id_fkey" FOREIGN KEY ("cloned_from_bom_id") REFERENCES "product_bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom" ADD CONSTRAINT "product_bom_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom" ADD CONSTRAINT "product_bom_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom_line" ADD CONSTRAINT "product_bom_line_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "product_bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom_line" ADD CONSTRAINT "product_bom_line_sub_product_id_fkey" FOREIGN KEY ("sub_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom_line" ADD CONSTRAINT "product_bom_line_product_uom_id_fkey" FOREIGN KEY ("product_uom_id") REFERENCES "uom_uom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_drawing" ADD CONSTRAINT "shop_drawing_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_drawing" ADD CONSTRAINT "shop_drawing_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_drawing" ADD CONSTRAINT "shop_drawing_generalized_from_id_fkey" FOREIGN KEY ("generalized_from_id") REFERENCES "shop_drawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_drawing" ADD CONSTRAINT "shop_drawing_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_drawing" ADD CONSTRAINT "shop_drawing_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_revision" ADD CONSTRAINT "drawing_revision_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "shop_drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_revision" ADD CONSTRAINT "drawing_revision_approved_uid_fkey" FOREIGN KEY ("approved_uid") REFERENCES "res_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_revision" ADD CONSTRAINT "drawing_revision_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
