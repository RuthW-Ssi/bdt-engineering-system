-- Progress Change History: one batch per write to bom_assembly_progress
-- (manual edit, bulk edit, Excel import, or rollback), one entry per field
-- that actually changed. Feeds the History UI + rollback.

-- CreateTable
CREATE TABLE "progress_change_batch" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "file_name" VARCHAR(255),
    "rolled_back_batch_id" INTEGER,
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_change_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_change_entry" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "assembly_id" INTEGER NOT NULL,
    "field" VARCHAR(40) NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,

    CONSTRAINT "progress_change_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "progress_change_batch_project_id_create_date_idx" ON "progress_change_batch"("project_id", "create_date");

-- CreateIndex
CREATE INDEX "progress_change_entry_batch_id_idx" ON "progress_change_entry"("batch_id");

-- CreateIndex
CREATE INDEX "progress_change_entry_assembly_id_field_idx" ON "progress_change_entry"("assembly_id", "field");

-- AddForeignKey
ALTER TABLE "progress_change_batch" ADD CONSTRAINT "progress_change_batch_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_change_batch" ADD CONSTRAINT "progress_change_batch_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_change_entry" ADD CONSTRAINT "progress_change_entry_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "progress_change_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_change_entry" ADD CONSTRAINT "progress_change_entry_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "bom_assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
