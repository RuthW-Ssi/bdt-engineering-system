-- Add revision column to bom_dispatch (explicit user-controlled revision number)
ALTER TABLE "bom_dispatch" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- Create composite index on (zone_id, sub_zone_id, revision)
CREATE INDEX "bom_dispatch_zone_id_sub_zone_id_revision_idx" ON "bom_dispatch"("zone_id", "sub_zone_id", "revision");
