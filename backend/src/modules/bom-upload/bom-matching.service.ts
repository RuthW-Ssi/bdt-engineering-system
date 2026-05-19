import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { parseProfile } from '../../libs/products/profile-parser'
import type { Prisma } from '@prisma/client'

type Tx = Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export type MatchStatus = 'MATCHED_STANDARD' | 'MATCHED_CUSTOM' | 'AUTO_CREATED'

export interface MatchResult {
  product_id: number
  match_status: MatchStatus
}

@Injectable()
export class BomMatchingService {
  private defaultCategIdCache: number | null = null

  constructor(private readonly prisma: PrismaService) {}

  // T-BE-1.4: Batch-match assembly rows.
  // D6: CUSTOM(project, by assembly_mark) → STANDARD(by assembly name) → AUTO_CREATED
  async matchAssemblies(
    tx: Tx,
    rows: Array<{ id: number; assembly_mark: string; name: string; weight_kg?: number | null; surface_area_m2?: number | null }>,
    projectId: number,
    uid: number,
  ): Promise<void> {
    if (!rows.length) return
    const normalize = (s: string) => s.trim().toUpperCase()

    const uniqueMarks = [...new Set(rows.map(r => normalize(r.assembly_mark)))]
    const uniqueNames = [...new Set(rows.map(r => normalize(r.name ?? '')))]

    // Two separate queries: custom by assembly_mark, standard by assembly category name
    const [customCandidates, standardCandidates] = await Promise.all([
      tx.$queryRaw<Array<{ id: number; name: string }>>`
        SELECT id, name FROM products
        WHERE product_kind = 'assembly'
          AND product_type = 'custom'
          AND active = true
          AND project_id = ${projectId}
          AND UPPER(TRIM(name)) = ANY(${uniqueMarks}::text[])
      `,
      tx.$queryRaw<Array<{ id: number; name: string }>>`
        SELECT id, name FROM products
        WHERE product_kind = 'assembly'
          AND product_type = 'standard'
          AND active = true
          AND UPPER(TRIM(name)) = ANY(${uniqueNames}::text[])
      `,
    ])

    const customMap = new Map<string, number>()   // normalized assembly_mark → product.id
    const standardMap = new Map<string, number>()  // normalized assembly name → product.id
    for (const c of customCandidates) customMap.set(normalize(c.name), c.id)
    for (const s of standardCandidates) if (!standardMap.has(normalize(s.name))) standardMap.set(normalize(s.name), s.id)

    const rowResults = new Map<number, MatchResult>()  // row.id → result
    const unmatchedRows: typeof rows = []

    for (const row of rows) {
      const markKey = normalize(row.assembly_mark)
      const nameKey = normalize(row.name ?? '')
      if (customMap.has(markKey)) {
        rowResults.set(row.id, { product_id: customMap.get(markKey)!, match_status: 'MATCHED_CUSTOM' })
      } else if (standardMap.has(nameKey)) {
        rowResults.set(row.id, { product_id: standardMap.get(nameKey)!, match_status: 'MATCHED_STANDARD' })
      } else {
        unmatchedRows.push(row)
      }
    }

    // T-BE-1.6: Auto-create one custom product per unmatched unique mark
    if (unmatchedRows.length) {
      const categId = await this.getDefaultCategId(tx)
      const seenMarks = new Map<string, number>() // to deduplicate within same upload
      for (const row of unmatchedRows) {
        const markKey = normalize(row.assembly_mark)
        if (seenMarks.has(markKey)) {
          rowResults.set(row.id, { product_id: seenMarks.get(markKey)!, match_status: 'MATCHED_CUSTOM' })
          continue
        }
        const code = await this.generateCodeWithTx(tx)
        const created = await tx.products.create({
          data: {
            product_code: code,
            name: markKey,
            categ_id: categId,
            product_type: 'custom',
            product_kind: 'assembly',
            project_id: projectId,
            create_uid: uid,
            write_uid: uid,
            attributes: {
              source: 'auto_created_from_bom',
              ...(row.weight_kg != null ? { weight_kg: Number(row.weight_kg) } : {}),
              ...(row.surface_area_m2 != null ? { surface_area_m2: Number(row.surface_area_m2) } : {}),
            },
          },
        })
        seenMarks.set(markKey, created.id)
        rowResults.set(row.id, { product_id: created.id, match_status: 'MATCHED_CUSTOM' })
      }
    }

    await Promise.all(
      rows.map(row => {
        const result = rowResults.get(row.id)
        if (!result) return Promise.resolve()
        return tx.bom_assembly.update({
          where: { id: row.id },
          data: { product_id: result.product_id, match_status: result.match_status, write_uid: uid },
        })
      }),
    )
  }

