-- AlterTable (guarded — column may pre-exist from out-of-band db push)
ALTER TABLE "mrp_routing_workcenter" ADD COLUMN IF NOT EXISTS "activities_snapshot" JSONB;
