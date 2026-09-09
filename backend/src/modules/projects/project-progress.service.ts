import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { stripContractPrefix } from '../bom-upload/xlsx-parser.service'
import { ProgressChangeLogService, type DiffEntry } from './progress-change-log.service'
import { STAGE_WEIGHTS, FAB_STAGES, effectiveQty, clampPct, clampPcs, PAYMENT_STATUSES, buildProgressCreateDefaults } from './progress-shared'
import type { FabStage, PaymentStatus } from './progress-shared'

// Re-exported for backward compatibility — every other call site in this
// module (spec file, bom-upload carry-forward) still imports these from
// here. Canonical definitions live in progress-shared.ts (progress-change-log.service.ts
// needs them too, and importing them from THIS file would be circular
// since this file also imports ProgressChangeLogService above).
export { STAGE_WEIGHTS, FAB_STAGES, effectiveQty, clampPct, clampPcs, PAYMENT_STATUSES }
export type { FabStage, PaymentStatus }

export type ProgressStatus = 'notstart' | 'fabrication' | 'load' | 'erection' | 'done'
// Light = phase in progress, dark = phase complete-and-waiting — drives the
// two-shade 3D coloring. Single-shade statuses always report 'light'.
export type ProgressShade = 'light' | 'dark'

type FabStageFields = Record<FabStage, number>

interface ProgressFields extends FabStageFields {
  fab_plan_finish_date: Date | null
  fab_actual_finish_date: Date | null
  plan_load_date: Date | null
  actual_load_date: Date | null
  loaded_pcs: number
  erected_pcs: number
  erection_plan_finish_date: Date | null
  erection_actual_finish_date: Date | null
  payment_status: string
}

// Plain-interface DTO (paint-config precedent) — stage percents clamp
// server-side to 0..100 (never 400: the real sheet has "50"-for-0.5 typo
// entries, clamping is the design's own semantics), dates arrive as
// 'YYYY-MM-DD' strings with explicit null clearing, pcs clamp to the
// assembly's own qty. Omitted fields are left unchanged.
export interface UpdateAssemblyProgressDto extends Partial<FabStageFields> {
  fab_plan_finish_date?: string | null
  fab_actual_finish_date?: string | null
  plan_load_date?: string | null
  actual_load_date?: string | null
  loaded_pcs?: number
  erected_pcs?: number
  erection_plan_finish_date?: string | null
  erection_actual_finish_date?: string | null
  payment_status?: string
}

// Bulk applies ONE payload to many rows whose qty differ — loaded_pcs/
// erected_pcs take the same raw pcs count as a single row; each row clamps
// independently to its own qty in the loop below, so one shared value is
// naturally capped per-assembly instead of needing a flat max up front.
export interface BulkUpdateAssemblyProgressDto extends UpdateAssemblyProgressDto {
  assembly_ids: number[]
}

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

export type PhaseKey = 'fabrication' | 'payment' | 'load' | 'erection'
export interface PhaseState { passed: boolean; shade: ProgressShade }

// Independent per-phase pass/shade — NOT a ladder, unlike computeStatus()
// above. Each phase reasons only about its own field(s): an assembly can
// legally pass Payment while still mid-fabrication, or pass Erection while
// still unpaid. Feeds the 4 filter pills — clicking one highlights every
// assembly that has passed or is passing that specific phase, regardless of
// what other phases it's also in/past. Deliberately does not reproduce
// computeStatus()'s terminal 'done' collapse: full erection here is its own
// passed+dark state, not folded into anything else.
export function computePhases(p: ProgressFields | null, qty: unknown): Record<PhaseKey, PhaseState> {
  const q = effectiveQty(qty)
  const fab = computeFabPct(p)
  const loaded = p?.loaded_pcs ?? 0
  const erected = p?.erected_pcs ?? 0
  return {
    fabrication: { passed: fab > 0, shade: fab >= 100 ? 'dark' : 'light' },
    // 3-state status, but only "Paid" counts as passed — no partial state,
    // so shade is only ever 'dark' (only read when passed === true).
    payment: { passed: p?.payment_status === 'Paid', shade: 'dark' },
    load: { passed: loaded > 0, shade: loaded >= q ? 'dark' : 'light' },
    erection: { passed: erected > 0, shade: erected >= q ? 'dark' : 'light' },
  }
}

