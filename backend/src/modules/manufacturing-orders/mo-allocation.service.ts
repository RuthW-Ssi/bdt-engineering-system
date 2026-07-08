import { Injectable } from '@nestjs/common'
import { MoStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/** Statuses that still consume assembly allocation (P15). Only CANCELLED returns qty. */
export const ALLOCATING_STATUSES: MoStatus[] = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'DONE']

export interface AllocationEntry {
  mo_code: string
  qty: number
}

type DispatchGroup = { project_id: number; zone_id: number; sub_zone_id: number | null }

/** Composite key for "same physical mark" across bom_assembly row history (P2 full-slot-replace
 *  gives every re-uploaded mark a brand-new row id, even when content is unchanged). */
function markGroupKey(mark: string, dispatch: DispatchGroup): string {
  return `${mark}|${dispatch.project_id}|${dispatch.zone_id}|${dispatch.sub_zone_id ?? 'null'}`
}

/**
 * Shared allocation + mark-prefix-resolution logic, reused by:
 *  - ManufacturingOrderService  (qty validation P13, assemblies tab)
 *  - mark-prefix `with-pending-count` (T-MO.03) — allocation lookup + prefix resolution
 *  - boms `bom-assemblies?mark_prefix_id` (T-MO.04) — allocation lookup + prefix resolution
 *
 * remaining(assembly) = bom_assembly.qty − Σ(allocated qty on non-CANCELLED MOs).
 * Dispatch scoping (via status='ACTIVE' filtering) no longer uses this class.
 *
 * Allocation is resolved by (assembly_mark, project_id, zone_id, sub_zone_id) — the physical
 * mark's identity — not by the raw bom_assembly_id FK. Task 2's full-slot-replace upload path
 * creates a brand-new bom_assembly row (new id) for EVERY mark on every re-upload, even marks
 * whose content is unchanged, flipping the old row to INACTIVE. Existing mo_assembly_line rows
 * still point at the old (now-INACTIVE) id, so a raw-FK lookup would report 0 allocated against
 * the new row even though real MOs/WOs already exist for that mark — resolving by mark+group
 * instead lets allocation survive across that re-point.
 */
@Injectable()
export class MoAllocationService {
  constructor(private readonly prisma: PrismaService) {}

  async remainingFor(bomAssemblyId: number, excludeMoId?: number): Promise<number> {
    const assembly = await this.prisma.bom_assembly.findUnique({ where: { id: bomAssemblyId } })
    const total = Number(assembly?.qty ?? 0)
    return total - (await this.allocatedFor(bomAssemblyId, excludeMoId))
  }

