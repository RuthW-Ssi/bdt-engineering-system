/**
 * Sprint 11 Phase 4 — Factory 1 seed (idempotent)
 * Creates:
 *   1. 2 new op types (form, beam)
 *   2. 10 new formula params
 *   3. 12 new workcenters  (keeps existing 5: WC-BU, WC-AS, WC-PT, WC-PR, WC-CNC)
 *   4. 25 activity templates
 *   5. 13 operation templates + their snapshot activities
 *
 * Run: cd backend && ts-node prisma/seed-factory1.ts
 */
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()
const ADMIN_UID = 1

// ─────────────────────────────────────────────────────────────────
// 1. Op Types
// ─────────────────────────────────────────────────────────────────

const NEW_OP_TYPES = [
  { key: 'form',     label: 'Form',     color: '#F59E0B', sequence: 15 },
  { key: 'beam',     label: 'Beam',     color: '#8B5CF6', sequence: 35 },
  { key: 'assembly', label: 'Assembly', color: '#06B6D4', sequence: 45 },
  { key: 'finish',   label: 'Finish',   color: '#10B981', sequence: 75 },
]

// ─────────────────────────────────────────────────────────────────
// 2. Formula Params
// ─────────────────────────────────────────────────────────────────

const FORMULA_PARAMS: Prisma.routing_formula_paramCreateInput[] = [
  {
    code: 'per_piece',
    description: 'Per piece (constant 1 — for fixed-time activities)',
    formula_expression: '1',
    inputs_required: [],
    return_unit: 'pc',
    applies_to_groups: ['all'],
  },
  {
    code: 'cut_length_mm',
    description: 'Cutting length (mm)',
    formula_expression: 'cut_length_mm',
    inputs_required: ['cut_length_mm'],
    return_unit: 'mm',
    applies_to_groups: ['cut'],
  },
  {
    code: 'bevel_length_mm',
    description: 'Bevel prep length (mm)',
    formula_expression: 'bevel_length_mm',
    inputs_required: ['bevel_length_mm'],
    return_unit: 'mm',
    applies_to_groups: ['cut'],
  },
  {
    code: 'cut_count',
    description: 'Number of cuts',
    formula_expression: 'cut_count',
    inputs_required: ['cut_count'],
    return_unit: 'ea',
    applies_to_groups: ['cut'],
  },
  {
    code: 'bend_count',
    description: 'Number of bend strokes',
    formula_expression: 'bend_count',
    inputs_required: ['bend_count'],
    return_unit: 'ea',
    applies_to_groups: ['form'],
  },
  {
    code: 'hole_count',
    description: 'Number of holes (punch / drill / tap)',
    formula_expression: 'hole_count',
    inputs_required: ['hole_count'],
    return_unit: 'ea',
    applies_to_groups: ['form'],
  },
  {
    code: 'tack_points',
    description: 'Number of tack weld points',
    formula_expression: 'tack_points',
    inputs_required: ['tack_points'],
    return_unit: 'ea',
    applies_to_groups: ['fitup', 'weld'],
  },
  {
    code: 'weld_metal_kg',
    description: 'Weld metal deposited (kg) — root / fill / cap passes',
    formula_expression: 'weld_metal_kg',
    inputs_required: ['weld_metal_kg'],
    return_unit: 'kg',
    applies_to_groups: ['weld'],
  },
  {
    code: 'weld_length_mm',
    description: 'Weld seam length (mm)',
    formula_expression: 'weld_length_mm',
    inputs_required: ['weld_length_mm'],
    return_unit: 'mm',
    applies_to_groups: ['weld', 'beam', 'grind', 'inspect'],
  },
  {
    code: 'edge_length_mm',
    description: 'Edge / face length to grind (mm)',
    formula_expression: 'edge_length_mm',
    inputs_required: ['edge_length_mm'],
    return_unit: 'mm',
    applies_to_groups: ['finish'],
  },
]

// ─────────────────────────────────────────────────────────────────
// 3. Workcenters
// ─────────────────────────────────────────────────────────────────

