-- Op 000 "Build-up(Pre-Shop)" gets its own system operation template so it
-- shows a build-up icon (layers — plates built up into an H-beam) and the
-- Beam op type wherever operations render (2026-10-07). status 'system' keeps
-- it out of the Operation Library list and the routing builder.
INSERT INTO "operation_template" ("op_code", "name", "op_type_id", "icon", "workcenter_id", "time_mode", "status")
SELECT 'OP-000-PRESHOP', 'Build-up(Pre-Shop)',
       (SELECT "id" FROM "mrp_op_type" WHERE "key" = 'beam'),
       'layers',
       COALESCE((SELECT "id" FROM "mrp_workcenter" WHERE "code" = 'WC-HBEAM'), (SELECT MIN("id") FROM "mrp_workcenter" WHERE "active")),
       'by_activities', 'system'
WHERE NOT EXISTS (SELECT 1 FROM "operation_template" WHERE "op_code" = 'OP-000-PRESHOP')
  AND EXISTS (SELECT 1 FROM "mrp_workcenter" WHERE "active"); -- an empty DB skips the seed

UPDATE "mrp_routing_workcenter" o
SET "operation_template_id" = ot."id",
    "op_type_id" = ot."op_type_id"
FROM "operation_template" ot, "routing_template" t
WHERE ot."op_code" = 'OP-000-PRESHOP'
  AND t."code" = 'SYS-PRESHOP' AND o."template_id" = t."id";
