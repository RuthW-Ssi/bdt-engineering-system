/**
 * Products Seed (V3 Adjusted) — 2026-05-18
 *
 * Aligns with EXISTING Sprint 2 schema (single-table inheritance):
 *   products.product_type ∈ {'standard', 'custom'}
 *   products.variant_attributes JSONB  ← V3 Hybrid data goes here
 *   products.attributes JSONB           ← Engineering specs (existing)
 *   products.state ∈ {draft|in_design|in_review|approved|released|obsolete}
 *   products.mark_prefix + mark_number   ← Custom only
 *   products.project_id + erection_zone_id ← Custom only
 *   4-component cost: cost_raw_material + cost_transport + cost_production + cost_warehouse
 *
 * Replaces:
 *   - 12 legacy STD products (STD-00001..00012) — clean reset to V3 format
 *   - Adds 10 sample CUSTOM products from THEPHA Zone 2 (demonstration)
 *
 * Prerequisites:
 *   - mark_prefix_master seeded (C, RF, FB, RB, WH, B, PS, ...)
 *   - steel_grade seeded (SS400, HY370, SM520B, S275, ...)
 *   - project '0X181-THEPHA' seeded (for custom examples)
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const COST_DEFAULTS = {
  cost_raw_material: 0,
  cost_transport: 0,
  cost_production: 0,
  cost_warehouse: 0,
}

// ─────────────────────────── STANDARD PRODUCTS (51 entries) ───────────────────────────
// product_type='standard', state='released', no project_id, no mark
const STANDARD_PRODUCTS = [
  // PLATE (SS400) — common Thai stock sizes 1500×6000mm
  { code: 'STD-00001', name: 'PL6x1500 SS400 (stock 6m)',  type: 'PLATE',   grade: 'SS400',  va: { profile:'PL6x1500',  shape:'PL', method:'PL', thickness_mm:6,  width_mm:1500 }, weight:423.9 },
  { code: 'STD-00002', name: 'PL9x1500 SS400 (stock 6m)',  type: 'PLATE',   grade: 'SS400',  va: { profile:'PL9x1500',  shape:'PL', method:'PL', thickness_mm:9,  width_mm:1500 }, weight:635.85 },
  { code: 'STD-00003', name: 'PL10x1500 SS400 (stock 6m)', type: 'PLATE',   grade: 'SS400',  va: { profile:'PL10x1500', shape:'PL', method:'PL', thickness_mm:10, width_mm:1500 }, weight:706.5 },
  { code: 'STD-00004', name: 'PL12x1500 SS400 (stock 6m)', type: 'PLATE',   grade: 'SS400',  va: { profile:'PL12x1500', shape:'PL', method:'PL', thickness_mm:12, width_mm:1500 }, weight:847.8 },
  { code: 'STD-00005', name: 'PL16x1500 SS400 (stock 6m)', type: 'PLATE',   grade: 'SS400',  va: { profile:'PL16x1500', shape:'PL', method:'PL', thickness_mm:16, width_mm:1500 }, weight:1130.4 },
  { code: 'STD-00006', name: 'PL20x1500 SS400 (stock 6m)', type: 'PLATE',   grade: 'SS400',  va: { profile:'PL20x1500', shape:'PL', method:'PL', thickness_mm:20, width_mm:1500 }, weight:1413.0 },
  { code: 'STD-00007', name: 'PL25x1500 SS400 (stock 6m)', type: 'PLATE',   grade: 'SS400',  va: { profile:'PL25x1500', shape:'PL', method:'PL', thickness_mm:25, width_mm:1500 }, weight:1766.25 },

  // PLATE (HY370)
  { code: 'STD-00008', name: 'PL6x1500 HY370 (stock 6m)',  type: 'PLATE',   grade: 'HY370',  va: { profile:'PL6x1500',  shape:'PL', method:'PL', thickness_mm:6,  width_mm:1500 }, weight:423.9 },
  { code: 'STD-00009', name: 'PL10x1500 HY370 (stock 6m)', type: 'PLATE',   grade: 'HY370',  va: { profile:'PL10x1500', shape:'PL', method:'PL', thickness_mm:10, width_mm:1500 }, weight:706.5 },
  { code: 'STD-00010', name: 'PL16x1500 HY370 (stock 6m)', type: 'PLATE',   grade: 'HY370',  va: { profile:'PL16x1500', shape:'PL', method:'PL', thickness_mm:16, width_mm:1500 }, weight:1130.4 },
  { code: 'STD-00011', name: 'PL20x1500 HY370 (stock 6m)', type: 'PLATE',   grade: 'HY370',  va: { profile:'PL20x1500', shape:'PL', method:'PL', thickness_mm:20, width_mm:1500 }, weight:1413.0 },

  // L_ANGLE
  { code: 'STD-00012', name: 'L50x50x5 SS400 (stock 6m)',     type: 'L_ANGLE', grade: 'SS400', va: { profile:'L50x50x5',     shape:'L', method:'ANG', leg_a_mm:50,  leg_b_mm:50,  thickness_mm:5  }, weight:22.86 },
  { code: 'STD-00013', name: 'L65x65x6 SS400 (stock 6m)',     type: 'L_ANGLE', grade: 'SS400', va: { profile:'L65x65x6',     shape:'L', method:'ANG', leg_a_mm:65,  leg_b_mm:65,  thickness_mm:6  }, weight:35.46 },
  { code: 'STD-00014', name: 'L75x75x6 SS400 (stock 6m)',     type: 'L_ANGLE', grade: 'SS400', va: { profile:'L75x75x6',     shape:'L', method:'ANG', leg_a_mm:75,  leg_b_mm:75,  thickness_mm:6  }, weight:41.16 },
  { code: 'STD-00015', name: 'L90x90x9 SS400 (stock 6m)',     type: 'L_ANGLE', grade: 'SS400', va: { profile:'L90x90x9',     shape:'L', method:'ANG', leg_a_mm:90,  leg_b_mm:90,  thickness_mm:9  }, weight:73.62 },
  { code: 'STD-00016', name: 'L100x100x10 SS400 (stock 6m)',  type: 'L_ANGLE', grade: 'SS400', va: { profile:'L100x100x10',  shape:'L', method:'ANG', leg_a_mm:100, leg_b_mm:100, thickness_mm:10 }, weight:91.20 },
  { code: 'STD-00017', name: 'L75x75x6 HY370 (stock 6m)',     type: 'L_ANGLE', grade: 'HY370', va: { profile:'L75x75x6',     shape:'L', method:'ANG', leg_a_mm:75,  leg_b_mm:75,  thickness_mm:6  }, weight:41.16 },
  { code: 'STD-00018', name: 'L100x100x10 HY370 (stock 6m)',  type: 'L_ANGLE', grade: 'HY370', va: { profile:'L100x100x10',  shape:'L', method:'ANG', leg_a_mm:100, leg_b_mm:100, thickness_mm:10 }, weight:91.20 },

  // H_BEAM (JIS hot-rolled)
  { code: 'STD-00019', name: 'H200x200x8x12 SS400 (stock 12m)',   type: 'H_BEAM', grade: 'SS400',  va: { profile:'H200x200x8x12',   shape:'H', method:'HR', height_mm:200, width_mm:200, web_thickness_mm:8,  flange_thickness_mm:12 }, weight:595.2 },
  { code: 'STD-00020', name: 'H250x250x9x14 SS400 (stock 12m)',   type: 'H_BEAM', grade: 'SS400',  va: { profile:'H250x250x9x14',   shape:'H', method:'HR', height_mm:250, width_mm:250, web_thickness_mm:9,  flange_thickness_mm:14 }, weight:866.4 },
  { code: 'STD-00021', name: 'H300x300x10x15 SS400 (stock 12m)',  type: 'H_BEAM', grade: 'SS400',  va: { profile:'H300x300x10x15',  shape:'H', method:'HR', height_mm:300, width_mm:300, web_thickness_mm:10, flange_thickness_mm:15 }, weight:1128.0 },
  { code: 'STD-00022', name: 'H350x350x12x19 SS400 (stock 12m)',  type: 'H_BEAM', grade: 'SS400',  va: { profile:'H350x350x12x19',  shape:'H', method:'HR', height_mm:350, width_mm:350, web_thickness_mm:12, flange_thickness_mm:19 }, weight:1620.0 },
  { code: 'STD-00023', name: 'H400x400x13x21 SS400 (stock 12m)',  type: 'H_BEAM', grade: 'SS400',  va: { profile:'H400x400x13x21',  shape:'H', method:'HR', height_mm:400, width_mm:400, web_thickness_mm:13, flange_thickness_mm:21 }, weight:2052.0 },
  { code: 'STD-00024', name: 'H350x350x12x19 SM520B (stock 12m)', type: 'H_BEAM', grade: 'SM520B', va: { profile:'H350x350x12x19',  shape:'H', method:'HR', height_mm:350, width_mm:350, web_thickness_mm:12, flange_thickness_mm:19 }, weight:1620.0 },
  { code: 'STD-00025', name: 'H400x400x13x21 SM520B (stock 12m)', type: 'H_BEAM', grade: 'SM520B', va: { profile:'H400x400x13x21',  shape:'H', method:'HR', height_mm:400, width_mm:400, web_thickness_mm:13, flange_thickness_mm:21 }, weight:2052.0 },

  // C_CHANNEL
  { code: 'STD-00026', name: 'C100x50x5x7.5 SS400 (stock 6m)',  type: 'C_CHANNEL', grade: 'SS400', va: { profile:'C100x50x5x7.5', shape:'C', method:'HR', height_mm:100, width_mm:50, web_thickness_mm:5,   flange_thickness_mm:7.5 }, weight:56.4 },
  { code: 'STD-00027', name: 'C125x65x6x8 SS400 (stock 6m)',    type: 'C_CHANNEL', grade: 'SS400', va: { profile:'C125x65x6x8',   shape:'C', method:'HR', height_mm:125, width_mm:65, web_thickness_mm:6,   flange_thickness_mm:8   }, weight:81.0 },
  { code: 'STD-00028', name: 'C150x75x6.5x10 SS400 (stock 6m)', type: 'C_CHANNEL', grade: 'SS400', va: { profile:'C150x75x6.5x10',shape:'C', method:'HR', height_mm:150, width_mm:75, web_thickness_mm:6.5, flange_thickness_mm:10  }, weight:113.4 },

  // CHS
  { code: 'STD-00029', name: 'CHS60.5x2.3 SS400 (stock 6m)',  type: 'CHS', grade: 'SS400', va: { profile:'CHS60.5x2.3',  shape:'CHS', method:'PIPE', width_mm:60.5,  thickness_mm:2.3 }, weight:19.7 },
  { code: 'STD-00030', name: 'CHS89.1x3.2 SS400 (stock 6m)',  type: 'CHS', grade: 'SS400', va: { profile:'CHS89.1x3.2',  shape:'CHS', method:'PIPE', width_mm:89.1,  thickness_mm:3.2 }, weight:40.6 },
  { code: 'STD-00031', name: 'CHS114.3x4.5 SS400 (stock 6m)', type: 'CHS', grade: 'SS400', va: { profile:'CHS114.3x4.5', shape:'CHS', method:'PIPE', width_mm:114.3, thickness_mm:4.5 }, weight:73.2 },

  // PIPE
  { code: 'STD-00032', name: 'PIPE60.5x2.3 SS400 (stock 6m)',  type: 'PIPE', grade: 'SS400', va: { profile:'PIPE60.5x2.3',  shape:'PIPE', method:'PIPE', width_mm:60.5,  thickness_mm:2.3 }, weight:19.7 },
  { code: 'STD-00033', name: 'PIPE76.3x2.8 SS400 (stock 6m)',  type: 'PIPE', grade: 'SS400', va: { profile:'PIPE76.3x2.8',  shape:'PIPE', method:'PIPE', width_mm:76.3,  thickness_mm:2.8 }, weight:30.4 },
  { code: 'STD-00034', name: 'PIPE114.3x4.5 SS400 (stock 6m)', type: 'PIPE', grade: 'SS400', va: { profile:'PIPE114.3x4.5', shape:'PIPE', method:'PIPE', width_mm:114.3, thickness_mm:4.5 }, weight:73.2 },
  { code: 'STD-00035', name: 'PIPE165.2x5.0 SS400 (stock 6m)', type: 'PIPE', grade: 'SS400', va: { profile:'PIPE165.2x5.0', shape:'PIPE', method:'PIPE', width_mm:165.2, thickness_mm:5.0 }, weight:118.5 },

  // RHS / SHS
  { code: 'STD-00036', name: 'RHS100x50x3.2 SS400 (stock 6m)', type: 'RHS', grade: 'SS400', va: { profile:'RHS100x50x3.2', shape:'RHS', method:'PIPE', width_mm:100, height_mm:50, thickness_mm:3.2 }, weight:43.2 },
  { code: 'STD-00037', name: 'RHS125x75x4.5 SS400 (stock 6m)', type: 'RHS', grade: 'SS400', va: { profile:'RHS125x75x4.5', shape:'RHS', method:'PIPE', width_mm:125, height_mm:75, thickness_mm:4.5 }, weight:80.4 },
  { code: 'STD-00038', name: 'SHS50x3.2 SS400 (stock 6m)',     type: 'SHS', grade: 'SS400', va: { profile:'SHS50x3.2',     shape:'SHS', method:'PIPE', width_mm:50,  thickness_mm:3.2 }, weight:28.2 },
  { code: 'STD-00039', name: 'SHS75x4.5 SS400 (stock 6m)',     type: 'SHS', grade: 'SS400', va: { profile:'SHS75x4.5',     shape:'SHS', method:'PIPE', width_mm:75,  thickness_mm:4.5 }, weight:58.5 },
  { code: 'STD-00040', name: 'SHS100x6 SS400 (stock 6m)',      type: 'SHS', grade: 'SS400', va: { profile:'SHS100x6',      shape:'SHS', method:'PIPE', width_mm:100, thickness_mm:6.0 }, weight:105.6 },

  // ROD
  { code: 'STD-00041', name: 'RB12 SS400 (stock 12m)', type: 'ROD', grade: 'SS400', va: { profile:'RB12', shape:'RB', method:'BAR', diameter_mm:12 }, weight:10.66 },
  { code: 'STD-00042', name: 'RB16 SS400 (stock 12m)', type: 'ROD', grade: 'SS400', va: { profile:'RB16', shape:'RB', method:'BAR', diameter_mm:16 }, weight:18.94 },
  { code: 'STD-00043', name: 'RB19 SS400 (stock 12m)', type: 'ROD', grade: 'SS400', va: { profile:'RB19', shape:'RB', method:'BAR', diameter_mm:19 }, weight:26.71 },
  { code: 'STD-00044', name: 'RB22 SS400 (stock 12m)', type: 'ROD', grade: 'SS400', va: { profile:'RB22', shape:'RB', method:'BAR', diameter_mm:22 }, weight:35.82 },
  { code: 'STD-00045', name: 'RB25 SS400 (stock 12m)', type: 'ROD', grade: 'SS400', va: { profile:'RB25', shape:'RB', method:'BAR', diameter_mm:25 }, weight:46.25 },
  { code: 'STD-00046', name: 'RB32 SS400 (stock 12m)', type: 'ROD', grade: 'SS400', va: { profile:'RB32', shape:'RB', method:'BAR', diameter_mm:32 }, weight:75.78 },
  { code: 'STD-00047', name: 'RB22 HY370 (stock 12m)', type: 'ROD', grade: 'HY370', va: { profile:'RB22', shape:'RB', method:'BAR', diameter_mm:22 }, weight:35.82 },

  // S275 (EN10025) extras
  { code: 'STD-00048', name: 'PL10x1500 S275 (stock 6m)',         type: 'PLATE',   grade: 'S275', va: { profile:'PL10x1500',      shape:'PL', method:'PL', thickness_mm:10, width_mm:1500 }, weight:706.5 },
  { code: 'STD-00049', name: 'PL16x1500 S275 (stock 6m)',         type: 'PLATE',   grade: 'S275', va: { profile:'PL16x1500',      shape:'PL', method:'PL', thickness_mm:16, width_mm:1500 }, weight:1130.4 },
  { code: 'STD-00050', name: 'H300x300x10x15 S275 (stock 12m)',   type: 'H_BEAM',  grade: 'S275', va: { profile:'H300x300x10x15', shape:'H',  method:'HR', height_mm:300, width_mm:300, web_thickness_mm:10, flange_thickness_mm:15 }, weight:1128.0 },
  { code: 'STD-00051', name: 'L75x75x6 S275 (stock 6m)',          type: 'L_ANGLE', grade: 'S275', va: { profile:'L75x75x6',       shape:'L',  method:'ANG', leg_a_mm:75, leg_b_mm:75, thickness_mm:6 }, weight:41.16 },
]

// ─────────────────────── STANDARD ASSEMBLIES (3 generic types) ───────────────────────
// product_type='standard', product_kind='assembly', matched by name during BOM upload
const STANDARD_ASSEMBLIES = [
  {
    code: 'STD-00052', name: 'FLYBRACING',
    va: { category: 'flybracing', typical_parts: [{ profile: 'L50x50x5', grade: 'SS400', product_code: 'STD-00012' }] },
  },
  {
    code: 'STD-00053', name: 'ROD',
    va: { category: 'rod', typical_parts: [
      { profile: 'RB19', grade: 'SS400', product_code: 'STD-00043' },
      { profile: 'RB22', grade: 'SS400', product_code: 'STD-00044' },
      { profile: 'RB25', grade: 'SS400', product_code: 'STD-00045' },
    ]},
  },
  {
    code: 'STD-00054', name: 'PIPESTUD',
    va: { category: 'pipestud', typical_parts: [{ profile: 'PIPE139.8x2.5', grade: 'HSS500' }] },
  },
]

// ─────────────────────── CUSTOM PRODUCTS (12 sample from THEPHA Zone 2) ──────────────
// product_type='custom', state='released', project_id required, mark_prefix + mark_number required
const CUSTOM_PRODUCTS = [
  // Sub-parts (PL plates from Assembly Part List)
  { code: 'CUS-00001', name: 'PL6x950 HY370 (TH-2p3)',   type: 'PLATE',   grade: 'HY370', mark_prefix: 'WEB', mark_number: 'TH-2p3',   va: { profile:'PL6x950',   shape:'PL', method:'PL', thickness_mm:6,  width_mm:950 } },
  { code: 'CUS-00002', name: 'PL20x170 HY370 (TH-2p6)',  type: 'PLATE',   grade: 'HY370', mark_prefix: 'STF', mark_number: 'TH-2p6',   va: { profile:'PL20x170',  shape:'PL', method:'PL', thickness_mm:20, width_mm:170 } },
  { code: 'CUS-00003', name: 'PL6x150 HY370 (TH-2p7)',   type: 'PLATE',   grade: 'HY370', mark_prefix: 'FLG', mark_number: 'TH-2p7',   va: { profile:'PL6x150',   shape:'PL', method:'PL', thickness_mm:6,  width_mm:150 } },
  { code: 'CUS-00004', name: 'PL8x150 HY370 (TH-2p8)',   type: 'PLATE',   grade: 'HY370', mark_prefix: 'FLG', mark_number: 'TH-2p8',   va: { profile:'PL8x150',   shape:'PL', method:'PL', thickness_mm:8,  width_mm:150 } },
  { code: 'CUS-00005', name: 'PL16x170 HY370 (TH-2p2)',  type: 'PLATE',   grade: 'HY370', mark_prefix: 'STF', mark_number: 'TH-2p2',   va: { profile:'PL16x170',  shape:'PL', method:'PL', thickness_mm:16, width_mm:170 } },

  // Washers (PL8x60 — special small plates)
  { code: 'CUS-00006', name: 'PL8x60 HY370 (TH-2WH1)',   type: 'PLATE',   grade: 'HY370', mark_prefix: 'WH',  mark_number: 'TH-2WH1',  va: { profile:'PL8x60',    shape:'PL', method:'PL', thickness_mm:8,  width_mm:60 } },

  // Built-up Assembly (composite — has BOM children)
  { code: 'CUS-00007', name: 'Column Built-up H1259x170 HY370 (TH-2CO1)',
                                                          type: 'ASSEMBLY',grade: 'HY370', mark_prefix: 'C',   mark_number: 'TH-2CO1',
                                                          va: { profile:'H1259x170x6x6', shape:'H', method:'BH',
                                                                category:'COLUMN', height_mm:1259, width_mm:170,
                                                                web_thickness_mm:6, flange_thickness_mm:6 },
                                                          is_assembly: true },
  { code: 'CUS-00008', name: 'Column Built-up H805x430 HY370 (TH-2CO7)',
                                                          type: 'ASSEMBLY',grade: 'HY370', mark_prefix: 'C',   mark_number: 'TH-2CO7',
                                                          va: { profile:'H805x430x5x6', shape:'H', method:'BH',
                                                                category:'COLUMN', height_mm:805, width_mm:430,
                                                                web_thickness_mm:5, flange_thickness_mm:6 },
                                                          is_assembly: true },
  { code: 'CUS-00009', name: 'Rafter Built-up H962x150 HY370 (TH-2RF1)',
                                                          type: 'ASSEMBLY',grade: 'HY370', mark_prefix: 'RF',  mark_number: 'TH-2RF1',
                                                          va: { profile:'H962x150x8x8', shape:'H', method:'BH',
                                                                category:'RAFTER', height_mm:962, width_mm:150,
                                                                web_thickness_mm:8, flange_thickness_mm:8 },
                                                          is_assembly: true },

  // Fly Bracing (matches STD-00012 if same dims — example to show match logic)
  { code: 'CUS-00010', name: 'Fly Bracing L50x50x5 SS400 (TH-2FB1)',
                                                          type: 'ASSEMBLY',grade: 'SS400', mark_prefix: 'FB',  mark_number: 'TH-2FB1',
                                                          va: { profile:'L50x50x5', shape:'L', method:'ANG',
                                                                category:'FLYBRACING', leg_a_mm:50, leg_b_mm:50, thickness_mm:5 } },

  // Rod assembly
  { code: 'CUS-00011', name: 'Rod RB25 SS400 (TH-2R1)',  type: 'ASSEMBLY',grade: 'SS400', mark_prefix: 'RB',  mark_number: 'TH-2R1',   va: { profile:'RB25', shape:'RB', method:'BAR', category:'ROD', diameter_mm:25 } },
  { code: 'CUS-00012', name: 'Rod RB19 SS400 (TH-2R2)',  type: 'ASSEMBLY',grade: 'SS400', mark_prefix: 'RB',  mark_number: 'TH-2R2',   va: { profile:'RB19', shape:'RB', method:'BAR', category:'ROD', diameter_mm:19 } },
]


async function main() {
  // ─── Step 1: Get project (THEPHA) for custom examples ───
  const projectThePha = await prisma.project.findFirst({ where: { project_code: '0X181' } })
    ?? await prisma.project.create({ data: {
        project_code: '0X181', name: 'THEPHA 28x54m', state: 'active',
        create_uid: 1, write_uid: 1,
      }})

  // ─── Step 1b: Resolve category IDs by prefix_5 ───
  const categByPrefix = Object.fromEntries(
    (await prisma.product_category.findMany({
      where: { prefix_5: { in: ['PL000', 'HR000', 'CF000', 'PT000', 'MS000'] } },
      select: { id: true, prefix_5: true },
    })).map(c => [c.prefix_5!, c.id])
  )
  const CATEG: Record<string, number> = {
    PLATE:     categByPrefix['PL000'],
    L_ANGLE:   categByPrefix['HR000'],
    H_BEAM:    categByPrefix['HR000'],
    C_CHANNEL: categByPrefix['HR000'],
    ROD:       categByPrefix['HR000'],
    CHS:       categByPrefix['PT000'],
    PIPE:      categByPrefix['PT000'],
    RHS:       categByPrefix['CF000'],
    SHS:       categByPrefix['CF000'],
    ASSEMBLY:  categByPrefix['MS000'],
  }

  // ─── Step 1c: Ensure missing mark prefixes exist ───
  await prisma.mark_prefix_master.createMany({
    data: [
      { code: 'STF', label: 'Stiffener',  category: 'plate_part', part_type_code: 'p' },
      { code: 'WH',  label: 'Washer',     category: 'plate_part', part_type_code: 'p' },
      { code: 'RB',  label: 'Round Bar',  category: 'member',     part_type_code: 'm' },
    ],
    skipDuplicates: true,
  })

  // ─── Step 2: Clear old products (FK-safe order) ───
  console.log('🧹 Clearing existing products...')
  // Reset eBOM FK references first
  await prisma.bom_assembly.updateMany({ data: { product_id: null } }).catch(() => {})
  await prisma.bom_part.updateMany({ data: { product_id: null } }).catch(() => {})
  // Delete BOMs (cascade lines)
  await prisma.product_bom_line.deleteMany({})
  await prisma.product_bom.deleteMany({})
  // Delete products
  await prisma.products.deleteMany({})

  // ─── Step 3: Seed STANDARD products ───
  console.log(`🌱 Seeding ${STANDARD_PRODUCTS.length} STANDARD products...`)
  let stdCount = 0
  for (const p of STANDARD_PRODUCTS) {
    await prisma.products.create({
      data: {
        product_code: p.code,
        name: p.name,
        product_type: 'standard',
        product_kind: 'part',
        state: 'released',
        categ_id: CATEG[p.type],
        variant_attributes: { ...p.va, grade: p.grade },
        attributes: {},
        ...COST_DEFAULTS,
        stock_policy: 'reorder',
        reorder_min: 0,
        reorder_max: 100,
        create_uid: 1,
        write_uid: 1,
      }
    })
    stdCount++
  }
  console.log(`✅ Inserted ${stdCount} STANDARD products (STD-00001..00051)`)

  // ─── Step 3b: Seed STANDARD assemblies ───
  console.log(`🌱 Seeding ${STANDARD_ASSEMBLIES.length} STANDARD assemblies...`)
  for (const a of STANDARD_ASSEMBLIES) {
    await prisma.products.create({
      data: {
        product_code: a.code,
        name: a.name,
        product_type: 'standard',
        product_kind: 'assembly',
        state: 'released',
        categ_id: CATEG['ASSEMBLY'],
        variant_attributes: a.va,
        attributes: {},
        ...COST_DEFAULTS,
        create_uid: 1,
        write_uid: 1,
      },
    })
  }
  console.log(`✅ Inserted ${STANDARD_ASSEMBLIES.length} STANDARD assemblies (STD-00052..00054)`)

  // ─── Step 4: Seed CUSTOM products (THEPHA example) ───
  console.log(`🌱 Seeding ${CUSTOM_PRODUCTS.length} CUSTOM products...`)
  let cusCount = 0
  for (const p of CUSTOM_PRODUCTS) {
    await prisma.products.create({
      data: {
        product_code: p.code,
        name: p.name,
        product_type: 'custom',
        product_kind: (p as any).is_assembly ? 'assembly' : 'part',
        state: 'released',
        categ_id: CATEG[p.type],
        variant_attributes: p.va,
        attributes: {},
        ...COST_DEFAULTS,
        project_id: projectThePha.id,
        mark_prefix: p.mark_prefix,
        mark_number: p.mark_number,
        create_uid: 1,
        write_uid: 1,
      }
    })
    cusCount++
  }
  console.log(`✅ Inserted ${cusCount} CUSTOM products (CUS-00001..00012)`)

  // ─── Step 5: Verify ───
  const total = await prisma.products.count()
  const stdN = await prisma.products.count({ where: { product_type: 'standard', product_kind: 'part' } })
  const stdAsmN = await prisma.products.count({ where: { product_type: 'standard', product_kind: 'assembly' } })
  const cusN = await prisma.products.count({ where: { product_type: 'custom' } })
  console.log(`\n📊 Final: ${total} products = ${stdN} standard parts + ${stdAsmN} standard assemblies + ${cusN} custom`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
