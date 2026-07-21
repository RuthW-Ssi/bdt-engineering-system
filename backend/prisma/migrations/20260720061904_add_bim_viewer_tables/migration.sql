-- CreateTable
CREATE TABLE "bim_model" (
    "id" SERIAL NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "urn" VARCHAR(200) NOT NULL,
    "bucket_key" VARCHAR(100) NOT NULL,
    "translation_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "translation_error" TEXT,
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bim_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bim_element" (
    "id" SERIAL NOT NULL,
    "model_id" INTEGER NOT NULL,
    "mark" VARCHAR(100),
    "global_id" VARCHAR(60),
    "ifc_type" VARCHAR(60),
    "weight_kg" DECIMAL(12,3),
    "area_m2" DECIMAL(10,3),
    "length_mm" DECIMAL(10,1),
    "width_mm" DECIMAL(10,1),
    "height_mm" DECIMAL(10,1),
    "status" VARCHAR(20) NOT NULL DEFAULT 'unassigned',
    "properties" JSONB NOT NULL,

    CONSTRAINT "bim_element_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bim_model_urn_key" ON "bim_model"("urn");

-- CreateIndex
CREATE INDEX "bim_element_model_id_idx" ON "bim_element"("model_id");

-- AddForeignKey
ALTER TABLE "bim_model" ADD CONSTRAINT "bim_model_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bim_element" ADD CONSTRAINT "bim_element_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "bim_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;
