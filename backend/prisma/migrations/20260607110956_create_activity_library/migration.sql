/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `product_library` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "activity" (
    "id" SERIAL NOT NULL,
    "activity_code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "machine_id" INTEGER NOT NULL,
    "duration_min" DECIMAL(10,2) NOT NULL,
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_consume" (
    "activity_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,

    CONSTRAINT "activity_consume_pkey" PRIMARY KEY ("activity_id","material_id")
);

-- CreateTable
CREATE TABLE "activity_code_seq" (
    "id" INTEGER NOT NULL,
    "next_val" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "activity_code_seq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_activity_code_key" ON "activity"("activity_code");

-- CreateIndex
CREATE INDEX "activity_machine_id_idx" ON "activity"("machine_id");

-- CreateIndex
CREATE INDEX "activity_name_idx" ON "activity"("name");

-- CreateIndex
CREATE INDEX "activity_consume_material_id_idx" ON "activity_consume"("material_id");

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "equipment_resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_consume" ADD CONSTRAINT "activity_consume_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_consume" ADD CONSTRAINT "activity_consume_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the sequence counter (must always exist, id=1)
INSERT INTO "activity_code_seq" (id, next_val) VALUES (1, 1);
