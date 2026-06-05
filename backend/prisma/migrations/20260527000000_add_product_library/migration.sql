-- Migration: Sprint 11 — Product Library
-- Adds product_library catalog, product_library_seq, and library_id FK on products

-- Sequence table (single row, value starts at 0 → first code = LIB-001)
CREATE TABLE "product_library_seq" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "product_library_seq_pkey" PRIMARY KEY ("id")
);
INSERT INTO "product_library_seq" ("id", "value") VALUES (1, 0);

-- Product library catalog
CREATE TABLE "product_library" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_library_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_library_code_key" ON "product_library"("code");
CREATE UNIQUE INDEX "product_library_name_key" ON "product_library"(lower("name"));
CREATE INDEX "product_library_active_idx" ON "product_library"("active");

-- FK: product_library → res_users (create + write)
ALTER TABLE "product_library" ADD CONSTRAINT "product_library_create_uid_fkey"
    FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_library" ADD CONSTRAINT "product_library_write_uid_fkey"
    FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend products: nullable library_id FK
ALTER TABLE "products" ADD COLUMN "library_id" INTEGER;
CREATE INDEX "products_library_id_idx" ON "products"("library_id");

ALTER TABLE "products" ADD CONSTRAINT "products_library_id_fkey"
    FOREIGN KEY ("library_id") REFERENCES "product_library"("id") ON DELETE SET NULL ON UPDATE CASCADE;
