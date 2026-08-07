-- Sprint 27 follow-up: split the single can_write flag into independent
-- create/update/delete permissions per (user, module). View is never
-- enforced (read-all stands) so no can_view column is needed.
ALTER TABLE "user_module_permission" ADD COLUMN "can_create" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_module_permission" ADD COLUMN "can_update" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_module_permission" ADD COLUMN "can_delete" BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing effective access: a prior can_write=true implied every
-- write route in that module was allowed, so it becomes true for all three.
UPDATE "user_module_permission" SET
  "can_create" = "can_write",
  "can_update" = "can_write",
  "can_delete" = "can_write";

ALTER TABLE "user_module_permission" DROP COLUMN "can_write";
