import { PrismaClient } from '@prisma/client'
import * as bcryptjs from 'bcryptjs'
import { seedMachineTracker } from './seed-machine-tracker'
import { seedMachineDemo } from './seed-machine-demo'

const prisma = new PrismaClient()

async function main() {
  // ── res_users: admin ──────────────────────────────────────
  const adminPassword = await bcryptjs.hash(
    process.env.ADMIN_SEED_PASSWORD ?? 'BdtDev2026!',
    12,
  )
  await prisma.res_users.upsert({
    where: { login: 'admin' },
    update: { password: adminPassword, role: 'admin' },
    create: { login: 'admin', name: 'Administrator', active: true, password: adminPassword, role: 'admin' },
  })

  // T-MACH.01: repair_ticket_seq — must exist before the machine seeds below,
  // which `update` (not upsert) this row.
  await prisma.repair_ticket_seq.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, next_val: 1 },
  })

  // T-MACH.08: Machine Tracker sample data
  await seedMachineTracker(prisma)
  // Demo: rich realistic data for presentation
  await seedMachineDemo(prisma)

  console.log('Seed completed ✓ (admin user, repair_ticket_seq, machine tracker + demo data)')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
