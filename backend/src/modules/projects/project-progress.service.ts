import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { stripContractPrefix } from '../bom-upload/xlsx-parser.service'

// Fabrication stage weights — the site team's own Excel weight row (REV1,
// row 5) verbatim: sums to exactly 100. Fab% = Σ(stage% × weight) / 100.
export const STAGE_WEIGHTS = {
  cut: 10,
  buildup: 10,
  weld1: 15,
  fitup_drill: 10,
  weld2: 15,
  qc_inspection: 10,
  primer: 10,
  fireproof: 5,
  top_coat: 10,
  qc_final: 5,
} as const

export type FabStage = keyof typeof STAGE_WEIGHTS
export const FAB_STAGES = Object.keys(STAGE_WEIGHTS) as FabStage[]

export type ProgressStatus = 'notstart' | 'fabrication' | 'load' | 'erection' | 'done'
// Light = phase in progress, dark = phase complete-and-waiting — drives the
// two-shade 3D coloring. Single-shade statuses always report 'light'.
export type ProgressShade = 'light' | 'dark'

type FabStageFields = Record<FabStage, number>

interface ProgressFields extends FabStageFields {
  plan_load_date: Date | null
  actual_load_date: Date | null
  loaded_pcs: number
  erected_pcs: number
}

// Plain-interface DTO (paint-config precedent) — stage percents clamp
// server-side to 0..100 (never 400: the real sheet has "50"-for-0.5 typo
// entries, clamping is the design's own semantics), dates arrive as
// 'YYYY-MM-DD' strings with explicit null clearing, pcs clamp to the
// assembly's own qty. Omitted fields are left unchanged.
export interface UpdateAssemblyProgressDto extends Partial<FabStageFields> {
  plan_load_date?: string | null
  actual_load_date?: string | null
  loaded_pcs?: number
  erected_pcs?: number
}

// Bulk applies ONE payload to many rows whose qty differ — raw pcs counts
// can't be shared, so they're replaced by set-full flags resolved per-row.
export interface BulkUpdateAssemblyProgressDto
  extends Omit<UpdateAssemblyProgressDto, 'loaded_pcs' | 'erected_pcs'> {
  assembly_ids: number[]
  set_loaded_full?: boolean
  set_erected_full?: boolean
}

// An assembly is at least one physical piece — this single helper feeds
// pcs clamping, the status ladder, load/erect percents AND mirrors the
// migration SQL's GREATEST(1, COALESCE(ROUND(qty)::int, 1)), so all four
// places agree on what "full quantity" means for null/zero/decimal qty.
export function effectiveQty(qty: unknown): number {
  if (qty == null) return 1
  return Math.max(1, Math.round(Number(qty)))
}

const clampPct = (v: number) => Math.min(100, Math.max(0, Math.round(v)))
const clampPcs = (v: number, q: number) => Math.min(q, Math.max(0, Math.round(v)))

export function computeFabPct(p: ProgressFields | null): number {
  if (!p) return 0
  let sum = 0
  for (const stage of FAB_STAGES) sum += (p[stage] ?? 0) * STAGE_WEIGHTS[stage]
  return Math.round(sum) / 100 // 2dp — stage% × weight already scales by 100
}

// Status = furthest phase started (same principle as v1's furthest
// milestone) — out-of-order entry is legal, pcs are the phase signal for
// load/erection (an actual_load_date alone does NOT advance status; the
// migration guaranteed loaded_pcs consistency for existing rows).
export function computeStatus(
  p: ProgressFields | null,
  qty: unknown,
): { status: ProgressStatus; shade: ProgressShade } {
  if (!p) return { status: 'notstart', shade: 'light' }
  const q = effectiveQty(qty)
  if (p.erected_pcs >= q) return { status: 'done', shade: 'light' }
  if (p.erected_pcs > 0) return { status: 'erection', shade: 'light' }
  if (p.loaded_pcs >= q) return { status: 'load', shade: 'dark' }
  if (p.loaded_pcs > 0) return { status: 'load', shade: 'light' }
  const fab = computeFabPct(p)
  if (fab >= 100) return { status: 'fabrication', shade: 'dark' }
  if (fab > 0) return { status: 'fabrication', shade: 'light' }
  return { status: 'notstart', shade: 'light' }
}