const WORKCENTERS = [
  { code: 'WC-CUT-CNC',   name: 'CNC Plasma/Gas Cutting (Plate)', sequence: 10 },
  { code: 'WC-CUT-PIPE',  name: 'CNC Pipe Cutting',               sequence: 20 },
  { code: 'WC-CUT-SAW',   name: 'Band Saw Cutting',               sequence: 30 },
  { code: 'WC-PRESS',     name: 'Press / Bending',                sequence: 40 },
  { code: 'WC-PUNCH',     name: 'Hydraulic Punching',             sequence: 50 },
  { code: 'WC-DRILL',     name: 'Drilling',                       sequence: 60 },
  { code: 'WC-TAP',       name: 'Round Bar Tapping',              sequence: 70 },
  { code: 'WC-HBEAM',     name: 'H-Beam Built-up Making',         sequence: 80 },
  { code: 'WC-FITUP',     name: 'Beam Fit-up',                    sequence: 90 },
  { code: 'WC-WELD-SMAW', name: 'Manual (Electrode) Welding',     sequence: 100 },
  { code: 'WC-WELD-MAG',  name: 'MAG/MIG Welding',                sequence: 110 },
  { code: 'WC-GRIND',     name: 'Grinding',                       sequence: 120 },
]

// ─────────────────────────────────────────────────────────────────
// 4. Activity Templates
// Each activity uses op_code as its unique ACT-XXX identifier
// per_minute × formula_param_value = time_in_minutes (placeholder — confirm with shop)
// ─────────────────────────────────────────────────────────────────

type ActivitySeed = {
  op_code: string       // unique ACT-XXX identifier stored in op_code field
  description: string
  wc_code: string       // workcenter code (resolved to id at runtime)
  formula_param_code: string
  per_minute: number
  std_measure: number
  unit: string
}

