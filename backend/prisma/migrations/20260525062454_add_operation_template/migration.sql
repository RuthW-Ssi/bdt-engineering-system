-- CreateTable
CREATE TABLE "operation_template" (
    "id" SERIAL NOT NULL,
    "op_code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "op_type_id" INTEGER,
    "workcenter_id" INTEGER,
    "method" VARCHAR(20),
    "time_mode" VARCHAR(20) NOT NULL DEFAULT 'formula',
    "duration_min" DECIMAL(10,4),
    "formula_expr" VARCHAR(400),
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "create_uid" INTEGER NOT NULL DEFAULT 1,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL DEFAULT 1,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_template_activity" (
    "id" SERIAL NOT NULL,
    "operation_template_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 10,
    "name" VARCHAR(200) NOT NULL,
    "measure" VARCHAR(40) NOT NULL,
    "unit" VARCHAR(20),
    "per_minute" DECIMAL(10,4),
    "source_activity_template_id" INTEGER,

    CONSTRAINT "operation_template_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operation_template_op_code_key" ON "operation_template"("op_code");

-- CreateIndex
CREATE INDEX "operation_template_activity_operation_template_id_idx" ON "operation_template_activity"("operation_template_id");

-- AddForeignKey
ALTER TABLE "operation_template" ADD CONSTRAINT "operation_template_op_type_id_fkey" FOREIGN KEY ("op_type_id") REFERENCES "mrp_op_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_template" ADD CONSTRAINT "operation_template_workcenter_id_fkey" FOREIGN KEY ("workcenter_id") REFERENCES "mrp_workcenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_template_activity" ADD CONSTRAINT "operation_template_activity_operation_template_id_fkey" FOREIGN KEY ("operation_template_id") REFERENCES "operation_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_template_activity" ADD CONSTRAINT "operation_template_activity_source_activity_template_id_fkey" FOREIGN KEY ("source_activity_template_id") REFERENCES "routing_activity_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
