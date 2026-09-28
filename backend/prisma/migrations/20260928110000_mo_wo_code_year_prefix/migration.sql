-- MO/WO code format now embeds a 2-digit year (2026-09-28: "อยากให้ใส่ปี
-- เข้าไปด้วย...รีใหม่เลย") — MO-NNNNN / WO-NNNNNNNN (flat global counters)
-- become MO-YYNNNNNN / WO-YYNNNNNN (2-digit year + 6-digit per-year
-- counter, same total width as the old WO format). Every existing
-- manufacturing_order/work_order row is renumbered in its own original
-- chronological order (by create_date/created_at), grouped by the year it
-- was actually created in, so relative ordering within a year is exactly
-- preserved. mo_code_seq/work_order_code_seq go from a single row (id=1)
-- to one row per year (PK `year`), reseeded here from the renumbered data
-- so the very next MO/WO created continues correctly with no gap or
-- collision — see mo-code.generator.ts / wo-auto-create.service.ts for the
-- generator side of this change (now an atomic upsert, race-safe even for
-- a brand-new year's first row, since this migration only guarantees a
-- seeded row for years that already had at least one MO/WO before today).

-- Renumber manufacturing_order
WITH ranked AS (
  SELECT id, EXTRACT(YEAR FROM create_date)::int AS yr,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM create_date) ORDER BY create_date ASC) AS rn
  FROM "manufacturing_order"
)
UPDATE "manufacturing_order" mo
SET mo_code = 'MO-' || LPAD((ranked.yr % 100)::text, 2, '0') || LPAD(ranked.rn::text, 6, '0')
FROM ranked
WHERE mo.id = ranked.id;

-- Renumber work_order the same way, keyed off created_at
WITH ranked AS (
  SELECT id, EXTRACT(YEAR FROM created_at)::int AS yr,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM created_at) ORDER BY created_at ASC) AS rn
  FROM "work_order"
)
UPDATE "work_order" wo
SET wo_code = 'WO-' || LPAD((ranked.yr % 100)::text, 2, '0') || LPAD(ranked.rn::text, 6, '0')
FROM ranked
WHERE wo.id = ranked.id;

-- mo_code_seq: single row (id=1) -> one row per year (PK year), reseeded
-- so next_val continues right after the highest sequence just assigned
-- above for each year. Left empty on a DB with zero manufacturing_order
-- rows (e.g. staging right after this ships) — the generator's own
-- INSERT ... ON CONFLICT upsert seeds a year's first row itself.
ALTER TABLE "mo_code_seq" DROP CONSTRAINT "mo_code_seq_pkey";
ALTER TABLE "mo_code_seq" RENAME COLUMN "id" TO "year";
DELETE FROM "mo_code_seq";
INSERT INTO "mo_code_seq" (year, next_val)
SELECT (EXTRACT(YEAR FROM create_date)::int % 100), COUNT(*) + 1
FROM "manufacturing_order" GROUP BY 1;
ALTER TABLE "mo_code_seq" ADD CONSTRAINT "mo_code_seq_pkey" PRIMARY KEY ("year");

-- work_order_code_seq: same
ALTER TABLE "work_order_code_seq" DROP CONSTRAINT "work_order_code_seq_pkey";
ALTER TABLE "work_order_code_seq" RENAME COLUMN "id" TO "year";
DELETE FROM "work_order_code_seq";
INSERT INTO "work_order_code_seq" (year, next_val)
SELECT (EXTRACT(YEAR FROM created_at)::int % 100), COUNT(*) + 1
FROM "work_order" GROUP BY 1;
ALTER TABLE "work_order_code_seq" ADD CONSTRAINT "work_order_code_seq_pkey" PRIMARY KEY ("year");
