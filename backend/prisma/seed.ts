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

  console.log('Seed completed ✓')
  console.log('  - admin user with bcrypt password (Sprint 6)')
  console.log('  - repair_ticket_seq seeded (T-MACH.01)')
  console.log('  - machine tracker + machine demo data (T-MACH.08)')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
