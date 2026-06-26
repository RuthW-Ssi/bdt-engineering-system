import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ProductCodeGenerator } from '../products/product-code.generator'

type Tx = Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export type MatchStatus = 'MATCHED_STANDARD' | 'MATCHED_CUSTOM'

export interface MatchResult {
  product_id: number
  match_status: MatchStatus
}

const DEFAULT_CATEG_ID = 24 // MS000 — Main Structures

@Injectable()
export class BomMatchingService {
  private readonly logger = new Logger(BomMatchingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: ProductCodeGenerator,
  ) {}

  async matchAssemblies(
    tx: Tx,
    rows: Array<{ id: number; assembly_mark: string; name: string; weight_kg?: number | null; surface_area_m2?: number | null }>,
    _projectId: number,
    uid: number,
  ): Promise<void> {
    if (!rows.length) return
    const normalize = (s: string) => s.trim().toUpperCase()
    const uniqueNames = [...new Set(rows.map(r => normalize(r.name ?? '')))]

    const candidates = await tx.$queryRaw<Array<{ id: number; name: string }>>`
      SELECT id, name FROM products
      WHERE product_kind = 'assembly'
        AND product_type = 'standard'
        AND active = true
        AND UPPER(TRIM(name)) = ANY(${uniqueNames}::text[])
    `

    const nameMap = new Map<string, number>()
    for (const c of candidates) {
      const key = normalize(c.name)
      if (!nameMap.has(key)) nameMap.set(key, c.id)
    }

    const matched = rows.filter(r => nameMap.has(normalize(r.name ?? '')))
    if (!matched.length) return

    await Promise.all(matched.map(row =>
      tx.bom_assembly.update({
        where: { id: row.id },
        data: { product_id: nameMap.get(normalize(row.name ?? ''))!, match_status: 'MATCHED_STANDARD', write_uid: uid },
      }),
    ))
  }

  async matchParts(
    tx: Tx,
    rows: Array<{ id: number; part_mark: string; profile?: string | null; grade?: string | null; weight_kg?: number | null; length_mm?: number | null }>,
    _projectId: number,
    uid: number,
  ): Promise<void> {
    if (!rows.length) return
    const normalize = (s: string) => s.trim().toUpperCase()
    const uniqueMarks = [...new Set(rows.map(r => normalize(r.part_mark)))]

    const candidates = await tx.$queryRaw<Array<{ id: number; name: string }>>`
      SELECT id, name FROM products
      WHERE product_kind = 'part'
        AND product_type = 'standard'
        AND active = true
        AND UPPER(TRIM(name)) = ANY(${uniqueMarks}::text[])
    `

    const nameMap = new Map<string, number>()
    for (const c of candidates) {
      const key = normalize(c.name)
      if (!nameMap.has(key)) nameMap.set(key, c.id)
    }

    const matched = rows.filter(r => nameMap.has(normalize(r.part_mark)))
    if (!matched.length) return

    await Promise.all(matched.map(row =>
      tx.bom_part.update({
        where: { id: row.id },
        data: { product_id: nameMap.get(normalize(row.part_mark))!, match_status: 'MATCHED_STANDARD', write_uid: uid },
      }),
    ))
  }

