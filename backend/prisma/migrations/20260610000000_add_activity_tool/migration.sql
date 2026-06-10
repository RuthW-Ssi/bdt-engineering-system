-- CreateTable
CREATE TABLE IF NOT EXISTS "activity_tool" (
    "activity_id" INTEGER NOT NULL,
    "resource_id" INTEGER NOT NULL,

    CONSTRAINT "activity_tool_pkey" PRIMARY KEY ("activity_id","resource_id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_tool_resource_id_idx" ON "activity_tool"("resource_id");

-- AddForeignKey (guarded — table may pre-exist from out-of-band db push)
DO $$ BEGIN
    ALTER TABLE "activity_tool" ADD CONSTRAINT "activity_tool_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey (guarded)
DO $$ BEGIN
    ALTER TABLE "activity_tool" ADD CONSTRAINT "activity_tool_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "equipment_resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
