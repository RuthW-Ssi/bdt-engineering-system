-- Cutting Plan plate files (2026-11-06): the four files of each plate (.txt/.xls/.pdf/.dxf)
-- are kept in storage; this table records where. Additive only, new table.
CREATE TABLE IF NOT EXISTS "cutting_plan_file" (
  "id" SERIAL NOT NULL,
  "upload_id" INTEGER NOT NULL,
  "plate_name" VARCHAR(120) NOT NULL,
  "kind" VARCHAR(4) NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "file_key" VARCHAR(500) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cutting_plan_file_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cutting_plan_file_file_key_key" ON "cutting_plan_file"("file_key");
CREATE INDEX IF NOT EXISTS "cutting_plan_file_upload_id_idx" ON "cutting_plan_file"("upload_id");
ALTER TABLE "cutting_plan_file" ADD CONSTRAINT "cutting_plan_file_upload_id_fkey"
  FOREIGN KEY ("upload_id") REFERENCES "cutting_plan_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
