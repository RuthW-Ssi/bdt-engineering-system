import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const EQUIPMENT: Array<{
  code: string; name: string; type: string; rate: number | null; rate_unit: string | null
}> = [
  // ── Labor ──────────────────────────────────────────────────────
  { code: 'LABOR',              name: 'Labor (คน)',                     type: 'labor',    rate: null,   rate_unit: null },

  // ── Cutting Area ───────────────────────────────────────────────
  { code: 'EQ-CUT-PLASMA25',   name: 'Plasma/Gas CNC 2.5 m',          type: 'machine',  rate: 2000,   rate_unit: 'mm/min' },
  { code: 'EQ-CUT-PLASMA60',   name: 'Plasma/Gas CNC 6 m',            type: 'machine',  rate: 2000,   rate_unit: 'mm/min' },
  { code: 'EQ-CUT-PIPE',       name: 'CNC Pipe Cutter',               type: 'machine',  rate: 1500,   rate_unit: 'mm/min' },
  { code: 'EQ-SAW-BAND',       name: 'Band Saw',                       type: 'machine',  rate: null,   rate_unit: null },

  // ── Forming / Machining Area ───────────────────────────────────
  { code: 'EQ-PRESS-110',      name: 'Machine Press 110T',             type: 'machine',  rate: null,   rate_unit: null },
  { code: 'EQ-BRAKE-200',      name: 'Hydraulic Press Brake 200T',     type: 'machine',  rate: null,   rate_unit: null },
  { code: 'EQ-PUNCH',          name: 'Hydraulic Puncher',              type: 'machine',  rate: null,   rate_unit: null },
  { code: 'EQ-DRILL',          name: 'Drilling Machine',               type: 'machine',  rate: null,   rate_unit: null },
  { code: 'EQ-TAP',            name: 'Round Bar Tapping',              type: 'machine',  rate: null,   rate_unit: null },

  // ── H-Beam Built-up Area ───────────────────────────────────────
  { code: 'EQ-HBEAM',          name: 'Integrated H-beam Making',       type: 'machine',  rate: null,   rate_unit: null },
  { code: 'EQ-STRAIGHTEN',     name: 'Flange Straightening',           type: 'machine',  rate: null,   rate_unit: null },
  { code: 'EQ-WELD-SAW',       name: 'SAW (auto weld)',                type: 'machine',  rate: null,   rate_unit: 'kg/hr' },

  // ── Fabrication Area ──────────────────────────────────────────
  { code: 'EQ-WELD-SMAW',      name: 'Electrode Welder (SMAW)',        type: 'machine',  rate: null,   rate_unit: 'kg/hr' },
  { code: 'EQ-WELD-MAG',       name: 'MAG/MIG Welder',                 type: 'machine',  rate: null,   rate_unit: 'kg/hr' },
  { code: 'EQ-GRIND-4',        name: 'DEWALT Grinder 4"',              type: 'machine',  rate: null,   rate_unit: null },
  { code: 'EQ-GRIND-7',        name: 'DEWALT Grinder 7"',              type: 'machine',  rate: null,   rate_unit: null },

  // ── Handling (shared) ─────────────────────────────────────────
  { code: 'EQ-CRANE-25T',      name: 'Overhead Crane 25T',             type: 'handling', rate: null,   rate_unit: null },
  { code: 'EQ-CRANE-10T',      name: 'Overhead Crane 10T',             type: 'handling', rate: null,   rate_unit: null },
  { code: 'EQ-CONV-01',        name: 'Conveyor',                       type: 'handling', rate: null,   rate_unit: null },

  // ── Paint Area ────────────────────────────────────────────────
  { code: 'EQ-BLAST',          name: 'Shot Blast Machine',             type: 'machine',  rate: null,   rate_unit: null },
  { code: 'EQ-SPRAY-AIRLESS',  name: 'Airless Spray Painter',          type: 'machine',  rate: null,   rate_unit: null },

  // ── Tools & Fixtures ──────────────────────────────────────────
  { code: 'TOOL-GRIND-DISC4',  name: 'Grinding Disc 4"',               type: 'tool',     rate: null,   rate_unit: null },
  { code: 'TOOL-GRIND-DISC7',  name: 'Grinding Disc 7"',               type: 'tool',     rate: null,   rate_unit: null },
  { code: 'TOOL-WIRE-BRUSH',   name: 'Wire Brush',                     type: 'tool',     rate: null,   rate_unit: null },
  { code: 'TOOL-CLAMP-SET',    name: 'Clamp Set',                      type: 'tool',     rate: null,   rate_unit: null },
  { code: 'TOOL-RULER',        name: 'Steel Ruler / Square',           type: 'tool',     rate: null,   rate_unit: null },
  { code: 'TOOL-PUNCH-MARK',   name: 'Center Punch + Marker',          type: 'tool',     rate: null,   rate_unit: null },
  { code: 'TOOL-DRILL-BIT',    name: 'Drill Bit Set',                  type: 'tool',     rate: null,   rate_unit: null },
  { code: 'TOOL-TAP-SET',      name: 'Tap & Die Set',                  type: 'tool',     rate: null,   rate_unit: null },
  { code: 'TOOL-WRENCH-SET',   name: 'Wrench Set',                     type: 'tool',     rate: null,   rate_unit: null },
  { code: 'TOOL-FIXTURE-JIG',  name: 'Welding Fixture / Jig',          type: 'tool',     rate: null,   rate_unit: null },

  // ── Consumables ───────────────────────────────────────────────
  { code: 'CON-ELEC-E6013',    name: 'Electrode E6013',                type: 'consumable', rate: null, rate_unit: 'kg' },
  { code: 'CON-ELEC-E7018',    name: 'Electrode E7018',                type: 'consumable', rate: null, rate_unit: 'kg' },
  { code: 'CON-WIRE-ER70S6',   name: 'MIG/MAG Wire ER70S-6',          type: 'consumable', rate: null, rate_unit: 'kg' },
  { code: 'CON-WIRE-FCAW',     name: 'Flux-Cored Wire (FCAW)',         type: 'consumable', rate: null, rate_unit: 'kg' },
  { code: 'CON-GAS-CO2',       name: 'Shielding Gas CO₂',             type: 'consumable', rate: null, rate_unit: 'L' },
  { code: 'CON-GAS-ARGON',     name: 'Shielding Gas Argon',            type: 'consumable', rate: null, rate_unit: 'L' },
  { code: 'CON-FLUX-SAW',      name: 'SAW Flux',                       type: 'consumable', rate: null, rate_unit: 'kg' },
  { code: 'CON-PRIMER',        name: 'Primer Paint',                   type: 'consumable', rate: null, rate_unit: 'L' },
  { code: 'CON-TOPCOAT',       name: 'Top Coat Paint',                 type: 'consumable', rate: null, rate_unit: 'L' },
  { code: 'CON-THINNER',       name: 'Paint Thinner',                  type: 'consumable', rate: null, rate_unit: 'L' },
  { code: 'CON-CUTTING-GAS',   name: 'Cutting Gas (O₂ + LPG)',        type: 'consumable', rate: null, rate_unit: 'L' },
  { code: 'CON-ABRASIVE',      name: 'Abrasive / Shot Blast Media',    type: 'consumable', rate: null, rate_unit: 'kg' },
]

async function main() {
  console.log('Seeding equipment resources…')
  let created = 0, skipped = 0

  for (const eq of EQUIPMENT) {
    const existing = await prisma.equipment_resource.findUnique({ where: { code: eq.code } })
    if (existing) { skipped++; continue }
    await prisma.equipment_resource.create({ data: eq })
    created++
  }

  console.log(`Done — created: ${created}, skipped (already exists): ${skipped}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
