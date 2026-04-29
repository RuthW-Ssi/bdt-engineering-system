-- DropForeignKey
ALTER TABLE "custom_routing" DROP CONSTRAINT "custom_routing_cloned_from_template_id_fkey";

-- DropForeignKey
ALTER TABLE "custom_routing" DROP CONSTRAINT "custom_routing_create_uid_fkey";

-- DropForeignKey
ALTER TABLE "custom_routing" DROP CONSTRAINT "custom_routing_product_id_fkey";

-- DropForeignKey
ALTER TABLE "custom_routing" DROP CONSTRAINT "custom_routing_write_uid_fkey";

-- DropForeignKey
ALTER TABLE "custom_routing_activity" DROP CONSTRAINT "custom_routing_activity_formula_param_code2_fkey";

-- DropForeignKey
ALTER TABLE "custom_routing_activity" DROP CONSTRAINT "custom_routing_activity_formula_param_code_fkey";

-- DropForeignKey
ALTER TABLE "custom_routing_activity" DROP CONSTRAINT "custom_routing_activity_op_id_fkey";

-- DropForeignKey
ALTER TABLE "custom_routing_activity" DROP CONSTRAINT "custom_routing_activity_workcenter_id_fkey";

-- DropForeignKey
ALTER TABLE "custom_routing_op" DROP CONSTRAINT "custom_routing_op_custom_routing_id_fkey";

-- DropForeignKey
ALTER TABLE "custom_routing_op" DROP CONSTRAINT "custom_routing_op_workcenter_id_fkey";

-- DropForeignKey
ALTER TABLE "mrp_routing_workcenter" DROP CONSTRAINT "mrp_routing_workcenter_template_id_fkey";

-- DropForeignKey
ALTER TABLE "product_routing_override" DROP CONSTRAINT "product_routing_override_activity_template_id_fkey";

-- DropForeignKey
ALTER TABLE "product_routing_override" DROP CONSTRAINT "product_routing_override_create_uid_fkey";

-- DropForeignKey
ALTER TABLE "product_routing_override" DROP CONSTRAINT "product_routing_override_override_workcenter_id_fkey";

-- DropForeignKey
ALTER TABLE "product_routing_override" DROP CONSTRAINT "product_routing_override_product_id_fkey";

-- DropForeignKey
ALTER TABLE "product_routing_override" DROP CONSTRAINT "product_routing_override_write_uid_fkey";

-- DropForeignKey
ALTER TABLE "product_routing_override_history" DROP CONSTRAINT "product_routing_override_history_changed_by_uid_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_routing_template_id_fkey";

-- DropForeignKey
ALTER TABLE "routing_activity_template_history" DROP CONSTRAINT "routing_activity_template_history_activity_template_id_fkey";

-- DropForeignKey
ALTER TABLE "routing_activity_template_history" DROP CONSTRAINT "routing_activity_template_history_changed_by_uid_fkey";

-- DropForeignKey
ALTER TABLE "routing_op_activity" DROP CONSTRAINT "routing_op_activity_activity_template_id_fkey";

-- DropForeignKey
ALTER TABLE "routing_op_activity" DROP CONSTRAINT "routing_op_activity_routing_workcenter_id_fkey";

-- DropForeignKey
ALTER TABLE "routing_template" DROP CONSTRAINT "routing_template_applies_to_categ_id_fkey";

-- DropForeignKey
ALTER TABLE "routing_template" DROP CONSTRAINT "routing_template_create_uid_fkey";

-- DropForeignKey
ALTER TABLE "routing_template" DROP CONSTRAINT "routing_template_write_uid_fkey";

-- DropForeignKey
ALTER TABLE "routing_template_binding_rule" DROP CONSTRAINT "routing_template_binding_rule_routing_template_id_fkey";

-- DropForeignKey
ALTER TABLE "routing_template_history" DROP CONSTRAINT "routing_template_history_changed_by_uid_fkey";

-- DropForeignKey
ALTER TABLE "routing_template_history" DROP CONSTRAINT "routing_template_history_template_id_fkey";

-- DropIndex
DROP INDEX "products_routing_template_id_idx";

-- AlterTable
ALTER TABLE "custom_routing_op" ALTER COLUMN "blocked_by_op_ids" DROP DEFAULT;

-- CreateTable
CREATE TABLE "routing_template_test_fixture" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "source_mode" VARCHAR(20) NOT NULL,
    "source_product_id" INTEGER,
    "attribute_values" JSONB NOT NULL,
    "expected_total_min" DECIMAL(10,2),
    "expected_total_cost" DECIMAL(12,2),
    "create_uid" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_template_test_fixture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "routing_template_test_fixture_template_id_idx" ON "routing_template_test_fixture"("template_id");

