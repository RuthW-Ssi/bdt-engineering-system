-- WO Complete records whether the WO finished On Plan or Delayed, plus why (2026-10-01).
CREATE TYPE "WoTimeliness" AS ENUM ('ON_PLAN', 'DELAYED');
ALTER TABLE "work_order" ADD COLUMN "timeliness" "WoTimeliness", ADD COLUMN "delay_note" TEXT;
