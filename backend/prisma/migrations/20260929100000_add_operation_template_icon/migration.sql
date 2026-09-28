-- Add optional icon field to operation_template (lucide icon key, e.g. "flame")
ALTER TABLE "operation_template" ADD COLUMN "icon" VARCHAR(40);
