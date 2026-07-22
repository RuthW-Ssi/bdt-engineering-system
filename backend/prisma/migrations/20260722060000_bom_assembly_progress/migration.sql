-- Sprint 24: Project Progress Overview — manual-entry progress milestones
-- per assembly (interim layer while MO/WO-driven tracking matures).
-- 1:1 side-table keyed on bom_assembly.id; no row = "not started".

-- CreateTable
CREATE TABLE "bom_assembly_progress" (
    "assembly_id" INTEGER NOT NULL,
    "qc_inspection_pass" BOOLEAN NOT NULL DEFAULT false,
    "qc_final_pass" BOOLEAN NOT NULL DEFAULT false,
    "actual_load_date" DATE,
    "install_date" DATE,
    "qc_install_date" DATE,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bom_assembly_progress_pkey" PRIMARY KEY ("assembly_id")
);

-- AddForeignKey
ALTER TABLE "bom_assembly_progress" ADD CONSTRAINT "bom_assembly_progress_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "bom_assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_assembly_progress" ADD CONSTRAINT "bom_assembly_progress_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
