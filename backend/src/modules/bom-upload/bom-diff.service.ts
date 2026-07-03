import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type {
  DiffRow, DiffStatus, DiffAggregate, DiffMetric,
  AssemblyDiffItem, PartDiffItem, JunctionDiffItem,
  DispatchDiffResult,
} from './dto/diff.dto'

const FLOAT_TOL = 0.001

function floatEq(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < FLOAT_TOL
}

function toNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function metric(prev: number | null, curr: number | null): DiffMetric {
  const delta = prev != null && curr != null ? curr - prev : curr != null ? curr : prev != null ? -prev : null
  return { prev, curr, delta }
}

// ── Generic O(n+m) diff ────────────────────────────────────────

function diffEntities<T>(
  prev: T[],
  curr: T[],
  keyFn: (x: T) => string,
  equalFn: (a: T, b: T) => boolean,
): DiffRow<T>[] {
  const prevMap = new Map<string, T>()
  for (const p of prev) prevMap.set(keyFn(p), p)

  const rows: DiffRow<T>[] = []
  for (const c of curr) {
    const key = keyFn(c)
    const p = prevMap.get(key)
    if (!p) {
      rows.push({ status: 'added', prev: null, curr: c })
    } else {
      const status: DiffStatus = equalFn(p, c) ? 'unchanged' : 'changed'
      rows.push({ status, prev: p, curr: c })
      prevMap.delete(key)
    }
  }
  for (const p of prevMap.values()) {
    rows.push({ status: 'removed', prev: p, curr: null })
  }
  return rows
}

// ── Domain-specific comparators ────────────────────────────────

function assembliesEqual(a: AssemblyDiffItem, b: AssemblyDiffItem): boolean {
  return (
    a.name === b.name &&
    floatEq(a.qty, b.qty) &&
    floatEq(a.weight_kg, b.weight_kg) &&
    floatEq(a.surface_area_m2, b.surface_area_m2)
  )
}

function partsEqual(a: PartDiffItem, b: PartDiffItem): boolean {
  return (
    a.description === b.description &&
    a.profile === b.profile &&
    a.grade === b.grade &&
    floatEq(a.qty, b.qty) &&
    floatEq(a.length_mm, b.length_mm) &&
    floatEq(a.weight_kg, b.weight_kg)
  )
}

function junctionsEqual(a: JunctionDiffItem, b: JunctionDiffItem): boolean {
  return floatEq(a.qty, b.qty)
}

// ── BomDiffService ─────────────────────────────────────────────

@Injectable()
export class BomDiffService {
  constructor(private readonly prisma: PrismaService) {}

