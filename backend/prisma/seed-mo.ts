/**
 * Seed 5 sample Manufacturing Orders (T-MO.11) — one per status, with
 * snapshotted operations + partial allocation so the FE has demo data.
 * Idempotent: skips entirely if MO-00001 already exists.
 *
 * Run:  npm run seed:mo   (requires the Sprint-13 migration applied first)
 */
import { PrismaClient, Prisma, MoStatus } from '@prisma/client'

const prisma = new PrismaClient()

// Mirrors MoCodeGenerator.next() (2026-09-28 year-prefix change) — mo_code_seq's
// PK is now `year`, not the old fixed `id = 1`; MO-00001 stopped existing once
// every real mo_code got renumbered to MO-YYNNNNNN, so idempotency below checks
// by create_uid instead of a hardcoded old-format code string.
async function nextMoCode(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear() % 100
  const rows = await tx.$queryRaw<{ allocated: number }[]>`
    INSERT INTO mo_code_seq (year, next_val) VALUES (${year}, 2)
    ON CONFLICT (year) DO UPDATE SET next_val = mo_code_seq.next_val + 1
    RETURNING next_val - 1 AS allocated
  `
  const n = rows[0].allocated
  return `MO-${year.toString().padStart(2, '0')}${n.toString().padStart(6, '0')}`
}

async function main() {
  const admin = await prisma.res_users.findUnique({ where: { login: 'admin' } })
  if (!admin) throw new Error('admin user not found — run the base seed first')
  const uid = admin.id

  const exists = await prisma.manufacturing_order.count({ where: { create_uid: uid } })
  if (exists > 0) {
    console.log('⏭  admin already has manufacturing_order rows — skipping MO seed.')
    return
  }

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
        },
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

      console.log(`  ✓ ${mo_code}  ${p.status}  · ${lines.length} line(s) · ${template!.operations.length} routing ops`)
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
