-- Activity Library: link each activity to an Operation Type (mrp_op_type).
-- NULL means "All" — usable for every operation type.
ALTER TABLE "activity" ADD COLUMN     "operation_type_id" INTEGER;

ALTER TABLE "activity" ADD CONSTRAINT "activity_operation_type_id_fkey" FOREIGN KEY ("operation_type_id") REFERENCES "mrp_op_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
