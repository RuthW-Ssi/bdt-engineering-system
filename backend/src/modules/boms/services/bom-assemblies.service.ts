import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MoAllocationService } from '../../manufacturing-orders/mo-allocation.service'

type GroupDim = 'project' | 'zone' | 'subzone'

export interface AssemblyPickerItem {
  id: number
  assembly_mark: string
  name: string | null
  mark_prefix: string | null
  project: string | null
  zone: string | null
  sub_zone: string | null
  bom_version: number // BOM upload version of this assembly's dispatch (latest)
  total: number
  allocated: number
  remaining: number
  allocation_breakdown: { mo_code: string; qty: number }[]
}

/**
 * T-MO.04 · MO form Section 2 data.
 * Lists bom_assembly rows resolving to a mark prefix (P10), each with
 * remaining = qty − Σ(allocated) and a per-MO allocation breakdown.
 * pending_mo (default true) hides fully-allocated assemblies (P16).
 */
@Injectable()
export class BomAssembliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alloc: MoAllocationService,
  ) {}

  async byMarkPrefix(opts: {
    mark_prefix_id?: string
    pending_mo?: boolean
    group_by?: string
  }) {
    const pendingOnly = opts.pending_mo !== false
    const dims = this.parseGroupBy(opts.group_by)

    const prefixes = await this.prisma.mark_prefix_master.findMany({ select: { code: true } })
    const codes = prefixes.map((p) => p.code).sort((a, b) => b.length - a.length)

    // only the latest BOM version per project/zone/sub-zone (supersede older uploads)
    const latestMap = await this.alloc.latestDispatchMap()

    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { dispatch_id: { in: [...latestMap.keys()] } },
      include: {
        product: { select: { mark_prefix: true } },
        dispatch: { include: { project: true, zone: true, sub_zone: true } },
      },
      orderBy: { assembly_mark: 'asc' },
    })
    const allocMap = await this.alloc.allocationMap()
    const breakdownMap = await this.alloc.allocationBreakdownMap()

    const items: AssemblyPickerItem[] = []
    for (const a of assemblies) {
      const resolved = this.alloc.resolvePrefixCode(a, codes)
      if (opts.mark_prefix_id && resolved !== opts.mark_prefix_id) continue

      const total = Number(a.qty ?? 0)
      const allocated = allocMap.get(a.id) ?? 0
      const remaining = total - allocated
      if (pendingOnly && remaining <= 0) continue

      items.push({
        id: a.id,
        assembly_mark: a.assembly_mark,
        name: a.name,
        mark_prefix: resolved,
        project: a.dispatch.project?.name ?? null,
        zone: a.dispatch.zone?.label ?? null,
        sub_zone: a.dispatch.sub_zone?.name ?? null,
        bom_version: latestMap.get(a.dispatch_id)?.version ?? 1,
        total,
        allocated,
        remaining,
        allocation_breakdown: breakdownMap.get(a.id) ?? [],
      })
    }

    return {
      mark_prefix: opts.mark_prefix_id ?? null,
      total: items.length,
      groups: dims.length
        ? this.group(items, dims)
        : [{ key: null, label: 'All', bom_version: items[0]?.bom_version ?? null, items }],
    }
  }

  private parseGroupBy(raw?: string): GroupDim[] {
    if (!raw) return []
    const valid: GroupDim[] = ['project', 'zone', 'subzone']
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is GroupDim => (valid as string[]).includes(s))
  }

  private group(items: AssemblyPickerItem[], dims: GroupDim[]) {
    const buckets = new Map<string, { key: Record<string, string | null>; label: string; bom_version: number | null; items: AssemblyPickerItem[] }>()
    for (const item of items) {
      const key: Record<string, string | null> = {}
      for (const d of dims) {
        key[d] = d === 'project' ? item.project : d === 'zone' ? item.zone : item.sub_zone
      }
      const label = dims.map((d) => key[d] ?? '—').join(' · ')
      const bucketKey = JSON.stringify(key)
      // one (project/zone/sub-zone) group = one dispatch → one BOM version
      const bucket = buckets.get(bucketKey) ?? { key, label, bom_version: item.bom_version, items: [] }
      bucket.items.push(item)
      buckets.set(bucketKey, bucket)
    }
    return [...buckets.values()]
  }
}
