-- ============================================================
-- Activity Library – Full Mock Data Seed
-- SSI Steel fabrication workflow
-- Run: psql $DATABASE_URL -f this_file.sql
-- ============================================================

BEGIN;

-- ─── 1. Enrich existing activities ───────────────────────────
-- Tools & updated labour for ACT-00003..ACT-00016
-- (labor already has 1 row each; keep qty=1 except fit-up/weld)

-- ACT-00003  Plasma cut plate to profile (2.5 m)
DELETE FROM activity_tool WHERE activity_id = 3;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (3, 27),   -- TOOL-RULER
  (3, 28);   -- TOOL-PUNCH-MARK

-- ACT-00004  Plasma cut large plate (6 m bed)
DELETE FROM activity_tool WHERE activity_id = 4;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (4, 27),   -- TOOL-RULER
  (4, 28);   -- TOOL-PUNCH-MARK

-- ACT-00005  CNC pipe cut to length
DELETE FROM activity_tool WHERE activity_id = 5;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (5, 27),   -- TOOL-RULER
  (5, 28);   -- TOOL-PUNCH-MARK

-- ACT-00006  Band saw cut section to length
DELETE FROM activity_tool WHERE activity_id = 6;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (6, 27),   -- TOOL-RULER
  (6, 28);   -- TOOL-PUNCH-MARK

-- ACT-00007  Press brake bend 200T
DELETE FROM activity_tool WHERE activity_id = 7;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (7, 27),   -- TOOL-RULER
  (7, 26);   -- TOOL-CLAMP-SET

-- ACT-00008  CNC drill holes
DELETE FROM activity_tool WHERE activity_id = 8;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (8, 29),   -- TOOL-DRILL-BIT
  (8, 28);   -- TOOL-PUNCH-MARK

-- ACT-00009  Hydraulic punch holes
DELETE FROM activity_tool WHERE activity_id = 9;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (9, 27),   -- TOOL-RULER
  (9, 28);   -- TOOL-PUNCH-MARK

-- ACT-00010  Thread tapping
DELETE FROM activity_tool WHERE activity_id = 10;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (10, 30),  -- TOOL-TAP-SET
  (10, 29),  -- TOOL-DRILL-BIT
  (10, 27);  -- TOOL-RULER

-- ACT-00011  Fit-up and tack weld (2 fitters)
DELETE FROM activity_tool WHERE activity_id = 11;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (11, 26),  -- TOOL-CLAMP-SET
  (11, 27),  -- TOOL-RULER
  (11, 32);  -- TOOL-FIXTURE-JIG
UPDATE activity_labor SET qty = 2 WHERE activity_id = 11;

-- ACT-00012  MIG/MAG main weld (2 welders)
DELETE FROM activity_tool WHERE activity_id = 12;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (12, 26),  -- TOOL-CLAMP-SET
  (12, 32),  -- TOOL-FIXTURE-JIG
  (12, 25);  -- TOOL-WIRE-BRUSH
UPDATE activity_labor SET qty = 2 WHERE activity_id = 12;

-- ACT-00013  SAW auto weld H-beam flange
DELETE FROM activity_tool WHERE activity_id = 13;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (13, 32),  -- TOOL-FIXTURE-JIG
  (13, 27);  -- TOOL-RULER

-- ACT-00014  SMAW touch-up weld
DELETE FROM activity_tool WHERE activity_id = 14;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (14, 25),  -- TOOL-WIRE-BRUSH
  (14, 27);  -- TOOL-RULER
-- add consume: E7018 electrode
INSERT INTO activity_consume (activity_id, material_id)
  SELECT 14, id FROM materials WHERE default_code = 'WIRE70S610'
  ON CONFLICT DO NOTHING;

-- ACT-00015  Grind weld flush and clean edge
DELETE FROM activity_tool WHERE activity_id = 15;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (15, 24),  -- TOOL-GRIND-DISC7
  (15, 23),  -- TOOL-GRIND-DISC4
  (15, 25);  -- TOOL-WIRE-BRUSH

-- ACT-00016  Visual inspection & dimension check  (fix machine: no machine needed → use LABOR as placeholder is wrong, but machine_id NOT NULL constraint forces a machine)
-- Keep EQ-GRIND-4 as machine for now (workaround for NOT NULL)
DELETE FROM activity_tool WHERE activity_id = 16;
INSERT INTO activity_tool (activity_id, resource_id) VALUES
  (16, 27),  -- TOOL-RULER
  (16, 28);  -- TOOL-PUNCH-MARK


-- ─── 2. New activities ────────────────────────────────────────

INSERT INTO activity (activity_code, name, machine_id, duration_min, create_uid, create_date, write_uid, write_date) VALUES
  ('ACT-00017', 'Shot blast surface prep',              21,  25.00, 1, NOW(), 1, NOW()),  -- EQ-BLAST
  ('ACT-00018', 'Primer coat – airless spray',          22,  30.00, 1, NOW(), 1, NOW()),  -- EQ-SPRAY-AIRLESS
  ('ACT-00019', 'Topcoat painting – airless spray',     22,  25.00, 1, NOW(), 1, NOW()),  -- EQ-SPRAY-AIRLESS
  ('ACT-00020', 'H-beam flange straightening',          12,   8.00, 1, NOW(), 1, NOW()),  -- EQ-STRAIGHTEN
  ('ACT-00021', 'FCAW structural weld (heavy)',         15,  20.00, 1, NOW(), 1, NOW()),  -- EQ-WELD-MAG
  ('ACT-00022', 'Crane lift & material transfer',       18,   5.00, 1, NOW(), 1, NOW()),  -- EQ-CRANE-25T
  ('ACT-00023', 'Assembly & bolt-up',                    1,  15.00, 1, NOW(), 1, NOW()),  -- LABOR (manual)
  ('ACT-00024', 'Dimensional QC with template',         16,   8.00, 1, NOW(), 1, NOW()),  -- EQ-GRIND-4 (placeholder)
  ('ACT-00025', 'Weld seam NDT & marking',              16,  10.00, 1, NOW(), 1, NOW())   -- EQ-GRIND-4 (placeholder)
