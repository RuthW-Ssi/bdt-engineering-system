-- Sprint 7 F-BE-1: BOM Dispatch schema — 5 new models
-- Applied via prisma db push (drift resolution from missing migration 20260511041003)

-- ── bom_dispatch ─────────────────────────────────────────────────
CREATE TABLE "bom_dispatch" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "sub_zone_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assembly_total" INTEGER,
    "part_total" INTEGER,
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bom_dispatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bom_dispatch_project_id_status_idx" ON "bom_dispatch"("project_id", "status");
CREATE INDEX "bom_dispatch_zone_id_idx" ON "bom_dispatch"("zone_id");
CREATE INDEX "bom_dispatch_uploaded_at_idx" ON "bom_dispatch"("uploaded_at");

ALTER TABLE "bom_dispatch" ADD CONSTRAINT "bom_dispatch_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_dispatch" ADD CONSTRAINT "bom_dispatch_zone_id_fkey"
    FOREIGN KEY ("zone_id") REFERENCES "project_zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_dispatch" ADD CONSTRAINT "bom_dispatch_sub_zone_id_fkey"
    FOREIGN KEY ("sub_zone_id") REFERENCES "sub_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bom_dispatch" ADD CONSTRAINT "bom_dispatch_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_dispatch" ADD CONSTRAINT "bom_dispatch_write_uid_fkey"
    FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── bom_doc_revision ─────────────────────────────────────────────
CREATE TABLE "bom_doc_revision" (
    "id" SERIAL NOT NULL,
    "dispatch_id" INTEGER NOT NULL,
    "doc_type" VARCHAR(30) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "file_size_bytes" BIGINT,
    "file_mime_type" VARCHAR(60),
    "file_checksum_sha256" VARCHAR(64),
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bom_doc_revision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bom_doc_revision_dispatch_id_doc_type_key" ON "bom_doc_revision"("dispatch_id", "doc_type");
CREATE INDEX "bom_doc_revision_dispatch_id_idx" ON "bom_doc_revision"("dispatch_id");

ALTER TABLE "bom_doc_revision" ADD CONSTRAINT "bom_doc_revision_dispatch_id_fkey"
    FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_doc_revision" ADD CONSTRAINT "bom_doc_revision_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── bom_assembly ─────────────────────────────────────────────────
CREATE TABLE "bom_assembly" (
    "id" SERIAL NOT NULL,
    "dispatch_id" INTEGER NOT NULL,
    "assembly_mark" VARCHAR(60) NOT NULL,
    "name" VARCHAR(200),
    "qty" DECIMAL(12,3),
    "weight_kg" DECIMAL(12,3),
    "surface_area_m2" DECIMAL(12,4),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bom_assembly_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bom_assembly_dispatch_id_assembly_mark_key" ON "bom_assembly"("dispatch_id", "assembly_mark");
CREATE INDEX "bom_assembly_dispatch_id_idx" ON "bom_assembly"("dispatch_id");

ALTER TABLE "bom_assembly" ADD CONSTRAINT "bom_assembly_dispatch_id_fkey"
    FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_assembly" ADD CONSTRAINT "bom_assembly_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_assembly" ADD CONSTRAINT "bom_assembly_write_uid_fkey"
    FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── bom_part ─────────────────────────────────────────────────────
CREATE TABLE "bom_part" (
    "id" SERIAL NOT NULL,
    "dispatch_id" INTEGER NOT NULL,
    "part_mark" VARCHAR(60) NOT NULL,
    "description" VARCHAR(200),
    "profile" VARCHAR(60),
    "grade" VARCHAR(20),
    "qty" DECIMAL(12,3),
    "length_mm" DECIMAL(10,2),
    "weight_kg" DECIMAL(12,3),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bom_part_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bom_part_dispatch_id_part_mark_key" ON "bom_part"("dispatch_id", "part_mark");
CREATE INDEX "bom_part_dispatch_id_idx" ON "bom_part"("dispatch_id");

ALTER TABLE "bom_part" ADD CONSTRAINT "bom_part_dispatch_id_fkey"
    FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_part" ADD CONSTRAINT "bom_part_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bom_part" ADD CONSTRAINT "bom_part_write_uid_fkey"
    FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── bom_assembly_part ─────────────────────────────────────────────
CREATE TABLE "bom_assembly_part" (
    "id" SERIAL NOT NULL,
    "assembly_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "sequence" INTEGER,
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bom_assembly_part_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bom_assembly_part_assembly_id_part_id_key" ON "bom_assembly_part"("assembly_id", "part_id");
CREATE INDEX "bom_assembly_part_assembly_id_idx" ON "bom_assembly_part"("assembly_id");
CREATE INDEX "bom_assembly_part_part_id_idx" ON "bom_assembly_part"("part_id");

ALTER TABLE "bom_assembly_part" ADD CONSTRAINT "bom_assembly_part_assembly_id_fkey"
    FOREIGN KEY ("assembly_id") REFERENCES "bom_assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_assembly_part" ADD CONSTRAINT "bom_assembly_part_part_id_fkey"
    FOREIGN KEY ("part_id") REFERENCES "bom_part"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_assembly_part" ADD CONSTRAINT "bom_assembly_part_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
