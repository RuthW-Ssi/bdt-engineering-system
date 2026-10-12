-- Document Center (2026-10-05): admin-managed PDF library, see wiki
-- features/document-center.md. Additive only.
CREATE TABLE "document" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" VARCHAR(50) NOT NULL DEFAULT 'user-manual',
    "audience" VARCHAR(20) NOT NULL DEFAULT 'employee',
    "version" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "file_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_id" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_category_idx" ON "document"("category");

ALTER TABLE "document" ADD CONSTRAINT "document_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
