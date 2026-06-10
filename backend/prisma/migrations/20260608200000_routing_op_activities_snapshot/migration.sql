-- Add activities_snapshot JSONB to routing template operations
-- Stores per-op activity list in routing canvas snapshot
ALTER TABLE "mrp_routing_workcenter"
  ADD COLUMN "activities_snapshot" JSONB;
