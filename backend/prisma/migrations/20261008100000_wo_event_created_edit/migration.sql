-- Every change is in History (2026-10-08): a WO's creation and its edits
-- (actual dates, consume, part withdrawals) become work_order_event rows.
ALTER TYPE "WoEventType" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "WoEventType" ADD VALUE IF NOT EXISTS 'EDIT';
