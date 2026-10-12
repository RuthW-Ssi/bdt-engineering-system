-- AlterTable — add the list columns, carry part_source over, then drop it
-- (part_source only ever existed on the unmerged round-1 branch).
ALTER TABLE "manufacturing_order" ADD COLUMN     "part_sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source_files" JSONB NOT NULL DEFAULT '[]';

UPDATE "manufacturing_order" SET "part_sources" = ARRAY["part_source"]::TEXT[] WHERE "part_source" IS NOT NULL;

ALTER TABLE "manufacturing_order" DROP COLUMN "part_source";

-- AlterTable
ALTER TABLE "mo_part_line" ADD COLUMN     "cut_length_mm" DECIMAL(12,2),
ADD COLUMN     "holes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "mark_id" INTEGER;

-- CreateTable
CREATE TABLE "mo_part_mark" (
    "id" SERIAL NOT NULL,
    "mo_id" INTEGER NOT NULL,
    "mark" VARCHAR(60) NOT NULL,
    "set_qty" DECIMAL(12,3) NOT NULL,
    "length_mm" DECIMAL(10,2),
    "width_mm" DECIMAL(10,2),
    "height_mm" DECIMAL(10,2),
    "weight_kg" DECIMAL(12,3),
    "tw_mm" DECIMAL(6,2),
    "tf_mm" DECIMAL(6,2),

    CONSTRAINT "mo_part_mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mo_part_change" (
    "id" SERIAL NOT NULL,
    "mo_id" INTEGER NOT NULL,
    "changed_by" VARCHAR(120) NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "changes" JSONB NOT NULL,

    CONSTRAINT "mo_part_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mo_part_mark_mo_id_mark_key" ON "mo_part_mark"("mo_id", "mark");

-- CreateIndex
CREATE INDEX "mo_part_change_mo_id_idx" ON "mo_part_change"("mo_id");

-- AddForeignKey
ALTER TABLE "mo_part_line" ADD CONSTRAINT "mo_part_line_mark_id_fkey" FOREIGN KEY ("mark_id") REFERENCES "mo_part_mark"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mo_part_mark" ADD CONSTRAINT "mo_part_mark_mo_id_fkey" FOREIGN KEY ("mo_id") REFERENCES "manufacturing_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mo_part_change" ADD CONSTRAINT "mo_part_change_mo_id_fkey" FOREIGN KEY ("mo_id") REFERENCES "manufacturing_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