@Injectable()
export class ProjectProgressService {
  private readonly changeLog: ProgressChangeLogService

  // changeLog is an optional param (defaulted in-body, not @Optional()) so
  // the 28+ existing `new ProjectProgressService(prisma)` call sites in
  // project-progress.service.spec.ts keep compiling unchanged — NestJS DI
  // still injects the real one at runtime once it's registered in
  // ProjectsModule (standard constructor injection, no decorator needed).
  constructor(private readonly prisma: PrismaService, changeLog?: ProgressChangeLogService) {
    this.changeLog = changeLog ?? new ProgressChangeLogService(prisma)
  }

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
      select: { id: true, qty: true, dispatch: { select: { project_id: true } } },
    })
    if (!assembly) throw new NotFoundException(`Assembly ${assemblyId} not found in project ${projectCode}`)
    const q = effectiveQty(assembly.qty)

    const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null)
    const pct = (v: number | undefined) => (v === undefined ? undefined : clampPct(v))
    const fields = {
      ...Object.fromEntries(FAB_STAGES.map(s => [s, pct(dto[s])])),
      fab_plan_finish_date: toDate(dto.fab_plan_finish_date),
      fab_actual_finish_date: toDate(dto.fab_actual_finish_date),
      plan_load_date: toDate(dto.plan_load_date),
      actual_load_date: toDate(dto.actual_load_date),
      loaded_pcs: dto.loaded_pcs === undefined ? undefined : clampPcs(dto.loaded_pcs, q),
      erected_pcs: dto.erected_pcs === undefined ? undefined : clampPcs(dto.erected_pcs, q),
      erection_plan_finish_date: toDate(dto.erection_plan_finish_date),
      erection_actual_finish_date: toDate(dto.erection_actual_finish_date),
      payment_status: dto.payment_status,
    }

    // Transaction so the pre-write read, the upsert, and the change-log
    // batch it feeds are all atomic — a diff computed against a row that
    // could still change underneath it would be a lie.
    const row = await this.prisma.$transaction(async tx => {
      const current = await tx.bom_assembly_progress.findUnique({ where: { assembly_id: assemblyId } })
      const diff = this.changeLog.computeDiff(current, fields)
      const upserted = await tx.bom_assembly_progress.upsert({
        where: { assembly_id: assemblyId },
        create: { assembly_id: assemblyId, ...buildProgressCreateDefaults(fields, userId) },
        update: { ...fields, write_uid: userId, write_date: new Date() },
      })
      await this.changeLog.logBatch(tx, {
        projectId: assembly.dispatch.project_id,
        source: 'manual_edit',
        userId,
        rows: [{ assemblyId, diff }],
      })
      return upserted
    })
    const { status, shade } = computeStatus(row, assembly.qty)
    // claimed_weight_kg/delivered_weight_kg dropped from the API surface —
    // the DB columns still exist (unused now) but the app no longer reads
    // or writes them, so they're excluded here rather than left as raw
    // Prisma Decimal values on the response.
    const { claimed_weight_kg: _claimed, delivered_weight_kg: _delivered, ...rowWithoutRemovedFields } = row
    return {
      ...rowWithoutRemovedFields,
      fab_pct: computeFabPct(row),
      load_pct: Math.round((row.loaded_pcs / q) * 100),
      erect_pct: Math.round((row.erected_pcs / q) * 100),
      payment_pct: row.payment_status === 'Paid' ? 100 : 0,
      status,
      shade,
      phases: computePhases(row, assembly.qty),
    }
  }

  // BIM-first progress entry (2026-09) — lets a user remove a placeholder
  // assembly they don't need (e.g. a BIM mark that turned out irrelevant,
  // or a duplicate). Soft-delete via the same status='INACTIVE' mechanism
  // every other supersession in this app already uses — every read path
  // already filters ACTIVE, so no new filtering logic is needed anywhere.
  // Scoped to source: 'BIM_PLACEHOLDER' so a real BOM assembly (managed
  // exclusively by BOM upload/re-upload) can never be deleted this way —
  // "not found" covers both "doesn't exist" and "isn't a placeholder
  // assembly" identically, so this endpoint can't be used to probe which
  // real assembly ids exist in a project.
  async deletePlaceholderAssembly(projectCode: string, assemblyId: number, userId: number) {
    const assembly = await this.prisma.bom_assembly.findFirst({
      where: {
        id: assemblyId, status: 'ACTIVE',
        dispatch: { project: { project_code: projectCode }, source: 'BIM_PLACEHOLDER' },
      },
      select: { id: true },
    })
    if (!assembly) throw new NotFoundException(`Placeholder assembly ${assemblyId} not found in project ${projectCode}`)

    await this.prisma.bom_assembly.update({
      where: { id: assemblyId },
      data: { status: 'INACTIVE', deleted_by_user: true, write_uid: userId, write_date: new Date() },
    })
    return { deleted: true }
  }

  // Placeholder assemblies a user deleted (deleted_by_user=true) — NOT ones
  // deactivated by carryForwardProgress reconciliation, which also sets
  // status='INACTIVE' but leaves deleted_by_user false. Only the former are
  // meaningfully restorable; a reconciled assembly's progress already lives
  // under a different, real assembly_id, so "restoring" it would just
  // recreate a mark that collides with the real BOM data.
  async listDeletedPlaceholderAssemblies(projectCode: string) {
    const rows = await this.prisma.bom_assembly.findMany({
      where: {
        status: 'INACTIVE', deleted_by_user: true,
        dispatch: { project: { project_code: projectCode }, source: 'BIM_PLACEHOLDER' },
      },
      orderBy: { write_date: 'desc' },
      select: { id: true, assembly_mark: true, write_date: true },
    })
    return rows.map(r => ({ assembly_id: r.id, mark: r.assembly_mark, deleted_at: r.write_date }))
  }

  // Mirrors deletePlaceholderAssembly's scoping exactly, plus deleted_by_user:
  // true — a reconciled (deleted_by_user=false) assembly 404s here just like
  // a nonexistent one, for the reason above.
  async restorePlaceholderAssembly(projectCode: string, assemblyId: number, userId: number) {
    const assembly = await this.prisma.bom_assembly.findFirst({
      where: {
        id: assemblyId, status: 'INACTIVE', deleted_by_user: true,
        dispatch: { project: { project_code: projectCode }, source: 'BIM_PLACEHOLDER' },
      },
      select: { id: true },
    })
    if (!assembly) throw new NotFoundException(`Deleted placeholder assembly ${assemblyId} not found in project ${projectCode}`)

    await this.prisma.bom_assembly.update({
      where: { id: assemblyId },
      data: { status: 'ACTIVE', deleted_by_user: false, write_uid: userId, write_date: new Date() },
    })
    return { restored: true }
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
      select: { id: true, qty: true, progress: true },
    })
    if (!owned.length) return { updated: 0 }

    const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null)
    const pct = (v: number | undefined) => (v === undefined ? undefined : clampPct(v))
    // Shared across all rows; pcs are per-row via the set-full flags below
    // (one absolute count can't apply to rows with different qty).
    const shared = {
      ...Object.fromEntries(FAB_STAGES.map(s => [s, pct(dto[s])])),
      fab_plan_finish_date: toDate(dto.fab_plan_finish_date),
      fab_actual_finish_date: toDate(dto.fab_actual_finish_date),
      plan_load_date: toDate(dto.plan_load_date),
      actual_load_date: toDate(dto.actual_load_date),
      erection_plan_finish_date: toDate(dto.erection_plan_finish_date),
      erection_actual_finish_date: toDate(dto.erection_actual_finish_date),
      payment_status: dto.payment_status,
    }

    // Callback-transaction form (not the array-of-promises form this used
    // to be) — needed so the change-log batch can be created and its id
    // referenced by the entries in the SAME transaction as the upserts.
    await this.prisma.$transaction(async tx => {
      const diffRows: { assemblyId: number; diff: DiffEntry[] }[] = []
      for (const { id, qty, progress } of owned) {
        const q = effectiveQty(qty)
        const fields = {
          ...shared,
          loaded_pcs: dto.loaded_pcs === undefined ? undefined : clampPcs(dto.loaded_pcs, q),
          erected_pcs: dto.erected_pcs === undefined ? undefined : clampPcs(dto.erected_pcs, q),
        }
        diffRows.push({ assemblyId: id, diff: this.changeLog.computeDiff(progress, fields) })
        // Every targeted row is still upserted regardless of diff (unchanged
        // behavior — write_uid/write_date always bump on Apply, same as
        // before) — only the LOGGING below is diff-gated, not the write.
        await tx.bom_assembly_progress.upsert({
          where: { assembly_id: id },
          create: { assembly_id: id, ...buildProgressCreateDefaults(fields, userId) },
          update: { ...fields, write_uid: userId, write_date: new Date() },
        })
      }
      await this.changeLog.logBatch(tx, {
        projectId: project.id,
        source: 'bulk_edit',
        userId,
        rows: diffRows,
      })
    })
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

    // BIM-first progress entry (2026-09) — only the one placeholder zone per
    // project needs this: which of its marks are still present in the
    // project's latest complete BIM model, vs. stale (removed or renamed in
    // a newer version — see the design doc's "BIM re-upload" section). A
    // normal zone's marks come from real BOM and are never "stale" this way.
    let staleMarks: Set<string> | null = null
    if (zone.is_placeholder) {
      const latestModel = await this.findLatestCompleteModel(project.id)
      const currentMarks = latestModel
        ? new Set((await this.prisma.bim_element.findMany({
            where: { model_id: latestModel.id, ifc_type: 'IfcElementAssembly', mark: { not: null } },
            select: { mark: true },
          })).map(e => e.mark as string))
        : new Set<string>()
      staleMarks = new Set(assemblies.filter(a => !currentMarks.has(a.assembly_mark)).map(a => a.assembly_mark))
    }

    // zone_id wasn't on this row shape at all until the mobile Drawing
    // sheet needed it (MobileDrawingSheet/MobileBimCard's "show drawing"
    // button) — it silently no-op'd at zone level since the frontend type
    // declares zone_id optional, while getProjectRows (which always
    // attached it) worked fine. We already fetched `zone` above; just carry
    // its id through instead of adding a query for something already known.
    return assemblies.map(a => ({
      ...mapAssemblyRow(a),
      zone_id: zone.id,
      is_placeholder: zone.is_placeholder,
      stale: staleMarks ? staleMarks.has(a.assembly_mark) : false,
    }))
  }

  // Same shape as getZoneRows, but every zone of the project at once — feeds
  // the Overview tab's project-wide isolate-by-status 3D view. Unlike
  // getZoneRows (caller already knows the zone from the URL), this also
  // carries zone_code/zone_label per row — the mobile 3D tap-to-identify
  // feature needs it since one project-wide model spans every zone.
  async getProjectRows(projectCode: string) {
    const project = await this.findProjectOrThrow(projectCode)
    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: project.id } },
      orderBy: { assembly_mark: 'asc' },
      select: {
        id: true, assembly_mark: true, weight_kg: true, qty: true,
        progress: true,
        dispatch: { select: { zone: { select: { id: true, code: true, label: true } } } },
      },
    })

    return assemblies.map(a => ({
      ...mapAssemblyRow(a),
      zone_id: a.dispatch.zone.id,
      zone_code: a.dispatch.zone.code,
      zone_label: a.dispatch.zone.label,
      is_placeholder: false,
      stale: false,
    }))
  }

  async getOverview(projectCode: string) {
    const project = await this.findProjectOrThrow(projectCode)
    const zones = await this.prisma.project_zone.findMany({
      where: { project_id: project.id, active: true },
      orderBy: [{ erection_sequence: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, label: true, is_placeholder: true, target_start: true, target_end: true },
    })

    // One query for the whole project, grouped in JS — assembly counts per
    // project are in the hundreds, not worth per-zone round-trips.
    const assemblies = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { project_id: project.id } },
      select: { weight_kg: true, qty: true, progress: true, dispatch: { select: { zone_id: true, source: true } } },
    })

    const perZone = zones.map(z => {
      const rows = assemblies.filter(a => a.dispatch.zone_id === z.id)
      return { zone: z, ...rollup(rows) }
    })
    // BIM-first progress entry (2026-09) — the placeholder zone's own row
    // above still reports its real (if unweighted) assembly count, but the
    // PROJECT total must never include BIM-only data the eventual real BOM
    // will supersede (weight_kg/qty are null on placeholder rows anyway,
    // which would otherwise silently understate a mixed total).
    const total = rollup(assemblies.filter(a => a.dispatch.source !== 'BIM_PLACEHOLDER'))
    return {
      zones: perZone.map(({ zone, ...agg }) => ({
        zone_id: zone.id, zone_code: zone.code, zone_label: zone.label, is_placeholder: zone.is_placeholder, ...agg,
      })),
      total,
      schedule_progress: computeScheduleProgress(zones, total.fab_pct, total.erect_pct),
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
    fab_plan_finish_date: p?.fab_plan_finish_date ?? null,
    fab_actual_finish_date: p?.fab_actual_finish_date ?? null,
    plan_load_date: p?.plan_load_date ?? null,
    actual_load_date: p?.actual_load_date ?? null,
    loaded_pcs: p?.loaded_pcs ?? 0,
    erected_pcs: p?.erected_pcs ?? 0,
    erection_plan_finish_date: p?.erection_plan_finish_date ?? null,
    erection_actual_finish_date: p?.erection_actual_finish_date ?? null,
    payment_status: p?.payment_status ?? 'Not Disbursed',
    fab_pct: computeFabPct(p),
    load_pct: Math.round(((p?.loaded_pcs ?? 0) / q) * 100),
    erect_pct: Math.round(((p?.erected_pcs ?? 0) / q) * 100),
    payment_pct: p?.payment_status === 'Paid' ? 100 : 0,
    status,
    shade,
    phases: computePhases(p, a.qty),
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
    payment_pct: row.payment_pct,
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
    payment_pct: null as number | null,
    status: null as ProgressStatus | null,
    shade: null as ProgressShade | null,
  }
}

