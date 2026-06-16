import { PrismaClient, Prisma, WoStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function nextWoCode(tx: Prisma.TransactionClient): Promise<string> {
  await tx.$executeRaw`INSERT INTO work_order_code_seq (id, next_val) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`
  const rows = await tx.$queryRaw<{ next_val: number }[]>`SELECT next_val FROM work_order_code_seq WHERE id = 1 FOR UPDATE`
  const n = rows[0].next_val
  await tx.$executeRaw`UPDATE work_order_code_seq SET next_val = ${n + 1} WHERE id = 1`
  return `WO-${String(n).padStart(8, '0')}`
}

const DAY = 86_400_000

async function main() {
  // Idempotency: this seed owns the SCEN-2026-06-ACTIVE version — its presence means we ran already.
  const seededAlready = await prisma.prod_schedule_version.findFirst({ where: { version_code: 'SCEN-2026-06-ACTIVE' } })
  if (seededAlready) {
    console.log('⏭  SCEN-2026-06-ACTIVE already exists — skipping WO seed.')
    return
  }

  const admin = await prisma.res_users.findUnique({ where: { login: 'admin' } })
  if (!admin) throw new Error('admin user not found — run the base seed first')

  // Target a CONFIRMED+ MO (WOs only exist post-confirm) — leaves DRAFT MOs WO-free
  // for the "WOs will be created on confirm" empty-state demo.
  const mo = await prisma.manufacturing_order.findFirst({
    where: {
      status: { in: ['CONFIRMED', 'IN_PROGRESS', 'DONE'] },
      operations: { some: {} },
      assembly_lines: { some: {} },
    },
    orderBy: { id: 'asc' },
    include: {
      operations: { orderBy: { sequence: 'asc' } },
      assembly_lines: { include: { bom_assembly: { select: { id: true, dispatch_id: true } } }, orderBy: { line_seq: 'asc' } },
    },
  })
  if (!mo) throw new Error('no MO with operations + assembly_lines found — run seed-mo first')

  // Latest dispatch per (project,zone,sub_zone) group → to deliberately pick an OUTDATED snapshot.
  const dispatches = await prisma.bom_dispatch.findMany({
    select: { id: true, project_id: true, zone_id: true, sub_zone_id: true, uploaded_at: true },
    orderBy: [{ uploaded_at: 'asc' }, { id: 'asc' }],
  })
  const groupKey = (d: { project_id: number; zone_id: number; sub_zone_id: number | null }) =>
    `${d.project_id}/${d.zone_id}/${d.sub_zone_id ?? 'null'}`
  const latestPerGroup = new Map<string, number>()
  for (const d of dispatches) latestPerGroup.set(groupKey(d), d.id)

  // Any dispatch that is NOT the latest in its group → snapshotting it = outdated.
  const outdatedDispatchIds = dispatches.filter((d) => latestPerGroup.get(groupKey(d)) !== d.id).map((d) => d.id)
  // An assembly living in such a dispatch drives the BOM Version Alert demo WO.
  const outdatedAsm = outdatedDispatchIds.length
    ? await prisma.bom_assembly.findFirst({ where: { dispatch_id: { in: outdatedDispatchIds } }, select: { id: true, dispatch_id: true } })
    : null

  // op × assembly combos to draw from
  const combos: { op: (typeof mo.operations)[number]; bomAssemblyId: number; dispatchId: number }[] = []
  for (const line of mo.assembly_lines) {
    for (const op of mo.operations) {
      combos.push({ op, bomAssemblyId: line.bom_assembly.id, dispatchId: line.bom_assembly.dispatch_id })
    }
  }
  if (combos.length < 8) throw new Error(`need ≥8 op×assembly combos, got ${combos.length}`)

  // 8 WOs across all 6 statuses (T-WO.12 plan); `outdated` marks the BOM-alert demo row.
  const plan: { status: WoStatus; outdated?: boolean }[] = [
    { status: 'NOT_STARTED', outdated: true }, // BOM Version Alert demo
    { status: 'NOT_STARTED' },
    { status: 'RELEASED' },
    { status: 'IN_PROGRESS' },
    { status: 'IN_PROGRESS' },
    { status: 'PAUSED' },
    { status: 'DONE' },
    { status: 'CANCELLED' },
  ]

  const now = Date.now()
  let madeOutdated = false
  let i = 0

  for (const spec of plan) {
    const c = combos[i % combos.length]
    let bomAssemblyId = c.bomAssemblyId
    let snapshotDispatch = c.dispatchId
    if (spec.outdated && outdatedAsm) {
      bomAssemblyId = outdatedAsm.id
      snapshotDispatch = outdatedAsm.dispatch_id
      madeOutdated = true
    }

    await prisma.$transaction(async (tx) => {
      const wo_code = await nextWoCode(tx)
      const released = spec.status !== 'NOT_STARTED'
      const startedStatuses: WoStatus[] = ['IN_PROGRESS', 'PAUSED', 'DONE']
      const started = startedStatuses.includes(spec.status)
      const done = spec.status === 'DONE'

      await tx.work_order.create({
        data: {
          wo_code,
          mo_id: mo.id,
          mo_operation_id: c.op.id,
          sequence: c.op.sequence,
          work_center_id: c.op.work_center_id,
          expected_duration_min: c.op.expected_duration_min,
          setup_time_min: c.op.setup_time_min,
          op_attributes: c.op.op_attributes as Prisma.InputJsonValue,
          bom_assembly_id: bomAssemblyId,
          bom_dispatch_id_snapshot: snapshotDispatch,
          status: spec.status,
          earliest_start_at: new Date(now + (i - 2) * DAY),
          target_end_at: new Date(now + (i + 3) * DAY),
          released_at: released ? new Date(now - 2 * DAY) : null,
          released_by: released ? 'admin' : null,
          actual_start_at: started ? new Date(now - 1 * DAY) : null,
          actual_end_at: done ? new Date(now - 2 * 3600_000) : null,
          qty_done: done ? new Prisma.Decimal(10) : null,
          qty_scrapped: done ? new Prisma.Decimal(1) : null,
          assigned_to: started ? 'Somchai' : null,
          created_by: 'admin',
        },
      })
      const woRow = await tx.work_order.findUnique({ where: { wo_code }, select: { id: true } })
      const wid = woRow!.id

      // event chains
      const ev = (event_type: 'START' | 'PAUSE' | 'RESUME' | 'DONE' | 'CANCEL', notes?: string, ageMs = 0) =>
        tx.work_order_event.create({ data: { work_order_id: wid, event_type, notes: notes ?? null, recorded_by: 'admin', recorded_at: new Date(now - ageMs) } })
      if (started) await ev('START', undefined, 1 * DAY)
      if (spec.status === 'PAUSED') await ev('PAUSE', 'Seed: material shortage', 12 * 3600_000)
      if (done) await ev('DONE', undefined, 2 * 3600_000)
      if (spec.status === 'CANCELLED') await ev('CANCEL', 'Seed: cancelled demo', 3 * 3600_000)

      console.log(`  ✓ ${wo_code}  ${spec.status}${spec.outdated && madeOutdated ? '  ⚠ outdated' : ''}`)
    })
    i++
  }

  // ── prod_schedule_version (active · manual) + prod_schedule rows ─────────────
  const eq = await prisma.equipment_resource.findFirst({ where: { active: true }, select: { id: true } })
  const supersededExists = await prisma.prod_schedule_version.findFirst({ where: { version_code: 'SCEN-2026-06-SUPERSEDED' } })
  if (!supersededExists) {
    await prisma.prod_schedule_version.create({ data: { version_code: 'SCEN-2026-06-SUPERSEDED', description: 'Earlier what-if scenario', is_active: false, scheduler_source: 'what-if', created_by: 'admin' } })
  }
  const version = await prisma.prod_schedule_version.create({
    data: { version_code: 'SCEN-2026-06-ACTIVE', description: 'Manual baseline schedule', is_active: true, scheduler_source: 'manual', created_by: 'admin' },
  })

  const schedulable = await prisma.work_order.findMany({
    where: { mo_id: mo.id, status: { in: ['NOT_STARTED', 'RELEASED', 'IN_PROGRESS'] } },
    select: { id: true },
  })
  let day = 0
  for (const w of schedulable) {
    await prisma.prod_schedule.create({
      data: {
        prod_schedule_version_id: version.id,
        work_order_id: w.id,
        start_datetime: new Date(now + day * DAY),
        end_datetime: new Date(now + day * DAY + 4 * 3600_000),
        workcenter_line_id: eq?.id ?? null,
      },
    })
    day++
  }

  console.log(`\n✅ Done — 8 work orders + 1 active schedule version + ${schedulable.length} prod_schedule rows.`)
  console.log(madeOutdated ? '   ⚠ outdated WO created for BOM Version Alert demo.' : '   (no multi-dispatch group found — no naturally-outdated WO)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
