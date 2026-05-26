/**
 * Demo Showcase Seed — 4 routing templates with full activities,
 * machine assignments, tools, and consumables.
 *
 * Run: npx ts-node --project tsconfig.json prisma/seed-demo-showcase.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ADMIN_UID = 1

// ── Equipment Resource IDs (verified from DB) ──────────────────
const EQ = {
  DRILL:           9,
  HBEAM:          11,
  STRAIGHTEN:     12,
  WELD_SAW:       13,
  WELD_SMAW:      14,
  WELD_MAG:       15,
  GRIND_7:        17,
  CRANE_25T:      18,
  BLAST:          21,
  SPRAY_AIRLESS:  22,
  CUT_PLASMA25:    2,
  CUT_PIPE:        4,
  PUNCH:           8,
  TAP:            10,
}

const TOOL = {
  GRIND_DISC7:    24,
  WIRE_BRUSH:     25,
  CLAMP_SET:      26,
  RULER:          27,
  PUNCH_MARK:     28,
  DRILL_BIT:      29,
  TAP_SET:        30,
  WRENCH_SET:     31,
  FIXTURE_JIG:    32,
}

const CON = {
  ELEC_E6013:    33,
  ELEC_E7018:    34,
  WIRE_ER70S6:   35,
  GAS_CO2:       37,
  FLUX_SAW:      39,
  PRIMER:        40,
  TOPCOAT:       41,
  CUTTING_GAS:   43,
  ABRASIVE:      44,
}

// ── Workcenter IDs (verified from DB) ─────────────────────────
const WC = {
  BU:        1,
  PT:        3,
  CUT_CNC:  11,
  CUT_PIPE: 12,
  PUNCH:    15,
  DRILL:    16,
  TAP:      17,
  HBEAM:    18,
  FITUP:    19,
  WELD_SMAW:20,
  WELD_MAG: 21,
  GRIND:    22,
}

// ── Formula param codes ─────────────────────────────────────────
const P = {
  per_piece:    'per_piece',
  hole_count:   'hole_count',
  cut_length:   'cut_length_mm',
  weld_length:  'weld_length_mm',
  edge_length:  'edge_length_mm',
  product_area: 'product_area',
  tack_points:  'tack_points',
}

// ─────────────────────────────────────────────────────────────────
// Helper: upsert a routing_activity_template
// ─────────────────────────────────────────────────────────────────
async function upsertActivity(opts: {
  op_code: string
  description: string
  sequence: number
  formula_param_code: string
  std_measure: number
  unit: string
  per_minute: number
  manpower?: number
  machine_id?: number
}) {
  // Use create-or-update based on (op_code + sequence) uniqueness approximation
  const existing = await prisma.routing_activity_template.findFirst({
    where: { op_code: opts.op_code, sequence: opts.sequence },
  })
  if (existing) {
    return prisma.routing_activity_template.update({
      where: { id: existing.id },
      data: {
        description: opts.description,
        per_minute: opts.per_minute,
        std_measure: opts.std_measure,
        unit: opts.unit,
        formula_param_code: opts.formula_param_code,
        manpower: opts.manpower ?? 1,
        workcenter_id: WC.DRILL, // placeholder – overridden below per op
        machine_id: opts.machine_id ?? null,
        write_uid: ADMIN_UID,
        write_date: new Date(),
      },
    })
  }
  return prisma.routing_activity_template.create({
    data: {
      op_code: opts.op_code,
      description: opts.description,
      sequence: opts.sequence,
      formula_param_code: opts.formula_param_code,
      std_measure: opts.std_measure,
      unit: opts.unit,
      per_minute: opts.per_minute,
      manpower: opts.manpower ?? 1,
      workcenter_id: WC.DRILL, // placeholder – actual WC is on the routing op
      machine_id: opts.machine_id ?? null,
      source: 'demo_seed',
      create_uid: ADMIN_UID,
      write_uid: ADMIN_UID,
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Helper: create routing_op_activity with machine, tools, consumables
// ─────────────────────────────────────────────────────────────────
async function createOpActivity(opts: {
  routing_workcenter_id: number
  activity_template_id: number
  sequence: number
  machine_id?: number
  tool_ids?: number[]
  consumables?: { resource_id: number; qty: number; unit: string }[]
}) {
  const oa = await prisma.routing_op_activity.upsert({
    where: {
      routing_workcenter_id_sequence: {
        routing_workcenter_id: opts.routing_workcenter_id,
        sequence: opts.sequence,
      },
    },
    create: {
      routing_workcenter_id: opts.routing_workcenter_id,
      activity_template_id: opts.activity_template_id,
      sequence: opts.sequence,
      machine_id: opts.machine_id ?? null,
    },
    update: {
      activity_template_id: opts.activity_template_id,
      machine_id: opts.machine_id ?? null,
    },
  })

  // Recreate tools
  await prisma.routing_op_act_tool.deleteMany({ where: { activity_id: oa.id } })
  if (opts.tool_ids?.length) {
    await prisma.routing_op_act_tool.createMany({
      data: opts.tool_ids.map(r => ({ activity_id: oa.id, resource_id: r })),
      skipDuplicates: true,
    })
  }

  // Recreate consumables
  await prisma.routing_op_act_consumable.deleteMany({ where: { activity_id: oa.id } })
  if (opts.consumables?.length) {
    await prisma.routing_op_act_consumable.createMany({
      data: opts.consumables.map(c => ({
        activity_id: oa.id,
        resource_id: c.resource_id,
        qty: c.qty,
        unit: c.unit,
      })),
      skipDuplicates: true,
    })
  }

  return oa
}

// ─────────────────────────────────────────────────────────────────
// Helper: upsert a routing_template + clean its ops
// ─────────────────────────────────────────────────────────────────
async function upsertTemplate(code: string, name: string, description: string) {
  const existing = await prisma.routing_template.findUnique({ where: { code } })
  if (existing) {
    // Delete existing ops (cascades to routing_op_activity + tools/consumables)
    await prisma.mrp_routing_workcenter.deleteMany({ where: { template_id: existing.id } })
    await prisma.routing_template.update({
      where: { id: existing.id },
      data: { name, description, write_uid: ADMIN_UID, write_date: new Date() },
    })
    return existing
  }
  return prisma.routing_template.create({
    data: {
      code, name, description,
      state: 'active',
      active: true,
      create_uid: ADMIN_UID,
      write_uid: ADMIN_UID,
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Helper: upsert mrp_routing_workcenter
// ─────────────────────────────────────────────────────────────────
async function upsertOp(opts: {
  template_id: number
  op_code: string
  name: string
  workcenter_id: number
  sequence: number
}) {
  return prisma.mrp_routing_workcenter.create({
    data: {
      template_id: opts.template_id,
      op_code: opts.op_code,
      name: opts.name,
      workcenter_id: opts.workcenter_id,
      sequence: opts.sequence,
      time_mode: 'activities',
      create_uid: ADMIN_UID,
      write_uid: ADMIN_UID,
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Helper: upsert test fixture
// ─────────────────────────────────────────────────────────────────
async function upsertFixture(opts: {
  template_id: number
  name: string
  source_mode: string
  attribute_values: Record<string, number>
}) {
  const existing = await prisma.routing_template_test_fixture.findFirst({
    where: { template_id: opts.template_id, name: opts.name },
  })
  if (existing) {
    return existing
  }
  return prisma.routing_template_test_fixture.create({
    data: {
      template_id: opts.template_id,
      name: opts.name,
      source_mode: opts.source_mode,
      attribute_values: opts.attribute_values,
      create_uid: ADMIN_UID,
    },
  })
}

// =================================================================
// MAIN SEED
// =================================================================
async function main() {
  console.log('🌱  Demo Showcase Seed starting...')

  // ================================================================
  // DEMO-T1: H-Beam Built-up Column/Beam
  // ================================================================
  console.log('  → DEMO-T1: H-Beam Built-up Column/Beam')
  const t1 = await upsertTemplate(
    'DEMO-T1',
    'H-Beam Built-up Column/Beam',
    'ชิ้นงานโครงสร้างเหล็กหลัก Built-up H-Section',
  )

  // Op 1 — CNC Drill
  const a_drill_setup = await upsertActivity({ op_code: 'OP-DEMO-DRILL', description: 'Setup & mark layout', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 1, machine_id: EQ.DRILL })
  const a_drill_holes = await upsertActivity({ op_code: 'OP-DEMO-DRILL', description: 'Drill bolt holes', sequence: 20, formula_param_code: P.hole_count, std_measure: 24, unit: 'holes', per_minute: 1.2, manpower: 1, machine_id: EQ.DRILL })
  const a_drill_deburr = await upsertActivity({ op_code: 'OP-DEMO-DRILL', description: 'Deburr & clean holes', sequence: 30, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1, machine_id: EQ.DRILL })

  const op1_t1 = await upsertOp({ template_id: t1.id, op_code: 'OP-DEMO-DRILL', name: 'CNC Drill', workcenter_id: WC.DRILL, sequence: 10 })
  await createOpActivity({ routing_workcenter_id: op1_t1.id, activity_template_id: a_drill_setup.id, sequence: 10, machine_id: EQ.DRILL, tool_ids: [TOOL.RULER, TOOL.PUNCH_MARK] })
  await createOpActivity({ routing_workcenter_id: op1_t1.id, activity_template_id: a_drill_holes.id, sequence: 20, machine_id: EQ.DRILL, tool_ids: [TOOL.DRILL_BIT] })
  await createOpActivity({ routing_workcenter_id: op1_t1.id, activity_template_id: a_drill_deburr.id, sequence: 30, machine_id: EQ.DRILL, tool_ids: [TOOL.DRILL_BIT] })

  // Op 2 — H-Beam Built-up Fit
  const a_hb_lift   = await upsertActivity({ op_code: 'OP-DEMO-HBEAM-FIT', description: 'Lift web+flanges to jig', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.04, manpower: 2, machine_id: EQ.CRANE_25T })
  const a_hb_assem  = await upsertActivity({ op_code: 'OP-DEMO-HBEAM-FIT', description: 'Assemble web+flanges', sequence: 20, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 2, machine_id: EQ.HBEAM })
  const a_hb_tack   = await upsertActivity({ op_code: 'OP-DEMO-HBEAM-FIT', description: 'Tack weld', sequence: 30, formula_param_code: P.tack_points, std_measure: 20, unit: 'points', per_minute: 0.5, manpower: 1 })
  const a_hb_insp   = await upsertActivity({ op_code: 'OP-DEMO-HBEAM-FIT', description: 'Inspect dimensions', sequence: 40, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })

  const op2_t1 = await upsertOp({ template_id: t1.id, op_code: 'OP-DEMO-HBEAM-FIT', name: 'H-Beam Built-up Fit', workcenter_id: WC.HBEAM, sequence: 20 })
  await createOpActivity({ routing_workcenter_id: op2_t1.id, activity_template_id: a_hb_lift.id,  sequence: 10, machine_id: EQ.CRANE_25T })
  await createOpActivity({ routing_workcenter_id: op2_t1.id, activity_template_id: a_hb_assem.id, sequence: 20, machine_id: EQ.HBEAM, tool_ids: [TOOL.FIXTURE_JIG, TOOL.CLAMP_SET] })
  await createOpActivity({ routing_workcenter_id: op2_t1.id, activity_template_id: a_hb_tack.id,  sequence: 30, tool_ids: [TOOL.FIXTURE_JIG], consumables: [{ resource_id: CON.ELEC_E6013, qty: 0.5, unit: 'kg' }] })
  await createOpActivity({ routing_workcenter_id: op2_t1.id, activity_template_id: a_hb_insp.id,  sequence: 40, tool_ids: [TOOL.RULER] })

  // Op 3 — SAW Auto Weld
  const a_saw_setup  = await upsertActivity({ op_code: 'OP-DEMO-SAW-WELD', description: 'Setup weld params & test run', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 1, machine_id: EQ.WELD_SAW })
  const a_saw_pass1  = await upsertActivity({ op_code: 'OP-DEMO-SAW-WELD', description: 'SAW weld pass 1 (flange 1)', sequence: 20, formula_param_code: P.weld_length, std_measure: 12000, unit: 'mm', per_minute: 300, manpower: 1, machine_id: EQ.WELD_SAW })
  const a_saw_flip1  = await upsertActivity({ op_code: 'OP-DEMO-SAW-WELD', description: 'Flip workpiece', sequence: 30, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.04, manpower: 2, machine_id: EQ.CRANE_25T })
  const a_saw_pass2  = await upsertActivity({ op_code: 'OP-DEMO-SAW-WELD', description: 'SAW weld pass 2 (flange 2)', sequence: 40, formula_param_code: P.weld_length, std_measure: 12000, unit: 'mm', per_minute: 300, manpower: 1, machine_id: EQ.WELD_SAW })
  const a_saw_str    = await upsertActivity({ op_code: 'OP-DEMO-SAW-WELD', description: 'Flange straighten', sequence: 50, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 1, machine_id: EQ.STRAIGHTEN })

  const op3_t1 = await upsertOp({ template_id: t1.id, op_code: 'OP-DEMO-SAW-WELD', name: 'SAW Auto Weld', workcenter_id: WC.HBEAM, sequence: 30 })
  await createOpActivity({ routing_workcenter_id: op3_t1.id, activity_template_id: a_saw_setup.id, sequence: 10, machine_id: EQ.WELD_SAW })
  await createOpActivity({ routing_workcenter_id: op3_t1.id, activity_template_id: a_saw_pass1.id, sequence: 20, machine_id: EQ.WELD_SAW, consumables: [{ resource_id: CON.WIRE_ER70S6, qty: 2, unit: 'kg' }, { resource_id: CON.FLUX_SAW, qty: 2, unit: 'kg' }] })
  await createOpActivity({ routing_workcenter_id: op3_t1.id, activity_template_id: a_saw_flip1.id, sequence: 30, machine_id: EQ.CRANE_25T })
  await createOpActivity({ routing_workcenter_id: op3_t1.id, activity_template_id: a_saw_pass2.id, sequence: 40, machine_id: EQ.WELD_SAW, consumables: [{ resource_id: CON.WIRE_ER70S6, qty: 2, unit: 'kg' }, { resource_id: CON.FLUX_SAW, qty: 2, unit: 'kg' }] })
  await createOpActivity({ routing_workcenter_id: op3_t1.id, activity_template_id: a_saw_str.id,   sequence: 50, machine_id: EQ.STRAIGHTEN })

  // Op 4 — Fit-up Assembly
  const a_fu_layout  = await upsertActivity({ op_code: 'OP-DEMO-FITUP', description: 'Layout & mark parts', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 1 })
  const a_fu_clamp   = await upsertActivity({ op_code: 'OP-DEMO-FITUP', description: 'Position & clamp parts', sequence: 20, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 2 })
  const a_fu_tack    = await upsertActivity({ op_code: 'OP-DEMO-FITUP', description: 'Tack weld', sequence: 30, formula_param_code: P.tack_points, std_measure: 20, unit: 'points', per_minute: 0.5, manpower: 1 })
  const a_fu_dimchk  = await upsertActivity({ op_code: 'OP-DEMO-FITUP', description: 'Dimensional check', sequence: 40, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })

  const op4_t1 = await upsertOp({ template_id: t1.id, op_code: 'OP-DEMO-FITUP', name: 'Fit-up Assembly', workcenter_id: WC.FITUP, sequence: 40 })
  await createOpActivity({ routing_workcenter_id: op4_t1.id, activity_template_id: a_fu_layout.id, sequence: 10, tool_ids: [TOOL.RULER, TOOL.PUNCH_MARK] })
  await createOpActivity({ routing_workcenter_id: op4_t1.id, activity_template_id: a_fu_clamp.id,  sequence: 20, tool_ids: [TOOL.CLAMP_SET] })
  await createOpActivity({ routing_workcenter_id: op4_t1.id, activity_template_id: a_fu_tack.id,   sequence: 30, consumables: [{ resource_id: CON.ELEC_E6013, qty: 0.3, unit: 'kg' }] })
  await createOpActivity({ routing_workcenter_id: op4_t1.id, activity_template_id: a_fu_dimchk.id, sequence: 40, tool_ids: [TOOL.RULER] })

  // Op 5 — Assembly MAG Welding
  const a_mag_weld   = await upsertActivity({ op_code: 'OP-DEMO-AS-WELD', description: 'Weld structural joints', sequence: 10, formula_param_code: P.weld_length, std_measure: 8000, unit: 'mm', per_minute: 200, manpower: 2, machine_id: EQ.WELD_MAG })
  const a_mag_grind  = await upsertActivity({ op_code: 'OP-DEMO-AS-WELD', description: 'Grind & smooth welds', sequence: 20, formula_param_code: P.edge_length, std_measure: 3000, unit: 'mm', per_minute: 100, manpower: 1, machine_id: EQ.GRIND_7 })
  const a_mag_insp   = await upsertActivity({ op_code: 'OP-DEMO-AS-WELD', description: 'Inspect & record', sequence: 30, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.3, manpower: 1 })

  const op5_t1 = await upsertOp({ template_id: t1.id, op_code: 'OP-DEMO-AS-WELD', name: 'Assembly MAG Welding', workcenter_id: WC.WELD_MAG, sequence: 50 })
  await createOpActivity({ routing_workcenter_id: op5_t1.id, activity_template_id: a_mag_weld.id,  sequence: 10, machine_id: EQ.WELD_MAG, consumables: [{ resource_id: CON.WIRE_ER70S6, qty: 3, unit: 'kg' }, { resource_id: CON.GAS_CO2, qty: 5, unit: 'L' }] })
  await createOpActivity({ routing_workcenter_id: op5_t1.id, activity_template_id: a_mag_grind.id, sequence: 20, machine_id: EQ.GRIND_7, tool_ids: [TOOL.GRIND_DISC7, TOOL.WIRE_BRUSH] })
  await createOpActivity({ routing_workcenter_id: op5_t1.id, activity_template_id: a_mag_insp.id,  sequence: 30, tool_ids: [TOOL.RULER] })

  // Op 6 — Shot Blast & Primer
  const a_blast_move  = await upsertActivity({ op_code: 'OP-DEMO-BLAST', description: 'Move into blast chamber', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.04, manpower: 2, machine_id: EQ.CRANE_25T })
  const a_blast_shot  = await upsertActivity({ op_code: 'OP-DEMO-BLAST', description: 'Shot blast', sequence: 20, formula_param_code: P.product_area, std_measure: 85, unit: 'sq.m', per_minute: 4, manpower: 1, machine_id: EQ.BLAST })
  const a_blast_prime = await upsertActivity({ op_code: 'OP-DEMO-BLAST', description: 'Apply primer coat', sequence: 30, formula_param_code: P.product_area, std_measure: 85, unit: 'sq.m', per_minute: 3, manpower: 1, machine_id: EQ.SPRAY_AIRLESS })
  const a_blast_insp  = await upsertActivity({ op_code: 'OP-DEMO-BLAST', description: 'Inspect & record', sequence: 40, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })

  const op6_t1 = await upsertOp({ template_id: t1.id, op_code: 'OP-DEMO-BLAST', name: 'Shot Blast & Primer', workcenter_id: WC.PT, sequence: 60 })
  await createOpActivity({ routing_workcenter_id: op6_t1.id, activity_template_id: a_blast_move.id,  sequence: 10, machine_id: EQ.CRANE_25T })
  await createOpActivity({ routing_workcenter_id: op6_t1.id, activity_template_id: a_blast_shot.id,  sequence: 20, machine_id: EQ.BLAST,         consumables: [{ resource_id: CON.ABRASIVE, qty: 10, unit: 'kg' }] })
  await createOpActivity({ routing_workcenter_id: op6_t1.id, activity_template_id: a_blast_prime.id, sequence: 30, machine_id: EQ.SPRAY_AIRLESS, consumables: [{ resource_id: CON.PRIMER,   qty: 5,  unit: 'L'  }] })
  await createOpActivity({ routing_workcenter_id: op6_t1.id, activity_template_id: a_blast_insp.id,  sequence: 40 })

  // Op 7 — Top Coat
  const a_tc_prep   = await upsertActivity({ op_code: 'OP-DEMO-TOPCOAT', description: 'Surface prep', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })
  const a_tc_coat   = await upsertActivity({ op_code: 'OP-DEMO-TOPCOAT', description: 'Apply top coat', sequence: 20, formula_param_code: P.product_area, std_measure: 85, unit: 'sq.m', per_minute: 2, manpower: 1, machine_id: EQ.SPRAY_AIRLESS })
  const a_tc_meas   = await upsertActivity({ op_code: 'OP-DEMO-TOPCOAT', description: 'Measure paint thickness', sequence: 30, formula_param_code: P.product_area, std_measure: 85, unit: 'sq.m', per_minute: 10, manpower: 1 })
  const a_tc_final  = await upsertActivity({ op_code: 'OP-DEMO-TOPCOAT', description: 'Final inspection & tag', sequence: 40, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.3, manpower: 1 })

  const op7_t1 = await upsertOp({ template_id: t1.id, op_code: 'OP-DEMO-TOPCOAT', name: 'Top Coat', workcenter_id: WC.PT, sequence: 70 })
  await createOpActivity({ routing_workcenter_id: op7_t1.id, activity_template_id: a_tc_prep.id,  sequence: 10 })
  await createOpActivity({ routing_workcenter_id: op7_t1.id, activity_template_id: a_tc_coat.id,  sequence: 20, machine_id: EQ.SPRAY_AIRLESS, consumables: [{ resource_id: CON.TOPCOAT, qty: 8, unit: 'L' }] })
  await createOpActivity({ routing_workcenter_id: op7_t1.id, activity_template_id: a_tc_meas.id,  sequence: 30 })
  await createOpActivity({ routing_workcenter_id: op7_t1.id, activity_template_id: a_tc_final.id, sequence: 40 })

  // Fixture T1
  await upsertFixture({
    template_id: t1.id,
    name: '12m H-Beam Column — Standard',
    source_mode: 'manual',
    attribute_values: { hole_count: 24, tack_points: 20, weld_length_mm: 12000, edge_length_mm: 3000, sumNet_surface_area: 85 },
  })

  // ================================================================
  // DEMO-T2: Light Steel Accessory (Purlin / Girt / C-Section)
  // ================================================================
  console.log('  → DEMO-T2: Light Steel Accessory (Purlin)')
  const t2 = await upsertTemplate(
    'DEMO-T2',
    'Light Steel Accessory (Purlin/Girt/C-Section)',
    'ชิ้นงาน Accessory เหล็กรูปพรรณเย็น Purlin C/Z',
  )

  // Op 1 — CNC Plasma Cut
  const a2_setup    = await upsertActivity({ op_code: 'OP-DEMO-PLASMA', description: 'Load & setup CNC', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 1, machine_id: EQ.CUT_PLASMA25 })
  const a2_cut      = await upsertActivity({ op_code: 'OP-DEMO-PLASMA', description: 'Plasma cut profile', sequence: 20, formula_param_code: P.cut_length, std_measure: 3000, unit: 'mm', per_minute: 500, manpower: 1, machine_id: EQ.CUT_PLASMA25 })
  const a2_deburr   = await upsertActivity({ op_code: 'OP-DEMO-PLASMA', description: 'Remove slag & deburr', sequence: 30, formula_param_code: P.cut_length, std_measure: 3000, unit: 'mm', per_minute: 150, manpower: 1 })

  const op1_t2 = await upsertOp({ template_id: t2.id, op_code: 'OP-DEMO-PLASMA', name: 'CNC Plasma Cut', workcenter_id: WC.CUT_CNC, sequence: 10 })
  await createOpActivity({ routing_workcenter_id: op1_t2.id, activity_template_id: a2_setup.id,  sequence: 10, machine_id: EQ.CUT_PLASMA25, tool_ids: [TOOL.RULER] })
  await createOpActivity({ routing_workcenter_id: op1_t2.id, activity_template_id: a2_cut.id,    sequence: 20, machine_id: EQ.CUT_PLASMA25, consumables: [{ resource_id: CON.CUTTING_GAS, qty: 2, unit: 'L' }] })
  await createOpActivity({ routing_workcenter_id: op1_t2.id, activity_template_id: a2_deburr.id, sequence: 30, tool_ids: [TOOL.GRIND_DISC7] })

  // Op 2 — Punch Holes
  const a2_psetup  = await upsertActivity({ op_code: 'OP-DEMO-PUNCH', description: 'Setup punch dies', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1, machine_id: EQ.PUNCH })
  const a2_punch   = await upsertActivity({ op_code: 'OP-DEMO-PUNCH', description: 'Punch bolt holes', sequence: 20, formula_param_code: P.hole_count, std_measure: 12, unit: 'holes', per_minute: 2, manpower: 1, machine_id: EQ.PUNCH })
  const a2_pchk    = await upsertActivity({ op_code: 'OP-DEMO-PUNCH', description: 'Check dimensions', sequence: 30, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.3, manpower: 1 })

  const op2_t2 = await upsertOp({ template_id: t2.id, op_code: 'OP-DEMO-PUNCH', name: 'Punch Holes', workcenter_id: WC.PUNCH, sequence: 20 })
  await createOpActivity({ routing_workcenter_id: op2_t2.id, activity_template_id: a2_psetup.id, sequence: 10, machine_id: EQ.PUNCH, tool_ids: [TOOL.CLAMP_SET] })
  await createOpActivity({ routing_workcenter_id: op2_t2.id, activity_template_id: a2_punch.id,  sequence: 20, machine_id: EQ.PUNCH })
  await createOpActivity({ routing_workcenter_id: op2_t2.id, activity_template_id: a2_pchk.id,   sequence: 30, tool_ids: [TOOL.RULER] })

  // Op 3 — Fit-up & Tack
  const a2_lay   = await upsertActivity({ op_code: 'OP-DEMO-FITUP2', description: 'Lay & mark', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })
  const a2_tack  = await upsertActivity({ op_code: 'OP-DEMO-FITUP2', description: 'Tack weld', sequence: 20, formula_param_code: P.tack_points, std_measure: 6, unit: 'points', per_minute: 1, manpower: 1 })

  const op3_t2 = await upsertOp({ template_id: t2.id, op_code: 'OP-DEMO-FITUP2', name: 'Fit-up & Tack', workcenter_id: WC.FITUP, sequence: 30 })
  await createOpActivity({ routing_workcenter_id: op3_t2.id, activity_template_id: a2_lay.id,  sequence: 10, tool_ids: [TOOL.RULER, TOOL.PUNCH_MARK] })
  await createOpActivity({ routing_workcenter_id: op3_t2.id, activity_template_id: a2_tack.id, sequence: 20, consumables: [{ resource_id: CON.ELEC_E6013, qty: 0.1, unit: 'kg' }] })

  // Op 4 — MAG Weld
  const a2_mweld  = await upsertActivity({ op_code: 'OP-DEMO-MAG', description: 'Weld joints', sequence: 10, formula_param_code: P.weld_length, std_measure: 800, unit: 'mm', per_minute: 200, manpower: 1, machine_id: EQ.WELD_MAG })
  const a2_mgrind = await upsertActivity({ op_code: 'OP-DEMO-MAG', description: 'Grind welds', sequence: 20, formula_param_code: P.edge_length, std_measure: 400, unit: 'mm', per_minute: 100, manpower: 1 })

  const op4_t2 = await upsertOp({ template_id: t2.id, op_code: 'OP-DEMO-MAG', name: 'MAG Weld', workcenter_id: WC.WELD_MAG, sequence: 40 })
  await createOpActivity({ routing_workcenter_id: op4_t2.id, activity_template_id: a2_mweld.id,  sequence: 10, machine_id: EQ.WELD_MAG, consumables: [{ resource_id: CON.WIRE_ER70S6, qty: 0.5, unit: 'kg' }, { resource_id: CON.GAS_CO2, qty: 1, unit: 'L' }] })
  await createOpActivity({ routing_workcenter_id: op4_t2.id, activity_template_id: a2_mgrind.id, sequence: 20, tool_ids: [TOOL.GRIND_DISC7] })

  // Op 5 — Blast & Primer
  const a2_blast  = await upsertActivity({ op_code: 'OP-DEMO-PRIMER', description: 'Shot blast', sequence: 10, formula_param_code: P.product_area, std_measure: 18, unit: 'sq.m', per_minute: 4, manpower: 1, machine_id: EQ.BLAST })
  const a2_prime  = await upsertActivity({ op_code: 'OP-DEMO-PRIMER', description: 'Primer coat', sequence: 20, formula_param_code: P.product_area, std_measure: 18, unit: 'sq.m', per_minute: 3, manpower: 1, machine_id: EQ.SPRAY_AIRLESS })

  const op5_t2 = await upsertOp({ template_id: t2.id, op_code: 'OP-DEMO-PRIMER', name: 'Blast & Primer', workcenter_id: WC.PT, sequence: 50 })
  await createOpActivity({ routing_workcenter_id: op5_t2.id, activity_template_id: a2_blast.id, sequence: 10, machine_id: EQ.BLAST,         consumables: [{ resource_id: CON.ABRASIVE, qty: 3, unit: 'kg' }] })
  await createOpActivity({ routing_workcenter_id: op5_t2.id, activity_template_id: a2_prime.id, sequence: 20, machine_id: EQ.SPRAY_AIRLESS, consumables: [{ resource_id: CON.PRIMER,   qty: 1, unit: 'L'  }] })

  // Fixture T2
  await upsertFixture({
    template_id: t2.id,
    name: 'C-Purlin 150mm × 6m — Standard',
    source_mode: 'manual',
    attribute_values: { cut_length_mm: 3000, hole_count: 12, tack_points: 6, weld_length_mm: 800, sumNet_surface_area: 18 },
  })

  // ================================================================
  // DEMO-T3: Connection Plate / Baseplate
  // ================================================================
  console.log('  → DEMO-T3: Connection Plate / Baseplate')
  const t3 = await upsertTemplate(
    'DEMO-T3',
    'Connection Plate / Baseplate',
    'แผ่นเชื่อมต่อ/ฐาน Baseplate ตัดเจาะเชื่อมโดยไม่ทาสี',
  )

  // Op 1 — Plasma Cut Plate
  const a3_load   = await upsertActivity({ op_code: 'OP-DEMO-CUT-PLATE', description: 'Load plate & setup CNC', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 1, machine_id: EQ.CUT_PLASMA25 })
  const a3_cut    = await upsertActivity({ op_code: 'OP-DEMO-CUT-PLATE', description: 'Cut plate to size', sequence: 20, formula_param_code: P.cut_length, std_measure: 1600, unit: 'mm', per_minute: 600, manpower: 1, machine_id: EQ.CUT_PLASMA25 })
  const a3_grind  = await upsertActivity({ op_code: 'OP-DEMO-CUT-PLATE', description: 'Grind edges', sequence: 30, formula_param_code: P.cut_length, std_measure: 1600, unit: 'mm', per_minute: 100, manpower: 1 })

  const op1_t3 = await upsertOp({ template_id: t3.id, op_code: 'OP-DEMO-CUT-PLATE', name: 'Plasma Cut Plate', workcenter_id: WC.CUT_CNC, sequence: 10 })
  await createOpActivity({ routing_workcenter_id: op1_t3.id, activity_template_id: a3_load.id,  sequence: 10, machine_id: EQ.CUT_PLASMA25 })
  await createOpActivity({ routing_workcenter_id: op1_t3.id, activity_template_id: a3_cut.id,   sequence: 20, machine_id: EQ.CUT_PLASMA25, consumables: [{ resource_id: CON.CUTTING_GAS, qty: 1, unit: 'L' }] })
  await createOpActivity({ routing_workcenter_id: op1_t3.id, activity_template_id: a3_grind.id, sequence: 30, tool_ids: [TOOL.GRIND_DISC7] })

  // Op 2 — Drill
  const a3_mark    = await upsertActivity({ op_code: 'OP-DEMO-DRILL-PLATE', description: 'Setup & mark', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 1 })
  const a3_drill   = await upsertActivity({ op_code: 'OP-DEMO-DRILL-PLATE', description: 'Drill anchor holes', sequence: 20, formula_param_code: P.hole_count, std_measure: 8, unit: 'holes', per_minute: 0.8, manpower: 1, machine_id: EQ.DRILL })

  const op2_t3 = await upsertOp({ template_id: t3.id, op_code: 'OP-DEMO-DRILL-PLATE', name: 'Drill Anchor Holes', workcenter_id: WC.DRILL, sequence: 20 })
  await createOpActivity({ routing_workcenter_id: op2_t3.id, activity_template_id: a3_mark.id,  sequence: 10, tool_ids: [TOOL.RULER, TOOL.PUNCH_MARK] })
  await createOpActivity({ routing_workcenter_id: op2_t3.id, activity_template_id: a3_drill.id, sequence: 20, machine_id: EQ.DRILL, tool_ids: [TOOL.DRILL_BIT] })

  // Op 3 — Weld Stiffener
  const a3_fit    = await upsertActivity({ op_code: 'OP-DEMO-STIFF', description: 'Fit & tack', sequence: 10, formula_param_code: P.tack_points, std_measure: 4, unit: 'points', per_minute: 1, manpower: 1 })
  const a3_weld   = await upsertActivity({ op_code: 'OP-DEMO-STIFF', description: 'MAG weld stiffener', sequence: 20, formula_param_code: P.weld_length, std_measure: 600, unit: 'mm', per_minute: 200, manpower: 1, machine_id: EQ.WELD_MAG })
  const a3_clean  = await upsertActivity({ op_code: 'OP-DEMO-STIFF', description: 'Grind & clean', sequence: 30, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })

  const op3_t3 = await upsertOp({ template_id: t3.id, op_code: 'OP-DEMO-STIFF', name: 'Weld Stiffener', workcenter_id: WC.WELD_MAG, sequence: 30 })
  await createOpActivity({ routing_workcenter_id: op3_t3.id, activity_template_id: a3_fit.id,   sequence: 10, tool_ids: [TOOL.CLAMP_SET], consumables: [{ resource_id: CON.ELEC_E6013, qty: 0.1, unit: 'kg' }] })
  await createOpActivity({ routing_workcenter_id: op3_t3.id, activity_template_id: a3_weld.id,  sequence: 20, machine_id: EQ.WELD_MAG, consumables: [{ resource_id: CON.WIRE_ER70S6, qty: 0.3, unit: 'kg' }, { resource_id: CON.GAS_CO2, qty: 0.5, unit: 'L' }] })
  await createOpActivity({ routing_workcenter_id: op3_t3.id, activity_template_id: a3_clean.id, sequence: 30, tool_ids: [TOOL.GRIND_DISC7, TOOL.WIRE_BRUSH] })

  // Op 4 — QC & Mark
  const a3_dimchk  = await upsertActivity({ op_code: 'OP-DEMO-QC', description: 'Dimensional check', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })
  const a3_tag     = await upsertActivity({ op_code: 'OP-DEMO-QC', description: 'Mark & tag', sequence: 20, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.5, manpower: 1 })

  const op4_t3 = await upsertOp({ template_id: t3.id, op_code: 'OP-DEMO-QC', name: 'QC & Mark', workcenter_id: WC.FITUP, sequence: 40 })
  await createOpActivity({ routing_workcenter_id: op4_t3.id, activity_template_id: a3_dimchk.id, sequence: 10, tool_ids: [TOOL.RULER] })
  await createOpActivity({ routing_workcenter_id: op4_t3.id, activity_template_id: a3_tag.id,    sequence: 20, tool_ids: [TOOL.PUNCH_MARK] })

  // Fixture T3
  await upsertFixture({
    template_id: t3.id,
    name: 'Baseplate 400×400mm — Standard',
    source_mode: 'manual',
    attribute_values: { cut_length_mm: 1600, hole_count: 8, tack_points: 4, weld_length_mm: 600 },
  })

  // ================================================================
  // DEMO-T4: Pipe / Round Bar Processing
  // ================================================================
  console.log('  → DEMO-T4: Pipe / Round Bar Processing')
  const t4 = await upsertTemplate(
    'DEMO-T4',
    'Pipe Spool / Round Bar Processing',
    'Pipe Spool / Round Bar เจาะ ต๊าป เชื่อม',
  )

  // Op 1 — CNC Pipe Cut
  const a4_chuck   = await upsertActivity({ op_code: 'OP-DEMO-PIPE-CUT', description: 'Setup pipe chuck', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.1, manpower: 1, machine_id: EQ.CUT_PIPE })
  const a4_cut     = await upsertActivity({ op_code: 'OP-DEMO-PIPE-CUT', description: 'Cut to length', sequence: 20, formula_param_code: P.cut_length, std_measure: 3000, unit: 'mm', per_minute: 800, manpower: 1, machine_id: EQ.CUT_PIPE })
  const a4_deburr  = await upsertActivity({ op_code: 'OP-DEMO-PIPE-CUT', description: 'Deburr ends', sequence: 30, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })

  const op1_t4 = await upsertOp({ template_id: t4.id, op_code: 'OP-DEMO-PIPE-CUT', name: 'CNC Pipe Cut', workcenter_id: WC.CUT_PIPE, sequence: 10 })
  await createOpActivity({ routing_workcenter_id: op1_t4.id, activity_template_id: a4_chuck.id,  sequence: 10, machine_id: EQ.CUT_PIPE })
  await createOpActivity({ routing_workcenter_id: op1_t4.id, activity_template_id: a4_cut.id,    sequence: 20, machine_id: EQ.CUT_PIPE, consumables: [{ resource_id: CON.CUTTING_GAS, qty: 0.5, unit: 'L' }] })
  await createOpActivity({ routing_workcenter_id: op1_t4.id, activity_template_id: a4_deburr.id, sequence: 30, tool_ids: [TOOL.GRIND_DISC7] })

  // Op 2 — Drill
  const a4_mark    = await upsertActivity({ op_code: 'OP-DEMO-PIPE-DRILL', description: 'Mark & setup', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })
  const a4_drill   = await upsertActivity({ op_code: 'OP-DEMO-PIPE-DRILL', description: 'Drill holes', sequence: 20, formula_param_code: P.hole_count, std_measure: 4, unit: 'holes', per_minute: 0.5, manpower: 1, machine_id: EQ.DRILL })

  const op2_t4 = await upsertOp({ template_id: t4.id, op_code: 'OP-DEMO-PIPE-DRILL', name: 'Drill Holes', workcenter_id: WC.DRILL, sequence: 20 })
  await createOpActivity({ routing_workcenter_id: op2_t4.id, activity_template_id: a4_mark.id,  sequence: 10, tool_ids: [TOOL.RULER, TOOL.PUNCH_MARK] })
  await createOpActivity({ routing_workcenter_id: op2_t4.id, activity_template_id: a4_drill.id, sequence: 20, machine_id: EQ.DRILL, tool_ids: [TOOL.DRILL_BIT] })

  // Op 3 — Thread Tapping
  const a4_tapsetup  = await upsertActivity({ op_code: 'OP-DEMO-TAP', description: 'Setup tapping head', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1, machine_id: EQ.TAP })
  const a4_tap       = await upsertActivity({ op_code: 'OP-DEMO-TAP', description: 'Tap threads', sequence: 20, formula_param_code: P.hole_count, std_measure: 4, unit: 'holes', per_minute: 0.3, manpower: 1, machine_id: EQ.TAP })
  const a4_tapinsp   = await upsertActivity({ op_code: 'OP-DEMO-TAP', description: 'Inspect threads', sequence: 30, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.5, manpower: 1 })

  const op3_t4 = await upsertOp({ template_id: t4.id, op_code: 'OP-DEMO-TAP', name: 'Thread Tapping', workcenter_id: WC.TAP, sequence: 30 })
  await createOpActivity({ routing_workcenter_id: op3_t4.id, activity_template_id: a4_tapsetup.id, sequence: 10, machine_id: EQ.TAP, tool_ids: [TOOL.TAP_SET] })
  await createOpActivity({ routing_workcenter_id: op3_t4.id, activity_template_id: a4_tap.id,       sequence: 20, machine_id: EQ.TAP, tool_ids: [TOOL.TAP_SET] })
  await createOpActivity({ routing_workcenter_id: op3_t4.id, activity_template_id: a4_tapinsp.id,   sequence: 30, tool_ids: [TOOL.RULER] })

  // Op 4 — Assembly Weld (SMAW)
  const a4_fit    = await upsertActivity({ op_code: 'OP-DEMO-PIPE-WELD', description: 'Fit flanges/brackets', sequence: 10, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })
  const a4_weld   = await upsertActivity({ op_code: 'OP-DEMO-PIPE-WELD', description: 'SMAW weld', sequence: 20, formula_param_code: P.weld_length, std_measure: 300, unit: 'mm', per_minute: 80, manpower: 1, machine_id: EQ.WELD_SMAW })
  const a4_grind  = await upsertActivity({ op_code: 'OP-DEMO-PIPE-WELD', description: 'Grind & inspect', sequence: 30, formula_param_code: P.per_piece, std_measure: 1, unit: 'unit', per_minute: 0.2, manpower: 1 })

  const op4_t4 = await upsertOp({ template_id: t4.id, op_code: 'OP-DEMO-PIPE-WELD', name: 'Assembly Weld (SMAW)', workcenter_id: WC.WELD_SMAW, sequence: 40 })
  await createOpActivity({ routing_workcenter_id: op4_t4.id, activity_template_id: a4_fit.id,   sequence: 10, tool_ids: [TOOL.CLAMP_SET, TOOL.WRENCH_SET] })
  await createOpActivity({ routing_workcenter_id: op4_t4.id, activity_template_id: a4_weld.id,  sequence: 20, machine_id: EQ.WELD_SMAW, consumables: [{ resource_id: CON.ELEC_E7018, qty: 0.2, unit: 'kg' }] })
  await createOpActivity({ routing_workcenter_id: op4_t4.id, activity_template_id: a4_grind.id, sequence: 30, tool_ids: [TOOL.GRIND_DISC7] })

  // Fixture T4
  await upsertFixture({
    template_id: t4.id,
    name: 'Pipe Spool DN100 × 3m — Standard',
    source_mode: 'manual',
    attribute_values: { cut_length_mm: 3000, hole_count: 4 },
  })

  console.log('✅  Demo Showcase Seed complete.')
  console.log(`   Templates: ${t1.id}(DEMO-T1), ${t2.id}(DEMO-T2), ${t3.id}(DEMO-T3), ${t4.id}(DEMO-T4)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
