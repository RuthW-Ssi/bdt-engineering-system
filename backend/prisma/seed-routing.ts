/**
 * Sprint 4 — Routing seed for CUS-00001 (COLUMN WH-CO-1)
 * Creates one set of draft routing operations using the imported activity templates.
 * Run: npx ts-node prisma/seed-routing.ts
 * Idempotent: skips if routing already exists.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ADMIN_UID = 1

// Op code → WC id mapping (matches import-routing-xlsx.ts)
const OP_TO_WC: Record<string, string> = {
  buildup_fit:     'WC-BU',
  buildup_welding: 'WC-BU',
  fitup:           'WC-AS',
  welding:         'WC-AS',
  painting:        'WC-PT',
}

const OPERATIONS = [
  { op_code: 'buildup_fit',     name: 'Built-up Fit',      sequence: 10 },
  { op_code: 'buildup_welding', name: 'Built-up Welding',   sequence: 20 },
  { op_code: 'fitup',           name: 'Fit-up Assembly',    sequence: 30 },
  { op_code: 'welding',         name: 'Welding',            sequence: 40 },
  { op_code: 'painting',        name: 'Painting & Blasting', sequence: 50 },
]

async function main() {
  const product = await prisma.products.findUnique({
    where: { product_code: 'CUS-00001' },
    select: { id: true, product_code: true, name: true },
  })
  if (!product) {
    console.log('CUS-00001 not found — run bom_seed.ts first')
    return
  }

  // Skip if already has routing ops
  const existing = await prisma.mrp_routing_workcenter.findFirst({
    where: { product_id: product.id },
  })
  if (existing) {
    console.log(`${product.product_code} already has routing — skipping`)
    return
  }

  // Load WC codes → ids
  const wcs = await prisma.mrp_workcenter.findMany({ select: { id: true, code: true } })
  const wcMap = Object.fromEntries(wcs.map(w => [w.code, w.id]))

  // Load activity templates grouped by op_code
  const templates = await prisma.routing_activity_template.findMany({
    where: { active: true },
    orderBy: { sequence: 'asc' },
    select: { id: true, op_code: true, sequence: true },
  })
  const tplByOp: Record<string, number[]> = {}
  for (const t of templates) {
    if (!tplByOp[t.op_code]) tplByOp[t.op_code] = []
    tplByOp[t.op_code].push(t.id)
  }

  let totalActivities = 0

  for (const op of OPERATIONS) {
    const wcCode = OP_TO_WC[op.op_code]
    const workcenter_id = wcMap[wcCode]
    if (!workcenter_id) {
      console.warn(`  WC not found for op_code=${op.op_code}`)
      continue
    }

    const routingOp = await prisma.mrp_routing_workcenter.create({
      data: {
        product_id: product.id,
        op_code: op.op_code,
        name: op.name,
        sequence: op.sequence,
        workcenter_id,
        state: 'draft',
        create_uid: ADMIN_UID,
        write_uid: ADMIN_UID,
      },
    })

    // Attach all activity templates for this op_code
    const actIds = tplByOp[op.op_code] ?? []
    for (let i = 0; i < actIds.length; i++) {
      await prisma.routing_step_activity.create({
        data: {
          routing_workcenter_id: routingOp.id,
          activity_template_id: actIds[i],
          sequence: (i + 1) * 10,
        },
      })
    }
    totalActivities += actIds.length
    console.log(`  ✓ ${op.op_code} (${actIds.length} activities) → WC ${wcCode}`)
  }

  console.log(`\nRouting seeded for ${product.product_code} ${product.name}`)
  console.log(`  ${OPERATIONS.length} operations, ${totalActivities} step-activities`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