  private async findRevisionGroupIds(projectId: number, zoneId: number, subZoneId: number | null, revision: number): Promise<number[]> {
    const rows = await this.prisma.bom_dispatch.findMany({
      where: { project_id: projectId, zone_id: zoneId, sub_zone_id: subZoneId, revision },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
    return rows.map(r => r.id)
  }

  async findPreviousRevisionGroup(id: number): Promise<{ currentIds: number[]; previousIds: number[] } | null> {
    const current = await this.prisma.bom_dispatch.findUnique({ where: { id } })
    if (!current) throw new NotFoundException(`Dispatch ${id} not found`)

    const currentIds = await this.findRevisionGroupIds(current.project_id, current.zone_id, current.sub_zone_id, current.revision)

    const previousDispatch = await this.prisma.bom_dispatch.findFirst({
      where: {
        project_id: current.project_id,
        zone_id: current.zone_id,
        sub_zone_id: current.sub_zone_id,
        revision: { lt: current.revision },
      },
      orderBy: { revision: 'desc' },
    })
    if (!previousDispatch) return null

    const previousIds = await this.findRevisionGroupIds(current.project_id, current.zone_id, current.sub_zone_id, previousDispatch.revision)
    return { currentIds, previousIds }
  }

  async computeDiff(id: number): Promise<DispatchDiffResult | null> {
    const groups = await this.findPreviousRevisionGroup(id)
    if (!groups) return null
    const { currentIds, previousIds } = groups

    const [currDetail, prevDetail] = await Promise.all([
      this.loadRevisionGroupData(currentIds),
      this.loadRevisionGroupData(previousIds),
    ])

    const currDispatches = await this.prisma.bom_dispatch.findMany({ where: { id: { in: currentIds } } })
    const prevDispatches = await this.prisma.bom_dispatch.findMany({ where: { id: { in: previousIds } } })

    const warning = this.computeWarning(
      prevDispatches.map(d => d.status),
      currDispatches.map(d => d.status),
    )

    const assembly_diff = diffEntities(
      prevDetail.assemblies, currDetail.assemblies,
      a => a.assembly_mark, assembliesEqual,
    )

    const part_diff = diffEntities(
      prevDetail.parts, currDetail.parts,
      p => p.part_mark, partsEqual,
    )

    const junction_diff = diffEntities(
      prevDetail.junctions, currDetail.junctions,
      j => `${j.assembly_mark}__${j.part_mark}`, junctionsEqual,
    )

    const aggregate = await this.computeAggregate(previousIds, currentIds, assembly_diff, part_diff)

    return {
      prev_id: previousIds[0],
      curr_id: currentIds[0],
      warning,
      aggregate,
      assembly_diff,
      part_diff,
      junction_diff,
    }
  }

  // ── Private helpers ──────────────────────────────────────────

  private async loadRevisionGroupData(ids: number[]) {
    const [assemblies, parts, junctions] = await Promise.all([
      this.prisma.bom_assembly.findMany({
        where: { dispatch_id: { in: ids } },
        select: { assembly_mark: true, name: true, qty: true, weight_kg: true, surface_area_m2: true },
      }),
      this.prisma.bom_part.findMany({
        where: { dispatch_id: { in: ids } },
        select: { part_mark: true, description: true, profile: true, grade: true, qty: true, length_mm: true, weight_kg: true },
      }),
      this.prisma.bom_assembly_part.findMany({
        where: { assembly: { dispatch_id: { in: ids } } },
        select: {
          qty: true,
          assembly: { select: { assembly_mark: true } },
          part: { select: { part_mark: true } },
        },
      }),
    ])

    return {
      assemblies: assemblies.map(a => ({
        assembly_mark: a.assembly_mark,
        name: a.name ?? null,
        qty: toNum(a.qty),
        weight_kg: toNum(a.weight_kg),
        surface_area_m2: toNum(a.surface_area_m2),
      })) as AssemblyDiffItem[],

      parts: parts.map(p => ({
        part_mark: p.part_mark,
        description: p.description ?? null,
        profile: p.profile ?? null,
        grade: p.grade ?? null,
        qty: toNum(p.qty),
        length_mm: toNum(p.length_mm),
        weight_kg: toNum(p.weight_kg),
      })) as PartDiffItem[],

      junctions: junctions.map(j => ({
        assembly_mark: j.assembly.assembly_mark,
        part_mark: j.part.part_mark,
        qty: toNum(j.qty) ?? 1,
      })) as JunctionDiffItem[],
    }
  }

  private async computeAggregate(
    prevIds: number[], currIds: number[],
    assemblyDiff: DiffRow<AssemblyDiffItem>[],
    partDiff: DiffRow<PartDiffItem>[],
  ): Promise<DiffAggregate> {
    const [prevWeightArea, currWeightArea] = await Promise.all([
      this.sumWeightArea(prevIds),
      this.sumWeightArea(currIds),
    ])

    const asmPrev = assemblyDiff.filter(r => r.prev != null).length
    const asmCurr = assemblyDiff.filter(r => r.curr != null).length

    const [prevPartCount, currPartCount] = await Promise.all([
      this.prisma.bom_part.count({ where: { dispatch_id: { in: prevIds } } }),
      this.prisma.bom_part.count({ where: { dispatch_id: { in: currIds } } }),
    ])

    const countChanges = <T>(rows: DiffRow<T>[]) => ({
      added:   rows.filter(r => r.status === 'added').length,
      removed: rows.filter(r => r.status === 'removed').length,
      changed: rows.filter(r => r.status === 'changed').length,
    })

    return {
      weight_kg: metric(prevWeightArea.weight_kg, currWeightArea.weight_kg),
      area_m2: metric(prevWeightArea.area_m2, currWeightArea.area_m2),
      assembly_count: metric(asmPrev, asmCurr),
      assembly_changes: countChanges(assemblyDiff),
      part_total: metric(prevPartCount, currPartCount),
      part_changes: countChanges(partDiff),
    }
  }

  private async sumWeightArea(dispatchIds: number[]) {
    const rows = await this.prisma.bom_assembly.findMany({
      where: { dispatch_id: { in: dispatchIds } },
      select: { weight_kg: true, surface_area_m2: true },
    })
    let weight_kg = 0, area_m2 = 0
    for (const r of rows) {
      if (r.weight_kg != null) weight_kg += Number(r.weight_kg)
      if (r.surface_area_m2 != null) area_m2 += Number(r.surface_area_m2)
    }
    return {
      weight_kg: rows.length ? weight_kg : null,
      area_m2: rows.length ? area_m2 : null,
    }
  }

  private computeWarning(prevStatuses: string[], currStatuses: string[]): string | null {
    const prevPartial = prevStatuses.some(s => s === 'partial')
    const currPartial = currStatuses.some(s => s === 'partial')
    if (prevPartial && currPartial) {
      return 'ทั้งสอง dispatch มีสถานะ partial — ข้อมูลอาจไม่ครบถ้วน'
    }
    if (prevPartial) return 'เวอร์ชันก่อนหน้ามีสถานะ partial — ข้อมูลอาจไม่ครบถ้วน'
    if (currPartial) return 'เวอร์ชันปัจจุบันมีสถานะ partial — ข้อมูลอาจไม่ครบถ้วน'
    return null
  }
}