@Injectable()
export class ProjectProgressService {
  constructor(private readonly prisma: PrismaService) {}

  private async findProjectOrThrow(projectCode: string) {
    const project = await this.prisma.project.findUnique({ where: { project_code: projectCode } })
    if (!project) throw new NotFoundException(`Project ${projectCode} not found`)
    return project
  }

  async updateAssemblyProgress(projectCode: string, assemblyId: number, dto: UpdateAssemblyProgressDto, userId: number) {
    // Scope check through the dispatch's project — a valid assembly id from a
    // DIFFERENT project must 404, not silently write across projects. qty is
    // selected here too so pcs clamping needs no extra round-trip.
    const assembly = await this.prisma.bom_assembly.findFirst({
      where: { id: assemblyId, dispatch: { project: { project_code: projectCode } } },
      select: { id: true, qty: true },
    })
    if (!assembly) throw new NotFoundException(`Assembly ${assemblyId} not found in project ${projectCode}`)
    const q = effectiveQty(assembly.qty)

    const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null)
    const pct = (v: number | undefined) => (v === undefined ? undefined : clampPct(v))
    const fields = {
      ...Object.fromEntries(FAB_STAGES.map(s => [s, pct(dto[s])])),
      plan_load_date: toDate(dto.plan_load_date),
      actual_load_date: toDate(dto.actual_load_date),
      loaded_pcs: dto.loaded_pcs === undefined ? undefined : clampPcs(dto.loaded_pcs, q),
      erected_pcs: dto.erected_pcs === undefined ? undefined : clampPcs(dto.erected_pcs, q),
    }

