-- CreateTable
CREATE TABLE "cutting_plan_upload" (
    "id" SERIAL NOT NULL,
    "file_id" VARCHAR(100) NOT NULL,
    "project_code" VARCHAR(20) NOT NULL,
    "project_name" VARCHAR(200) NOT NULL,
    "tag" VARCHAR(60) NOT NULL,
    "description" VARCHAR(500),
    "version" VARCHAR(20) NOT NULL,
    "revision" VARCHAR(20) NOT NULL,
    "raw_response" JSONB NOT NULL,
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cutting_plan_upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_plan_nesting" (
    "id" SERIAL NOT NULL,
    "upload_id" INTEGER NOT NULL,
    "cuttingplan_number" VARCHAR(100) NOT NULL,
    "nc_file" VARCHAR(100),
    "need_date" VARCHAR(20),
    "nesting_length_mm" DECIMAL(10,2),
    "nesting_width_mm" DECIMAL(10,2),
    "changer" VARCHAR(60),
    "gen_date" VARCHAR(20),
    "gen_time" VARCHAR(20),
    "technology" VARCHAR(60),
    "article_number" VARCHAR(20),
    "count" INTEGER,
    "plate_number" VARCHAR(60),
    "charge" VARCHAR(100),
    "quality" VARCHAR(30),
    "thick_mm" DECIMAL(10,2),
    "width_mm" DECIMAL(10,2),
    "length_mm" DECIMAL(10,2),
    "area_m2" DECIMAL(10,3),
    "weight_kg" DECIMAL(12,3),
    "nesting_percent" DECIMAL(5,2),
    "path_type" VARCHAR(30),
    "time_min" DECIMAL(10,2),
    "quantity" INTEGER,
    "start_time_min" DECIMAL(10,2),
    "total_time_min" DECIMAL(10,2),

    CONSTRAINT "cutting_plan_nesting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_plan_order_part" (
    "id" SERIAL NOT NULL,
    "upload_id" INTEGER NOT NULL,
    "nesting_id" INTEGER,
    "cuttingplan_number" VARCHAR(100) NOT NULL,
    "tag_part" INTEGER,
    "order_number" VARCHAR(20),
    "item" INTEGER,
    "nested" INTEGER,
    "ordered" INTEGER,
    "due_date" VARCHAR(20),
    "drawing_part_no_version_no" VARCHAR(100),
    "length_mm" DECIMAL(10,2),
    "width_mm" DECIMAL(10,2),
    "weight_kg" DECIMAL(12,3),

    CONSTRAINT "cutting_plan_order_part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_plan_plate_usage" (
    "id" SERIAL NOT NULL,
    "upload_id" INTEGER NOT NULL,
    "nesting_id" INTEGER,
    "cuttingplan_number" VARCHAR(100) NOT NULL,
    "order_number" VARCHAR(20),
    "net_kg" DECIMAL(12,3),
    "gross_kg" DECIMAL(12,3),

    CONSTRAINT "cutting_plan_plate_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutting_plan_remnant" (
    "id" SERIAL NOT NULL,
    "upload_id" INTEGER NOT NULL,
    "nesting_id" INTEGER,
    "cuttingplan_number" VARCHAR(100) NOT NULL,
    "plate_number" VARCHAR(60),
    "length_mm" DECIMAL(10,2),
    "width_mm" DECIMAL(10,2),
    "area_m2" DECIMAL(10,3),
    "weight_kg" DECIMAL(12,3),
    "count" INTEGER,
    "ref_plate" VARCHAR(60),
    "ref_plate_seq" VARCHAR(60),

    CONSTRAINT "cutting_plan_remnant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cutting_plan_upload_file_id_key" ON "cutting_plan_upload"("file_id");

-- CreateIndex
CREATE INDEX "cutting_plan_upload_project_code_idx" ON "cutting_plan_upload"("project_code");

-- CreateIndex
CREATE INDEX "cutting_plan_nesting_upload_id_idx" ON "cutting_plan_nesting"("upload_id");

-- CreateIndex
CREATE INDEX "cutting_plan_nesting_cuttingplan_number_idx" ON "cutting_plan_nesting"("cuttingplan_number");

-- CreateIndex
CREATE INDEX "cutting_plan_order_part_upload_id_idx" ON "cutting_plan_order_part"("upload_id");

-- CreateIndex
CREATE INDEX "cutting_plan_order_part_nesting_id_idx" ON "cutting_plan_order_part"("nesting_id");

-- CreateIndex
CREATE INDEX "cutting_plan_plate_usage_upload_id_idx" ON "cutting_plan_plate_usage"("upload_id");

-- CreateIndex
CREATE INDEX "cutting_plan_plate_usage_nesting_id_idx" ON "cutting_plan_plate_usage"("nesting_id");

-- CreateIndex
CREATE INDEX "cutting_plan_remnant_upload_id_idx" ON "cutting_plan_remnant"("upload_id");

-- CreateIndex
CREATE INDEX "cutting_plan_remnant_nesting_id_idx" ON "cutting_plan_remnant"("nesting_id");

-- AddForeignKey
ALTER TABLE "cutting_plan_upload" ADD CONSTRAINT "cutting_plan_upload_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_nesting" ADD CONSTRAINT "cutting_plan_nesting_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "cutting_plan_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_order_part" ADD CONSTRAINT "cutting_plan_order_part_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "cutting_plan_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_order_part" ADD CONSTRAINT "cutting_plan_order_part_nesting_id_fkey" FOREIGN KEY ("nesting_id") REFERENCES "cutting_plan_nesting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_plate_usage" ADD CONSTRAINT "cutting_plan_plate_usage_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "cutting_plan_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_plate_usage" ADD CONSTRAINT "cutting_plan_plate_usage_nesting_id_fkey" FOREIGN KEY ("nesting_id") REFERENCES "cutting_plan_nesting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_remnant" ADD CONSTRAINT "cutting_plan_remnant_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "cutting_plan_upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cutting_plan_remnant" ADD CONSTRAINT "cutting_plan_remnant_nesting_id_fkey" FOREIGN KEY ("nesting_id") REFERENCES "cutting_plan_nesting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
