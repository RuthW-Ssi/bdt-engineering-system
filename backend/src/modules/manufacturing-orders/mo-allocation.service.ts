import { Injectable } from '@nestjs/common'
import { MoStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/** Statuses that still consume assembly allocation (P15). Only CANCELLED returns qty. */
export const ALLOCATING_STATUSES: MoStatus[] = ['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'DONE']

export interface AllocationEntry {
  mo_code: string
  qty: number
}

/**
 * Shared allocation + mark-prefix-resolution logic, reused by:
 *  - ManufacturingOrderService  (qty validation P13, assemblies tab)
 *  - mark-prefix `with-pending-count` (T-MO.03)
 *  - boms `bom-assemblies?mark_prefix_id` (T-MO.04)
 *
 * remaining(assembly) = bom_assembly.qty − Σ(allocated qty on non-CANCELLED MOs).
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
    const agg = await this.prisma.mo_assembly_line.aggregate({
      _sum: { qty: true },
      where: {
        bom_assembly_id: bomAssemblyId,
        mo: { status: { in: ALLOCATING_STATUSES } },
        ...(excludeMoId ? { mo_id: { not: excludeMoId } } : {}),
      },
    })
    return Number(agg._sum.qty ?? 0)
  }

  async allocationBreakdown(bomAssemblyId: number): Promise<AllocationEntry[]> {
    const lines = await this.prisma.mo_assembly_line.findMany({
      where: { bom_assembly_id: bomAssemblyId, mo: { status: { in: ALLOCATING_STATUSES } } },
      include: { mo: { select: { mo_code: true } } },
      orderBy: { mo_id: 'asc' },
    })
    return lines.map((l) => ({ mo_code: l.mo.mo_code, qty: Number(l.qty) }))
  }

  /**
   * Latest bom_dispatch per (project, zone, sub_zone) with a computed version
   * number (1-based by upload order). Each BOM upload creates a new dispatch;
   * older ones are superseded. Returns Map<latestDispatchId, {version, total}>.
   */
  async latestDispatchMap(): Promise<Map<number, { version: number; total: number; uploaded_at: Date }>> {
    const dispatches = await this.prisma.bom_dispatch.findMany({
      select: { id: true, project_id: true, zone_id: true, sub_zone_id: true, uploaded_at: true },
      orderBy: [{ uploaded_at: 'asc' }, { id: 'asc' }], // ascending → upload order = version index
    })
    const groups = new Map<string, { id: number; uploaded_at: Date }[]>()
    for (const d of dispatches) {
      const key = `${d.project_id}/${d.zone_id}/${d.sub_zone_id ?? 'null'}`
      const arr = groups.get(key) ?? []
      arr.push({ id: d.id, uploaded_at: d.uploaded_at })
      groups.set(key, arr)
    }
    const map = new Map<number, { version: number; total: number; uploaded_at: Date }>()
    for (const arr of groups.values()) {
      const total = arr.length
      const latest = arr[arr.length - 1] // ascending → last = newest
      map.set(latest.id, { version: total, total, uploaded_at: latest.uploaded_at })
    }
    return map
  }

  /** Map<bom_assembly_id, allocatedQty> across all non-CANCELLED MOs (one query). */
  async allocationMap(): Promise<Map<number, number>> {
    const grouped = await this.prisma.mo_assembly_line.groupBy({
      by: ['bom_assembly_id'],
      _sum: { qty: true },
      where: { mo: { status: { in: ALLOCATING_STATUSES } } },
    })
    return new Map(grouped.map((g) => [g.bom_assembly_id, Number(g._sum.qty ?? 0)]))
  }

  /** Map<bom_assembly_id, AllocationEntry[]> for tooltip breakdowns (one query). */
  async allocationBreakdownMap(): Promise<Map<number, AllocationEntry[]>> {
    const lines = await this.prisma.mo_assembly_line.findMany({
      where: { mo: { status: { in: ALLOCATING_STATUSES } } },
      include: { mo: { select: { mo_code: true } } },
      orderBy: { mo_id: 'asc' },
    })
    const map = new Map<number, AllocationEntry[]>()
    for (const l of lines) {
      const arr = map.get(l.bom_assembly_id) ?? []
      arr.push({ mo_code: l.mo.mo_code, qty: Number(l.qty) })
      map.set(l.bom_assembly_id, arr)
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
