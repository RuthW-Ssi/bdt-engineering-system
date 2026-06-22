-- Create consume_formula master table
CREATE TABLE "consume_formula" (
  "id"          SERIAL PRIMARY KEY,
  "name"        VARCHAR(80) NOT NULL,
  "expr"        TEXT NOT NULL,
  "result_unit" VARCHAR(20),
  "variables"   TEXT[] DEFAULT '{}',
  "category"    VARCHAR(30),
  "description" TEXT
);

-- Add formula_id to activity_consume
ALTER TABLE "activity_consume" ADD COLUMN "formula_id" INT REFERENCES "consume_formula"("id") ON DELETE SET NULL;

-- Add formula_id to op_act_material
ALTER TABLE "op_act_material" ADD COLUMN "formula_id" INT REFERENCES "consume_formula"("id") ON DELETE SET NULL;

-- Seed 19 formula templates
INSERT INTO "consume_formula" (name, expr, result_unit, variables, category, description) VALUES
('Zinc Primer – by area (50µm)',       'area / 7.0 * 1.20',             'L',   ARRAY['area'],             'paint',    'Zinc-rich primer, 50µm DFT, 20% waste'),
('Zinc Primer – by weight',            'weight * 0.032 / 7.0 * 1.20',   'L',   ARRAY['weight'],           'paint',    'เมื่อไม่รู้ area ใช้ weight × 0.032 m²/kg'),
('Epoxy Intermediate (100µm)',          'area / 5.5 * 1.20',             'L',   ARRAY['area'],             'paint',    'Epoxy mastic, mid-coat'),
('Polyurethane Topcoat (60µm)',         'area / 8.0 * 1.20',             'L',   ARRAY['area'],             'paint',    'PU finish coat, outdoor structural'),
('Heat-Resistant Paint (30µm)',         'area / 11.0 * 1.20',            'L',   ARRAY['area'],             'paint',    'Silicone-Al, fireproofing zones'),
('Stripe Coat – brush (edge/seam)',     'length * 0.05',                 'L',   ARRAY['length'],           'paint',    'ขอบ/รอยเชื่อม touch-up'),
('MIG/MAG Wire – fillet 6mm',          'length * 0.40',                 'kg',  ARRAY['length'],           'welding',  '6mm fillet, flat/horizontal'),
('MIG/MAG Wire – fillet 8mm',          'length * 0.70',                 'kg',  ARRAY['length'],           'welding',  '8mm fillet'),
('SAW Flux – H-beam flange',           'length * 1.20',                 'kg',  ARRAY['length'],           'welding',  'Submerged arc flux, flux:wire ≈1:1'),
('SMAW Electrode 3.2mm',               'length * 0.25',                 'kg',  ARRAY['length'],           'welding',  'Includes ~60% stub loss'),
('FCAW Wire – heavy plate',            'length * 0.90',                 'kg',  ARRAY['length'],           'welding',  '10mm fillet, vertical'),
('Welding Wire – by weight (rough)',   'weight * 0.015',                'kg',  ARRAY['weight'],           'welding',  '~1.5% of part weight, rough estimate'),
('Shielding Gas Ar/CO₂',              'length * 12',                   'L',   ARRAY['length'],           'welding',  '15 L/min × ~12 min/m arc time'),
('Plasma Gas O₂',                     'length * thickness * 0.008',    'm³',  ARRAY['length','thickness'],'cutting',  'O₂ plasma, plate <20mm'),
('Oxy-fuel O₂',                       'length * thickness * 0.012',    'm³',  ARRAY['length','thickness'],'cutting',  'Flame cut >15mm plate'),
('Oxy-fuel LPG',                      'length * thickness * 0.004',    'm³',  ARRAY['length','thickness'],'cutting',  'Flame cut LPG consumption'),
('Shot Blast Media Loss',             'area * 0.15',                   'kg',  ARRAY['area'],             'abrasive', 'Steel grit/shot carryover loss per blast cycle'),
('Grinding Disc 4"',                  'length * 0.05',                 'pcs', ARRAY['length'],           'abrasive', 'Flap disc 40-grit, weld seam flush'),
('Grinding Disc 7"',                  'length * 0.03',                 'pcs', ARRAY['length'],           'abrasive', '7" fibre disc, heavy grinding');
