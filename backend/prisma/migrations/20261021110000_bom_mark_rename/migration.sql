-- BOM mark/part renamed between dispatch versions (2026-10-21): confirmed
-- pairs + their pair/undo History. Additive only.
CREATE TABLE "bom_mark_rename" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "zone_id" INTEGER NOT NULL,
    "sub_zone_id" INTEGER,
    "dispatch_id" INTEGER NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "from_mark" VARCHAR(100) NOT NULL,
    "to_mark" VARCHAR(100) NOT NULL,
    "from_ref_id" INTEGER NOT NULL,
    "to_ref_id" INTEGER NOT NULL,
    "carried" JSONB,
    "confirmed_by" VARCHAR(120) NOT NULL,
    "confirmed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ,
    CONSTRAINT "bom_mark_rename_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "bom_mark_rename_event" (
    "id" SERIAL NOT NULL,
    "dispatch_id" INTEGER NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "from_mark" VARCHAR(100) NOT NULL,
    "to_mark" VARCHAR(100) NOT NULL,
    "keep" VARCHAR(3),
    "changes" JSONB,
    "recorded_by" VARCHAR(120) NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bom_mark_rename_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bom_mark_rename_dispatch_id_kind_from_mark_key" ON "bom_mark_rename"("dispatch_id", "kind", "from_mark");
CREATE UNIQUE INDEX "bom_mark_rename_dispatch_id_kind_to_mark_key" ON "bom_mark_rename"("dispatch_id", "kind", "to_mark");
CREATE INDEX "bom_mark_rename_project_id_zone_id_sub_zone_id_idx" ON "bom_mark_rename"("project_id", "zone_id", "sub_zone_id");
CREATE INDEX "bom_mark_rename_event_dispatch_id_recorded_at_idx" ON "bom_mark_rename_event"("dispatch_id", "recorded_at");
ALTER TABLE "bom_mark_rename" ADD CONSTRAINT "bom_mark_rename_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bom_mark_rename_event" ADD CONSTRAINT "bom_mark_rename_event_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "bom_dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
