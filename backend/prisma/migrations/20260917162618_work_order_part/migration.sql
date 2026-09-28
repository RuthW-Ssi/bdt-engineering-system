-- work_order_part (2026-09-17): plan-vs-actual physical PART withdrawal per WO,
-- parallel to work_order_consume (which is for formula-driven materials, a
-- distinct concept from bom_assembly_part). Hand-curated from `prisma migrate
-- diff` — the raw diff also surfaced the same large amount of pre-existing,
-- unrelated dev-DB drift noted in the multi_mark_work_orders migration; none
-- of that is included here, only this table.

-- CreateTable
CREATE TABLE "work_order_part" (
    "id" SERIAL NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "bom_assembly_part_id" INTEGER NOT NULL,
    "qty_planned" DECIMAL(12,3) NOT NULL,
    "qty_withdrawn" DECIMAL(12,3),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(120) NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" VARCHAR(120),

    CONSTRAINT "work_order_part_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_part_work_order_id_bom_assembly_part_id_key" ON "work_order_part"("work_order_id", "bom_assembly_part_id");

-- AddForeignKey
ALTER TABLE "work_order_part" ADD CONSTRAINT "work_order_part_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_part" ADD CONSTRAINT "work_order_part_bom_assembly_part_id_fkey" FOREIGN KEY ("bom_assembly_part_id") REFERENCES "bom_assembly_part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
