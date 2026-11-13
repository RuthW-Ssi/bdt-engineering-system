-- Cutting Plan Shape (2026-11-10): CutLogic 1D cutting layouts. Additive only: a plan_type column on the upload
-- (existing rows become PLATE) and three new tables size → layout → part, all cascading from the upload.

-- AlterTable
ALTER TABLE "cutting_plan_upload" ADD COLUMN     "plan_type" VARCHAR(10) NOT NULL DEFAULT 'PLATE';

-- CreateTable
CREATE TABLE "cutting_plan_shape_size" (
    "id" SERIAL NOT NULL,
    "upload_id" INTEGER NOT NULL,
    "profile" VARCHAR(60) NOT NULL,
    "grade" VARCHAR(30),
    "plan_no" INTEGER NOT NULL,
    "kerf_mm" DECIMAL(8,2),
    "yield_pct" DECIMAL(6,2) NOT NULL,
    "stocks" INTEGER NOT NULL,
    "parts" INTEGER NOT NULL,
    "parts_length_mm" DECIMAL(14,2) NOT NULL,
    "layouts_count" INTEGER NOT NULL,
    "fingerprint" VARCHAR(40) NOT NULL,

CONSTRAINT "cutting_plan_shape_size_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_plan_shape_layout" (
    "id" SERIAL NOT NULL,
    "size_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "stock_no" INTEGER NOT NULL,
    "stock_length_mm" DECIMAL(12,2) NOT NULL,
    "rest_mm" DECIMAL(12,2) NOT NULL,
    "repeat" INTEGER NOT NULL,

CONSTRAINT "cutting_plan_shape_layout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_plan_shape_part" (
    "id" SERIAL NOT NULL,
    "layout_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "part_no" INTEGER NOT NULL,
    "mark" VARCHAR(120) NOT NULL,
    "length_mm" DECIMAL(12,2) NOT NULL,
    "count" INTEGER NOT NULL,

CONSTRAINT "cutting_plan_shape_part_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cutting_plan_shape_size_upload_id_idx" ON "cutting_plan_shape_size"("upload_id");

-- CreateIndex
CREATE INDEX "cutting_plan_shape_size_profile_idx" ON "cutting_plan_shape_size"("profile");

-- CreateIndex
CREATE INDEX "cutting_plan_shape_layout_size_id_idx" ON "cutting_plan_shape_layout"("size_id");

-- CreateIndex
CREATE INDEX "cutting_plan_shape_part_layout_id_idx" ON "cutting_plan_shape_part"("layout_id");

-- CreateIndex
CREATE INDEX "cutting_plan_upload_plan_type_idx" ON "cutting_plan_upload"("plan_type");

-- AddForeignKey
ALTER TABLE "cutting_plan_shape_size" ADD CONSTRAINT "cutting_plan_shape_size_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "cutting_plan_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_shape_layout" ADD CONSTRAINT "cutting_plan_shape_layout_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "cutting_plan_shape_size"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_shape_part" ADD CONSTRAINT "cutting_plan_shape_part_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "cutting_plan_shape_layout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
