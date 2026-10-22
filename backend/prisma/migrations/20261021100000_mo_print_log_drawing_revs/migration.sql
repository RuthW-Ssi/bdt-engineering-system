-- MO/WO follow the drawing revision (2026-10-21, Task 1): records the rev of
-- every (WO, mark) pair whose drawing a print actually included, so a later
-- print can warn (never block) that the drawing changed since this paper.
ALTER TABLE "mo_print_log" ADD COLUMN "drawing_revs" JSONB;