ON CONFLICT (activity_code) DO NOTHING;


-- ─── 3. Tools for new activities ─────────────────────────────

-- ACT-00017  Shot blast
INSERT INTO activity_tool (activity_id, resource_id)
  SELECT a.id, t.rid FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00017') a,
    (VALUES (26),(27)) t(rid)   -- CLAMP-SET, RULER
  ON CONFLICT DO NOTHING;

-- ACT-00018  Primer coat
INSERT INTO activity_tool (activity_id, resource_id)
  SELECT a.id, t.rid FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00018') a,
    (VALUES (27),(25)) t(rid)   -- RULER, WIRE-BRUSH
  ON CONFLICT DO NOTHING;

-- ACT-00019  Topcoat
INSERT INTO activity_tool (activity_id, resource_id)
  SELECT a.id, t.rid FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00019') a,
    (VALUES (27),(25)) t(rid)   -- RULER, WIRE-BRUSH
  ON CONFLICT DO NOTHING;

-- ACT-00020  H-beam straighten
INSERT INTO activity_tool (activity_id, resource_id)
  SELECT a.id, t.rid FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00020') a,
    (VALUES (27),(26)) t(rid)   -- RULER, CLAMP-SET
  ON CONFLICT DO NOTHING;

-- ACT-00021  FCAW weld (2 welders)
INSERT INTO activity_tool (activity_id, resource_id)
  SELECT a.id, t.rid FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00021') a,
    (VALUES (26),(32),(25)) t(rid)  -- CLAMP-SET, FIXTURE-JIG, WIRE-BRUSH
  ON CONFLICT DO NOTHING;

-- ACT-00022  Crane transfer
INSERT INTO activity_tool (activity_id, resource_id)
  SELECT a.id, t.rid FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00022') a,
    (VALUES (31),(26)) t(rid)   -- WRENCH-SET, CLAMP-SET
  ON CONFLICT DO NOTHING;

-- ACT-00023  Assembly & bolt-up
INSERT INTO activity_tool (activity_id, resource_id)
  SELECT a.id, t.rid FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00023') a,
    (VALUES (31),(27),(26)) t(rid)  -- WRENCH-SET, RULER, CLAMP-SET
  ON CONFLICT DO NOTHING;

-- ACT-00024  Dimensional QC
INSERT INTO activity_tool (activity_id, resource_id)
  SELECT a.id, t.rid FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00024') a,
    (VALUES (27),(28)) t(rid)   -- RULER, PUNCH-MARK
  ON CONFLICT DO NOTHING;

-- ACT-00025  NDT & marking
INSERT INTO activity_tool (activity_id, resource_id)
  SELECT a.id, t.rid FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00025') a,
    (VALUES (27),(28),(25)) t(rid)  -- RULER, PUNCH-MARK, WIRE-BRUSH
  ON CONFLICT DO NOTHING;


-- ─── 4. Labour for new activities ────────────────────────────

INSERT INTO activity_labor (activity_id, labor_resource_id, qty)
  SELECT a.id, 1, v.qty FROM
    (VALUES
      ('ACT-00017', 2),
      ('ACT-00018', 2),
      ('ACT-00019', 2),
      ('ACT-00020', 1),
      ('ACT-00021', 2),
      ('ACT-00022', 2),
      ('ACT-00023', 3),
      ('ACT-00024', 1),
      ('ACT-00025', 1)
    ) v(code, qty)
  JOIN activity a ON a.activity_code = v.code
  ON CONFLICT DO NOTHING;


-- ─── 5. Consumable materials for new activities ───────────────

-- ACT-00018  Primer coat → TOA Zinc Rich Primer EP-200
INSERT INTO activity_consume (activity_id, material_id)
  SELECT a.id, m.id FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00018') a,
    (SELECT id FROM materials WHERE default_code='PAINTPR001') m
  ON CONFLICT DO NOTHING;

-- ACT-00019  Topcoat → TOA Polyurethane Topcoat
INSERT INTO activity_consume (activity_id, material_id)
  SELECT a.id, m.id FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00019') a,
    (SELECT id FROM materials WHERE default_code='PAINTTC001') m
  ON CONFLICT DO NOTHING;

-- ACT-00021  FCAW weld → Flux-Cored Wire  (ใช้ WIRE70S616 เป็น placeholder)
INSERT INTO activity_consume (activity_id, material_id)
  SELECT a.id, m.id FROM
    (SELECT id FROM activity WHERE activity_code='ACT-00021') a,
    (SELECT id FROM materials WHERE default_code='WIRE70S616') m
  ON CONFLICT DO NOTHING;


COMMIT;

-- ─── Verify ───────────────────────────────────────────────────
SELECT
  a.activity_code,
  a.name,
  a.duration_min  AS "min",
  m.code          AS machine,
  (SELECT COUNT(*) FROM activity_tool  at WHERE at.activity_id=a.id) AS tools,
  (SELECT SUM(qty) FROM activity_labor al WHERE al.activity_id=a.id) AS labour,
  (SELECT COUNT(*) FROM activity_consume ac WHERE ac.activity_id=a.id) AS consumes
FROM activity a
JOIN equipment_resource m ON m.id=a.machine_id
ORDER BY a.activity_code;
