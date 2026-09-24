-- Multi-mark WO redesign (2026-09-17): 1 work_order per (mo, routing operation),
-- spanning many marks via the new work_order_mark junction table.
-- NOTE: hand-curated from `prisma migrate diff` output — the raw diff also
-- surfaced a large amount of PRE-EXISTING, unrelated drift between this dev
-- DB and migration history (renamed FK constraints, a dropped stock_quant
-- table, unrelated column type changes, a missing subcontractor FK). None of
-- that is included here; only statements for this change are applied.

-- AlterEnum
ALTER TYPE "WoEventType" ADD VALUE 'UNHOLD';
ALTER TYPE "WoEventType" ADD VALUE 'MARK_REMOVED';

-- DropForeignKey
ALTER TABLE "work_order" DROP CONSTRAINT "work_order_bom_assembly_id_fkey";

-- AlterTable
ALTER TABLE "work_order" DROP COLUMN "bom_assembly_id",
DROP COLUMN "bom_dispatch_id_snapshot",
DROP COLUMN "qty_done",
DROP COLUMN "qty_reusable",
DROP COLUMN "qty_scrapped";

-- AlterTable
ALTER TABLE "work_order_event" ADD COLUMN "work_order_mark_id" INTEGER;

-- CreateTable
CREATE TABLE "work_order_mark" (
    "id" SERIAL NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "bom_assembly_id" INTEGER NOT NULL,
    "bom_dispatch_id_snapshot" INTEGER NOT NULL,
    "qty_planned" DECIMAL(12,3) NOT NULL,
    "qty_done" DECIMAL(12,3),
    "qty_scrapped" DECIMAL(12,3),
    "qty_reusable" DECIMAL(12,3),
    "removed_at" TIMESTAMPTZ,
    "removed_by" VARCHAR(120),
    "removed_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(120) NOT NULL,

    CONSTRAINT "work_order_mark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_order_mark_bom_assembly_id_idx" ON "work_order_mark"("bom_assembly_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_mark_work_order_id_bom_assembly_id_key" ON "work_order_mark"("work_order_id", "bom_assembly_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_mo_id_source_routing_op_id_key" ON "work_order"("mo_id", "source_routing_op_id");

-- CreateIndex
CREATE INDEX "work_order_event_work_order_mark_id_idx" ON "work_order_event"("work_order_mark_id");

-- AddForeignKey
ALTER TABLE "work_order_mark" ADD CONSTRAINT "work_order_mark_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_mark" ADD CONSTRAINT "work_order_mark_bom_assembly_id_fkey" FOREIGN KEY ("bom_assembly_id") REFERENCES "bom_assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_event" ADD CONSTRAINT "work_order_event_work_order_mark_id_fkey" FOREIGN KEY ("work_order_mark_id") REFERENCES "work_order_mark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
