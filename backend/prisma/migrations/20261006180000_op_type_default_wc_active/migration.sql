-- Op types pointed their default_wc at retired workcenters (WC-BU, WC-PT,
-- WC-PR, WC-CUT-PLATE-CNC2.5M) and Drill at a cutting one, so the Operation /
-- Routing builders scoped Drill to the "Cutting" category and hid WC-DRILL
-- (2026-10-06). Repoint each default to an active workcenter, by code.
-- Only rows whose default is missing-or-inactive are touched, so a default
-- someone already fixed by hand is kept. Inspect gets no default (QC happens
-- at any station → show every workcenter).
UPDATE "mrp_op_type" t
SET "default_wc_id" = w."id", "write_date" = now()
FROM (VALUES
  ('cut',   'WC-CUT-PLATE6.0M'),
  ('drill', 'WC-DRILL'),
  ('fitup', 'WC-FIT-WELD'),
  ('weld',  'WC-FIT-WELD'),
  ('grind', 'WC-GRIND'),
  ('blast', 'WC-SURFACE'),
  ('paint', 'WC-PAINT')
) AS m("key", "wc_code")
JOIN "mrp_workcenter" w ON w."code" = m."wc_code" AND w."active" = true
WHERE t."key" = m."key"
  AND NOT EXISTS (
    SELECT 1 FROM "mrp_workcenter" cur
    WHERE cur."id" = t."default_wc_id" AND cur."active" = true
  );

UPDATE "mrp_op_type" t
SET "default_wc_id" = NULL, "write_date" = now()
WHERE t."key" = 'inspect'
  AND t."default_wc_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "mrp_workcenter" cur
    WHERE cur."id" = t."default_wc_id" AND cur."active" = true
  );