export interface PlanDateBucket {
  date: string // YYYY-MM-DD — the shared fab_plan_finish_date/erection_plan_finish_date value for this row
  total: number
  not_started: number
  on_time: number
  delay: number
}

// Plan-vs-actual grouped by each distinct plan date, counts only (2026-09).
// Dates don't average across many assemblies/zones the way a percent does —
// a MAX or weighted-mean date across unrelated zones on different schedules
// would misrepresent the project, and a single date pair can't capture that
// each assembly plans its own. Counting into on_time/delay per plan-date
// sidesteps both problems: sums cleanly regardless of how many zones/dates
// are involved, and every distinct date gets its own honest bucket.
//
// Per assembly (only counted if its plan date is set at all):
//   not_started — no progress on this phase yet (fab_pct 0, or erected_pcs 0)
//   on_time     — started, and (done with actual date on/before plan) OR
//                 (not done and today is still on/before plan)
//   delay       — started, and (done but actual date after plan) OR
//                 (not done and today is already past plan)
// A started-but-undated completion (fab_pct 100 with no fab_actual_finish_date
// entered) falls back to comparing today against plan, same as "not done" —
// the best available signal when nobody recorded exactly when it finished.
function computePlanBreakdown(
  rows: { progress: ProgressFields | null }[],
  kind: 'fab' | 'erection',
): PlanDateBucket[] {
  const today = new Date()
  const byDate = new Map<string, { total: number; not_started: number; on_time: number; delay: number }>()
  for (const r of rows) {
    const planDate = kind === 'fab' ? r.progress?.fab_plan_finish_date : r.progress?.erection_plan_finish_date
    if (!planDate) continue
    const actualDate = kind === 'fab' ? r.progress?.fab_actual_finish_date : r.progress?.erection_actual_finish_date
    const started = kind === 'fab' ? computeFabPct(r.progress) > 0 : (r.progress?.erected_pcs ?? 0) > 0

    const key = planDate.toISOString().slice(0, 10)
    const bucket = byDate.get(key) ?? { total: 0, not_started: 0, on_time: 0, delay: 0 }
    bucket.total++
    if (!started) bucket.not_started++
    else if ((actualDate ?? today) <= planDate) bucket.on_time++
    else bucket.delay++
    byDate.set(key, bucket)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({ date, ...b }))
}