const ACTIVITIES: ActivitySeed[] = [
  // ── Cut (WC-CUT-CNC) ──────────────────────────────────────────
  { op_code: 'ACT-CUT-SETUP',   description: 'setup & load',        wc_code: 'WC-CUT-CNC',  formula_param_code: 'per_piece',      per_minute: 8,      std_measure: 1,      unit: 'pc'  },
  { op_code: 'ACT-CUT-CUT',     description: 'cut',                 wc_code: 'WC-CUT-CNC',  formula_param_code: 'cut_length_mm',  per_minute: 0.0005, std_measure: 1000,   unit: 'mm'  },
  { op_code: 'ACT-CUT-DEBURR',  description: 'deburr',              wc_code: 'WC-CUT-CNC',  formula_param_code: 'cut_length_mm',  per_minute: 0.002,  std_measure: 500,    unit: 'mm'  },
  { op_code: 'ACT-CUT-BEVEL',   description: 'bevel edge prep',     wc_code: 'WC-CUT-CNC',  formula_param_code: 'bevel_length_mm',per_minute: 0.001,  std_measure: 1000,   unit: 'mm'  },
  // ── Saw cut (WC-CUT-SAW) ─────────────────────────────────────
  { op_code: 'ACT-SAW-CUT',     description: 'saw cut',             wc_code: 'WC-CUT-SAW',  formula_param_code: 'cut_count',      per_minute: 3,      std_measure: 1,      unit: 'ea'  },
  // ── Form — Press (WC-PRESS) ───────────────────────────────────
  { op_code: 'ACT-BEND-SETUP',  description: 'setup die',           wc_code: 'WC-PRESS',    formula_param_code: 'per_piece',      per_minute: 6,      std_measure: 1,      unit: 'pc'  },
  { op_code: 'ACT-BEND-STROKE', description: 'bend stroke',         wc_code: 'WC-PRESS',    formula_param_code: 'bend_count',     per_minute: 0.5,    std_measure: 1,      unit: 'ea'  },
  // ── Form — Punch (WC-PUNCH) ───────────────────────────────────
  { op_code: 'ACT-PUNCH-HOLE',  description: 'punch hole',          wc_code: 'WC-PUNCH',    formula_param_code: 'hole_count',     per_minute: 0.2,    std_measure: 1,      unit: 'ea'  },
  // ── Form — Drill (WC-DRILL) ───────────────────────────────────
  { op_code: 'ACT-DRILL-SETUP', description: 'setup',               wc_code: 'WC-DRILL',    formula_param_code: 'per_piece',      per_minute: 4,      std_measure: 1,      unit: 'pc'  },
  { op_code: 'ACT-DRILL-HOLE',  description: 'drill hole',          wc_code: 'WC-DRILL',    formula_param_code: 'hole_count',     per_minute: 0.8,    std_measure: 1,      unit: 'ea'  },
  // ── Form — Tap (WC-TAP) ───────────────────────────────────────
  { op_code: 'ACT-TAP-THREAD',  description: 'tap thread',          wc_code: 'WC-TAP',      formula_param_code: 'hole_count',     per_minute: 0.5,    std_measure: 1,      unit: 'ea'  },
  // ── Beam (WC-HBEAM) ──────────────────────────────────────────
  { op_code: 'ACT-HBEAM-ASSEMBLE',   description: 'assemble web+flange',    wc_code: 'WC-HBEAM', formula_param_code: 'per_piece',      per_minute: 12,     std_measure: 1,      unit: 'pc'  },
  { op_code: 'ACT-HBEAM-WELD',       description: 'auto weld seam (SAW)',   wc_code: 'WC-HBEAM', formula_param_code: 'weld_length_mm', per_minute: 0.002,  std_measure: 24000,  unit: 'mm'  },
  { op_code: 'ACT-HBEAM-STRAIGHTEN', description: 'flange straighten',      wc_code: 'WC-HBEAM', formula_param_code: 'per_piece',      per_minute: 8,      std_measure: 1,      unit: 'pc'  },
  // ── Assembly (WC-FITUP) ───────────────────────────────────────
  { op_code: 'ACT-FIT-LAYOUT', description: 'layout / mark',        wc_code: 'WC-FITUP',    formula_param_code: 'per_piece',      per_minute: 5,      std_measure: 1,      unit: 'pc'  },
  { op_code: 'ACT-FIT-TACK',   description: 'tack',                 wc_code: 'WC-FITUP',    formula_param_code: 'tack_points',    per_minute: 1,      std_measure: 4,      unit: 'ea'  },
  // ── Weld (WC-WELD-MAG) ────────────────────────────────────────
  { op_code: 'ACT-WELD-TACK',  description: 'tack',                 wc_code: 'WC-WELD-MAG', formula_param_code: 'tack_points',    per_minute: 1,      std_measure: 4,      unit: 'ea'  },
  { op_code: 'ACT-WELD-ROOT',  description: 'root pass',            wc_code: 'WC-WELD-MAG', formula_param_code: 'weld_metal_kg',  per_minute: 30,     std_measure: 0.1,    unit: 'kg'  },
  { op_code: 'ACT-WELD-FILL',  description: 'fill pass',            wc_code: 'WC-WELD-MAG', formula_param_code: 'weld_metal_kg',  per_minute: 20,     std_measure: 0.2,    unit: 'kg'  },
  { op_code: 'ACT-WELD-CAP',   description: 'cap pass',             wc_code: 'WC-WELD-MAG', formula_param_code: 'weld_metal_kg',  per_minute: 15,     std_measure: 0.1,    unit: 'kg'  },
  // ── Finish (WC-GRIND) ─────────────────────────────────────────
  { op_code: 'ACT-GRIND-WELD', description: 'grind weld',           wc_code: 'WC-GRIND',    formula_param_code: 'weld_length_mm', per_minute: 0.01,   std_measure: 500,    unit: 'mm'  },
  { op_code: 'ACT-GRIND-EDGE', description: 'grind edge',           wc_code: 'WC-GRIND',    formula_param_code: 'edge_length_mm', per_minute: 0.005,  std_measure: 1000,   unit: 'mm'  },
  // ── QC (WC-FITUP placeholder — QC station TBD) ───────────────
  { op_code: 'ACT-QC-VISUAL',  description: 'visual inspect',       wc_code: 'WC-FITUP',    formula_param_code: 'weld_length_mm', per_minute: 0.003,  std_measure: 1000,   unit: 'mm'  },
  { op_code: 'ACT-QC-MEASURE', description: 'dimension check',      wc_code: 'WC-FITUP',    formula_param_code: 'per_piece',      per_minute: 4,      std_measure: 1,      unit: 'pc'  },
  { op_code: 'ACT-QC-UT',      description: 'UT test',              wc_code: 'WC-FITUP',    formula_param_code: 'weld_length_mm', per_minute: 0.02,   std_measure: 500,    unit: 'mm'  },
]

// ─────────────────────────────────────────────────────────────────
// 5. Operation Templates (13 standard ops)
// op_type_key resolves to mrp_op_type.id at runtime
// ─────────────────────────────────────────────────────────────────

type OpSeed = {
  op_code: string
  name: string
  op_type_key: string
  wc_code: string | null  // null = WC TBD (e.g. QC)
  method: string | null
  activity_codes: string[]
}

