-- Sprint 27 follow-up: View becomes a real, enforced permission — removing
-- it blocks the feature entirely (no more universal read-all for the 20
-- business modules). Existing rows that already had any write permission
-- clearly implied the user could see the module too, so backfill can_view
-- for those; brand new rows default to false like the others.
ALTER TABLE "user_module_permission" ADD COLUMN "can_view" BOOLEAN NOT NULL DEFAULT false;

UPDATE "user_module_permission" SET "can_view" = true
  WHERE "can_create" = true OR "can_update" = true OR "can_delete" = true;
