/**
 * Import 0X202 — WH-CO1 Factory (อาคารคลังสินค้า สมุทรปราการ)
 * Creates: 1 Project, 80 Custom Products (assemblies), ~860 BOM lines
 * Materials auto-created from profile+grade if not already in DB.
 * Idempotent: project by code, products by mark_number, materials by name.
 */
import { PrismaClient } from '@prisma/client'
import * as XLSX from 'xlsx'
import * as path from 'path'

const prisma = new PrismaClient()
const ADMIN_UID = 1
const DOC_DIR = path.join(__dirname, '../../document/0X202 อาคารคลังสินค้า จ.สมุทรปราการ')

// Fixed DB IDs (verified 2026-05-08)
const CATEG_MAIN_STRUCTURES = 24
const CATEG_STEEL_PLATE = 25
const CATEG_HOT_ROLL = 26
const UOM_EACH = 1
const UOM_KG = 14

// Tekla mark type → BDT mark_prefix_master code (null = no match → skip FK)
const TEKLA_TO_PREFIX: Record<string, string | null> = {
  CO:  'C',   // Column
  RF:  'RF',  // Rafter
  FB:  'FB',  // FlyBrace
  GT:  'GU',  // Gutter
  LP:  'LP',  // LoosePlate
  LP1: 'LP',  // LoosePlate variant
  PS:  'PS',  // PipeStud
  DR:  'FR',  // DoorFrame → Frame
  FA:  null,  // Fascia (no BDT code)
  RB:  'R',   // Rod Bracing → Rod
  TF1: null,
  TF2: null,
}

// Extract mark type from AssMk like "WH-CO-1" → "CO"
function markType(assMk: string): string {
  const parts = assMk.split('-')
  return parts.length >= 2 ? parts[1] : ''
}

// Derive prefix_5 from profile string for part_code_seq lookup
function profileToPrefix5(profile: string): string {
  const p = profile.toUpperCase()
  if (p.startsWith('PL')) return 'PL000'
  return 'HR000'  // angles, H-beams, channels, etc.
}

// Derive categ_id from profile string
function profileToCateg(profile: string): number {
  return profile.toUpperCase().startsWith('PL') ? CATEG_STEEL_PLATE : CATEG_HOT_ROLL
}

// Cache for material ID lookup
const materialCache = new Map<string, number>()

async function getOrCreateMaterial(profile: string, grade: string): Promise<number> {
  const key = grade ? `${profile} ${grade}` : profile
  if (materialCache.has(key)) return materialCache.get(key)!

  const existing = await prisma.materials.findFirst({ where: { name: key }, select: { id: true } })
  if (existing) {
    materialCache.set(key, existing.id)
    return existing.id
  }

  const prefix5 = profileToPrefix5(profile)
  const defaultCode = await prisma.$transaction(async tx => {
    const seq = await tx.$queryRaw<{ next_run: number }[]>`
      SELECT next_run FROM part_code_seq WHERE prefix_5 = ${prefix5} FOR UPDATE
    `
    if (!seq.length) throw new Error(`No part_code_seq for prefix ${prefix5}`)
    const run = seq[0].next_run
    await tx.$executeRaw`UPDATE part_code_seq SET next_run = next_run + 1 WHERE prefix_5 = ${prefix5}`
    return `${prefix5}${String(run).padStart(5, '0')}`
  })

  const mat = await prisma.materials.create({
    data: {
      default_code: defaultCode,
      name: key,
      description_sale: key,
      categ_id: profileToCateg(profile),
      uom_id: UOM_KG,
      type: 'product',
      state: 'draft',
      attributes: { profile, grade, source: '0X202' },
      create_uid: ADMIN_UID,
      write_uid: ADMIN_UID,
    },
  })
  materialCache.set(key, mat.id)
  return mat.id
}

// Product code sequence (CUS)
async function nextProductCode(): Promise<string> {
  return prisma.$transaction(async tx => {
    const seq = await tx.$queryRaw<{ next_run: number }[]>`
      SELECT next_run FROM product_code_seq WHERE kind = 'CUS' FOR UPDATE
    `
    const run = seq[0].next_run
    await tx.$executeRaw`UPDATE product_code_seq SET next_run = next_run + 1 WHERE kind = 'CUS'`
    return `CUS-${String(run).padStart(5, '0')}`
  })
}