    const row = await this.prisma.bom_assembly_progress.upsert({
      where: { assembly_id: assemblyId },
      create: {
        assembly_id: assemblyId,
        ...Object.fromEntries(FAB_STAGES.map(s => [s, (fields as Record<string, number | undefined>)[s] ?? 0])),
        plan_load_date: fields.plan_load_date ?? null,
        actual_load_date: fields.actual_load_date ?? null,
        loaded_pcs: fields.loaded_pcs ?? 0,
        erected_pcs: fields.erected_pcs ?? 0,
        write_uid: userId,
      },
      update: { ...fields, write_uid: userId, write_date: new Date() },
    })
    const { status, shade } = computeStatus(row, assembly.qty)
    return {
      ...row,
      fab_pct: computeFabPct(row),
      load_pct: Math.round((row.loaded_pcs / q) * 100),
      erect_pct: Math.round((row.erected_pcs / q) * 100),
      status,
      shade,
    }
  }

  // Applies the same field values to many assemblies at once (bulk-select in
  // the table) — one transaction, not N sequential PATCHes from the client.
  // Fields work exactly like the single-assembly upsert (omitted=unchanged,
  // explicit null=clear); only assembly_ids that actually belong to this
  // project are touched — a stray/foreign id is silently skipped rather than
  // 404ing the whole batch, since the caller can't attribute one bad id in a
  // batch of N without more plumbing than this is worth.
  async bulkUpdateAssemblyProgress(projectCode: string, dto: BulkUpdateAssemblyProgressDto, userId: number) {
    const project = await this.findProjectOrThrow(projectCode)
    const owned = await this.prisma.bom_assembly.findMany({
      where: { id: { in: dto.assembly_ids }, dispatch: { project_id: project.id } },
      select: { id: true, qty: true },
    })
    if (!owned.length) return { updated: 0 }

    const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null)
    const pct = (v: number | undefined) => (v === undefined ? undefined : clampPct(v))
    // Shared across all rows; pcs are per-row via the set-full flags below
    // (one absolute count can't apply to rows with different qty).
    const shared = {
      ...Object.fromEntries(FAB_STAGES.map(s => [s, pct(dto[s])])),
      plan_load_date: toDate(dto.plan_load_date),
      actual_load_date: toDate(dto.actual_load_date),
    }

    await this.prisma.$transaction(
      owned.map(({ id, qty }) => {
        const fields = {
          ...shared,
          loaded_pcs: dto.set_loaded_full ? effectiveQty(qty) : undefined,
          erected_pcs: dto.set_erected_full ? effectiveQty(qty) : undefined,
        }
        return this.prisma.bom_assembly_progress.upsert({
          where: { assembly_id: id },
          create: {
            assembly_id: id,
            ...Object.fromEntries(FAB_STAGES.map(s => [s, (fields as Record<string, number | undefined>)[s] ?? 0])),
            plan_load_date: fields.plan_load_date ?? null,
            actual_load_date: fields.actual_load_date ?? null,
            loaded_pcs: fields.loaded_pcs ?? 0,
            erected_pcs: fields.erected_pcs ?? 0,
            write_uid: userId,
          },
          update: { ...fields, write_uid: userId, write_date: new Date() },
        })
      }),
    )
    return { updated: owned.length }
  }

  async getZoneRows(projectCode: string, zoneId: number) {
    const project = await this.findProjectOrThrow(projectCode)
    const zone = await this.prisma.project_zone.findFirst({ where: { id: zoneId, project_id: project.id } })
    if (!zone) throw new NotFoundException(`Zone ${zoneId} not found in project ${projectCode}`)

    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: project.id, zone_id: zoneId } },
      orderBy: { assembly_mark: 'asc' },
      select: {
        id: true, assembly_mark: true, weight_kg: true, qty: true,
        progress: true,
      },
    })

    return assemblies.map(mapAssemblyRow)
  }

  // Same shape as getZoneRows, but every zone of the project at once — feeds
  // the Overview tab's project-wide isolate-by-status 3D view.
  async getProjectRows(projectCode: string) {
    const project = await this.findProjectOrThrow(projectCode)
    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: project.id } },
      orderBy: { assembly_mark: 'asc' },
      select: {
        id: true, assembly_mark: true, weight_kg: true, qty: true,
        progress: true,
      },
    })

    return assemblies.map(mapAssemblyRow)
  }

  async getOverview(projectCode: string) {
    const project = await this.findProjectOrThrow(projectCode)
    const zones = await this.prisma.project_zone.findMany({
      where: { project_id: project.id, active: true },
      orderBy: [{ erection_sequence: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, label: true },
    })

    // One query for the whole project, grouped in JS — assembly counts per
    // project are in the hundreds, not worth per-zone round-trips.
    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: project.id } },
      select: { weight_kg: true, qty: true, progress: true, dispatch: { select: { zone_id: true } } },
    })

    const perZone = zones.map(z => {
      const rows = assemblies.filter(a => a.dispatch.zone_id === z.id)
      return { zone: z, ...rollup(rows) }
    })
    return {
      zones: perZone.map(({ zone, ...agg }) => ({
        zone_id: zone.id, zone_code: zone.code, zone_label: zone.label, ...agg,
      })),
      total: rollup(assemblies),
    }
  }

  // Latest complete BIM model of the project, matched to one zone's ACTIVE
  // assembly marks. Also surfaces the BOM/BIM version currently in view —
  // both tables were already being queried here, so this just widens the
  // existing `select`s rather than adding new queries.
  async getZoneBimMatch(projectCode: string, zoneId: number) {
    const project = await this.findProjectOrThrow(projectCode)
    const model = await this.findLatestCompleteModel(project.id)

    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: project.id, zone_id: zoneId } },
      select: {
        id: true, assembly_mark: true,
        dispatch: { select: { id: true, revision: true, zone_id: true, sub_zone_id: true } },
      },
    })
    const bom_version = await this.computeBomVersion(project.id, assemblies)

    if (!model) return { model_id: null, model_version: null, bom_version, matches: [] }
    return {
      model_id: model.id,
      model_version: `${model.major_version}.${model.minor_version}`,
      bom_version,
      matches: await this.matchAssembliesToBim(model.id, assemblies),
    }
  }

  // Mirrors BomList.tsx's own versionMap computation exactly (there is no
  // stored "minor version" column — `bom_dispatch.revision` only carries
  // the major number). Group by (zone_id, sub_zone_id), sub-group by
  // revision, then rank chronologically by dispatch id within each
  // revision: "Continue revision" reads as 1.0, 1.1, 1.2…; only "Start new
  // revision" jumps the major number.
  //
  // A zone's ACTIVE assemblies can legitimately span more than one dispatch
  // at once — "Continue revision" only re-uploads the marks present in the
  // new file, so marks it didn't touch stay ACTIVE on the older dispatch.
  // Surfacing every version that's technically live would read as noise, so
  // this reports only the highest (revision, then minor) — the version a
  // user would recognize as "current".
  private async computeBomVersion(
    projectId: number,
    assemblies: { dispatch: { id: number; revision: number; zone_id: number; sub_zone_id: number | null } }[],
  ): Promise<string | null> {
    const activeDispatches = new Map(assemblies.map(a => [a.dispatch.id, a.dispatch]))
    if (!activeDispatches.size) return null

    const groupKeys = [...new Set([...activeDispatches.values()].map(d => `${d.zone_id}:${d.sub_zone_id ?? ''}`))]
    const allDispatches = await this.prisma.bom_dispatch.findMany({
      where: {
        project_id: projectId,
        OR: groupKeys.map(k => {
          const [zoneId, subZoneId] = k.split(':')
          return { zone_id: Number(zoneId), sub_zone_id: subZoneId ? Number(subZoneId) : null }
        }),
      },
      select: { id: true, revision: true, zone_id: true, sub_zone_id: true },
      orderBy: { id: 'asc' },
    })

    const byGroupRevision = new Map<string, typeof allDispatches>()
    for (const d of allDispatches) {
      const key = `${d.zone_id}:${d.sub_zone_id ?? ''}:${d.revision}`
      const list = byGroupRevision.get(key)
      if (list) list.push(d)
      else byGroupRevision.set(key, [d])
    }
    const versionById = new Map<number, { revision: number; minor: number }>()
    for (const list of byGroupRevision.values()) {
      list.forEach((d, idx) => versionById.set(d.id, { revision: d.revision, minor: idx }))
    }

    const versions = [...activeDispatches.keys()].map(id => versionById.get(id)!)
    const highest = versions.reduce((best, v) =>
      v.revision > best.revision || (v.revision === best.revision && v.minor > best.minor) ? v : best)
    return `${highest.revision}.${highest.minor}`
  }

  // Same match, all zones of the project at once — feeds the Overview tab's
  // whole-project 3D view (one model shared across zones in practice). No
  // bom_revisions here — a single number doesn't mean much once it spans
  // zones that may be on different revisions.
  async getProjectBimMatch(projectCode: string) {
    const project = await this.findProjectOrThrow(projectCode)
    const model = await this.findLatestCompleteModel(project.id)
    if (!model) return { model_id: null, model_version: null, matches: [] }

    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: project.id } },
      select: { id: true, assembly_mark: true },
    })
    return {
      model_id: model.id,
      model_version: `${model.major_version}.${model.minor_version}`,
      matches: await this.matchAssembliesToBim(model.id, assemblies),
    }
  }

  // Alternate Overview grouping: by BIM structural position code (grid/
  // elevation, e.g. "2/A/EL.950") instead of Zone. A bay commonly holds
  // several different marks at once, AND a single mark commonly spans many
  // bays (confirmed on real data: ~half of matched marks sit at >1 position)
  // — so unlike the zone rollup this can't collapse to one row per key with
  // a weight/pct average. Weight is deliberately omitted (a mark's weight
  // would either overcount total tonnage if repeated per position, or need
  // an arbitrary /position-count split the team never agreed to) — each
  // (position, mark) pair just reports that mark's own existing progress
  // numbers, repeated wherever it physically appears.
  //
  // Driven from the BIM side (every physical instance the model knows
  // about), not just the marks that happen to have a BOM row — a piece can
  // be in the model before it's ever uploaded to BOM, and that gap is
  // exactly what this view should surface, not hide. Marks with no BOM
  // match get null progress fields (frontend renders "-"); BOM rows with
  // real progress but no BIM position anywhere are surfaced separately
  // under `unmatched`, so nothing is silently dropped in either direction.
  async getProjectPositions(projectCode: string) {
    const project = await this.findProjectOrThrow(projectCode)
    const model = await this.findLatestCompleteModel(project.id)

    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: project.id } },
      select: { id: true, assembly_mark: true, weight_kg: true, qty: true, progress: true },
    })
    const rows = assemblies.map(mapAssemblyRow)

    if (!model) {
      return { model_id: null, model_version: null, groups: [], unmatched: rows.map(r => toPositionMark(r)) }
    }

    // Every (position, mark) instance the model has — the full picture,
    // not filtered down to marks that already have a BOM row.
    const counts = await this.prisma.bim_element.groupBy({
      by: ['position', 'mark'],
      where: { model_id: model.id, ifc_type: 'IfcElementAssembly', position: { not: null }, mark: { not: null } },
      _count: { _all: true },
    })

    // BOM rows indexed by mark (array-valued — the same mark can legally
    // exist as separate bom_assembly rows in different zones).
    const rowsByMark = new Map<string, (typeof rows)[number][]>()
    for (const row of rows) {
      const list = rowsByMark.get(row.mark)
      if (list) list.push(row)
      else rowsByMark.set(row.mark, [row])
    }

    // Same fuzzy-match rule as matchAssembliesToBim: BOM marks are already
    // stripped, so a raw BIM mark matches either directly or after
    // stripping its own contract-no prefix.
    const matchedAssemblyIds = new Set<number>()
    const groups = new Map<string, PositionMarkEntry[]>()
    for (const c of counts) {
      const bimMark = c.mark as string
      const position = c.position as string
      const matches = rowsByMark.get(bimMark) ?? rowsByMark.get(stripContractPrefix(bimMark)) ?? []
      const entries = matches.length
        ? matches.map(row => {
            matchedAssemblyIds.add(row.assembly_id)
            return toPositionMark(row, c._count._all)
          })
        : [toUnmatchedBimMark(bimMark, c._count._all)]
      const list = groups.get(position)
      if (list) list.push(...entries)
      else groups.set(position, entries)
    }

    // Tracked in BOM with real progress, but never found anywhere in the
    // model — the other direction of the same "don't hide gaps" principle.
    const unmatched = rows.filter(r => !matchedAssemblyIds.has(r.assembly_id)).map(r => toPositionMark(r))

    return {
      model_id: model.id,
      model_version: `${model.major_version}.${model.minor_version}`,
      groups: [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([position, marks]) => ({ position, marks: marks.sort((a, b) => a.mark.localeCompare(b.mark)) })),
      unmatched: unmatched.sort((a, b) => a.mark.localeCompare(b.mark)),
    }
  }

  private async findLatestCompleteModel(projectId: number) {
    return this.prisma.bim_model.findFirst({
      where: { project_id: projectId, translation_status: 'complete' },
      orderBy: [{ major_version: 'desc' }, { minor_version: 'desc' }],
      select: { id: true, major_version: true, minor_version: true },
    })
  }

  // Exact match first; fallback strips the Tekla contract-no prefix off the
  // BIM-side mark (reuses the BOM upload parser's own logic — BOM marks are
  // already stored stripped, BIM marks come raw off IFC TAG). Junk BIM marks
  // ("0(?)" etc.) simply never match — no special-casing.
  private async matchAssembliesToBim(modelId: number, assemblies: { id: number; assembly_mark: string }[]) {
    const bimElements = await this.prisma.bim_element.findMany({
      where: { model_id: modelId, ifc_type: 'IfcElementAssembly', mark: { not: null }, global_id: { not: null } },
      select: { mark: true, global_id: true },
    })

    // Index BIM elements by both raw and prefix-stripped mark; marks repeat
    // across physical instances, so each key maps to MANY global_ids.
    const byBimMark = new Map<string, string[]>()
    for (const el of bimElements) {
      const raw = el.mark as string
      const keys = new Set([raw, stripContractPrefix(raw)])
      for (const key of keys) {
        const list = byBimMark.get(key)
        if (list) list.push(el.global_id as string)
        else byBimMark.set(key, [el.global_id as string])
      }
    }

    return assemblies.flatMap(a => {
      const globalIds = byBimMark.get(a.assembly_mark)
      return globalIds?.length ? [{ assembly_id: a.id, mark: a.assembly_mark, global_ids: globalIds }] : []
    })
  }
}

