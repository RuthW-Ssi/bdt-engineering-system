-- Simplify work_order_part (2026-09-17, same day it was created): drop the
-- plan/actual split (qty_planned/qty_withdrawn) in favor of a single
-- weight_kg field — per explicit user direction, parts don't need a
-- plan-vs-actual distinction like work_order_consume does; whatever value is
-- entered is authoritative. No real data existed in this table yet (created
-- earlier the same session), so this drops + recreates rather than migrating
-- column values.

DROP TABLE "work_order_part";

CREATE TABLE "work_order_part" (
    "id" SERIAL NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "bom_assembly_part_id" INTEGER NOT NULL,
    "weight_kg" DECIMAL(12,3) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(120) NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by" VARCHAR(120),

    CONSTRAINT "work_order_part_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_order_part_work_order_id_bom_assembly_part_id_key" ON "work_order_part"("work_order_id", "bom_assembly_part_id");

ALTER TABLE "work_order_part" ADD CONSTRAINT "work_order_part_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_order_part" ADD CONSTRAINT "work_order_part_bom_assembly_part_id_fkey" FOREIGN KEY ("bom_assembly_part_id") REFERENCES "bom_assembly_part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