  async autoCreateCustomProducts(
    dispatchId: number,
    projectId: number,
    zoneId: number,
    uid: number,
  ): Promise<number> {
    const unmatched = await this.prisma.bom_assembly.findMany({
      where: { dispatch_id: dispatchId, match_status: null },
      select: {
        id: true, assembly_mark: true, name: true,
        weight_kg: true, surface_area_m2: true,
        length_mm: true, width_mm: true, height_mm: true,
      },
    })

    if (!unmatched.length) return 0

    // Batch-load library entries matching assembly names (case-insensitive)
    const assemblyNames = [...new Set(unmatched.map(a => a.name?.trim()).filter(Boolean))] as string[]
    const libraryEntries = await this.prisma.product_library.findMany({
      where: { active: true, name: { in: assemblyNames, mode: 'insensitive' } },
      select: { id: true, name: true },
    })
    const libraryByName = new Map(libraryEntries.map(e => [e.name.trim().toLowerCase(), e]))

    // Fetch project_code and zone_code once for sMark construction
    const [proj, zone] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId }, select: { project_code: true } }),
      this.prisma.project_zone.findUnique({ where: { id: zoneId }, select: { code: true } }),
    ])
    const projectCode = proj?.project_code ?? ''
    const zoneCode = zone?.code ?? ''

    let created = 0
    let skipped = 0
    for (const asm of unmatched) {
      const nameKey = asm.name?.trim().toLowerCase() ?? ''
      const libEntry = libraryByName.get(nameKey)
      if (!libEntry) {
        this.logger.warn(`autoCreate: skip ${asm.assembly_mark} — '${asm.name}' not in library`)
        skipped++
        continue
      }

      const { prefix, number } = parseAssemblyMark(asm.assembly_mark)

      const segment = asm.assembly_mark.includes('-') ? asm.assembly_mark.split('-').pop()! : asm.assembly_mark
      const oMark = asm.assembly_mark
      const sMark = [projectCode, zoneCode, segment].filter(Boolean).join('-')

      const attrs: Record<string, unknown> = { oMark, sMark }
      if (asm.weight_kg)       attrs.weight_kg = Number(asm.weight_kg)
      if (asm.surface_area_m2) attrs.area_m2   = Number(asm.surface_area_m2)
      if (asm.length_mm)       attrs.length_mm = Number(asm.length_mm)
      if (asm.width_mm)        attrs.width_mm  = Number(asm.width_mm)
      if (asm.height_mm)       attrs.height_mm = Number(asm.height_mm)

      await this.prisma.mark_prefix_master.upsert({
        where: { code: prefix },
        update: {},
        create: { code: prefix, label: prefix, category: 'main_structure', part_type_code: 'm' },
      })

      // Reuse existing product if same mark already exists in this project/zone
      let product = await this.prisma.products.findFirst({
        where: { product_type: 'custom', project_id: projectId, erection_zone_id: zoneId, mark_prefix: prefix, mark_number: number },
        select: { id: true, product_code: true },
      })

      if (!product) {
        const productCode = await this.codeGen.generate('CUS')
        product = await this.prisma.products.create({
          data: {
            product_code: productCode,
            name: libEntry.name,
            library_id: libEntry.id,
            categ_id: DEFAULT_CATEG_ID,
            product_type: 'custom',
            product_kind: 'assembly',
            project_id: projectId,
            erection_zone_id: zoneId,
            mark_prefix: prefix,
            mark_number: number,
            attributes: attrs as import('@prisma/client').Prisma.InputJsonValue,
            state: 'draft',
            create_uid: uid,
            write_uid: uid,
          },
          select: { id: true, product_code: true },
        })
      }

      await this.prisma.bom_assembly.update({
        where: { id: asm.id },
        data: { product_id: product.id, match_status: 'MATCHED_CUSTOM', write_uid: uid },
      })

      this.logger.log(`autoCreate: ${asm.assembly_mark} → ${product.product_code} (lib: ${libEntry.name})`)
      created++
    }

    this.logger.log(`autoCreate: created ${created}, skipped ${skipped} for dispatch ${dispatchId}`)
    return created
  }

  async enforceStandardIntegrity(tx: Tx, dispatchId: number, uid: number): Promise<void> {
    const violated = await tx.$queryRaw<Array<{ id: number }>>`
      SELECT DISTINCT ba.id
      FROM bom_assembly ba
      JOIN bom_assembly_part bap ON bap.assembly_id = ba.id
      JOIN bom_part bp ON bp.id = bap.part_id
      WHERE ba.dispatch_id = ${dispatchId}
        AND ba.match_status = 'MATCHED_STANDARD'
        AND bp.match_status != 'MATCHED_STANDARD'
    `
    if (!violated.length) return
    const ids = violated.map(r => r.id)
    await tx.$executeRaw`
      UPDATE bom_assembly
      SET match_status = NULL, product_id = NULL, write_uid = ${uid}
      WHERE id = ANY(${ids}::int[])
    `
  }
}

function parseAssemblyMark(mark: string): { prefix: string; number: string } {
  // Format: optional {text}-{digits}{LETTERS}{digits}, e.g. "TH-2CO1" → prefix="CO", number="1"
  const segment = mark.includes('-') ? mark.split('-').pop()! : mark
  const m = segment.match(/^\d*([A-Za-z]+)(\d+.*)$/)
  if (!m) return { prefix: mark.toUpperCase(), number: '' }
  return { prefix: m[1].toUpperCase(), number: m[2] }
}