-- CreateIndex
CREATE INDEX "routing_template_test_fixture_source_product_id_idx" ON "routing_template_test_fixture"("source_product_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_routing_template_id_fkey" FOREIGN KEY ("routing_template_id") REFERENCES "routing_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mrp_routing_workcenter" ADD CONSTRAINT "mrp_routing_workcenter_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "routing_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_op_activity" ADD CONSTRAINT "routing_op_activity_routing_workcenter_id_fkey" FOREIGN KEY ("routing_workcenter_id") REFERENCES "mrp_routing_workcenter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_op_activity" ADD CONSTRAINT "routing_op_activity_activity_template_id_fkey" FOREIGN KEY ("activity_template_id") REFERENCES "routing_activity_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_template" ADD CONSTRAINT "routing_template_applies_to_categ_id_fkey" FOREIGN KEY ("applies_to_categ_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_template" ADD CONSTRAINT "routing_template_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_template" ADD CONSTRAINT "routing_template_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_activity_template_id_fkey" FOREIGN KEY ("activity_template_id") REFERENCES "routing_activity_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_override_workcenter_id_fkey" FOREIGN KEY ("override_workcenter_id") REFERENCES "mrp_workcenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_routing_override" ADD CONSTRAINT "product_routing_override_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing" ADD CONSTRAINT "custom_routing_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing" ADD CONSTRAINT "custom_routing_cloned_from_template_id_fkey" FOREIGN KEY ("cloned_from_template_id") REFERENCES "routing_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing" ADD CONSTRAINT "custom_routing_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing" ADD CONSTRAINT "custom_routing_write_uid_fkey" FOREIGN KEY ("write_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing_op" ADD CONSTRAINT "custom_routing_op_custom_routing_id_fkey" FOREIGN KEY ("custom_routing_id") REFERENCES "custom_routing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing_op" ADD CONSTRAINT "custom_routing_op_workcenter_id_fkey" FOREIGN KEY ("workcenter_id") REFERENCES "mrp_workcenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing_activity" ADD CONSTRAINT "custom_routing_activity_op_id_fkey" FOREIGN KEY ("op_id") REFERENCES "custom_routing_op"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing_activity" ADD CONSTRAINT "custom_routing_activity_formula_param_code_fkey" FOREIGN KEY ("formula_param_code") REFERENCES "routing_formula_param"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing_activity" ADD CONSTRAINT "custom_routing_activity_formula_param_code2_fkey" FOREIGN KEY ("formula_param_code2") REFERENCES "routing_formula_param"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_routing_activity" ADD CONSTRAINT "custom_routing_activity_workcenter_id_fkey" FOREIGN KEY ("workcenter_id") REFERENCES "mrp_workcenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_template_binding_rule" ADD CONSTRAINT "routing_template_binding_rule_routing_template_id_fkey" FOREIGN KEY ("routing_template_id") REFERENCES "routing_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_template_test_fixture" ADD CONSTRAINT "routing_template_test_fixture_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "routing_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_template_test_fixture" ADD CONSTRAINT "routing_template_test_fixture_source_product_id_fkey" FOREIGN KEY ("source_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_template_test_fixture" ADD CONSTRAINT "routing_template_test_fixture_create_uid_fkey" FOREIGN KEY ("create_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_template_history" ADD CONSTRAINT "routing_template_history_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "routing_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_template_history" ADD CONSTRAINT "routing_template_history_changed_by_uid_fkey" FOREIGN KEY ("changed_by_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_activity_template_history" ADD CONSTRAINT "routing_activity_template_history_activity_template_id_fkey" FOREIGN KEY ("activity_template_id") REFERENCES "routing_activity_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_activity_template_history" ADD CONSTRAINT "routing_activity_template_history_changed_by_uid_fkey" FOREIGN KEY ("changed_by_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_routing_override_history" ADD CONSTRAINT "product_routing_override_history_changed_by_uid_fkey" FOREIGN KEY ("changed_by_uid") REFERENCES "res_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "custom_routing_template_idx" RENAME TO "custom_routing_cloned_from_template_id_idx";

-- RenameIndex
ALTER INDEX "custom_routing_activity_seq_key" RENAME TO "custom_routing_activity_op_id_sequence_key";

-- RenameIndex
ALTER INDEX "custom_routing_activity_wc_idx" RENAME TO "custom_routing_activity_workcenter_id_idx";

-- RenameIndex
ALTER INDEX "custom_routing_op_seq_key" RENAME TO "custom_routing_op_custom_routing_id_sequence_key";

-- RenameIndex
ALTER INDEX "custom_routing_op_wc_idx" RENAME TO "custom_routing_op_workcenter_id_idx";

-- RenameIndex
ALTER INDEX "product_routing_override_act_idx" RENAME TO "product_routing_override_activity_template_id_idx";

-- RenameIndex
ALTER INDEX "product_routing_override_prod_idx" RENAME TO "product_routing_override_product_id_idx";

-- RenameIndex
ALTER INDEX "product_routing_override_history_activity_template_id_changed_a" RENAME TO "product_routing_override_history_activity_template_id_chang_idx";

-- RenameIndex
ALTER INDEX "routing_activity_template_history_activity_template_id_changed_" RENAME TO "routing_activity_template_history_activity_template_id_chan_idx";

-- RenameIndex
ALTER INDEX "routing_op_activity_act_tmpl_idx" RENAME TO "routing_op_activity_activity_template_id_idx";

-- RenameIndex
ALTER INDEX "routing_op_activity_rwc_seq_key" RENAME TO "routing_op_activity_routing_workcenter_id_sequence_key";

-- RenameIndex
ALTER INDEX "routing_template_binding_rule_priority_idx" RENAME TO "routing_template_binding_rule_priority_active_idx";

-- RenameIndex
ALTER INDEX "routing_template_binding_rule_tmpl_idx" RENAME TO "routing_template_binding_rule_routing_template_id_idx";
