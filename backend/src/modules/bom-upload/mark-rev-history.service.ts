import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MarkAliasService } from '../mark-rename/mark-alias.service'
import { aliasesOf, aliasWhere } from '../mark-rename/mark-alias'
import { markDiff, partLine, snapshot, type MarkDiff, type MarkSnapshot, type RevSource } from './mark-rev'
import { uploadNumbersOf } from './upload-number'

export interface MarkRevEntry {
  rev: number; mark: string; renamed_from: string | null; rev_source: RevSource | null; dn_status: string | null
  upload_no: number | null; dispatch_id: number; uploaded_at: string; uploaded_by: string
  first: boolean; values: MarkSnapshot | null; diff: MarkDiff | null
}
export interface MarkRevHistory { assembly_id: number; mark: string; current_rev: number; entries: MarkRevEntry[] }
export interface HistRow { assembly_mark: string; dispatch_id: number; rev: number; rev_source: string | null; dn_status: string | null; snap: MarkSnapshot; uploaded_at: Date; uploaded_by: string }

/** One entry per rev (or rename) — the first row of each, diffed against the last row before it. Newest first. */
export function revEntries(rows: HistRow[], uploadNo: Map<number, number>): MarkRevEntry[] {
  const out: MarkRevEntry[] = []
  rows.forEach((r, i) => {
    const prev = rows[i - 1]
    if (prev && prev.rev === r.rev && prev.assembly_mark === r.assembly_mark) return
    out.push({
      rev: r.rev, mark: r.assembly_mark, renamed_from: prev && prev.assembly_mark !== r.assembly_mark ? prev.assembly_mark : null,
      rev_source: r.rev_source as RevSource | null, dn_status: r.dn_status, upload_no: uploadNo.get(r.dispatch_id) ?? null,
      dispatch_id: r.dispatch_id, uploaded_at: r.uploaded_at.toISOString(), uploaded_by: r.uploaded_by,
      first: !prev, values: prev ? null : r.snap, diff: prev ? markDiff(prev.snap, r.snap) : null,
    })
  })
  return out.reverse()
}

const HIST_SELECT = {
  assembly_mark: true, dispatch_id: true, rev: true, rev_source: true, dn_status: true,
  name: true, qty: true, length_mm: true, width_mm: true, height_mm: true, weight_kg: true, surface_area_m2: true,
  assembly_parts: { select: { qty: true, part: { select: { part_mark: true, description: true, profile: true, grade: true, length_mm: true, weight_kg: true } } } },
  dispatch: { select: { uploaded_at: true, create_user: { select: { name: true } } } },
} as const

/** A mark's BOM Rev history (2026-10-26, spec decision 7): every rev with field
 *  old → new, parts added / removed / changed, renames, "กำหนด rev เอง", and
 *  which upload / when / who — History standard. Follows confirmed renames. */
@Injectable()
export class MarkRevHistoryService {
  constructor(private readonly prisma: PrismaService, private readonly alias: MarkAliasService) {}

  async history(assemblyId: number): Promise<MarkRevHistory> {
    const own = await this.prisma.bom_assembly.findUnique({
      where: { id: assemblyId },
      select: { id: true, assembly_mark: true, dispatch_id: true, rev: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
    })
    if (!own) throw new NotFoundException('ไม่พบ mark นี้')
    const scope = own.dispatch
    const aliases = aliasesOf(await this.alias.renamesFor(scope), 'ASSEMBLY', own.assembly_mark, own.dispatch_id)
    const rows = await this.prisma.bom_assembly.findMany({
      where: { AND: [aliasWhere(aliases, 'assembly_mark'), { dispatch: { ...scope, source: 'BOM_UPLOAD' } }, { dispatch_id: { lte: own.dispatch_id } }] },
      orderBy: { dispatch_id: 'asc' },
      select: HIST_SELECT,
    })
    const hist: HistRow[] = rows.map(r => ({
      assembly_mark: r.assembly_mark, dispatch_id: r.dispatch_id, rev: r.rev, rev_source: r.rev_source, dn_status: r.dn_status,
      snap: snapshot(r, r.assembly_parts.map(ap => partLine(ap.part, ap.qty))),
      uploaded_at: r.dispatch.uploaded_at, uploaded_by: r.dispatch.create_user.name,
    }))
    const nos = await uploadNumbersOf(this.prisma, [...new Set(hist.map(h => h.dispatch_id))])
    return { assembly_id: own.id, mark: own.assembly_mark, current_rev: own.rev, entries: revEntries(hist, nos) }
  }
}