  // T-BE-1.5: Batch-match part rows. D6: STANDARD → CUSTOM(project) → AUTO_CREATED
  async matchParts(
    tx: Tx,
    rows: Array<{ id: number; part_mark: string; profile?: string | null; grade?: string | null; weight_kg?: number | null; length_mm?: number | null }>,
    projectId: number,
    uid: number,
  ): Promise<void> {
    if (!rows.length) return
    const normalize = (s: string) => s.trim().toUpperCase()
    const uniqueMarks = [...new Set(rows.map(r => normalize(r.part_mark)))]

    const candidates = await tx.$queryRaw<Array<{
      id: number
      name: string
      product_type: string
      project_id: number | null
    }>>`
      SELECT id, name, product_type, project_id
      FROM products
      WHERE product_kind = 'part'
        AND active = true
        AND UPPER(TRIM(name)) = ANY(${uniqueMarks}::text[])
        AND (
          product_type = 'standard'
          OR (product_type = 'custom' AND project_id = ${projectId})
        )
    `

    const standardMap = new Map<string, number>()
    const customMap = new Map<string, number>()
    for (const c of candidates) {
      const key = normalize(c.name)
      if (c.product_type === 'standard' && !standardMap.has(key)) standardMap.set(key, c.id)
      else if (c.product_type === 'custom' && c.project_id === projectId) customMap.set(key, c.id)
    }

    const rowResults = new Map<number, MatchResult>()
    const unmatchedRows: typeof rows = []

    for (const row of rows) {
      const key = normalize(row.part_mark)
      if (standardMap.has(key)) {
        rowResults.set(row.id, { product_id: standardMap.get(key)!, match_status: 'MATCHED_STANDARD' })
      } else if (customMap.has(key)) {
        rowResults.set(row.id, { product_id: customMap.get(key)!, match_status: 'MATCHED_CUSTOM' })
      } else {
        unmatchedRows.push(row)
      }
    }

    if (unmatchedRows.length && unmatchedRows.some(r => r.profile)) {
      const stdIndex = await this.buildStandardPartIndex(tx)
      const stillUnmatched: typeof unmatchedRows = []
      for (const row of unmatchedRows) {
        if (row.profile) {
          const parsed = parseProfile(row.profile)
          const key = parsed.profile
            ? `${parsed.profile}:${(row.grade ?? '').toUpperCase()}`
            : null
          if (key && stdIndex.has(key)) {
            rowResults.set(row.id, { product_id: stdIndex.get(key)!, match_status: 'MATCHED_STANDARD' })
            continue
          }
        }
        stillUnmatched.push(row)
      }
      unmatchedRows.length = 0
      unmatchedRows.push(...stillUnmatched)
    }

    if (unmatchedRows.length) {
      const categId = await this.getDefaultCategId(tx)
      const seenMarks = new Map<string, number>()
      for (const row of unmatchedRows) {
        const markKey = normalize(row.part_mark)
        if (seenMarks.has(markKey)) {
          rowResults.set(row.id, { product_id: seenMarks.get(markKey)!, match_status: 'MATCHED_CUSTOM' })
          continue
        }
        const code = await this.generateCodeWithTx(tx)
        const created = await tx.products.create({
          data: {
            product_code: code,
            name: markKey,
            categ_id: categId,
            product_type: 'custom',
            product_kind: 'part',
            project_id: projectId,
            create_uid: uid,
            write_uid: uid,
            attributes: {
              source: 'auto_created_from_bom',
              ...(row.profile ? { profile: row.profile } : {}),
              ...(row.grade ? { grade: row.grade } : {}),
              ...(row.weight_kg != null ? { weight_kg: Number(row.weight_kg) } : {}),
              ...(row.length_mm != null ? { length_mm: Number(row.length_mm) } : {}),
            },
          },
        })
        seenMarks.set(markKey, created.id)
        rowResults.set(row.id, { product_id: created.id, match_status: 'MATCHED_CUSTOM' })
      }
    }

    await Promise.all(
      rows.map(row => {
        const result = rowResults.get(row.id)
        if (!result) return Promise.resolve()
        return tx.bom_part.update({
          where: { id: row.id },
          data: { product_id: result.product_id, match_status: result.match_status, write_uid: uid },
        })
      }),
    )
  }

  // ─── Helpers ──────────────────────────────────────────────────

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
      if (va?.profile && va?.grade) {
        map.set(`${va.profile}:${String(va.grade).toUpperCase()}`, r.id)
      }
    }
    return map
  }

  private async generateCodeWithTx(tx: Tx): Promise<string> {
    const seq = await tx.$queryRaw<{ next_run: number }[]>`
      SELECT next_run FROM product_code_seq WHERE kind = 'CUS' FOR UPDATE
    `
    const next = seq[0].next_run
    await tx.$executeRaw`
      UPDATE product_code_seq SET next_run = ${next + 1} WHERE kind = 'CUS'
    `
    return `CUS-${next.toString().padStart(5, '0')}`
  }

  private async getDefaultCategId(tx: Tx): Promise<number> {
    if (this.defaultCategIdCache !== null) return this.defaultCategIdCache
    const cat = await tx.product_category.findFirst({
      where: { active: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    if (!cat) throw new Error('No active product_category found — cannot auto-create BOM product')
    this.defaultCategIdCache = cat.id
    return cat.id
  }
}