const OPERATIONS: OpSeed[] = [
  {
    op_code: 'OP-CUT-PLATE',
    name: 'Cut plate to profile',
    op_type_key: 'cut',
    wc_code: 'WC-CUT-CNC',
    method: 'cut_method',
    activity_codes: ['ACT-CUT-SETUP', 'ACT-CUT-CUT', 'ACT-CUT-DEBURR'],
  },
  {
    op_code: 'OP-CUT-PIPE',
    name: 'Cut pipe',
    op_type_key: 'cut',
    wc_code: 'WC-CUT-PIPE',
    method: 'cut_method',
    activity_codes: ['ACT-CUT-SETUP', 'ACT-CUT-CUT', 'ACT-CUT-DEBURR'],
  },
  {
    op_code: 'OP-CUT-SECTION',
    name: 'Cut section to length',
    op_type_key: 'cut',
    wc_code: 'WC-CUT-SAW',
    method: null,
    activity_codes: ['ACT-CUT-SETUP', 'ACT-SAW-CUT'],
  },
  {
    op_code: 'OP-BEND',
    name: 'Bend / press form',
    op_type_key: 'form',
    wc_code: 'WC-PRESS',
    method: null,
    activity_codes: ['ACT-BEND-SETUP', 'ACT-BEND-STROKE'],
  },
  {
    op_code: 'OP-PUNCH',
    name: 'Punch holes',
    op_type_key: 'form',
    wc_code: 'WC-PUNCH',
    method: null,
    activity_codes: ['ACT-BEND-SETUP', 'ACT-PUNCH-HOLE'],
  },
  {
    op_code: 'OP-DRILL',
    name: 'Drill holes',
    op_type_key: 'form',
    wc_code: 'WC-DRILL',
    method: null,
    activity_codes: ['ACT-DRILL-SETUP', 'ACT-DRILL-HOLE'],
  },
  {
    op_code: 'OP-TAP',
    name: 'Tap thread',
    op_type_key: 'form',
    wc_code: 'WC-TAP',
    method: null,
    activity_codes: ['ACT-DRILL-SETUP', 'ACT-TAP-THREAD'],
  },
  {
    op_code: 'OP-HBEAM-BUILD',
    name: 'Build-up H-beam',
    op_type_key: 'beam',
    wc_code: 'WC-HBEAM',
    method: null,
    activity_codes: ['ACT-HBEAM-ASSEMBLE', 'ACT-HBEAM-WELD', 'ACT-HBEAM-STRAIGHTEN'],
  },
  {
    op_code: 'OP-FITUP',
    name: 'Fit-up members',
    op_type_key: 'fitup',
    wc_code: 'WC-FITUP',
    method: null,
    activity_codes: ['ACT-FIT-LAYOUT', 'ACT-FIT-TACK'],
  },
  {
    op_code: 'OP-WELD-MAIN',
    name: 'Weld main joints',
    op_type_key: 'weld',
    wc_code: 'WC-WELD-MAG',
    method: 'weld_process',
    activity_codes: ['ACT-WELD-TACK', 'ACT-WELD-ROOT', 'ACT-WELD-FILL', 'ACT-WELD-CAP'],
  },
  {
    op_code: 'OP-WELD-TOUCH',
    name: 'Touch-up weld',
    op_type_key: 'weld',
    wc_code: 'WC-WELD-SMAW',
    method: 'weld_process',
    activity_codes: ['ACT-WELD-ROOT'],
  },
  {
    op_code: 'OP-GRIND',
    name: 'Grind welds / edges',
    op_type_key: 'grind',
    wc_code: 'WC-GRIND',
    method: null,
    activity_codes: ['ACT-GRIND-WELD', 'ACT-GRIND-EDGE'],
  },
  {
    op_code: 'OP-QC-VISUAL',
    name: 'Visual inspection',
    op_type_key: 'inspect',
    wc_code: null,
    method: 'test_method',
    activity_codes: ['ACT-QC-VISUAL', 'ACT-QC-MEASURE'],
  },
]

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Factory 1 seed — Sprint 11 Phase 4\n')

  // ── 1. Op types ───────────────────────────────────────────────
  for (const ot of NEW_OP_TYPES) {
    await prisma.mrp_op_type.upsert({
      where: { key: ot.key },
      create: ot,
      update: {},
    })
  }
  const opTypeRows = await prisma.mrp_op_type.findMany({ select: { id: true, key: true } })
  const opTypeMap = Object.fromEntries(opTypeRows.map(r => [r.key, r.id]))
  console.log(`✓ Op types: ${opTypeRows.length} total (${NEW_OP_TYPES.length} upserted)`)

  // ── 2. Formula params ─────────────────────────────────────────
  let paramCount = 0
  for (const fp of FORMULA_PARAMS) {
    await prisma.routing_formula_param.upsert({
      where: { code: fp.code },
      create: fp,
      update: {},
    })
    paramCount++
  }
  console.log(`✓ Formula params: ${paramCount} upserted`)

  // ── 3. Workcenters ────────────────────────────────────────────
  let wcCreated = 0
  for (const wc of WORKCENTERS) {
    const existing = await prisma.mrp_workcenter.findUnique({ where: { code: wc.code } })
    if (!existing) {
      await prisma.mrp_workcenter.create({
        data: {
          ...wc,
          create_uid: ADMIN_UID,
          write_uid: ADMIN_UID,
        },
      })
      wcCreated++
    }
  }
  const wcRows = await prisma.mrp_workcenter.findMany({ select: { id: true, code: true } })
  const wcMap = Object.fromEntries(wcRows.map(r => [r.code, r.id]))
  console.log(`✓ Workcenters: ${wcCreated} created, ${wcRows.length} total`)

  // ── 4. Activity templates ─────────────────────────────────────
  let actCreated = 0
  const actMap: Record<string, number> = {}

  for (const act of ACTIVITIES) {
    const existing = await prisma.routing_activity_template.findFirst({
      where: { op_code: act.op_code },
    })
    if (existing) {
      actMap[act.op_code] = existing.id
    } else {
      const wc_id = wcMap[act.wc_code]
      if (!wc_id) {
        console.warn(`  ⚠ WC not found: ${act.wc_code} (skip ${act.op_code})`)
        continue
      }
      const created = await prisma.routing_activity_template.create({
        data: {
          op_code: act.op_code,
          description: act.description,
          formula_param_code: act.formula_param_code,
          per_minute: act.per_minute,
          std_measure: act.std_measure,
          unit: act.unit,
          workcenter_id: wc_id,
          create_uid: ADMIN_UID,
          write_uid: ADMIN_UID,
          source: 'factory1_seed',
        },
      })
      actMap[act.op_code] = created.id
      actCreated++
    }
  }
  console.log(`✓ Activity templates: ${actCreated} created, ${Object.keys(actMap).length} total mapped`)

  // ── 5. Operation templates + snapshot activities ──────────────
  let opCreated = 0
  let opSkipped = 0

  for (const op of OPERATIONS) {
    const wc_id = op.wc_code ? wcMap[op.wc_code] : null
    const op_type_id = opTypeMap[op.op_type_key] ?? null

    const opTpl = await prisma.operation_template.upsert({
      where: { op_code: op.op_code },
      create: {
        op_code: op.op_code,
        name: op.name,
        op_type_id,
        workcenter_id: wc_id,
        method: op.method,
        time_mode: 'by_activities',
        status: 'active',
        create_uid: ADMIN_UID,
        write_uid: ADMIN_UID,
      },
      update: {},
    })

    // Create snapshot activities only if none exist yet (idempotent)
    const existingActCount = await prisma.operation_template_activity.count({
      where: { operation_template_id: opTpl.id },
    })

    if (existingActCount === 0) {
      for (let i = 0; i < op.activity_codes.length; i++) {
        const actCode = op.activity_codes[i]
        const srcId = actMap[actCode]
        if (!srcId) {
          console.warn(`  ⚠ Activity not found: ${actCode} (skip in ${op.op_code})`)
          continue
        }

        const srcAct = ACTIVITIES.find(a => a.op_code === actCode)!
        await prisma.operation_template_activity.create({
          data: {
            operation_template_id: opTpl.id,
            sequence: (i + 1) * 10,
            name: srcAct.description,
            measure: srcAct.formula_param_code,
            unit: srcAct.unit,
            per_minute: srcAct.per_minute,
            source_activity_template_id: srcId,
          },
        })
      }
      opCreated++
    } else {
      opSkipped++
    }
  }

  console.log(`✓ Operation templates: ${opCreated} created with activities, ${opSkipped} already existed`)

  // ── Summary ───────────────────────────────────────────────────
  const [totalWc, totalAct, totalOp] = await Promise.all([
    prisma.mrp_workcenter.count(),
    prisma.routing_activity_template.count(),
    prisma.operation_template.count(),
  ])
  console.log(`\n✅ Seed complete`)
  console.log(`   Workcenters: ${totalWc} | Activity templates: ${totalAct} | Operation templates: ${totalOp}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
