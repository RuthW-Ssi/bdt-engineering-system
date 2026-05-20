/**
 * Patch: create missing mockup products in Supabase and fix bom_assembly.product_id links.
 *
 * Missing products: STD-00055, STD-00056, CUS-00347..CUS-00352
 * These were referenced in the THEPHA mockup dispatches but not in seed-products-v3-adjusted.ts.
 *
 * Run:
 *   LOCAL_DB_URL="postgresql://postgres:BdtDev2026%21@127.0.0.1:5432/bdt_dev?schema=public" \
 *   DATABASE_URL="<supabase-url>" \
 *   npx ts-node prisma/seed-patch-product-links.ts
 */
import { PrismaClient } from '@prisma/client'

const local = new PrismaClient({ datasources: { db: { url: process.env.LOCAL_DB_URL! } } })
const supa  = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL! } } })

const MISSING_CODES = ['STD-00055', 'STD-00056', 'CUS-00347', 'CUS-00348', 'CUS-00349', 'CUS-00350', 'CUS-00351', 'CUS-00352']

async function main() {
  // ── 1. Create missing products in Supabase ──────────────────
  console.log('Creating missing products...')
  const localProducts = await local.$queryRaw<{
    id: number; product_code: string; name: string; product_type: string;
    categ_id: number; mark_prefix: string | null; mark_number: string | null;
    project_id: number | null; state: string; attributes: any;
  }[]>`SELECT id, product_code, name, product_type, categ_id, mark_prefix, mark_number, project_id, state, attributes
       FROM products WHERE product_code = ANY(${MISSING_CODES}::text[])`

  const productCodeMap = new Map<string, number>() // product_code → supa product_id

  // Pre-load ALL Supabase products into the map (handles already-existing ones)
  const allSupaProducts = await supa.products.findMany({ select: { id: true, product_code: true } })
  for (const ep of allSupaProducts) productCodeMap.set(ep.product_code, ep.id)

  for (const p of localProducts) {
    if (productCodeMap.has(p.product_code)) {
      console.log(`  ✓ ${p.product_code} already exists`)
      continue
    }
    const n = await supa.products.create({
      data: {
        product_code: p.product_code,
        name:         p.name,
        product_type: p.product_type,
        categ_id:     p.categ_id,
        mark_prefix:  p.mark_prefix || null,
        mark_number:  p.mark_number || null,
        project_id:   p.project_id,
        state:        p.state,
        attributes:   p.attributes ?? {},
        create_uid:   1,
        write_uid:    1,
      },
    })
    productCodeMap.set(p.product_code, n.id)
    console.log(`  + ${p.product_code} (${p.name}) → id=${n.id}`)
  }

  // ── 2. Build local dispatch_id → supa dispatch_id map ───────
  console.log('\nBuilding dispatch ID map...')
  const localDispatches = await local.$queryRaw<{ id: number; zone_id: number }[]>`
    SELECT id, zone_id FROM bom_dispatch ORDER BY id LIMIT 3`
  const supaDispatches = await supa.bom_dispatch.findMany({
    orderBy: { id: 'asc' }, take: 3, select: { id: true },
  })
  const dispatchMap = new Map<number, number>()
  localDispatches.forEach((ld, i) => {
    if (supaDispatches[i]) dispatchMap.set(ld.id, supaDispatches[i].id)
  })
  console.log('  dispatch map:', Object.fromEntries(dispatchMap))

  // ── 3. Get assembly→product mappings from local dev ─────────
  console.log('\nFixing assembly product links...')
  const localLinks = await local.$queryRaw<{
    assembly_mark: string; dispatch_id: number; product_code: string;
  }[]>`
    SELECT ba.assembly_mark, ba.dispatch_id, p.product_code
    FROM bom_assembly ba
    JOIN products p ON p.id = ba.product_id
    WHERE ba.dispatch_id IN (${localDispatches[0].id}, ${localDispatches[1].id}, ${localDispatches[2].id})
  `

  let updated = 0
  for (const link of localLinks) {
    const supaDispatchId = dispatchMap.get(link.dispatch_id)
    const supaProductId  = productCodeMap.get(link.product_code)
    if (!supaDispatchId || !supaProductId) {
      console.warn(`  skip ${link.assembly_mark} — missing dispatch or product mapping`)
      continue
    }
    const result = await supa.bom_assembly.updateMany({
      where: { assembly_mark: link.assembly_mark, dispatch_id: supaDispatchId },
      data:  { product_id: supaProductId },
    })
    if (result.count > 0) updated += result.count
  }
  console.log(`  ✓ ${updated} assembly rows updated with product_id`)

  console.log('\n✅ Product link patch complete')
}

main()
  .catch(e => { console.error('❌', e.message); process.exit(1) })
  .finally(async () => { await local.$disconnect(); await supa.$disconnect() })
