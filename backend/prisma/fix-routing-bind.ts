import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // CUS-00001 has has_custom_routing=true — must clear it to satisfy ck_routing_xor
  const r1 = await prisma.products.update({
    where: { product_code: 'CUS-00001' },
    data: { routing_template_id: 5, has_custom_routing: false },
    select: { product_code: true, routing_template_id: true, has_custom_routing: true },
  })
  console.log('Fixed CUS-00001:', r1)

  // All other custom products (has_custom_routing is already false)
  const r2 = await prisma.products.updateMany({
    where: {
      product_type: 'custom',
      product_code: { not: 'CUS-00001' },
      routing_template_id: null,
    },
    data: { routing_template_id: 5 },
  })
  console.log(`Bound ${r2.count} remaining custom products to Main template (id=5)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
