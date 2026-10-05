-- WO progress history (2026-10-05): per-mark progress saves are audited in
-- work_order_event. Additive only: new enum value + nullable column.
ALTER TYPE "WoEventType" ADD VALUE IF NOT EXISTS 'PROGRESS_UPDATE';
ALTER TABLE "work_order_event" ADD COLUMN "changes" JSONB;
