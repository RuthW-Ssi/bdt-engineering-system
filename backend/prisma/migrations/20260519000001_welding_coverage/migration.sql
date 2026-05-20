-- Add welding coverage JSON to bom_dispatch
ALTER TABLE "bom_dispatch" ADD COLUMN "welding_coverage_json" JSONB;
