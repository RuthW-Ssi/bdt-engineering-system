-- Baseline migration: captures APS schema changes that were applied directly on
-- Supabase via the Supabase MCP (NOT through Prisma). These columns/tables ALREADY
-- EXIST in the live Supabase DB (project ref eebubyfkzeqhzwzqrqfz).
--
-- ⚠️ DO NOT `prisma migrate deploy` this against Supabase — the objects exist and
--    it would fail. Instead mark it applied without executing:
--      prisma migrate resolve --applied 20260625120000_capture_supabase_aps_drift
--    Apply normally (execute) only on environments that lack these objects (local docker).
--
-- Mirrors schema.prisma drift-capture commit bb65707.

-- AlterTable
ALTER TABLE "calendar" ADD COLUMN     "day_end_overhead_min" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "day_start_overhead_min" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "mrp_workcenter_line" ADD COLUMN     "crew_size" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "labor_mode" TEXT NOT NULL DEFAULT 'internal',
ADD COLUMN     "subcontractor_id" INTEGER;

-- AlterTable
ALTER TABLE "subcontractor" ADD COLUMN     "default_headcount" INTEGER,
ADD COLUMN     "rate" DECIMAL,
ADD COLUMN     "rate_unit" VARCHAR;

-- CreateTable
CREATE TABLE "stock_quant" (
    "id" SERIAL NOT NULL,
    "material_id" INTEGER NOT NULL,
    "location" VARCHAR NOT NULL DEFAULT 'WH/Stock',
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL NOT NULL DEFAULT 0,
    "forecasted_quantity" DECIMAL,
    "create_date" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "write_date" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_quant_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "stock_quant" ADD CONSTRAINT "stock_quant_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_workcenter_line" ADD CONSTRAINT "mrp_workcenter_line_subcontractor_id_fkey" FOREIGN KEY ("subcontractor_id") REFERENCES "subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
