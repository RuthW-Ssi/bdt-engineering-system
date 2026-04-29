/**
 * Sprint 4 — xlsx seed importer
 * Populates: mrp_workcenter, routing_formula_param, routing_activity_template
 * Source files: document/process routing.xlsx
 * Run: npx ts-node prisma/import-routing-xlsx.ts
 * Idempotent: uses upsert throughout.
 */
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as path from 'path'

const prisma = new PrismaClient()

const ROUTING_XLSX = path.resolve(__dirname, '../../document/process routing.xlsx')
const ADMIN_UID = 1

// ── Work center seed (4 canonical WCs) ────────────────────────────────────────
const WORK_CENTERS = [
  { code: 'WC-BU', name: 'Built Up',         sequence: 10, xlsxWcCodes: ['buildup'] },
  { code: 'WC-AS', name: 'Assembly',          sequence: 20, xlsxWcCodes: ['fit & weld'] },
  { code: 'WC-PT', name: 'Painting',          sequence: 30, xlsxWcCodes: ['painting'] },
  { code: 'WC-PR', name: 'Prepare Material',  sequence: 40, xlsxWcCodes: ['prepare'] },
]

// Maps xlsx operation codes to BDT work center codes
const OP_TO_WC: Record<string, string> = {
  buildup_fit:      'WC-BU',
  buildup_welding:  'WC-BU',
  fitup:            'WC-AS',
  welding:          'WC-AS',
  painting:         'WC-PT',
}

async function importWorkCenters() {
  console.log('Importing work centers...')
  for (const wc of WORK_CENTERS) {
    await prisma.mrp_workcenter.upsert({
      where: { code: wc.code },
      update: { name: wc.name, sequence: wc.sequence, write_uid: ADMIN_UID },
      create: {
        code: wc.code,
        name: wc.name,
        sequence: wc.sequence,
        oee_target: 90,
        create_uid: ADMIN_UID,
        write_uid: ADMIN_UID,
      },
    })
  }
  console.log(`  ✓ ${WORK_CENTERS.length} work centers`)
}

async function importFormulaParams(wb: XLSX.WorkBook) {
  console.log('Importing formula parameters...')
  const sheet = wb.Sheets['parameter']
  const rows = XLSX.utils.sheet_to_json<{ parameter: string; formula: string }>(sheet, { defval: null })

  const validRows = rows.filter(
    r => r.parameter && r.formula && !['manaul cal', 'FIX number', 'manual cal', 'manaul_cal'].includes(r.formula),
  )

  let count = 0
  for (const row of validRows) {
    // Extract input variables: words that look like camelCase identifiers
    const inputs = extractInputVars(row.formula)

    await prisma.routing_formula_param.upsert({
      where: { code: row.parameter },
      update: {
        formula_expression: row.formula,
        inputs_required: inputs,
        write_date: new Date(),
      },
      create: {
        code: row.parameter,
        description: row.parameter.replace(/_/g, ' '),
        formula_expression: row.formula,
        inputs_required: inputs,
        return_unit: 'unit',
        applies_to_groups: [],
      },
    })
    count++
  }

  // Ensure "per unit" fixed param exists (used as constant = 1)
  await prisma.routing_formula_param.upsert({
    where: { code: 'per unit' },
    update: {},
    create: {
      code: 'per unit',
      description: 'Per unit constant (fixed qty = 1)',
      formula_expression: '1',
      inputs_required: [],
      return_unit: 'unit',
      applies_to_groups: [],
    },
  })

  // Manual-calc params with placeholder formula
  const manualParams = ['buildup_weldingsize', 'product_welding_length', 'section_perimeter']
  for (const code of manualParams) {
    await prisma.routing_formula_param.upsert({
      where: { code },
      update: {},
      create: {
        code,
        description: code.replace(/_/g, ' ') + ' (manual)',
        formula_expression: '1',
        inputs_required: [],
        return_unit: 'unit',
        applies_to_groups: [],
      },
    })
  }

  console.log(`  ✓ ${count} formula params (+ manual placeholders)`)
}

