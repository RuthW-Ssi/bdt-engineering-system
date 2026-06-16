/**
 * Seed 5 sample Manufacturing Orders (T-MO.11) — one per status, with
 * snapshotted operations + partial allocation so the FE has demo data.
 * Idempotent: skips entirely if MO-00001 already exists.
 *
 * Run:  npm run seed:mo   (requires the Sprint-13 migration applied first)
 */
import { PrismaClient, Prisma, MoStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function nextMoCode(tx: Prisma.TransactionClient): Promise<string> {
  await tx.$executeRaw`INSERT INTO mo_code_seq (id, next_val) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`
  const rows = await tx.$queryRaw<{ next_val: number }[]>`SELECT next_val FROM mo_code_seq WHERE id = 1 FOR UPDATE`
  const n = rows[0].next_val
  await tx.$executeRaw`UPDATE mo_code_seq SET next_val = ${n + 1} WHERE id = 1`
  return `MO-${String(n).padStart(5, '0')}`
}

async function main() {
  const exists = await prisma.manufacturing_order.findUnique({ where: { mo_code: 'MO-00001' } })
  if (exists) {
    console.log('⏭  MO-00001 already exists — skipping MO seed.')
    return
  }

  const admin = await prisma.res_users.findUnique({ where: { login: 'admin' } })
  if (!admin) throw new Error('admin user not found — run the base seed first')
  const uid = admin.id

  // routing template with the most operations
  const template = await prisma.routing_template.findFirst({
    where: { active: true, operations: { some: {} } },
    orderBy: { operations: { _count: 'desc' } },
    include: { operations: { orderBy: { sequence: 'asc' } } },
  })
  if (!template) throw new Error('no routing_template with operations found')

  // a mark prefix (FK target) — prefer Column, else first active
  const prefix =
    (await prisma.mark_prefix_master.findFirst({ where: { code: 'CO', active: true } })) ??
    (await prisma.mark_prefix_master.findFirst({ where: { active: true } }))
  if (!prefix) throw new Error('no mark_prefix_master rows found')

  // candidate assemblies with a usable qty, biggest first (so we can split)
  const assemblies = await prisma.bom_assembly.findMany({
    where: { qty: { not: null, gt: 0 } },
    orderBy: { qty: 'desc' },
    take: 12,
  })
  if (assemblies.length < 4) throw new Error('not enough bom_assembly rows with qty>0 to seed MOs')

  // track remaining per assembly across the seed so we never over-allocate
  const remaining = new Map<number, number>(assemblies.map((a) => [a.id, Number(a.qty)]))
  const take = (id: number, want: number) => {
    const rem = remaining.get(id) ?? 0
    const q = Math.min(want, rem)
    remaining.set(id, rem - q)
    return q
  }

  function snapshotOps() {
    return template!.operations.map((op) => ({
      sequence: op.sequence,
      source_routing_op_id: op.id,
      work_center_id: op.workcenter_id,
      expected_duration_min: Math.round(Number(op.time_cycle_manual ?? op.time_cycle ?? 0)),
      setup_time_min: 0,
    }))
  }

  // status history chains per target status
  const CHAIN: Record<Exclude<MoStatus, 'DRAFT'>, MoStatus[]> = {
    CONFIRMED: ['DRAFT', 'CONFIRMED'],
    IN_PROGRESS: ['DRAFT', 'CONFIRMED', 'IN_PROGRESS'],
    DONE: ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'DONE'],
    CANCELLED: ['DRAFT', 'CANCELLED'],
  }

  // Plan: reuse assemblies[0] across MO#1 + MO#3 to demo allocation breakdown.
  const a0 = assemblies[0].id
  const plan: { status: MoStatus; lines: { id: number; want: number }[]; daysToDue: number }[] = [
    { status: 'DRAFT', lines: [{ id: a0, want: 1 }, { id: assemblies[1].id, want: 1 }], daysToDue: 21 },
    { status: 'CONFIRMED', lines: [{ id: assemblies[2].id, want: 1 }], daysToDue: 14 },
    { status: 'IN_PROGRESS', lines: [{ id: a0, want: 1 }, { id: assemblies[3].id, want: 1 }], daysToDue: 7 },
    { status: 'DONE', lines: [{ id: assemblies[4 % assemblies.length].id, want: 1 }], daysToDue: -3 },
    { status: 'CANCELLED', lines: [{ id: assemblies[5 % assemblies.length].id, want: 1 }], daysToDue: 30 },
  ]

  const now = Date.now()
  let created = 0

  for (const p of plan) {
    const lines = p.lines
      .map((l, i) => ({ bom_assembly_id: l.id, qty: take(l.id, l.want), line_seq: i }))
      .filter((l) => l.qty > 0)
    if (!lines.length) continue

    await prisma.$transaction(async (tx) => {
      const mo_code = await nextMoCode(tx)
      const mo = await tx.manufacturing_order.create({
        data: {
          mo_code,
          primary_mark_prefix_code: prefix!.code,
          routing_template_id: template!.id,
          status: p.status,
          due_date: new Date(now + p.daysToDue * 86400000),
          create_uid: uid,
          write_uid: uid,
          assembly_lines: { create: lines.map((l) => ({ ...l, qty: new Prisma.Decimal(l.qty) })) },
          operations: { create: snapshotOps() },
        },
        include: { operations: true },
      })

      // status history chain
      if (p.status !== 'DRAFT') {
        const chain = CHAIN[p.status as Exclude<MoStatus, 'DRAFT'>]
        for (let i = 1; i < chain.length; i++) {
          await tx.mo_status_history.create({
            data: {
              mo_id: mo.id,
              from_status: chain[i - 1],
              to_status: chain[i],
              reason: `Seed: ${chain[i - 1]} → ${chain[i]}`,
              changed_by: 'admin',
            },
          })
        }
      }

      // operation progress for IN_PROGRESS / DONE
      if (p.status === 'IN_PROGRESS' && mo.operations[0]) {
        await tx.mo_operation.update({ where: { id: mo.operations[0].id }, data: { status: 'IN_PROGRESS' } })
      }
      if (p.status === 'DONE') {
        await tx.mo_operation.updateMany({ where: { mo_id: mo.id }, data: { status: 'DONE' } })
      }

      console.log(`  ✓ ${mo_code}  ${p.status}  · ${lines.length} line(s) · ${mo.operations.length} ops`)
      created++
    })
  }

  console.log(`\n✅ Done — ${created} manufacturing orders seeded.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
