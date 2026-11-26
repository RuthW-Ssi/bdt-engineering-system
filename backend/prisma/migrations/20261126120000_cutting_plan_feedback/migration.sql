-- Cutting plan, user test report 2026-11-26. Additive only: two nullable columns on cutting_plan_nesting (certificate,
-- cut_length_mm) and three new tables (kerf settings, remnant use log, change history). No existing row changes.

-- AlterTable
ALTER TABLE "cutting_plan_nesting" ADD COLUMN     "certificate" VARCHAR(100),
ADD COLUMN     "cut_length_mm" DECIMAL(12,1);

-- CreateTable
CREATE TABLE "cutting_plan_kerf" (
    "id" SERIAL NOT NULL,
    "technology" VARCHAR(60) NOT NULL,
    "thick_mm" DECIMAL(8,2) NOT NULL,
    "kerf_mm" DECIMAL(6,2) NOT NULL,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cutting_plan_kerf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_plan_remnant_use" (
    "id" SERIAL NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "source_id" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "note" VARCHAR(200),
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cutting_plan_remnant_use_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_plan_change" (
    "id" SERIAL NOT NULL,
    "entity" VARCHAR(20) NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "field" VARCHAR(40) NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by_uid" INTEGER NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cutting_plan_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cutting_plan_kerf_technology_thick_mm_key" ON "cutting_plan_kerf"("technology", "thick_mm");

-- CreateIndex
CREATE INDEX "cutting_plan_remnant_use_source_source_id_idx" ON "cutting_plan_remnant_use"("source", "source_id");

-- CreateIndex
CREATE INDEX "cutting_plan_change_entity_entity_id_changed_at_idx" ON "cutting_plan_change"("entity", "entity_id", "changed_at");

-- AddForeignKey
ALTER TABLE "cutting_plan_kerf" ADD CONSTRAINT "cutting_plan_kerf_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_remnant_use" ADD CONSTRAINT "cutting_plan_remnant_use_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_change" ADD CONSTRAINT "cutting_plan_change_changed_by_uid_fkey" FOREIGN KEY ("changed_by_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

