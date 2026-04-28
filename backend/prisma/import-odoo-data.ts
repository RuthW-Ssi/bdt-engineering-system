import { PrismaClient, Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as path from 'path'

const prisma = new PrismaClient()

// ── Category Mapping: Odoo string → our prefix_5 ──────────────
const CATEG_MAP: Record<string, string> = {
  'All / Raw Materials / Plate / PLT':              'PL000',
  'All / Raw Materials / Plate / STEELPLATE':       'PL000',
  'All / Raw Materials / Hot Roll Coil / HRC':      'PL000',
  'All / Finished Goods / STEELPLATE-FG':           'PL000',
  'All / Structural Steels / Shape / STEELSHAPE':   'HR000',
  'All / Building Structures / COLDFORM':           'CF000',
  'All / Steel Accessories':                        'AC000',
  'All / Consumable':                               'WC000',
  'All / Expenses / PAINT':                         'PC000',
  'All / Expenses / FIREPROOF':                     'PC000',
  'All / Building Structures / CLADDING':           'BC000',
  'All / Building Structures / COMPONENTS':         'BC000',
  'All / Purchase Service':                         'SV000',
  'All / Purchase Service / FABRICATION':           'FB000',
  'All / Purchase Service / TRANSPORTATION':        'TS000',
  'All / Purchase Service / ERECTION':              'SV000',
  'All':                                            '10000',
  'All / Building Structures / MAIN STRUCTURES':    'MS000',
  'All / Building Structures / SECONDARY STRUCTURES': 'MS000',
}

const PRODUCT_CATEGORIES = new Set([
  'All / Building Structures / MAIN STRUCTURES',
  'All / Building Structures / SECONDARY STRUCTURES',
])

// ── UoM Mapping: Odoo abbreviation → our uom_uom.name ────────
const UOM_MAP: Record<string, string> = {
  'EA': 'Each', 'KG': 'Kilograms', 'SET': 'Set', 'MTR': 'Metres',
  'GAL': 'Gallon', 'DRM': 'Drum', 'PAK': 'Pack', 'CN': 'Can',
  'PR': 'Pair',
  // Approximate mappings
  'JOB': 'Each', 'SQM': 'Each', 'CUM': 'Each', 'TNN': 'Kilograms',
  'M2': 'Each', 'PRJ': 'Each', 'D': 'Each',
}

// ── Helpers ───────────────────────────────────────────────────
function cleanStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}
function cleanNum(v: unknown): number | null {
  if (v == null) return null
  const n = parseFloat(String(v))
  return isNaN(n) || n === 0 ? null : n
}

async function generateProductCode(kind: 'STD' | 'CUS'): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const seq = await tx.$queryRaw<{ next_run: number }[]>`
      SELECT next_run FROM product_code_seq WHERE kind = ${kind} FOR UPDATE
    `
    const next = seq[0].next_run
    await tx.$executeRaw`
      UPDATE product_code_seq SET next_run = ${next + 1} WHERE kind = ${kind}
    `
    return `${kind}-${next.toString().padStart(5, '0')}`
  })
}

async function generatePartCode(prefix5: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.$queryRaw<{ next_run: number }[]>`
      SELECT next_run FROM part_code_seq WHERE prefix_5 = ${prefix5} FOR UPDATE
    `
    if (!row.length) throw new Error(`No seq row for prefix ${prefix5}`)
    const run = row[0].next_run
    await tx.$executeRaw`
      UPDATE part_code_seq SET next_run = next_run + 1 WHERE prefix_5 = ${prefix5}
    `
    return `${prefix5}${String(run).padStart(5, '0')}`
  })
}

