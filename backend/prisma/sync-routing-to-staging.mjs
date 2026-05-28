/**
 * Sync routing data from local dev → Supabase staging
 * Tables: routing_activity_template, routing_template,
 *         mrp_routing_workcenter, routing_op_activity,
 *         routing_op_act_tool, routing_op_act_consumable
 *
 * Run: node prisma/sync-routing-to-staging.mjs
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PrismaClient } = require('../node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client')

const DEV_URL     = 'postgresql://postgres:BdtDev2026%21@127.0.0.1:5432/bdt_dev?schema=public'
const STAGING_URL = 'postgresql://postgres.eebubyfkzeqhzwzqrqfz:BdtDev2026!@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require'

const dev     = new PrismaClient({ datasources: { db: { url: DEV_URL } } })
const staging = new PrismaClient({ datasources: { db: { url: STAGING_URL } } })

async function main() {
  console.log('=== Sync routing data: dev → staging ===\n')

  // ── 1. Read from dev ──────────────────────────────────────────
  console.log('1. Reading dev data…')

  const formulaParams  = await dev.routing_formula_param.findMany({ orderBy: { code: 'asc' } })
  const workcenters    = await dev.mrp_workcenter.findMany({ orderBy: { id: 'asc' } })
  const opTypes        = await dev.mrp_op_type.findMany({ orderBy: { id: 'asc' } })
  const equipment      = await dev.equipment_resource.findMany({ orderBy: { id: 'asc' } })
  const actTemplates   = await dev.routing_activity_template.findMany({ orderBy: { id: 'asc' } })
  const templates    = await dev.routing_template.findMany({ orderBy: { id: 'asc' } })
  const ops          = await dev.mrp_routing_workcenter.findMany({ orderBy: { id: 'asc' } })
  const opActs       = await dev.routing_op_activity.findMany({ orderBy: { id: 'asc' } })
  const opTools      = await dev.routing_op_act_tool.findMany({ orderBy: { id: 'asc' } })
  const opCons       = await dev.routing_op_act_consumable.findMany({ orderBy: { id: 'asc' } })

  console.log(`   routing_formula_param     : ${formulaParams.length}`)
  console.log(`   mrp_workcenter            : ${workcenters.length}`)
  console.log(`   mrp_op_type               : ${opTypes.length}`)
  console.log(`   equipment_resource        : ${equipment.length}`)
  console.log(`   routing_activity_template : ${actTemplates.length}`)
  console.log(`   routing_template          : ${templates.length}`)
  console.log(`   mrp_routing_workcenter    : ${ops.length}`)
  console.log(`   routing_op_activity       : ${opActs.length}`)
  console.log(`   routing_op_act_tool       : ${opTools.length}`)
  console.log(`   routing_op_act_consumable : ${opCons.length}\n`)

  // ── 2. Clear staging (reverse FK order) ──────────────────────
  console.log('2. Clearing staging routing tables…')

  await staging.routing_op_act_consumable.deleteMany({})
  await staging.routing_op_act_tool.deleteMany({})
  await staging.routing_op_activity.deleteMany({})
  await staging.mrp_routing_workcenter.deleteMany({})
  await staging.routing_template_binding_rule.deleteMany({})
  await staging.routing_template_history.deleteMany({})
  await staging.routing_template_test_fixture.deleteMany({})
  await staging.products.updateMany({
    where: { routing_template_id: { not: null } },
    data: { routing_template_id: null },
  })
  await staging.custom_routing.updateMany({
    where: { cloned_from_template_id: { not: null } },
    data: { cloned_from_template_id: null },
  })
  await staging.routing_template.deleteMany({})
  await staging.routing_activity_template.deleteMany({})

  console.log('   ✓ Cleared\n')

  // ── 3. Reset sequences so IDs match dev ──────────────────────
  console.log('3. Resetting sequences…')
  const seqTables = [
    ['routing_activity_template_id_seq', actTemplates.at(-1)?.id ?? 0],
    ['routing_template_id_seq',          templates.at(-1)?.id ?? 0],
    ['mrp_routing_workcenter_id_seq',    ops.at(-1)?.id ?? 0],
    ['routing_op_activity_id_seq',       opActs.at(-1)?.id ?? 0],
    ['routing_op_act_tool_id_seq',       opTools.at(-1)?.id ?? 0],
    ['routing_op_act_consumable_id_seq', opCons.at(-1)?.id ?? 0],
  ]
  for (const [seq, val] of seqTables) {
    await staging.$executeRawUnsafe(`SELECT setval('"${seq}"', ${Math.max(val, 1)})`)
  }
  console.log('   ✓ Sequences reset\n')

  // ── 4. Insert in FK order ─────────────────────────────────────
  console.log('4. Inserting data…')

  // master tables — upsert only (shared with other features, don't delete)
  for (const r of formulaParams) {
    await staging.routing_formula_param.upsert({ where: { code: r.code }, update: r, create: r })
  }
  console.log(`   ✓ routing_formula_param: ${formulaParams.length} rows (upserted)`)

  // workcenter first (op_type depends on it via default_wc_id)
  for (const r of workcenters) {
    const { zone: _, workcenter_group: __, op_types: ___, activities: ____, operations: _____, resource_requirements: ______, ...data } = r
    await staging.mrp_workcenter.upsert({ where: { id: r.id }, update: data, create: data })
  }
  console.log(`   ✓ mrp_workcenter: ${workcenters.length} rows (upserted)`)

  for (const r of opTypes) {
    const { mrp_op_type_mrp_workcenter: _, op_templates: __, operations: ___, ...data } = r
    await staging.mrp_op_type.upsert({ where: { id: r.id }, update: data, create: data })
  }
  console.log(`   ✓ mrp_op_type: ${opTypes.length} rows (upserted)`)

  for (const r of equipment) {
    const { workcenter: _, activity_templates: __, routing_operations: ___, custom_activities: ____, op_act_tools: _____, op_act_consumables: ______, ...data } = r
    await staging.equipment_resource.upsert({ where: { id: r.id }, update: data, create: data })
  }
  console.log(`   ✓ equipment_resource: ${equipment.length} rows (upserted)`)

  // routing_activity_template
  for (const r of actTemplates) {
    await staging.routing_activity_template.create({ data: r })
  }
  console.log(`   ✓ routing_activity_template: ${actTemplates.length} rows`)

  // routing_template (canvas_edges is Json — pass as-is)
  for (const r of templates) {
    await staging.routing_template.create({ data: r })
  }
  console.log(`   ✓ routing_template: ${templates.length} rows`)

  // mrp_routing_workcenter
  for (const r of ops) {
    await staging.mrp_routing_workcenter.create({ data: r })
  }
  console.log(`   ✓ mrp_routing_workcenter: ${ops.length} rows`)

  // routing_op_activity
  for (const r of opActs) {
    await staging.routing_op_activity.create({ data: r })
  }
  console.log(`   ✓ routing_op_activity: ${opActs.length} rows`)

  // routing_op_act_tool
  for (const r of opTools) {
    await staging.routing_op_act_tool.create({ data: r })
  }
  console.log(`   ✓ routing_op_act_tool: ${opTools.length} rows`)

  // routing_op_act_consumable
  for (const r of opCons) {
    await staging.routing_op_act_consumable.create({ data: r })
  }
  console.log(`   ✓ routing_op_act_consumable: ${opCons.length} rows`)

  console.log('\n=== Done — staging routing data matches dev ===')
}

main()
  .catch(e => { console.error(e.message); process.exit(1) })
  .finally(async () => { await dev.$disconnect(); await staging.$disconnect() })
