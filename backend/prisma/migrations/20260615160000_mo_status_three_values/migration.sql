-- F-MO follow-up · reduce MoStatus to DRAFT / CONFIRMED / CANCELLED.
-- Postgres can't drop enum values in place → recreate the type, remapping
-- removed values (IN_PROGRESS, DONE) to CONFIRMED on all 3 columns that use it.

-- 1) drop default + widen columns to text so we can remap freely
ALTER TABLE "manufacturing_order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "manufacturing_order" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "mo_status_history" ALTER COLUMN "from_status" TYPE TEXT USING "from_status"::text;
ALTER TABLE "mo_status_history" ALTER COLUMN "to_status" TYPE TEXT USING "to_status"::text;

-- 2) remap removed values
UPDATE "manufacturing_order" SET "status" = 'CONFIRMED' WHERE "status" IN ('IN_PROGRESS', 'DONE');
UPDATE "mo_status_history" SET "from_status" = 'CONFIRMED' WHERE "from_status" IN ('IN_PROGRESS', 'DONE');
UPDATE "mo_status_history" SET "to_status" = 'CONFIRMED' WHERE "to_status" IN ('IN_PROGRESS', 'DONE');
-- drop history rows that became no-op after remap (e.g. CONFIRMED→CONFIRMED)
DELETE FROM "mo_status_history" WHERE "from_status" = "to_status";

-- 3) recreate the enum with the 3 pilot values
ALTER TYPE "MoStatus" RENAME TO "MoStatus_old";
CREATE TYPE "MoStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
ALTER TABLE "manufacturing_order" ALTER COLUMN "status" TYPE "MoStatus" USING "status"::"MoStatus";
ALTER TABLE "mo_status_history" ALTER COLUMN "from_status" TYPE "MoStatus" USING "from_status"::"MoStatus";
ALTER TABLE "mo_status_history" ALTER COLUMN "to_status" TYPE "MoStatus" USING "to_status"::"MoStatus";
ALTER TABLE "manufacturing_order" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "MoStatus_old";