async function main() {
  // ── 1. Ensure project exists ─────────────────────────────────
  let project = await prisma.project.findUnique({ where: { project_code: '0X202' } })
  if (!project) {
    project = await prisma.project.create({
      data: {
        project_code: '0X202',
        name: 'WH-CO1 อาคารคลังสินค้า สมุทรปราการ',
        state: 'confirmed',
        create_uid: ADMIN_UID,
        write_uid: ADMIN_UID,
      },
    })
    console.log('✓ Project created: 0X202')
  } else {
    console.log('  Project already exists: 0X202')
  }

  // ── 2. Parse Assembly List ────────────────────────────────────
  const wb1 = XLSX.readFile(path.join(DOC_DIR, '2. WH-CO1 Assembly List List Rev.0.xls'))
  const asmRows: unknown[][] = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { header: 1, defval: '' })

  // cols: [NO, AssMk, QTY, Name, DrawingNumber, Wt, Area, LENGTH, WIDTH, HEIGHT, QTY_ALL]
  const assemblies: { mark: string; name: string; weight: number; length: number; width: number; height: number }[] = []
  for (const row of asmRows) {
    const r = row as (string | number)[]
    const mark = String(r[1] ?? '').trim()
    if (!mark.startsWith('WH-')) continue
    assemblies.push({
      mark,
      name: String(r[3] ?? '').trim(),
      weight: Number(r[5]) || 0,
      length: Number(r[7]) || 0,
      width: Number(r[8]) || 0,
      height: Number(r[9]) || 0,
    })
  }
  console.log(`\nParsed ${assemblies.length} assemblies from Assembly List`)

  // ── 3. Parse Assembly Part List into groups ───────────────────
  const wb2 = XLSX.readFile(path.join(DOC_DIR, '3. WH-CO1 Assembly Part List List Rev.0.xls'))
  const partRows: unknown[][] = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1, defval: '' })

  // cols: [empty, part_mark_or_header, qty, profile, length_mm, grade, weight_kg, area_m2]
  const groups = new Map<string, { partMark: string; qty: number; profile: string; length: number; grade: string; weight: number }[]>()
  let currentAsm = assemblies[0]?.mark ?? ''
  groups.set(currentAsm, [])

  for (const row of partRows) {
    const r = row as (string | number)[]
    const col1 = String(r[1] ?? '').trim()
    if (!col1 || col1.startsWith('---')) continue
    if (col1.startsWith('0X202R1WH-')) {
      // Group header — e.g. "0X202R1WH-CO-2" → strip prefix
      currentAsm = col1.replace(/^0X202R1/, '')
      if (!groups.has(currentAsm)) groups.set(currentAsm, [])
      continue
    }
    if (!col1.startsWith('WH-')) continue  // skip non-part rows
    const profile = String(r[3] ?? '').trim()
    if (!profile || profile === 'WEB') continue  // skip header-only rows
    groups.get(currentAsm)?.push({
      partMark: col1,
      qty: Number(r[2]) || 1,
      profile,
      length: Number(r[4]) || 0,
      grade: String(r[5] ?? '').trim(),
      weight: Number(r[6]) || 0,
    })
  }
  console.log(`Parsed ${groups.size} BOM groups from Assembly Part List`)

  // ── 4. Create products + BOMs ─────────────────────────────────
  let createdProducts = 0
  let skippedProducts = 0
  let totalBomLines = 0

  for (const asm of assemblies) {
    // Idempotency: skip if product with this mark_number + project already exists
    const existing = await prisma.products.findFirst({
      where: { mark_number: asm.mark, project_id: project.id },
      select: { id: true },
    })
    if (existing) { skippedProducts++; continue }

    const type = markType(asm.mark)
    const prefix = TEKLA_TO_PREFIX[type] ?? null

    const productCode = await nextProductCode()
    const product = await prisma.products.create({
      data: {
        product_code: productCode,
        name: `${asm.mark} ${asm.name}`,
        categ_id: CATEG_MAIN_STRUCTURES,
        product_type: 'custom',
        project_id: project.id,
        mark_prefix: prefix,
        mark_number: asm.mark,
        state: 'draft',
        attributes: {
          weight_kg: asm.weight,
          product_length: asm.length,
          product_width: asm.width,
          product_height: asm.height,
          source: '0X202',
        },
        create_uid: ADMIN_UID,
        write_uid: ADMIN_UID,
      },
    })

    // BOM header
    const bom = await prisma.product_bom.create({
      data: {
        product_id: product.id,
        bom_type: 'normal',
        bom_view: 'eBOM',
        state: 'draft',
        product_qty: 1,
        product_uom_id: UOM_EACH,
        project_id: project.id,
        create_uid: ADMIN_UID,
        write_uid: ADMIN_UID,
      },
    })

    // BOM lines
    const parts = groups.get(asm.mark) ?? []
    let seq = 10
    for (const part of parts) {
      if (!part.profile) continue
      const matId = await getOrCreateMaterial(part.profile, part.grade)
      await prisma.product_bom_line.create({
        data: {
          bom_id: bom.id,
          sequence: seq,
          material_id: matId,
          product_qty: part.qty,
          product_uom_id: UOM_EACH,
          part_mark: part.partMark,
          profile: part.profile,
          grade: part.grade,
          length_mm: part.length || null,
          weight_per_unit_kg: part.weight || null,
        },
      })
      seq += 10
      totalBomLines++
    }

    createdProducts++
    if (createdProducts % 10 === 0) process.stdout.write('.')
  }

  console.log(`\n\n✅ Import 0X202 complete`)
  console.log(`   Products created: ${createdProducts} (skipped: ${skippedProducts})`)
  console.log(`   BOM lines created: ${totalBomLines}`)
  console.log(`   Materials in cache: ${materialCache.size} (new + existing)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