function mapAssemblyRow(a: { id: number; assembly_mark: string; weight_kg: unknown; qty: unknown; progress: ProgressFields | null }) {
  const q = effectiveQty(a.qty)
  const p = a.progress
  const { status, shade } = computeStatus(p, a.qty)
  return {
    assembly_id: a.id,
    mark: a.assembly_mark,
    weight_kg: a.weight_kg != null ? Number(a.weight_kg) : null,
    qty: a.qty != null ? Number(a.qty) : null,
    ...Object.fromEntries(FAB_STAGES.map(s => [s, p?.[s] ?? 0])),
    plan_load_date: p?.plan_load_date ?? null,
    actual_load_date: p?.actual_load_date ?? null,
    loaded_pcs: p?.loaded_pcs ?? 0,
    erected_pcs: p?.erected_pcs ?? 0,
    fab_pct: computeFabPct(p),
    load_pct: Math.round(((p?.loaded_pcs ?? 0) / q) * 100),
    erect_pct: Math.round(((p?.erected_pcs ?? 0) / q) * 100),
    status,
    shade,
  }
}

// count defaults to the mark's full effective qty — used for the
// `unmatched` bucket, where there's no BIM instance count to report instead.
function toPositionMark(row: ReturnType<typeof mapAssemblyRow>, count?: number) {
  return {
    assembly_id: row.assembly_id,
    mark: row.mark,
    count: count ?? effectiveQty(row.qty),
    fab_pct: row.fab_pct,
    load_pct: row.load_pct,
    erect_pct: row.erect_pct,
    status: row.status,
    shade: row.shade,
  }
}

