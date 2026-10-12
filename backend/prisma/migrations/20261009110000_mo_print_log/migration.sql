-- Print log (2026-10-09): which MO Rev each printed packet carried.
CREATE TABLE "mo_print_log" (
    "id" SERIAL NOT NULL,
    "mo_id" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "wo_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "include_manifest" BOOLEAN NOT NULL DEFAULT true,
    "printed_by" VARCHAR(120) NOT NULL,
    "printed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mo_print_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mo_print_log_mo_id_idx" ON "mo_print_log"("mo_id");
ALTER TABLE "mo_print_log" ADD CONSTRAINT "mo_print_log_mo_id_fkey" FOREIGN KEY ("mo_id") REFERENCES "manufacturing_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