// ══════════════════════════════════════════════════════════════
async function main() {
  const docDir = path.resolve(__dirname, '../../document')
  const adminUser = await prisma.res_users.findFirst({ where: { login: 'admin' } })
  const adminId = adminUser?.id ?? 1

  // ── Build lookup maps ────────────────────────────────────
  const allCategories = await prisma.product_category.findMany()
  const categByPrefix: Record<string, number> = {}
  for (const c of allCategories) {
    if (c.prefix_5) categByPrefix[c.prefix_5] = c.id
  }

  const allUoms = await prisma.uom_uom.findMany()
  const uomByName: Record<string, number> = {}
  for (const u of allUoms) uomByName[u.name] = u.id
  const defaultUomId = uomByName['Each'] ?? 1

  // ══════════════════════════════════════════════════════════
  // FILE 1: odoo-material-template.xlsx  (materials + main-structure products)
  // ══════════════════════���═══════════════════════════════════
  console.log('\n=== Reading odoo-material-template.xlsx ===')
  const wb1 = XLSX.readFile(path.join(docDir, 'odoo-material-template.xlsx'))
  const rows1: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]])

  let matInserted = 0, matSkipped = 0
  let prodUpdated = 0, prodInserted = 0

  for (const row of rows1) {
    const ref = cleanStr(row['Internal Reference'])
    const name = cleanStr(row['Name'])
    const category = cleanStr(row['Product Category'])
    const grade = cleanStr(row['Grade']) || null
    const thickness = cleanNum(row['Thickness (mm)'])
    const widthFt = cleanNum(row['Width (ft)'])
    const widthMm = cleanNum(row['Width (mm)'])
    const lengthMm = cleanNum(row['Length (mm)'])
    const salesPrice = cleanNum(row['Sales Price'])
    const cost = cleanNum(row['Cost'])
    const uomStr = cleanStr(row['Unit of Measure'])

    // Skip rows without both ref and name
    if (!ref && !name) continue
    if (!name || name.startsWith('\t')) continue
    if (!ref) continue
    if (category === 'All / By Products / Scrap') continue

    const prefix5 = CATEG_MAP[category]
    if (!prefix5) {
      console.warn(`  [SKIP] Unknown category: "${category}" for ${ref}`)
      matSkipped++
      continue
    }

    const categId = categByPrefix[prefix5]
    if (!categId) {
      console.warn(`  [SKIP] No categ_id for prefix ${prefix5}`)
      matSkipped++
      continue
    }

    const uomName = UOM_MAP[uomStr] ?? 'Each'
    const uomId = uomByName[uomName] ?? defaultUomId

    // Build attributes
    const attributes: Record<string, unknown> = {}
    if (grade) attributes.grade = grade
    if (thickness) attributes.thickness_t = thickness
    if (widthMm) attributes.width_mm = widthMm
    if (widthFt) attributes.width_ft = widthFt
    if (lengthMm) attributes.length_mm = lengthMm

    // ── PRODUCTS: MAIN STRUCTURES / SECONDARY STRUCTURES ──
    if (PRODUCT_CATEGORIES.has(category)) {
      if (category.includes('MAIN STRUCTURES')) {
        // Update existing seeded products (match by name or engineering_code prefix)
        const existing = await prisma.products.findFirst({
          where: {
            OR: [
              { engineering_code: ref },
              { name: { equals: name, mode: 'insensitive' } },
            ],
          },
        })
        if (existing) {
          await prisma.products.update({
            where: { id: existing.id },
            data: {
              odoo_ref_id: ref,
              odoo_compliance_status: 'MATCH',
              item_code: ref.length === 10 ? ref : null,
              write_uid: adminId,
              write_date: new Date(),
            },
          })
          prodUpdated++
        } else {
          console.warn(`  [WARN] MAIN STRUCTURES not found: ${ref} / ${name}`)
        }
      } else {
        // SECONDARY STRUCTURES — insert as new standard product
        const exists = await prisma.products.findFirst({
          where: { OR: [{ engineering_code: ref }, { odoo_ref_id: ref }] },
        })
        if (exists) { prodUpdated++; continue }

        const productCode = await generateProductCode('STD')
        await prisma.products.create({
          data: {
            product_code: productCode,
            engineering_code: ref,
            item_code: ref.length === 10 ? ref : null,
            odoo_ref_id: ref,
            odoo_compliance_status: 'MATCH',
            name,
            categ_id: categId,
            product_type: 'standard',
            state: 'draft',
            attributes: attributes as Prisma.InputJsonValue,
            create_uid: adminId,
            write_uid: adminId,
          },
        })
        prodInserted++
      }
      continue
    }

    // ─��� MATERIALS ──────────────────────────────────────────
    // default_code must be exactly 10 chars
    let defaultCode: string
    let odooRefId: string | null = null

    if (ref.length === 10) {
      defaultCode = ref
    } else if (ref.length < 10) {
      defaultCode = ref.padEnd(10, ' ')
    } else {
      // > 10 chars: store full ref in odoo_ref_id, generate code
      // But first check if already imported (idempotency)
      odooRefId = ref
      const existingByRef = await prisma.materials.findFirst({ where: { odoo_ref_id: ref } })
      if (existingByRef) {
        defaultCode = existingByRef.default_code
      } else {
        defaultCode = await generatePartCode(prefix5)
      }
    }

    // Description sale = uppercase name
    const descSale = name.toUpperCase().substring(0, 200)

    // Determine type
    let matType = 'product'
    if (category.includes('Purchase Service') || category.includes('Expenses')) {
      matType = 'service'
    } else if (category.includes('Consumable')) {
      matType = 'consu'
    }

    try {
      await prisma.materials.upsert({
        where: { default_code: defaultCode },
        update: {
          odoo_ref_id: odooRefId ?? ref,
          write_uid: adminId,
          write_date: new Date(),
        },
        create: {
          default_code: defaultCode,
          name,
          description_sale: descSale,
          categ_id: categId,
          uom_id: uomId,
          type: matType,
          state: 'draft',
          attributes: Object.keys(attributes).length > 0 ? (attributes as Prisma.InputJsonValue) : {},
          odoo_ref_id: odooRefId ?? ref,
          create_uid: adminId,
          write_uid: adminId,
        },
      })
      matInserted++
    } catch (e: any) {
      if (e.code === 'P2002') {
        matSkipped++
      } else {
        console.error(`  [ERR] ${defaultCode}: ${e.message}`)
        matSkipped++
      }
    }
  }

  console.log(`  Materials: ${matInserted} inserted/updated, ${matSkipped} skipped`)
  console.log(`  Products (MAIN): ${prodUpdated} updated`)
  console.log(`  Products (SECONDARY): ${prodInserted} inserted`)

  // ═���════════════════════════��═══════════════════════════════
  // FILE 2: Standard Part - Standardized.xlsx
  // ════��═════════════════════════════════════════════════════
  console.log('\n=== Reading Standard Part - Standardized.xlsx ===')
  const wb2 = XLSX.readFile(path.join(docDir, 'Standard Part - Standardized.xlsx'))
  const ws2 = wb2.Sheets[wb2.SheetNames[0]]
  const allRows2: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws2, { header: 1 })

  // Headers at row index 3 (0-based), data starts at row 4
  const headers = allRows2[3] as string[]
  const colIdx = {
    internalRef: 0,   // Internal Reference (Odoo)
    sourceCode: 1,    // Source BDTCM Code
    name: 2,          // Name (Odoo pattern)
    category: 3,      // Product Category
    grade: 4,         // Grade
    thickness: 5,     // Thickness (mm.)
    widthX: 6,        // Width X (mm.)
    widthY: 7,        // Width Y (mm.)
    length: 8,        // Length (mm.)
    hole: 9,          // Hole
    uom: 10,          // Unit of Measure
    status: 11,       // Status
    notes: 12,        // หมายเหตุ
  }

  const acCategId = categByPrefix['AC000'] ?? 1
  let stdInserted = 0, stdSkipped = 0

  for (let i = 4; i < allRows2.length; i++) {
    const row = allRows2[i]
    if (!row || row.length < 3) continue

    const name = cleanStr(row[colIdx.name])
    if (!name || name === 'Summary') break // Stop at summary section

    const internalRef = cleanStr(row[colIdx.internalRef])
    const sourceCode = cleanStr(row[colIdx.sourceCode])
    const grade = cleanStr(row[colIdx.grade]) || null
    const thickness = cleanNum(row[colIdx.thickness])
    const widthX = cleanNum(row[colIdx.widthX])
    const widthY = cleanNum(row[colIdx.widthY])
    const lengthVal = cleanStr(row[colIdx.length])
    const holeVal = cleanStr(row[colIdx.hole])
    const status = cleanStr(row[colIdx.status])
    const notes = cleanStr(row[colIdx.notes])

    // Skip if already imported (by engineering_code)
    const existing = await prisma.products.findFirst({
      where: {
        OR: [
          ...(sourceCode ? [{ engineering_code: sourceCode }] : []),
          ...(internalRef ? [{ item_code: internalRef }] : []),
          { name: { equals: name, mode: 'insensitive' as const } },
        ],
      },
    })
    if (existing) { stdSkipped++; continue }

    const productCode = await generateProductCode('STD')
    const isMatch = status === 'MATCH' && internalRef.length > 0

    // engineering_code max 20 chars — truncate combined codes, store full in notes
    const engCode = sourceCode.length <= 20 ? sourceCode : sourceCode.substring(0, 20)

    const attributes: Record<string, unknown> = {}
    if (sourceCode.length > 20) attributes.source_codes = sourceCode
    if (grade) attributes.grade = grade
    if (thickness) attributes.thickness_t = thickness
    if (widthX) attributes.width_x = widthX
    if (widthY) attributes.width_y = widthY
    if (lengthVal && lengthVal !== 'as designer') attributes.length_mm = lengthVal
    if (holeVal && holeVal !== 'as designer') attributes.hole = holeVal
    if (notes) attributes.notes = notes

    await prisma.products.create({
      data: {
        product_code: productCode,
        engineering_code: engCode || null,
        item_code: isMatch ? internalRef : null,
        odoo_ref_id: internalRef || null,
        odoo_compliance_status: isMatch ? 'MATCH' : 'NEW',
        name,
        categ_id: acCategId,
        product_type: 'standard',
        state: 'draft',
        sale_ok: false,
        purchase_ok: false,
        attributes: attributes as Prisma.InputJsonValue,
        create_uid: adminId,
        write_uid: adminId,
      },
    })
    stdInserted++
  }

  console.log(`  Standard Parts: ${stdInserted} inserted, ${stdSkipped} skipped (already exist)`)

  // ── Final summary ──────────────────────────────────────
  const matCount = await prisma.materials.count()
  const prodCount = await prisma.products.count()
  console.log(`\n=== Import Complete ===`)
  console.log(`  materials table: ${matCount} rows`)
  console.log(`  products table: ${prodCount} rows`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
