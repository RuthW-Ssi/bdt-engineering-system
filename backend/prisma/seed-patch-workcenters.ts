/**
 * Patch: create workcenters + routing ops for Main template.
 * Needed because import-routing-xlsx.ts requires a missing XLSX file,
 * and seed-routing.ts skips ops when workcenters are absent on first run.
 *
 * Run: DATABASE_URL="..." npx ts-node prisma/seed-patch-workcenters.ts
 * Idempotent: uses upsert for WCs, skips if Main ops already exist.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const ADMIN_UID = 1

const WORK_CENTERS = [
  { code: 'WC-BU', name: 'Built Up',          sequence: 10 },
  { code: 'WC-AS', name: 'Assembly',           sequence: 20 },
  { code: 'WC-PT', name: 'Painting',           sequence: 30 },
  { code: 'WC-PR', name: 'Prepare Material',   sequence: 40 },
]

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
  // ── 1. Upsert workcenters ────────────────────────────────────
  for (const wc of WORK_CENTERS) {
    await prisma.mrp_workcenter.upsert({
      where: { code: wc.code },
      update: { name: wc.name, sequence: wc.sequence },
      create: { code: wc.code, name: wc.name, sequence: wc.sequence, oee_target: 90, create_uid: ADMIN_UID, write_uid: ADMIN_UID },
    })
  }
  console.log(`✓ ${WORK_CENTERS.length} workcenters upserted`)

  // ── 2. Get Main template ─────────────────────────────────────
  const mainTpl = await prisma.routing_template.findUnique({ where: { code: 'Main' } })
  if (!mainTpl) { console.log('No Main template found — run seed-routing.ts first'); return }

  // ── 3. Skip if ops already exist ────────────────────────────
  const existingOps = await prisma.mrp_routing_workcenter.count({ where: { template_id: mainTpl.id } })
  if (existingOps > 0) {
    console.log(`Main template already has ${existingOps} ops — skipping`)
    return
  }

  // ── 4. Load WC map ───────────────────────────────────────────
  const wcs = await prisma.mrp_workcenter.findMany({ select: { id: true, code: true } })
  const wcMap = Object.fromEntries(wcs.map(w => [w.code, w.id]))

  // ── 5. Create routing ops ────────────────────────────────────
  for (const op of TEMPLATE_OPS) {
    const workcenter_id = wcMap[OP_TO_WC[op.op_code]]
    if (!workcenter_id) { console.warn(`  WC not found for ${op.op_code}`); continue }
    await prisma.mrp_routing_workcenter.create({
      data: { template_id: mainTpl.id, op_code: op.op_code, name: op.name, sequence: op.sequence, workcenter_id, create_uid: ADMIN_UID, write_uid: ADMIN_UID },
    })
    console.log(`  ✓ ${op.op_code} → ${OP_TO_WC[op.op_code]}`)
  }

  console.log('\n✅ Workcenter patch complete')
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
