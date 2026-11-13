-- Cutting plan "All zones (whole project)" = an upload with no zone (Tao 2026-11-10, option ก).
-- The legacy re-upload (2026-11-09/10) created a real zone `ALL — All zones` in each project instead. Move those
-- uploads to "no zone", then delete the ALL zones that nothing else uses. manufacturing_order and products are
-- ON DELETE SET NULL, so a delete would silently blank them: every referencing table is checked explicitly.
UPDATE "cutting_plan_upload" SET "zone_id" = NULL, "sub_zone_id" = NULL
WHERE "zone_id" IN (SELECT "id" FROM "project_zone" WHERE "code" = 'ALL' AND "label" = 'All zones');

DELETE FROM "project_zone" z
WHERE z."code" = 'ALL' AND z."label" = 'All zones'
  AND NOT EXISTS (SELECT 1 FROM "cutting_plan_upload" t WHERE t."zone_id" = z."id")
  AND NOT EXISTS (SELECT 1 FROM "sub_zone" t WHERE t."zone_id" = z."id")
  AND NOT EXISTS (SELECT 1 FROM "drawing" t WHERE t."zone_id" = z."id")
  AND NOT EXISTS (SELECT 1 FROM "bom_dispatch" t WHERE t."zone_id" = z."id")
  AND NOT EXISTS (SELECT 1 FROM "manufacturing_order" t WHERE t."zone_id" = z."id")
  AND NOT EXISTS (SELECT 1 FROM "products" t WHERE t."erection_zone_id" = z."id");
