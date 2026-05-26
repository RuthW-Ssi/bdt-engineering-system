-- AlterTable
ALTER TABLE "mrp_routing_workcenter" ADD COLUMN     "op_type_id" INTEGER;

-- CreateTable
CREATE TABLE "mrp_op_type" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(30) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "color" VARCHAR(10) NOT NULL DEFAULT '#555555',
    "default_op_code" VARCHAR(10),
    "method_options" JSONB,
    "sequence" INTEGER NOT NULL DEFAULT 10,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_wc_id" INTEGER,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "write_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mrp_op_type_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mrp_op_type_key_key" ON "mrp_op_type"("key");

-- AddForeignKey
ALTER TABLE "mrp_op_type" ADD CONSTRAINT "mrp_op_type_default_wc_id_fkey" FOREIGN KEY ("default_wc_id") REFERENCES "mrp_workcenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_routing_workcenter" ADD CONSTRAINT "mrp_routing_workcenter_op_type_id_fkey" FOREIGN KEY ("op_type_id") REFERENCES "mrp_op_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
