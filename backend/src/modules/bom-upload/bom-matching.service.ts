import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

type Tx = Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export type MatchStatus = 'MATCHED_STANDARD' | 'MATCHED_CUSTOM' | 'AUTO_CREATED'

export interface MatchResult {
  product_id: number
  match_status: MatchStatus
}

@Injectable()
export class BomMatchingService {
  constructor(private readonly prisma: PrismaService) {}

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
