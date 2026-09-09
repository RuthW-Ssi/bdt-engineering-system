-- Add is_placeholder column to project_zone table
ALTER TABLE "project_zone" ADD COLUMN "is_placeholder" BOOLEAN NOT NULL DEFAULT false;

-- Add source column to bom_dispatch table
ALTER TABLE "bom_dispatch" ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'BOM_UPLOAD';
