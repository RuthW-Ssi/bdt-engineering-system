-- CreateEnum
CREATE TYPE "MoKind" AS ENUM ('ASSEMBLY', 'PART');

-- AlterTable
ALTER TABLE "manufacturing_order" ADD COLUMN     "kind" "MoKind" NOT NULL DEFAULT 'ASSEMBLY',
ADD COLUMN     "part_source" VARCHAR(20),
ADD COLUMN     "project_id" INTEGER;

-- CreateTable
CREATE TABLE "mo_part_line" (
    "id" SERIAL NOT NULL,
    "mo_id" INTEGER NOT NULL,
    "line_seq" INTEGER NOT NULL DEFAULT 0,
    "profile" VARCHAR(60) NOT NULL,
    "grade" VARCHAR(20) NOT NULL,
    "length_mm" DECIMAL(10,2) NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unit_weight_kg" DECIMAL(12,3),
    "part_mark" VARCHAR(60),
    "bom_part_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],

    CONSTRAINT "mo_part_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mo_part_line_mo_id_idx" ON "mo_part_line"("mo_id");

-- CreateIndex
CREATE INDEX "manufacturing_order_kind_idx" ON "manufacturing_order"("kind");

-- AddForeignKey
ALTER TABLE "manufacturing_order" ADD CONSTRAINT "manufacturing_order_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mo_part_line" ADD CONSTRAINT "mo_part_line_mo_id_fkey" FOREIGN KEY ("mo_id") REFERENCES "manufacturing_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- D7: fallback prefix for MO Part when no existing prefix fits.
INSERT INTO "mark_prefix_master" ("code", "label", "category", "part_type_code", "active")
VALUES ('OTH', 'อื่นๆ', 'other', 'o', true)
ON CONFLICT ("code") DO NOTHING;