function extractInputVars(formula: string): string[] {
  // Match word tokens that are not purely numeric and not operators
  const tokens = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? []
  const builtins = new Set(['ceil', 'floor', 'round', 'abs', 'min', 'max', 'FIX'])
  return [...new Set(tokens.filter(t => !builtins.has(t)))]
}

async function importActivityTemplates(wb: XLSX.WorkBook) {
  console.log('Importing activity templates...')
  const sheet = wb.Sheets['activites']
  const rows = XLSX.utils.sheet_to_json<{
    operation: string
    description: string
    per_minute: number
    ratio: string
    unit: string
    std_measure: number
    manpower: number
  }>(sheet, { defval: null })

  // Filter valid rows (skip header duplicates and empty rows)
  const validRows = rows.filter(
    r =>
      r.operation &&
      r.operation !== 'operation' &&
      r.per_minute &&
      typeof r.per_minute === 'number',
  )

  // Build a set of known formula param codes
  const knownParams = new Set(
    (await prisma.routing_formula_param.findMany({ select: { code: true } })).map(p => p.code),
  )

  const wcMap = Object.fromEntries(
    (await prisma.mrp_workcenter.findMany({ select: { code: true, id: true } })).map(w => [w.code, w.id]),
  )

  // ── IDEMPOTENCY ────────────────────────────────────────────
  // routing_activity_template ไม่มี natural unique key (op_code+sequence)
  // ฉะนั้น clear ก่อน re-import — แต่ต้องเช็ค FK dependencies จาก
  // routing_op_activity และ product_routing_override (ไม่มี ON DELETE CASCADE)
  const existing = await prisma.routing_activity_template.count()
  if (existing > 0) {
    const opActivityRefs = await prisma.routing_op_activity.count()
    const overrideRefs = await prisma.product_routing_override.count()

    if (opActivityRefs > 0 || overrideRefs > 0) {
      console.error(
        `\n✗ Cannot re-import: ${existing} templates still referenced by ` +
          `${opActivityRefs} routing_op_activity + ${overrideRefs} product_routing_override.\n` +
          `  ทำอย่างใดอย่างหนึ่ง:\n` +
          `   1. ลบ dependent records ก่อน:\n` +
          `      psql -c "TRUNCATE routing_op_activity, product_routing_override CASCADE;"\n` +
          `   2. ใช้ TRUNCATE CASCADE (ระวัง! ลบ Sprint 4.2 routing data ทั้งหมด):\n` +
          `      psql -c "TRUNCATE routing_activity_template CASCADE;"\n`,
      )
      process.exit(1)
    }

    console.log(`  ⚠ Existing ${existing} templates found — clearing for re-import`)
    await prisma.routing_activity_template.deleteMany()
  }

  let count = 0
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i]
    const wcCode = OP_TO_WC[row.operation] ?? 'WC-BU'
    const workcenter_id = wcMap[wcCode]

    // Ensure formula param exists; fallback to 'per unit'
    const paramCode = knownParams.has(row.ratio) ? row.ratio : 'per unit'

    await prisma.routing_activity_template.create({
      data: {
        op_code: row.operation,
        description: row.description ?? `Activity ${i + 1}`,
        sequence: (i + 1) * 10,
        per_minute: row.per_minute,
        formula_param_code: paramCode,
        std_measure: row.std_measure ?? 1,
        unit: row.unit ?? 'unit',
        manpower: row.manpower ?? 1,
        workcenter_id,
        create_uid: ADMIN_UID,
        write_uid: ADMIN_UID,
      },
    })
    count++
  }

  console.log(`  ✓ ${count} activity templates`)
}

async function main() {
  console.log('=== Sprint 4 xlsx importer ===')
  console.log(`Reading: ${ROUTING_XLSX}\n`)

  const wb = XLSX.readFile(ROUTING_XLSX)

  await importWorkCenters()
  await importFormulaParams(wb)
  await importActivityTemplates(wb)

  console.log('\n✓ Import complete')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
