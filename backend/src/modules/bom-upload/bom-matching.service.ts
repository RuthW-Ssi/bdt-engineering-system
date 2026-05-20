import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { parseProfile } from '../../libs/products/profile-parser'

type Tx = Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export type MatchStatus = 'MATCHED_STANDARD' | 'MATCHED_CUSTOM' | 'AUTO_CREATED'

export interface MatchResult {
  product_id: number
  match_status: MatchStatus
}

@Injectable()
export class BomMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  // Match assemblies against standard products by name only.
  // Unmatched rows are left with null product_id / match_status.
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

  // Match parts against standard products by name, then by profile+grade variant.
  // Unmatched rows are left with null product_id / match_status.
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

    // Profile+grade secondary match for parts not found by name
    const profileMap = new Map<string, number>()
    const needProfile = rows.filter(r => !nameMap.has(normalize(r.part_mark)) && r.profile)
    if (needProfile.length) {
      const stdIndex = await this.buildStandardPartIndex(tx)
      for (const row of needProfile) {
        const parsed = parseProfile(row.profile!)
        const grade = (row.grade ?? '').toUpperCase()

        // Exact profile+grade match first
        const exactKey = parsed.profile ? `${parsed.profile}:${grade}` : null
        if (exactKey && stdIndex.has(exactKey)) {
          profileMap.set(normalize(row.part_mark), stdIndex.get(exactKey)!)
          continue
        }

        // Plate fallback: match by thickness only — PL is ordered as stock width and cut on-site
        if (parsed.shape === 'PL' && parsed.thickness_mm != null) {
          const plKey = `PL${parsed.thickness_mm}:${grade}`
          if (stdIndex.has(plKey)) profileMap.set(normalize(row.part_mark), stdIndex.get(plKey)!)
        }
      }
    }

    const matched = rows
      .map(row => {
        const k = normalize(row.part_mark)
        const productId = nameMap.get(k) ?? profileMap.get(k)
        return productId ? { id: row.id, product_id: productId } : null
      })
      .filter((r): r is { id: number; product_id: number } => r !== null)

    if (!matched.length) return

    await Promise.all(matched.map(r =>
      tx.bom_part.update({
        where: { id: r.id },
        data: { product_id: r.product_id, match_status: 'MATCHED_STANDARD', write_uid: uid },
      }),
    ))
  }

  // Downgrade any MATCHED_STANDARD assembly whose parts are not all MATCHED_STANDARD.
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

  private async buildStandardPartIndex(tx: Tx): Promise<Map<string, number>> {
    const rows = await tx.$queryRaw<Array<{ id: number; variant_attributes: unknown }>>`
      SELECT id, variant_attributes FROM products
      WHERE product_type = 'standard'
        AND product_kind = 'part'
        AND active = true
        AND variant_attributes IS NOT NULL
    `
    const map = new Map<string, number>()
    for (const r of rows) {
      const va = r.variant_attributes as Record<string, unknown>
      if (!va?.profile || !va?.grade) continue
      const profile = String(va.profile)
      const grade = String(va.grade).toUpperCase()

      // Exact key: e.g. "L100x100x10:SS400", "H300x300x10x15:SS400"
      map.set(`${profile}:${grade}`, r.id)

      // PL thickness-only key: e.g. "PL10:HY370" — plates are cut from stock width
      if (profile.startsWith('PL') && va.thickness_mm != null) {
        const plKey = `PL${va.thickness_mm}:${grade}`
        if (!map.has(plKey)) map.set(plKey, r.id)
      }
    }
    return map
  }
}
