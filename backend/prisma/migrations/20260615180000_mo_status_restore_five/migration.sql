-- F-MO · restore MoStatus to the original 5 values (re-add IN_PROGRESS, DONE).
-- ADD VALUE is non-destructive; positioned to keep the original ordering.
ALTER TYPE "MoStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS' BEFORE 'CANCELLED';
ALTER TYPE "MoStatus" ADD VALUE IF NOT EXISTS 'DONE' BEFORE 'CANCELLED';
