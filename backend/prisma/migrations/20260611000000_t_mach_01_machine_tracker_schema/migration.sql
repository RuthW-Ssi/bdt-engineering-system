-- T-MACH.01 · Machine Tracker schema migration
-- Idempotent: all guards use IF NOT EXISTS / DO $$ style

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE "EquipmentStatus" AS ENUM ('OPERATIONAL','MAINTENANCE','REPAIR','UNAVAILABLE','RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RepairStatus" AS ENUM ('OPEN','IN_PROGRESS','CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RepairSeverity" AS ENUM ('LOW','MEDIUM','HIGH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Modify equipment_resource
ALTER TABLE "equipment_resource"
  ADD COLUMN IF NOT EXISTS "current_status"      "EquipmentStatus" NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN IF NOT EXISTS "last_maintenance_at"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "location"             VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "manufacturer"         VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "model"                VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "serial_number"        VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "install_date"         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "specs"                TEXT,
  ADD COLUMN IF NOT EXISTS "photo_url"            TEXT;

-- 3. maintenance_log
CREATE TABLE IF NOT EXISTS "maintenance_log" (
  "id"             SERIAL PRIMARY KEY,
  "machine_id"     INTEGER NOT NULL REFERENCES "equipment_resource"("id"),
  "performed_at"   TIMESTAMPTZ NOT NULL,
  "performed_by"   VARCHAR(120) NOT NULL,
  "description"    TEXT NOT NULL,
  "parts_replaced" TEXT,
  "duration_min"   INTEGER,
  "notes"          TEXT,
  "photo_urls"     TEXT[] NOT NULL DEFAULT '{}',
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. repair_ticket
CREATE TABLE IF NOT EXISTS "repair_ticket" (
  "id"                  SERIAL PRIMARY KEY,
  "machine_id"          INTEGER NOT NULL REFERENCES "equipment_resource"("id"),
  "ticket_code"         VARCHAR(20) NOT NULL UNIQUE,
  "status"              "RepairStatus" NOT NULL DEFAULT 'OPEN',
  "severity"            "RepairSeverity" NOT NULL,
  "reported_by"         VARCHAR(120) NOT NULL,
  "reported_at"         TIMESTAMPTZ NOT NULL,
  "problem_description" TEXT NOT NULL,
  "photos_before"       TEXT[] NOT NULL DEFAULT '{}',
  "repaired_by"         VARCHAR(120),
  "closed_at"           TIMESTAMPTZ,
  "repair_description"  TEXT,
  "parts_replaced"      TEXT,
  "duration_min"        INTEGER,
  "photos_after"        TEXT[] NOT NULL DEFAULT '{}',
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. machine_status_history
CREATE TABLE IF NOT EXISTS "machine_status_history" (
  "id"                     SERIAL PRIMARY KEY,
  "machine_id"             INTEGER NOT NULL REFERENCES "equipment_resource"("id"),
  "from_status"            "EquipmentStatus" NOT NULL,
  "to_status"              "EquipmentStatus" NOT NULL,
  "reason"                 TEXT NOT NULL,
  "changed_by"             VARCHAR(120) NOT NULL,
  "changed_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "related_repair_id"      INTEGER,
  "related_maintenance_id" INTEGER
);

-- 6. repair_ticket_seq
CREATE TABLE IF NOT EXISTS "repair_ticket_seq" (
  "id"       INTEGER PRIMARY KEY DEFAULT 1,
  "next_val" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "repair_ticket_seq" ("id", "next_val")
VALUES (1, 1)
ON CONFLICT ("id") DO NOTHING;
