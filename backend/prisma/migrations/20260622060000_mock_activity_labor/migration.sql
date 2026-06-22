-- Mock activity_labor data — matched to activity names (34 activities)
-- Unique key is (activity_id, skill), use ON CONFLICT DO NOTHING for idempotency

INSERT INTO activity_labor (activity_id, skill, qty) VALUES
  -- 1: Plasma cut plate to profile (2.5 m)
  (1, 'CNC Plate Cutting', 1), (1, 'Helper', 1),
  -- 2: Plasma cut large plate (6 m bed)
  (2, 'CNC Plate Cutting', 1), (2, 'Helper', 2),
  -- 3: CNC pipe cut to length
  (3, 'CNC Pipe Cutting', 1), (3, 'Helper', 1),
  -- 4: Band saw cut section to length
  (4, 'CNC Plate Cutting', 1),
  -- 5: Press brake bend 200T
  (5, 'CNC Drilling', 1), (5, 'Helper', 1),
  -- 6: Machine press 110T
  (6, 'CNC Drilling', 1), (6, 'Helper', 1),
  -- 7: CNC drill holes
  (7, 'CNC Drilling', 2), (7, 'Helper', 1),
  -- 8: Hydraulic punch holes
  (8, 'CNC Drilling', 1), (8, 'Helper', 1),
  -- 9: Thread tapping
  (9, 'Helper', 2),
  -- 10: H-beam assembly & SAW weld
  (10, 'Assembly', 2), (10, 'Weld', 2), (10, 'Helper', 1),
  -- 11: H-beam flange straightening
  (11, 'Assembly', 1), (11, 'Helper', 2),
  -- 12: Fit-up and tack weld
  (12, 'Weld', 1), (12, 'Helper', 1),
  -- 13: MIG/MAG main weld
  (13, 'Weld', 2), (13, 'Helper', 1),
  -- 14: SAW auto weld (H-beam flange)
  (14, 'Weld', 2), (14, 'Subberg Machine', 1),
  -- 15: SMAW touch-up weld
  (15, 'Weld', 1),
  -- 16: SMAW root pass weld
  (16, 'Weld', 1), (16, 'Helper', 1),
  -- 17: FCAW structural weld (heavy plate)
  (17, 'Weld', 2), (17, 'Helper', 1),
  -- 18: MIG/MAG weld Argon mix (stainless)
  (18, 'Weld', 1), (18, 'Helper', 1),
  -- 19: Grind weld flush — 4" grinder
  (19, 'Grind', 1),
  -- 20: Grind weld flush — 7" grinder
  (20, 'Grind', 1), (20, 'Helper', 1),
  -- 21: Clean edge and deburr
  (21, 'Helper', 2),
  -- 22: Shot blast surface prep Sa 2.5
  (22, 'Helper', 2),
  -- 23: Apply zinc-rich primer (airless spray)
  (23, 'Paint', 1), (23, 'Helper', 1),
  -- 24: Apply epoxy primer coat (airless spray)
  (24, 'Paint', 1), (24, 'Helper', 1),
  -- 25: Apply intermediate coat (airless spray)
  (25, 'Paint', 1), (25, 'Helper', 1),
  -- 26: Apply finish topcoat (airless spray)
  (26, 'Paint', 2), (26, 'Helper', 1),
  -- 27: Touch-up paint and stripe coat (brush)
  (27, 'Paint', 1),
  -- 28: Apply heat-resistant paint (airless)
  (28, 'Paint', 1), (28, 'Helper', 1),
  -- 29: Visual inspection and dimension check
  (29, 'QC', 1),
  -- 30: Weld seam NDT and marking
  (30, 'QC', 1), (30, 'Helper', 1),
  -- 31: Dimensional QC with template
  (31, 'QC', 2),
  -- 32: Crane lift and transfer (25T)
  (32, 'Material Handling', 1), (32, 'Helper', 2),
  -- 33: Crane lift and transfer (10T)
  (33, 'Material Handling', 1), (33, 'Helper', 1),
  -- 34: Assembly and bolt-up
  (34, 'Assembly', 2), (34, 'Helper', 1)
ON CONFLICT (activity_id, skill) DO NOTHING;
