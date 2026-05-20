import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find assembly products whose typical_parts have any entry missing qty
  const products = await prisma.products.findMany({
    where: { product_type: 'standard' },
    select: { id: true, product_code: true, variant_attributes: true },
  })

  let patched = 0
  for (const p of products) {
    const va = p.variant_attributes as Record<string, unknown> | null
    if (!va || !Array.isArray(va.typical_parts)) continue

    const parts = va.typical_parts as Record<string, unknown>[]
    const needsFix = parts.some(part => part.qty == null)
    if (!needsFix) continue

    const fixed = parts.map(part => ({
      ...part,
      qty: part.qty != null ? Number(part.qty) : 1,
    }))

    await prisma.products.update({
      where: { id: p.id },
      data: {
        variant_attributes: { ...va, typical_parts: fixed } as unknown as Prisma.InputJsonValue,
      },
    })

    console.log(`Patched ${p.product_code}: ${parts.length} part(s) — ${parts.filter(x => x.qty == null).length} had missing qty`)
    patched++
  }

  console.log(`\nDone — ${patched} product(s) patched.`)
}

main().finally(() => prisma.$disconnect())
