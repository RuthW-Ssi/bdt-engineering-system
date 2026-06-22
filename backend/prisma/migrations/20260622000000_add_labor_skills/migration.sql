-- Add skills field for labor-type equipment_resource (JSON array of skill strings)
ALTER TABLE "equipment_resource" ADD COLUMN IF NOT EXISTS "skills" JSONB;
