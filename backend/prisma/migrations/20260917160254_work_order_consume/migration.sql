-- work_order_consume (2026-09-17): plan-vs-actual material consumption per WO,
-- parallel to work_order_mark but for the input (materials) side. Hand-curated
-- from `prisma migrate diff` — the raw diff also surfaced the same large amount
-- of pre-existing, unrelated dev-DB drift noted in the multi_mark_work_orders
-- migration; none of that is included here, only this table.

-- CreateTable
CREATE TABLE "work_order_consume" (
    "id" SERIAL NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "unit" VARCHAR(20),
    "qty_planned" DECIMAL(12,3) NOT NULL,
    "qty_actual" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(120) NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" VARCHAR(120),

    CONSTRAINT "work_order_consume_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_order_consume_work_order_id_material_id_key" ON "work_order_consume"("work_order_id", "material_id");

-- AddForeignKey
ALTER TABLE "work_order_consume" ADD CONSTRAINT "work_order_consume_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_consume" ADD CONSTRAINT "work_order_consume_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
