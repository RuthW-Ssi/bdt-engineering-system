-- Rename project_zone target_erection_start/end → target_start/end.
-- These dates were never erection-only in practice; a second consumer
-- (schedule Plan-vs-Actual) needs the same window for fab pace, so the
-- field is renamed to reflect the whole zone's work window.
ALTER TABLE "project_zone" RENAME COLUMN "target_erection_start" TO "target_start";
ALTER TABLE "project_zone" RENAME COLUMN "target_erection_end" TO "target_end";
