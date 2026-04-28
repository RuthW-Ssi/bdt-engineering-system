/**
 * bom_seed.ts — BOM seed for project 0X202 (WH-CO1-FACTORY)
 *
 * Reads 4 Excel files from the document directory and creates:
 *   - Custom products for each assembly mark (~80)
 *   - product_bom headers  (~80)
 *   - product_bom_lines    (~629)
 *
 * Run: npx ts-node prisma/bom_seed.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as path from 'path'

const prisma = new PrismaClient()

// ── Assembly name → mark_prefix mapping ─────────────────────────
const ASSEMBLY_PREFIX_MAP: Record<string, string> = {
  COLUMN:      'C',
  RAFTER:      'RF',
  FLYBRACING:  'FB',
  GUTTER:      'GU',
  FASCIA:      'CA',
  LOOSEPLATE:  'LP',
  WASHERPLATE: 'LP',
  PIPESTUD:    'PS',
  ROD:         'R',
  JACKBEAM:    'B',
  DOORFRAME:   'FR',
}

// ── Helpers ──────────────────────────────────────────────────────
function cleanStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function cleanNum(v: unknown): number | null {
  if (v == null) return null
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

function isSeparator(v: unknown): boolean {
  if (v == null) return true
  const s = String(v).trim()
  return s === '' || /^-{3,}/.test(s)
}

/** Infer material category prefix from Tekla profile code */
function inferPrefix5(profile: string): string {
  const p = profile.toUpperCase()
  if (p.startsWith('PL'))                          return 'PL000'
  if (p.startsWith('L') || p.startsWith('RODRB'))  return 'HR000'
  if (p.startsWith('RHS') || p.startsWith('SHS') || p.startsWith('C')) return 'CF000'
  if (p.startsWith('PIPE') || p.startsWith('PT'))  return 'PT000'
  if (p.startsWith('COUPLING') || p.startsWith('BOLT') || p.startsWith('NUT')) return 'BN000'
  return 'HR000'
}

/** Find material by profile name or create a placeholder entry */
async function getOrCreateMaterial(
  profile: string,
  grade: string | null,
  adminId: number,
  materialByName: Record<string, number>,
  uomKgId: number,
): Promise<number> {
  const key = profile.toLowerCase()
  if (materialByName[key] != null) return materialByName[key]

  const prefix5 = inferPrefix5(profile)
  // Generate part code via seq
  const defaultCode = await prisma.$transaction(async (tx) => {
    const row = await tx.$queryRaw<{ next_run: number }[]>`
      SELECT next_run FROM part_code_seq WHERE prefix_5 = ${prefix5} FOR UPDATE
    `
    if (!row.length) throw new Error(`No seq for prefix ${prefix5}`)
    const run = row[0].next_run
    await tx.$executeRaw`UPDATE part_code_seq SET next_run = next_run + 1 WHERE prefix_5 = ${prefix5}`
    return `${prefix5}${String(run).padStart(5, '0')}`
  })

  const categRow = await prisma.product_category.findUnique({ where: { prefix_5: prefix5 } })
  const categId = categRow?.id ?? 1

  const mat = await prisma.materials.create({
    data: {
      default_code: defaultCode,
      name: profile,
      description_sale: `${profile}${grade ? ' ' + grade : ''}`.toUpperCase().substring(0, 200),
      categ_id: categId,
      uom_id: uomKgId,
      type: 'product',
      state: 'draft',
      attributes: grade ? { grade } : {},
      create_uid: adminId,
      write_uid: adminId,
    },
  })
  materialByName[key] = mat.id
  return mat.id
}

/** Generates the next CUS product code using a SELECT ... FOR UPDATE transaction */
async function generateProductCode(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const seq = await tx.$queryRaw<{ next_run: number }[]>`
      SELECT next_run FROM product_code_seq WHERE kind = 'CUS' FOR UPDATE
    `
    if (!seq.length) throw new Error('No CUS row in product_code_seq')
    const next = seq[0].next_run
    await tx.$executeRaw`
      UPDATE product_code_seq SET next_run = ${next + 1} WHERE kind = 'CUS'
    `
    return `CUS-${next.toString().padStart(5, '0')}`
  })
}

