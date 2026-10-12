-- MO type replaces the mark-prefix choice when creating an MO (2026-10-07):
-- FULL_SHOP = the original flow, PRE_SHOP = marks from a Dispatch Note /
-- pre-shop drawing before the full shop drawing exists.
CREATE TYPE "MoShopType" AS ENUM ('FULL_SHOP', 'PRE_SHOP');
ALTER TABLE "manufacturing_order" ADD COLUMN "shop_type" "MoShopType" NOT NULL DEFAULT 'FULL_SHOP';

-- MOs are no longer created per mark prefix; existing MOs keep theirs (FK kept).
ALTER TABLE "manufacturing_order" ALTER COLUMN "primary_mark_prefix_code" DROP NOT NULL;

-- System routing template holding op 000 "Build-up(Pre-Shop)". PRE_SHOP MOs
-- show it before their own routing's operations and can issue WOs on it.
-- active = false keeps it out of every routing list / picker.
INSERT INTO "routing_template" ("code", "name", "description", "state", "active", "applies_to_product_type", "create_uid", "write_uid")
SELECT 'SYS-PRESHOP', 'Build-up (Pre-Shop) — system', 'Operation 000 prepended to every PRE_SHOP MO', 'system', false, NULL,
       (SELECT MIN(id) FROM "res_users"), (SELECT MIN(id) FROM "res_users")
WHERE NOT EXISTS (SELECT 1 FROM "routing_template" WHERE "code" = 'SYS-PRESHOP')
  AND EXISTS (SELECT 1 FROM "res_users"); -- an empty DB (shadow / fresh test DB) skips the seed

INSERT INTO "mrp_routing_workcenter" ("template_id", "name", "op_code", "sequence", "workcenter_id", "time_mode", "activities_snapshot", "create_uid", "write_uid")
SELECT t."id", 'Build-up(Pre-Shop)', 'OP-000', 0,
       COALESCE((SELECT "id" FROM "mrp_workcenter" WHERE "code" = 'WC-HBEAM'), (SELECT MIN("id") FROM "mrp_workcenter" WHERE "active")),
       'activities', '[]'::jsonb, t."create_uid", t."create_uid"
FROM "routing_template" t
WHERE t."code" = 'SYS-PRESHOP'
  AND NOT EXISTS (SELECT 1 FROM "mrp_routing_workcenter" o WHERE o."template_id" = t."id")
  AND EXISTS (SELECT 1 FROM "mrp_workcenter" WHERE "active"); -- needs a workcenter (NOT NULL)
