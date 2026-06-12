import { PrismaClient } from '@prisma/client'
import { seedMachineDemo } from './seed-machine-demo'

const prisma = new PrismaClient()

seedMachineDemo(prisma)
  .then(() => { console.log('✓ Demo seed complete'); return prisma.$disconnect() })
  .catch(e => { console.error(e); return prisma.$disconnect().then(() => process.exit(1)) })