// ══════════════════════════════════════════════════════════════════
async function main() {
  const docDir = path.resolve(
    __dirname,
    '../../document/0X202 อาคารคลังสินค้า จ.สมุทรปราการ',
  )

  // ── 1. Look up existing data ─────────────────────────────────
  console.log('\n=== Looking up existing data ===')

  const project = await prisma.project.findFirst({ where: { project_code: '0X202' } })
  if (!project) throw new Error('Project 0X202 not found — run seed.ts first')
  console.log(`  project: ${project.id} — ${project.name}`)

  const zoneWH = await prisma.project_zone.findFirst({
    where: { project_id: project.id, code: 'WH' },
  })
  if (!zoneWH) throw new Error('Zone WH not found for project 0X202')
  console.log(`  zone WH id: ${zoneWH.id}`)

  const admin = await prisma.res_users.findFirst({ where: { login: 'admin' } })
  const adminId = admin?.id ?? 1

  const ms000Categ = await prisma.product_category.findFirst({ where: { prefix_5: 'MS000' } })
  if (!ms000Categ) throw new Error('Category MS000 not found')
  console.log(`  MS000 categ id: ${ms000Categ.id}`)

  const allUoms = await prisma.uom_uom.findMany()
  const uomByName: Record<string, number> = {}
  for (const u of allUoms) uomByName[u.name] = u.id
  const uomEachId = uomByName['Each'] ?? 1
  const uomKgId = uomByName['Kilograms'] ?? 14
  console.log(`  UoM Each=${uomEachId}, Kilograms=${uomKgId}`)

  // Build material lookup by name (case-insensitive)
  const allMaterials = await prisma.materials.findMany({ select: { id: true, name: true } })
  const materialByName: Record<string, number> = {}
  for (const m of allMaterials) {
    materialByName[m.name.toLowerCase()] = m.id
  }
  console.log(`  materials indexed: ${allMaterials.length}`)

  // ── 2. Read File 2 — Assembly List ──────────────────────────
  console.log('\n=== Reading File 2: Assembly List ===')
  const wb2 = XLSX.readFile(path.join(docDir, '2. WH-CO1 Assembly List List Rev.0.xls'))
  const ws2 = wb2.Sheets[wb2.SheetNames[0]]
  const rows2 = XLSX.utils.sheet_to_json<unknown[]>(ws2, { header: 1 })

  // Headers at row 5 (index 5), data from row 7 (index 7)
  // [NO, AssMk, Q'TY, Name, DrawingNumber, Wt, Area, LENGTH, WIDTH, HIGTH, Q'TY_ALL]
  //  [0]   [1]   [2]  [3]    [4]           [5] [6]   [7]    [8]    [9]     [10]

  // Map: assMk → product id (will be populated as we create products)
  const productByMark: Record<string, number> = {}

  let prodInserted = 0
  let prodSkipped = 0

  for (let i = 7; i < rows2.length; i++) {
    const row = rows2[i] as unknown[]
    if (!row || row.length < 4) continue
    if (isSeparator(row[0]) || isSeparator(row[1])) continue

    const assMk = cleanStr(row[1])
    if (!assMk) continue

    const assemblyName = cleanStr(row[3]).toUpperCase()
    const qty = cleanNum(row[2]) ?? 1
    const weightKg = cleanNum(row[5])
    const paintArea = cleanNum(row[6])
    const lengthMm = cleanNum(row[7])
    const widthMm = cleanNum(row[8])
    const heightMm = cleanNum(row[9])
    const drawingNumber = cleanStr(row[4])
    const qtyAll = cleanNum(row[10]) ?? qty

    const markPrefix = ASSEMBLY_PREFIX_MAP[assemblyName] ?? null
    const productName = `${assemblyName} ${assMk}`

    // Upsert product by mark_number (project-scoped uniqueness)
    const existing = await prisma.products.findFirst({
      where: {
        project_id: project.id,
        mark_number: assMk,
      },
    })

    if (existing) {
      productByMark[assMk] = existing.id
      prodSkipped++
      continue
    }

    const productCode = await generateProductCode()
    const attrs: Record<string, unknown> = {}
    if (weightKg != null) attrs.weight_kg = weightKg
    if (paintArea != null) attrs.paint_area_m2 = paintArea
    if (lengthMm != null) attrs.length_mm = lengthMm
    if (widthMm != null) attrs.width_mm = widthMm
    if (heightMm != null) attrs.height_mm = heightMm
    if (drawingNumber) attrs.drawing_number = drawingNumber
    attrs.qty_total = qtyAll

    const newProd = await prisma.products.create({
      data: {
        product_code: productCode,
        name: productName,
        categ_id: ms000Categ.id,
        product_type: 'custom',
        state: 'draft',
        project_id: project.id,
        erection_zone_id: zoneWH.id,
        mark_prefix: markPrefix,
        mark_number: assMk,
        attributes: attrs as Prisma.InputJsonValue,
        create_uid: adminId,
        write_uid: adminId,
      },
    })
    productByMark[assMk] = newProd.id
    prodInserted++
  }

  // Also index already-existing products (for idempotency on re-run)
  if (prodSkipped > 0) {
    const existingProds = await prisma.products.findMany({
      where: { project_id: project.id, product_type: 'custom' },
      select: { id: true, mark_number: true },
    })
    for (const p of existingProds) {
      if (p.mark_number) productByMark[p.mark_number] = p.id
    }
  }

  console.log(`  Products created: ${prodInserted}, skipped (already exist): ${prodSkipped}`)
  console.log(`  productByMark entries: ${Object.keys(productByMark).length}`)

  // ── 3. Read File 3 — Assembly Part List → build BOMs ────────
  console.log('\n=== Reading File 3: Assembly Part List ===')
  const wb3 = XLSX.readFile(path.join(docDir, '3. WH-CO1 Assembly Part List List Rev.0.xls'))
  const ws3 = wb3.Sheets[wb3.SheetNames[0]]
  const rows3 = XLSX.utils.sheet_to_json<unknown[]>(ws3, { header: 1 })

  // Col indices: [0]=blank, [1]=mark/header, [2]=qty, [3]=profile, [4]=length, [5]=grade, [6]=weight, [7]=area

  let currentBomId: number | null = null
  let bomInserted = 0
  let bomSkipped = 0
  let lineInserted = 0
  let lineSkipped = 0
  let sequence = 10

  for (let i = 0; i < rows3.length; i++) {
    const row = rows3[i] as unknown[]
    if (!row || row.length < 2) continue

    const col1 = cleanStr(row[1])
    if (!col1 || isSeparator(col1)) continue

    // Assembly header detection: col1 starts with '0X202R1'
    if (col1.startsWith('0X202R1')) {
      const assMk = col1.substring('0X202R1'.length).trim()
      sequence = 10

      const productId = productByMark[assMk]
      if (!productId) {
        console.warn(`  [WARN] No product found for assembly mark "${assMk}" — skipping BOM`)
        currentBomId = null
        continue
      }

      // Check for existing BOM
      const existingBom = await prisma.product_bom.findFirst({
        where: { product_id: productId, project_id: project.id },
      })

      if (existingBom) {
        currentBomId = existingBom.id
        bomSkipped++
      } else {
        const newBom = await prisma.product_bom.create({
          data: {
            product_id: productId,
            version: '1.0.0',
            bom_view: 'eBOM',
            owner_role: 'engineering',
            state: 'draft',
            product_qty: new Prisma.Decimal(1),
            product_uom_id: uomEachId,
            bom_type: 'normal',
            project_id: project.id,
            notes: `Imported from 0X202 Tekla — ${assMk}`,
            create_uid: adminId,
            write_uid: adminId,
          },
        })
        currentBomId = newBom.id
        bomInserted++
      }
      continue
    }

    // Part line — only if we have a current BOM
    if (currentBomId == null) continue

    const partMark = col1
    const qty = cleanNum(row[2])
    const profile = cleanStr(row[3])
    const lengthMm = cleanNum(row[4])
    const grade = cleanStr(row[5]) || null
    const weightKg = cleanNum(row[6])
    const areaM2 = cleanNum(row[7])

    if (!qty) continue

    // Check if line already exists (idempotency on re-run)
    const existingLine = await prisma.product_bom_line.findFirst({
      where: { bom_id: currentBomId, part_mark: partMark },
    })
    if (existingLine) {
      lineSkipped++
      continue
    }

    // Find or create material for this profile (satisfies XOR constraint)
    const materialId = profile
      ? await getOrCreateMaterial(profile, grade, adminId, materialByName, uomKgId)
      : null

    if (!materialId) continue  // no profile → skip line

    await prisma.product_bom_line.create({
      data: {
        bom_id: currentBomId,
        sequence,
        material_id: materialId,
        product_qty: new Prisma.Decimal(qty),
        product_uom_id: uomKgId,
        scrap_pct: new Prisma.Decimal(0),
        cutting_length_mm: lengthMm != null ? new Prisma.Decimal(lengthMm) : null,
        weight_per_unit_kg: weightKg != null ? new Prisma.Decimal(weightKg) : null,
        note: `${partMark} — ${profile ?? ''}`,
        part_mark: partMark.substring(0, 30),
        profile: profile ? profile.substring(0, 60) : null,
        grade: grade ? grade.substring(0, 20) : null,
        length_mm: lengthMm != null ? new Prisma.Decimal(lengthMm) : null,
        area_m2: areaM2 != null ? new Prisma.Decimal(areaM2) : null,
      },
    })
    lineInserted++
    sequence += 10
  }

  console.log(`  BOMs created: ${bomInserted}, skipped (already exist): ${bomSkipped}`)
  console.log(`  BOM lines created: ${lineInserted}, skipped (already exist): ${lineSkipped}`)

  // ── 4. Final verification counts ────────────────────────────
  console.log('\n=== Final Counts ===')
  const totalProducts = await prisma.products.count({
    where: { project_id: project.id, product_type: 'custom' },
  })
  const totalBoms = await prisma.product_bom.count({ where: { project_id: project.id } })
  const totalBomLines = await prisma.product_bom_line.count({
    where: { bom: { project_id: project.id } },
  })
  console.log(`  Custom products for 0X202: ${totalProducts}`)
  console.log(`  product_bom rows:          ${totalBoms}`)
  console.log(`  product_bom_line rows:     ${totalBomLines}`)
  console.log('\nDone.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
