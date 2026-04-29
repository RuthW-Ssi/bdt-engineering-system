-- AlterTable
ALTER TABLE "product_bom_line" ADD COLUMN     "operation_id" INTEGER;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "active_routing_id" INTEGER;

-- CreateTable
CREATE TABLE "mrp_workcenter" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 10,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "capacity" DECIMAL(8,2) NOT NULL DEFAULT 1.0,
    "working_hours_per_week" DECIMAL(6,2) NOT NULL DEFAULT 40,
    "time_efficiency" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "time_start" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "time_stop" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "oee_target" DECIMAL(5,2) NOT NULL DEFAULT 90,
    "availability" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "performance" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "quality" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "labor_mix" JSONB NOT NULL DEFAULT '{"operator":100,"skilled":0,"group_head":0}',
    "labor_cost_per_min" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "electricity_cost_per_min" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "consumable_cost_per_min" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "overhead_cost_per_min" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "capacity_per_period" JSONB,
    "parent_id" INTEGER,
    "resource_type" VARCHAR(20) NOT NULL DEFAULT 'workcenter',
    "shared_resource_tag" VARCHAR(40),
    "odoo_ref_id" VARCHAR(40),
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrp_workcenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mrp_routing_workcenter" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER,
    "routing_template" VARCHAR(20),
    "name" VARCHAR(60) NOT NULL,
    "op_code" VARCHAR(30) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 10,
    "workcenter_id" INTEGER NOT NULL,
    "time_cycle" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "time_cycle_manual" DECIMAL(10,4),
    "time_mode" VARCHAR(10) NOT NULL DEFAULT 'formula',
    "routing_view" VARCHAR(10) NOT NULL DEFAULT 'eRoute',
    "state" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "last_computed_at" TIMESTAMPTZ,
    "cache_key" VARCHAR(64),
    "blocked_by_op_ids" INTEGER[],
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrp_routing_workcenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_activity_template" (
    "id" SERIAL NOT NULL,
    "op_code" VARCHAR(30) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 10,
    "include_idle" BOOLEAN NOT NULL DEFAULT false,
    "per_minute" DECIMAL(10,4) NOT NULL,
    "formula_param_code" VARCHAR(40) NOT NULL,
    "std_measure" DECIMAL(12,4) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "formula_param_code2" VARCHAR(40),
    "std_measure2" DECIMAL(12,4),
    "unit2" VARCHAR(20),
    "manpower" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "workcenter_id" INTEGER NOT NULL,
    "equipment_ref" VARCHAR(120),
    "consumable_note" VARCHAR(200),
    "utilities_note" VARCHAR(40),
    "version" VARCHAR(20) NOT NULL DEFAULT '1.0',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" VARCHAR(20) NOT NULL DEFAULT 'xlsx_seed',
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_uid" INTEGER NOT NULL,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_activity_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_step_activity" (
    "id" SERIAL NOT NULL,
    "routing_workcenter_id" INTEGER NOT NULL,
    "activity_template_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 10,
    "per_minute_override" DECIMAL(10,4),
    "std_measure_override" DECIMAL(12,4),
    "manpower_override" DECIMAL(4,2),
    "last_cycle_time_min" DECIMAL(10,4),
    "last_input_snapshot" JSONB,
    "last_computed_at" TIMESTAMPTZ,

    CONSTRAINT "routing_step_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_formula_param" (
    "code" VARCHAR(40) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "formula_expression" VARCHAR(400) NOT NULL,
    "inputs_required" TEXT[],
    "return_unit" VARCHAR(20) NOT NULL,
    "applies_to_groups" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_formula_param_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "mrp_workcenter_code_key" ON "mrp_workcenter"("code");

-- CreateIndex
CREATE INDEX "mrp_routing_workcenter_product_id_idx" ON "mrp_routing_workcenter"("product_id");

-- CreateIndex
CREATE INDEX "mrp_routing_workcenter_routing_template_idx" ON "mrp_routing_workcenter"("routing_template");

-- CreateIndex
CREATE UNIQUE INDEX "ux_routing_op_seq_per_product" ON "mrp_routing_workcenter"("product_id", "sequence");

-- CreateIndex
CREATE INDEX "routing_activity_template_op_code_idx" ON "routing_activity_template"("op_code");

-- CreateIndex
CREATE INDEX "routing_step_activity_routing_workcenter_id_idx" ON "routing_step_activity"("routing_workcenter_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_active_routing_id_fkey" FOREIGN KEY ("active_routing_id") REFERENCES "mrp_routing_workcenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom_line" ADD CONSTRAINT "product_bom_line_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "mrp_routing_workcenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_workcenter" ADD CONSTRAINT "mrp_workcenter_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "mrp_workcenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_workcenter" ADD CONSTRAINT "mrp_workcenter_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_workcenter" ADD CONSTRAINT "mrp_workcenter_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_routing_workcenter" ADD CONSTRAINT "mrp_routing_workcenter_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_routing_workcenter" ADD CONSTRAINT "mrp_routing_workcenter_workcenter_id_fkey" FOREIGN KEY ("workcenter_id") REFERENCES "mrp_workcenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_routing_workcenter" ADD CONSTRAINT "mrp_routing_workcenter_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_routing_workcenter" ADD CONSTRAINT "mrp_routing_workcenter_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_activity_template" ADD CONSTRAINT "routing_activity_template_formula_param_code_fkey" FOREIGN KEY ("formula_param_code") REFERENCES "routing_formula_param"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_activity_template" ADD CONSTRAINT "routing_activity_template_formula_param_code2_fkey" FOREIGN KEY ("formula_param_code2") REFERENCES "routing_formula_param"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_activity_template" ADD CONSTRAINT "routing_activity_template_workcenter_id_fkey" FOREIGN KEY ("workcenter_id") REFERENCES "mrp_workcenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_activity_template" ADD CONSTRAINT "routing_activity_template_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_activity_template" ADD CONSTRAINT "routing_activity_template_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_step_activity" ADD CONSTRAINT "routing_step_activity_routing_workcenter_id_fkey" FOREIGN KEY ("routing_workcenter_id") REFERENCES "mrp_routing_workcenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_step_activity" ADD CONSTRAINT "routing_step_activity_activity_template_id_fkey" FOREIGN KEY ("activity_template_id") REFERENCES "routing_activity_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
