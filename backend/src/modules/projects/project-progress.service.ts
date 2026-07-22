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

    return assemblies.map(a => ({
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
    }))
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
  // assembly marks. Exact match first; fallback strips the Tekla contract-no
  // prefix off the BIM-side mark (reuses the BOM upload parser's own logic —
  // BOM marks are already stored stripped, BIM marks come raw off IFC TAG).
  // Junk BIM marks ("0(?)" etc.) simply never match — no special-casing.
  async getZoneBimMatch(projectCode: string, zoneId: number) {
    const project = await this.findProjectOrThrow(projectCode)
    const model = await this.prisma.bim_model.findFirst({
      where: { project_id: project.id, translation_status: 'complete' },
      orderBy: [{ major_version: 'desc' }, { minor_version: 'desc' }],
      select: { id: true },
    })
    if (!model) return { model_id: null, matches: [] }

    const [assemblies, bimElements] = await Promise.all([
      this.prisma.bom_assembly.findMany({
        where: { status: 'ACTIVE', dispatch: { project_id: project.id, zone_id: zoneId } },
        select: { id: true, assembly_mark: true },
      }),
      this.prisma.bim_element.findMany({
        where: { model_id: model.id, ifc_type: 'IfcElementAssembly', mark: { not: null }, global_id: { not: null } },
        select: { mark: true, global_id: true },
      }),
    ])

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

    const matches = assemblies.flatMap(a => {
      const globalIds = byBimMark.get(a.assembly_mark)
      return globalIds?.length ? [{ assembly_id: a.id, mark: a.assembly_mark, global_ids: globalIds }] : []
    })
    return { model_id: model.id, matches }
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