// Three separate rollup numbers, deliberately no combined total (spec):
// fab weighted by weight_kg (matches the Excel's own overall column),
// load/erection by pieces (Σ/Σ, not averaged per-row).
function rollup(rows: { weight_kg: unknown; qty: unknown; progress: ProgressFields | null }[]) {
  let totalWeight = 0
  let weightedFab = 0
  let weightedPayment = 0
  let totalQty = 0
  let loadedPcs = 0
  let erectedPcs = 0
  const buckets = { notstart: 0, in_progress: 0, done: 0 }
  for (const r of rows) {
    const w = r.weight_kg != null ? Number(r.weight_kg) : 0
    totalWeight += w
    weightedFab += w * computeFabPct(r.progress)
    weightedPayment += w * (r.progress?.payment_status === 'Paid' ? 100 : 0)
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
    payment_pct: totalWeight > 0 ? Math.round((weightedPayment / totalWeight) * 100) / 100 : 0,
    total_qty: totalQty,
    loaded_pcs: loadedPcs,
    erected_pcs: erectedPcs,
    load_pct: totalQty > 0 ? Math.round((loadedPcs / totalQty) * 100) : 0,
    erect_pct: totalQty > 0 ? Math.round((erectedPcs / totalQty) * 100) : 0,
    buckets,
    // Scoped to whatever `rows` this call received — a per-zone call gets a
    // zone-scoped breakdown, the project-wide call (getOverview's `total`)
    // gets a project-wide one, automatically, same as every field above.
    fab_plan_breakdown: computePlanBreakdown(rows, 'fab'),
    erection_plan_breakdown: computePlanBreakdown(rows, 'erection'),
  }
}

