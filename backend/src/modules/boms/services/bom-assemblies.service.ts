import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { MoAllocationService } from '../../manufacturing-orders/mo-allocation.service'
import { BomDiffService } from '../../bom-upload/bom-diff.service'

type GroupDim = 'project' | 'zone' | 'subzone'

export interface AssemblyPickerItem {
  id: number
  assembly_mark: string
  name: string | null
  mark_prefix: string | null
  project: string | null
  zone: string | null
  sub_zone: string | null
  project_due_date: string | null    // project.target_handover as YYYY-MM-DD
  zone_end_date: string | null       // project_zone.target_erection_end as YYYY-MM-DD
  sub_zone_due_date: string | null  // sub_zone.due_date as YYYY-MM-DD
  bom_version: string // "revision.minor" label from BomDiffService.computeVersionLabels()
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
    private readonly bomDiff: BomDiffService,
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

    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE' },
      include: {
        product: { select: { mark_prefix: true } },
        dispatch: { include: { project: true, zone: true, sub_zone: true } },
      },
      orderBy: { assembly_mark: 'asc' },
    })
    const versionLabelById = await this.bomDiff.computeVersionLabels([...new Set(assemblies.map((a) => a.dispatch_id))])
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
        project_due_date: a.dispatch.project?.target_handover?.toISOString().slice(0, 10) ?? null,
        zone_end_date: a.dispatch.zone?.target_erection_end?.toISOString().slice(0, 10) ?? null,
        sub_zone_due_date: a.dispatch.sub_zone?.due_date?.toISOString().slice(0, 10) ?? null,
        bom_version: versionLabelById.get(a.dispatch_id) ?? '1.0',
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
        : [{ key: null, label: 'All', bom_version: items[0]?.bom_version ?? null, project_due_date: this.minDate(items.map((i) => i.project_due_date)), zone_end_date: this.minDate(items.map((i) => i.zone_end_date)), sub_zone_due_date: this.minDate(items.map((i) => i.sub_zone_due_date)), items }],
    }
  }

  private minDate(dates: (string | null)[]): string | null {
    const valid = dates.filter((d): d is string => d !== null)
    return valid.length ? valid.sort()[0] : null
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
    const buckets = new Map<string, { key: Record<string, string | null>; label: string; bom_version: string | null; project_due_date: string | null; zone_end_date: string | null; sub_zone_due_date: string | null; items: AssemblyPickerItem[] }>()
    for (const item of items) {
      const key: Record<string, string | null> = {}
      for (const d of dims) {
        key[d] = d === 'project' ? item.project : d === 'zone' ? item.zone : item.sub_zone
      }
      const label = dims.map((d) => key[d] ?? '—').join(' · ')
      const bucketKey = JSON.stringify(key)
      // one (project/zone/sub-zone) group = one dispatch → one BOM version
      const bucket = buckets.get(bucketKey) ?? { key, label, bom_version: item.bom_version, project_due_date: null, zone_end_date: null, sub_zone_due_date: null, items: [] }
      bucket.items.push(item)
      buckets.set(bucketKey, bucket)
    }
    // compute dates per group: min of each level (earliest = most urgent)
    for (const bucket of buckets.values()) {
      bucket.project_due_date = this.minDate(bucket.items.map((i) => i.project_due_date))
      bucket.zone_end_date = this.minDate(bucket.items.map((i) => i.zone_end_date))
      bucket.sub_zone_due_date = this.minDate(bucket.items.map((i) => i.sub_zone_due_date))
    }
    return [...buckets.values()]
  }
}