// A physical piece the BIM model knows about with no matching BOM row at
// all — null progress fields (frontend renders "-") rather than omitting
// the piece, since it's real and its absence from BOM is itself useful info.
type PositionMarkEntry = ReturnType<typeof toPositionMark> | ReturnType<typeof toUnmatchedBimMark>

function toUnmatchedBimMark(mark: string, count: number) {
  return {
    assembly_id: null as number | null,
    mark,
    count,
    fab_pct: null as number | null,
    load_pct: null as number | null,
    erect_pct: null as number | null,
    status: null as ProgressStatus | null,
    shade: null as ProgressShade | null,
  }
}

// Three separate rollup numbers, deliberately no combined total (spec):
// fab weighted by weight_kg (matches the Excel's own overall column),
// load/erection by pieces (Σ/Σ, not averaged per-row).
function rollup(rows: { weight_kg: unknown; qty: unknown; progress: ProgressFields | null }[]) {
  let totalWeight = 0
  let weightedFab = 0
  let totalQty = 0
  let loadedPcs = 0
  let erectedPcs = 0
  const buckets = { notstart: 0, in_progress: 0, done: 0 }
  for (const r of rows) {
    const w = r.weight_kg != null ? Number(r.weight_kg) : 0
    totalWeight += w
    weightedFab += w * computeFabPct(r.progress)
    const q = effectiveQty(r.qty)
    totalQty += q
    loadedPcs += Math.min(q, r.progress?.loaded_pcs ?? 0)
    erectedPcs += Math.min(q, r.progress?.erected_pcs ?? 0)
    const { status } = computeStatus(r.progress, r.qty)
    if (status === 'done') buckets.done++
    else if (status === 'notstart') buckets.notstart++
    else buckets.in_progress++
  }
  return {
    assembly_count: rows.length,
    total_weight_kg: totalWeight,
    fab_pct: totalWeight > 0 ? Math.round((weightedFab / totalWeight) * 100) / 100 : 0,
    total_qty: totalQty,
    loaded_pcs: loadedPcs,
    erected_pcs: erectedPcs,
    load_pct: totalQty > 0 ? Math.round((loadedPcs / totalQty) * 100) : 0,
    erect_pct: totalQty > 0 ? Math.round((erectedPcs / totalQty) * 100) : 0,
    buckets,
  }
}