export interface ScheduleProgress {
  window_start: string | null // YYYY-MM-DD — earliest zone target_start
  window_end: string | null // YYYY-MM-DD — latest zone target_end
  // % of [window_start, window_end] elapsed as of today, clamped 0-100 —
  // null when there's no valid window (no zone has both dates set, or
  // end <= start). One number shared by all three phases below: fab and
  // erection both work inside the same whole-zone window (2026-09 — see
  // project_zone.target_start/end's schema comment), so a phase-specific
  // plan% would just repeat this same value three times.
  plan_pct: number | null
  fab_actual_pct: number
  erection_actual_pct: number
  // Flat 50/50 split, not weight_kg-proportional — mirrors the client's own
  // "Progress Overall" sheet formula: %Fab+Erection = (Fab% × 0.5) + (Erection% × 0.5).
  combined_actual_pct: number
}

// Project-wide schedule position vs actual, feeding the Overview tab's
// Plan-vs-Actual card. Window comes from project_zone.target_start/end,
// rolled up across every non-placeholder zone (earliest start, latest end)
// — the same fields the per-zone delay-detection badge (computeDelayInfo,
// frontend delayStatus.ts) reads, just aggregated project-wide here instead
// of per-zone.
function computeScheduleProgress(
  zones: { is_placeholder: boolean; target_start: Date | null; target_end: Date | null }[],
  fabActualPct: number,
  erectionActualPct: number,
): ScheduleProgress {
  const active = zones.filter(z => !z.is_placeholder)
  const starts = active.map(z => z.target_start).filter((d): d is Date => d != null)
  const ends = active.map(z => z.target_end).filter((d): d is Date => d != null)
  const windowStart = starts.length ? new Date(Math.min(...starts.map(d => d.getTime()))) : null
  const windowEnd = ends.length ? new Date(Math.max(...ends.map(d => d.getTime()))) : null

  let planPct: number | null = null
  if (windowStart && windowEnd && windowEnd.getTime() > windowStart.getTime()) {
    const today = new Date()
    const totalMs = windowEnd.getTime() - windowStart.getTime()
    const elapsedMs = today.getTime() - windowStart.getTime()
    planPct = Math.round(Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) * 100) / 100
  }

  return {
    window_start: windowStart ? windowStart.toISOString().slice(0, 10) : null,
    window_end: windowEnd ? windowEnd.toISOString().slice(0, 10) : null,
    plan_pct: planPct,
    fab_actual_pct: fabActualPct,
    erection_actual_pct: erectionActualPct,
    combined_actual_pct: Math.round((fabActualPct * 0.5 + erectionActualPct * 0.5) * 100) / 100,
  }
}
