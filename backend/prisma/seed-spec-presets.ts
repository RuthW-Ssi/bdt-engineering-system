import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

// ── Paint spec — same base system for all structural steel ──────────────────
const PAINT_STANDARD: Prisma.InputJsonValue = {
  layers: [
    { paint_type: 'primer',    layers: 1, material_code: 'PAINTPR001', microns: 50 },
    { paint_type: 'topcoat',   layers: 1, material_code: 'PAINTTC001', microns: 75 },
  ],
}

const PAINT_WITH_INTERMEDIATE: Prisma.InputJsonValue = {
  layers: [
    { paint_type: 'primer',       layers: 1, material_code: 'PAINTPR001', microns: 50 },
    { paint_type: 'intermediate', layers: 1, material_code: 'PAINTIT001', microns: 75 },
    { paint_type: 'topcoat',      layers: 1, material_code: 'PAINTTC001', microns: 75 },
  ],
}

// ── Welding spec by section type ─────────────────────────────────────────────
const weldSpec = (fillet_mm: number, sides: number, wire = 'WIRE70S612'): Prisma.InputJsonValue => ({
  material_code: wire,
  fillet_mm,
  sides,
  weld_layers: 1,
})

// ── Classify section type from product name ───────────────────────────────────
function classifySection(name: string): string {
  const n = name.toUpperCase()
  if (n.startsWith('PL'))       return 'PL'
  if (n.startsWith('H'))        return 'H'
  if (n.startsWith('L'))        return 'L'
  if (n.startsWith('C') && !n.startsWith('CH')) return 'C'
  if (n.startsWith('CHS'))      return 'CHS'
  if (n.startsWith('PIPE'))     return 'PIPE'
  if (n.startsWith('RHS'))      return 'RHS'
  if (n.startsWith('SHS'))      return 'SHS'
  if (n.startsWith('RB') || n.startsWith('ROD')) return 'ROD'
  return 'OTHER'
}

// ── Spec per section type ─────────────────────────────────────────────────────
function getSpecs(name: string): { paint: Prisma.InputJsonValue; weld: Prisma.InputJsonValue } {
  const section = classifySection(name)
  switch (section) {
    case 'PL':
      return { paint: PAINT_STANDARD, weld: weldSpec(6, 2) }
    case 'H':
      // Heavy sections — larger fillet, include intermediate coat
      return { paint: PAINT_WITH_INTERMEDIATE, weld: weldSpec(8, 2) }
    case 'L':
      return { paint: PAINT_STANDARD, weld: weldSpec(5, 2) }
    case 'C':
      return { paint: PAINT_STANDARD, weld: weldSpec(6, 2) }
    case 'CHS':
    case 'PIPE':
      // Tubular — single circumferential weld side
      return { paint: PAINT_STANDARD, weld: weldSpec(5, 1) }
    case 'RHS':
    case 'SHS':
      return { paint: PAINT_STANDARD, weld: weldSpec(5, 2) }
    case 'ROD':
      // Small diameter — thinner wire
      return { paint: PAINT_STANDARD, weld: weldSpec(4, 2, 'WIRE70S610') }
    default:
      return { paint: PAINT_STANDARD, weld: weldSpec(6, 2) }
  }
}

async function main() {
  const products = await prisma.products.findMany({
    where: { product_type: 'standard', active: true },
    select: { id: true, product_code: true, name: true },
    orderBy: { product_code: 'asc' },
  })

  console.log(`Seeding spec presets for ${products.length} standard products...`)

  let updated = 0
  for (const p of products) {
    const { paint, weld } = getSpecs(p.name)
    await prisma.products.update({
      where: { id: p.id },
      data: { default_paint_spec: paint, default_welding_spec: weld },
    })
    console.log(`  ✓ ${p.product_code} — ${p.name} [${classifySection(p.name)}]`)
    updated++
  }

  console.log(`\nDone — ${updated} products updated.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
