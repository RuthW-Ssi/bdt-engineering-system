import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { stripContractPrefix } from '../bom-upload/xlsx-parser.service'

// Additive milestone weights (spec contract, Sprint 24) — no sequential
// enforcement: real-world entry is retroactive/out of order, so each filled
// field simply adds its weight regardless of the others.
const MILESTONE_WEIGHTS = {
  qc_inspection_pass: 20,
  qc_final_pass: 20,
  actual_load_date: 20,
  install_date: 30,
  qc_install_date: 10,
} as const

export type ProgressStatus = 'notstart' | 'qcinsp' | 'qcfinal' | 'load' | 'install' | 'done'

interface ProgressFields {
  qc_inspection_pass: boolean
  qc_final_pass: boolean
  actual_load_date: Date | null
  install_date: Date | null
  qc_install_date: Date | null
}

// Plain-interface DTO (paint-config precedent) — dates arrive as
// 'YYYY-MM-DD' strings, explicit null clears a previously-set value,
// omitted fields are left unchanged.
export interface UpdateAssemblyProgressDto {
  qc_inspection_pass?: boolean
  qc_final_pass?: boolean
  actual_load_date?: string | null
  install_date?: string | null
  qc_install_date?: string | null
}

export interface BulkUpdateAssemblyProgressDto extends UpdateAssemblyProgressDto {
  assembly_ids: number[]
}

export function computePct(p: ProgressFields | null): number {
  if (!p) return 0
  let pct = 0
  if (p.qc_inspection_pass) pct += MILESTONE_WEIGHTS.qc_inspection_pass
  if (p.qc_final_pass) pct += MILESTONE_WEIGHTS.qc_final_pass
  if (p.actual_load_date) pct += MILESTONE_WEIGHTS.actual_load_date
  if (p.install_date) pct += MILESTONE_WEIGHTS.install_date
  if (p.qc_install_date) pct += MILESTONE_WEIGHTS.qc_install_date
  return pct
}

// Display status = furthest milestone reached (done ⊃ install ⊃ load ⊃ …),
// independent of pct — a row can be "install" with load still unfilled.
export function computeStatus(p: ProgressFields | null): ProgressStatus {
  if (!p) return 'notstart'
  if (p.qc_install_date) return 'done'
  if (p.install_date) return 'install'
  if (p.actual_load_date) return 'load'
  if (p.qc_final_pass) return 'qcfinal'
  if (p.qc_inspection_pass) return 'qcinsp'
  return 'notstart'
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
    // DIFFERENT project must 404, not silently write across projects.
    const assembly = await this.prisma.bom_assembly.findFirst({
      where: { id: assemblyId, dispatch: { project: { project_code: projectCode } } },
      select: { id: true },
    })
    if (!assembly) throw new NotFoundException(`Assembly ${assemblyId} not found in project ${projectCode}`)

    const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null)
    const fields = {
      qc_inspection_pass: dto.qc_inspection_pass,
      qc_final_pass: dto.qc_final_pass,
      actual_load_date: toDate(dto.actual_load_date),
      install_date: toDate(dto.install_date),
      qc_install_date: toDate(dto.qc_install_date),
    }

    const row = await this.prisma.bom_assembly_progress.upsert({
      where: { assembly_id: assemblyId },
      create: {
        assembly_id: assemblyId,
        qc_inspection_pass: fields.qc_inspection_pass ?? false,
        qc_final_pass: fields.qc_final_pass ?? false,
        actual_load_date: fields.actual_load_date ?? null,
        install_date: fields.install_date ?? null,
        qc_install_date: fields.qc_install_date ?? null,
        write_uid: userId,
      },
      update: { ...fields, write_uid: userId, write_date: new Date() },
    })
    return { ...row, pct: computePct(row), status: computeStatus(row) }
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
      select: { id: true },
    })
    if (!owned.length) return { updated: 0 }

    const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null)
    const fields = {
      qc_inspection_pass: dto.qc_inspection_pass,
      qc_final_pass: dto.qc_final_pass,
      actual_load_date: toDate(dto.actual_load_date),
      install_date: toDate(dto.install_date),
      qc_install_date: toDate(dto.qc_install_date),
    }

    await this.prisma.$transaction(
      owned.map(({ id }) =>
        this.prisma.bom_assembly_progress.upsert({
          where: { assembly_id: id },
          create: {
            assembly_id: id,
            qc_inspection_pass: fields.qc_inspection_pass ?? false,
            qc_final_pass: fields.qc_final_pass ?? false,
            actual_load_date: fields.actual_load_date ?? null,
            install_date: fields.install_date ?? null,
            qc_install_date: fields.qc_install_date ?? null,
            write_uid: userId,
          },
          update: { ...fields, write_uid: userId, write_date: new Date() },
        }),
      ),
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
      select: { weight_kg: true, progress: true, dispatch: { select: { zone_id: true } } },
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
  return {
    assembly_id: a.id,
    mark: a.assembly_mark,
    weight_kg: a.weight_kg != null ? Number(a.weight_kg) : null,
    qty: a.qty != null ? Number(a.qty) : null,
    qc_inspection_pass: a.progress?.qc_inspection_pass ?? false,
    qc_final_pass: a.progress?.qc_final_pass ?? false,
    actual_load_date: a.progress?.actual_load_date ?? null,
    install_date: a.progress?.install_date ?? null,
    qc_install_date: a.progress?.qc_install_date ?? null,
    pct: computePct(a.progress),
    status: computeStatus(a.progress),
  }
}

function rollup(rows: { weight_kg: unknown; progress: ProgressFields | null }[]) {
  let totalWeight = 0
  let weightedPct = 0
  const buckets = { notstart: 0, in_progress: 0, done: 0 }
  for (const r of rows) {
    const w = r.weight_kg != null ? Number(r.weight_kg) : 0
    const pct = computePct(r.progress)
    totalWeight += w
    weightedPct += w * pct
    const status = computeStatus(r.progress)
    if (status === 'done') buckets.done++
    else if (status === 'notstart') buckets.notstart++
    else buckets.in_progress++
  }
  return {
    assembly_count: rows.length,
    total_weight_kg: totalWeight,
    pct: totalWeight > 0 ? Math.round((weightedPct / totalWeight) * 100) / 100 : 0,
    buckets,
  }
}
