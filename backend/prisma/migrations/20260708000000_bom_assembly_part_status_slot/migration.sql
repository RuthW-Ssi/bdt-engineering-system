ALTER TABLE "bom_assembly" ADD COLUMN "status" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "bom_assembly" ADD COLUMN "slot" VARCHAR(4);
CREATE INDEX "bom_assembly_status_idx" ON "bom_assembly"("status");

ALTER TABLE "bom_part" ADD COLUMN "status" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "bom_part" ADD COLUMN "slot" VARCHAR(4);
CREATE INDEX "bom_part_status_idx" ON "bom_part"("status");