  async allocatedFor(bomAssemblyId: number, excludeMoId?: number): Promise<number> {
    const assembly = await this.prisma.bom_assembly.findUnique({
      where: { id: bomAssemblyId },
      select: { assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
    })
    if (!assembly) return 0
    const agg = await this.prisma.mo_assembly_line.aggregate({
      _sum: { qty: true },
      where: {
        bom_assembly: {
          assembly_mark: assembly.assembly_mark,
          dispatch: {
            project_id: assembly.dispatch.project_id,
            zone_id: assembly.dispatch.zone_id,
            sub_zone_id: assembly.dispatch.sub_zone_id,
          },
        },
        mo: { status: { in: ALLOCATING_STATUSES } },
        ...(excludeMoId ? { mo_id: { not: excludeMoId } } : {}),
      },
    })
    return Number(agg._sum.qty ?? 0)
  }

  async allocationBreakdown(bomAssemblyId: number): Promise<AllocationEntry[]> {
    const assembly = await this.prisma.bom_assembly.findUnique({
      where: { id: bomAssemblyId },
      select: { assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
    })
    if (!assembly) return []
    const lines = await this.prisma.mo_assembly_line.findMany({
      where: {
        bom_assembly: {
          assembly_mark: assembly.assembly_mark,
          dispatch: {
            project_id: assembly.dispatch.project_id,
            zone_id: assembly.dispatch.zone_id,
            sub_zone_id: assembly.dispatch.sub_zone_id,
          },
        },
        mo: { status: { in: ALLOCATING_STATUSES } },
      },
      include: { mo: { select: { mo_code: true } } },
      orderBy: { mo_id: 'asc' },
    })
    return lines.map((l) => ({ mo_code: l.mo.mo_code, qty: Number(l.qty) }))
  }

  /**
   * Map<bom_assembly_id, allocatedQty> across all non-CANCELLED MOs, keyed by currently-ACTIVE
   * bom_assembly.id (the only ids any caller will ever `.get()`), but the value sums allocation
   * across the mark's FULL row history (active + inactive) — see class doc for why.
   */
  async allocationMap(): Promise<Map<number, number>> {
    const lines = await this.prisma.mo_assembly_line.findMany({
      where: { mo: { status: { in: ALLOCATING_STATUSES } } },
      select: {
        qty: true,
        bom_assembly: {
          select: { assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
        },
      },
    })
    const sumByMarkGroup = new Map<string, number>()
    for (const l of lines) {
      const key = markGroupKey(l.bom_assembly.assembly_mark, l.bom_assembly.dispatch)
      sumByMarkGroup.set(key, (sumByMarkGroup.get(key) ?? 0) + Number(l.qty))
    }

    const activeAssemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
    })
    const map = new Map<number, number>()
    for (const a of activeAssemblies) {
      const total = sumByMarkGroup.get(markGroupKey(a.assembly_mark, a.dispatch))
      if (total) map.set(a.id, total)
    }
    return map
  }

  /**
   * Map<bom_assembly_id, AllocationEntry[]> for tooltip breakdowns, keyed by currently-ACTIVE
   * bom_assembly.id — same mark+group broadcast pattern as allocationMap() above.
   */
  async allocationBreakdownMap(): Promise<Map<number, AllocationEntry[]>> {
    const lines = await this.prisma.mo_assembly_line.findMany({
      where: { mo: { status: { in: ALLOCATING_STATUSES } } },
      include: {
        mo: { select: { mo_code: true } },
        bom_assembly: {
          select: { assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
        },
      },
      orderBy: { mo_id: 'asc' },
    })
    const entriesByMarkGroup = new Map<string, AllocationEntry[]>()
    for (const l of lines) {
      const key = markGroupKey(l.bom_assembly.assembly_mark, l.bom_assembly.dispatch)
      const arr = entriesByMarkGroup.get(key) ?? []
      arr.push({ mo_code: l.mo.mo_code, qty: Number(l.qty) })
      entriesByMarkGroup.set(key, arr)
    }

    const activeAssemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
    })
    const map = new Map<number, AllocationEntry[]>()
    for (const a of activeAssemblies) {
      const entries = entriesByMarkGroup.get(markGroupKey(a.assembly_mark, a.dispatch))
      if (entries) map.set(a.id, entries)
    }
    return map
  }

  /**
   * P10 · resolve an assembly's mark prefix code:
   *   1) product link  (bom_assembly.product.mark_prefix)
   *   2) fallback: parse assembly_mark — first alpha token matching a known code
   * `knownCodes` should be passed sorted longest-first for greedy startsWith.
   */
  resolvePrefixCode(
    assembly: { assembly_mark: string; product?: { mark_prefix: string | null } | null },
    knownCodes: string[],
  ): string | null {
    const fromProduct = assembly.product?.mark_prefix
    if (fromProduct) return fromProduct

    const mark = (assembly.assembly_mark ?? '').toUpperCase()
    // tokens split on any non-alphanumeric; an exact alpha token match wins first
    const tokens = mark.split(/[^A-Z0-9]+/).filter(Boolean)
    for (const code of knownCodes) {
      const up = code.toUpperCase()
      if (tokens.includes(up)) return code
    }
    // then greedy startsWith on the whole mark (longest code first)
    for (const code of knownCodes) {
      if (mark.startsWith(code.toUpperCase())) return code
    }
    return null
  }
}
