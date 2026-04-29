/**
 * Sprint 4.2 — Routing seed (Option 3: Hybrid Template + Override + Custom)
 * Creates:
 *   1. 3 routing_template rows (Main / Accessory / False)
 *   2. mrp_routing_workcenter ops bound to Main template
 *   3. routing_op_activity junction rows
 *   4. 5 routing_template_binding_rule rows
 *   5. Binds CUS-00001 (WH-CO-1) to Main template
 * Idempotent: skips if routing_template 'Main' already exists.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ADMIN_UID = 1

const OP_TO_WC: Record<string, string> = {
  buildup_fit:     'WC-BU',
  buildup_welding: 'WC-BU',
  fitup:           'WC-AS',
  welding:         'WC-AS',
  painting:        'WC-PT',
}

const TEMPLATE_OPS = [
  { op_code: 'buildup_fit',     name: 'Built-up Fit',       sequence: 10 },
  { op_code: 'buildup_welding', name: 'Built-up Welding',    sequence: 20 },
  { op_code: 'fitup',           name: 'Fit-up Assembly',     sequence: 30 },
  { op_code: 'welding',         name: 'Welding',             sequence: 40 },
  { op_code: 'painting',        name: 'Painting & Blasting', sequence: 50 },
]

async function main() {
  // ── Idempotency check ───────────────────────────────────────
  const existing = await prisma.routing_template.findUnique({ where: { code: 'Main' } })
  if (existing) {
    console.log('routing_template Main already exists — skipping')
    return
  }

  // ── 1. Create 3 routing templates ──────────────────────────
  const [mainTpl, accessoryTpl, falseTpl] = await Promise.all([
    prisma.routing_template.create({
      data: {
        code: 'Main', name: 'Main Structural (Built-up Beam / Column)', state: 'active',
        applies_to_product_type: 'custom', create_uid: ADMIN_UID, write_uid: ADMIN_UID,
      },
    }),
    prisma.routing_template.create({
      data: {
        code: 'Accessory', name: 'Accessory Parts (Purlin / Girt / Anchor)', state: 'active',
        applies_to_product_type: 'custom', create_uid: ADMIN_UID, write_uid: ADMIN_UID,
      },
    }),
    prisma.routing_template.create({
      data: {
        code: 'False', name: 'False / Bought-out (No Routing)', state: 'active',
        applies_to_product_type: 'custom', create_uid: ADMIN_UID, write_uid: ADMIN_UID,
      },
    }),
  ])
  console.log(`✓ Templates created: ${mainTpl.code}, ${accessoryTpl.code}, ${falseTpl.code}`)

  // ── 2. Load WC map ─────────────────────────────────────────
  const wcs = await prisma.mrp_workcenter.findMany({ select: { id: true, code: true } })
  const wcMap = Object.fromEntries(wcs.map(w => [w.code, w.id]))

  // ── 3. Create ops + junction rows under Main template ──────
  const templates = await prisma.routing_activity_template.findMany({
    where: { active: true },
    orderBy: { sequence: 'asc' },
    select: { id: true, op_code: true },
  })
  const tplByOp: Record<string, number[]> = {}
  for (const t of templates) {
    if (!tplByOp[t.op_code]) tplByOp[t.op_code] = []
    tplByOp[t.op_code].push(t.id)
  }

  let totalJunctions = 0
  for (const op of TEMPLATE_OPS) {
    const workcenter_id = wcMap[OP_TO_WC[op.op_code]]
    if (!workcenter_id) { console.warn(`  WC not found for ${op.op_code}`); continue }

    const routingOp = await prisma.mrp_routing_workcenter.create({
      data: {
        template_id: mainTpl.id,
        op_code: op.op_code,
        name: op.name,
        sequence: op.sequence,
        workcenter_id,
        create_uid: ADMIN_UID,
        write_uid: ADMIN_UID,
      },
    })

    const actIds = tplByOp[op.op_code] ?? []
    for (let i = 0; i < actIds.length; i++) {
      await prisma.routing_op_activity.create({
        data: {
          routing_workcenter_id: routingOp.id,
          activity_template_id: actIds[i],
          sequence: (i + 1) * 10,
        },
      })
    }
    totalJunctions += actIds.length
    console.log(`  ✓ ${op.op_code} (${actIds.length} activities) → WC ${OP_TO_WC[op.op_code]}`)
  }

  // ── 4. Seed 5 binding rules ────────────────────────────────
  const rules = [
    { priority: 10,  description: 'WH- prefix → Main (Built-up Beam/Column)', match_mark_prefix: 'WH', routing_template_id: mainTpl.id },
    { priority: 20,  description: 'CO- prefix → Main (Column)',                match_mark_prefix: 'CO', routing_template_id: mainTpl.id },
    { priority: 30,  description: 'BR- prefix → Accessory (Purlin/Brace)',     match_mark_prefix: 'BR', routing_template_id: accessoryTpl.id },
    { priority: 40,  description: 'All standard products → False',             match_product_type: 'standard', routing_template_id: falseTpl.id },
    { priority: 100, description: 'Fallback: all custom → Main',               match_product_type: 'custom',   routing_template_id: mainTpl.id },
  ]
  for (const rule of rules) {
    await prisma.routing_template_binding_rule.create({ data: rule })
  }
  console.log(`✓ ${rules.length} binding rules created`)

  // ── 5. Bind CUS-00001 (WH-CO-1) to Main template ──────────
  const product = await prisma.products.findUnique({ where: { product_code: 'CUS-00001' } })
  if (product) {
    await prisma.products.update({
      where: { id: product.id },
      data: { routing_template_id: mainTpl.id },
    })
    console.log(`✓ ${product.product_code} bound to template 'Main'`)
  } else {
    console.log('CUS-00001 not found — run bom_seed.ts first to create it')
  }

  console.log(`\n✅ Routing seed complete`)
  console.log(`   ${TEMPLATE_OPS.length} template ops, ${totalJunctions} junction rows`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
