-- Widen file_mime_type from VarChar(60) to VarChar(100): the real
-- browser-native XLSX MIME type ("application/vnd.openxmlformats-
-- officedocument.spreadsheetml.sheet") is 65 characters and previously
-- overflowed the column, causing genuine .xlsx uploads/drawing revisions to
-- fail with a Postgres "value too long" error.
ALTER TABLE "drawing_revision" ALTER COLUMN "file_mime_type" SET DATA TYPE VARCHAR(100);
ALTER TABLE "bom_doc_revision" ALTER COLUMN "file_mime_type" SET DATA TYPE VARCHAR(100);
