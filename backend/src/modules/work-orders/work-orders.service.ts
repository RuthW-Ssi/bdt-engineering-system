import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, WoEventType, WoStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { WorkOrderAutoCreateService } from './wo-auto-create.service'
import { AcceptVersionDto } from './dto/accept-version.dto'
import { CancelWoDto, WoDoneDto } from './dto/wo-transition.dto'
import { RemoveMarkDto } from './dto/remove-mark.dto'
import { UpdateConsumeDto } from './dto/update-consume.dto'
import { UpdatePartsDto } from './dto/update-parts.dto'

/**
 * WO list default sort tiebreak (T-WO.09): active work first, terminal last.
 * Primary sort is plan_start asc (nulls last); this is the secondary key.
 */
export const WO_STATUS_PRIORITY: Record<WoStatus, number> = {
  ON_HOLD: 0,
  IN_PROGRESS: 1,
  PAUSED: 2,
  RELEASED: 3,
  NOT_STARTED: 4,
  DONE: 5,
  CANCELLED: 6,
}

/**
 * Every status-machine action, including 'done'/'cancel' — kept here (not just in
 * TransitionAction) so WO_ACTIONS / allowedActionsFrom() remain the single source
 * of truth for "what statuses can reach what" across ALL actions, even though
 * 'done'/'cancel' are executed by their own dedicated methods below (their bodies
 * are per-mark arrays, not the simple {reason}/{notes} shape transition() takes).
 */
export type WoAction = 'release' | 'start' | 'pause' | 'resume' | 'done' | 'cancel' | 'hold'

/** The subset transition() itself actually executes — see WoAction's doc comment. */
export type TransitionAction = Exclude<WoAction, 'done' | 'cancel'>

interface WoActionSpec {
  from: WoStatus[]
  to: WoStatus
  event?: WoEventType // release has no event (sets released_at/by only)
}

/**
 * T-WO.05 status state machine. `from` lists the statuses the action is valid in.
 * 'hold' (multi-mark redesign, 2026-09-17): manual only now — factory admin/manager
 * action, no longer auto-triggered by BOM uploads (see the deleted
 * applyBomChangeHolds()). 'resume' FROM ON_HOLD (restoring pre_hold_status) is
 * handled by resume()'s own branch, not by this table — its target status is
 * dynamic (whatever pre_hold_status was), unlike every other action's fixed `to`.
 */
export const WO_ACTIONS: Record<WoAction, WoActionSpec> = {
  release: { from: ['NOT_STARTED'], to: 'RELEASED' },
  start: { from: ['RELEASED'], to: 'IN_PROGRESS', event: 'START' },
  pause: { from: ['IN_PROGRESS'], to: 'PAUSED', event: 'PAUSE' },
  resume: { from: ['PAUSED'], to: 'IN_PROGRESS', event: 'RESUME' },
  done: { from: ['IN_PROGRESS', 'PAUSED'], to: 'DONE', event: 'DONE' },
  cancel: { from: ['NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD'], to: 'CANCELLED', event: 'CANCEL' },
  hold: { from: ['NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED'], to: 'ON_HOLD', event: 'HOLD' },
}

/** Action names valid from a given status — surfaced in the 409 body as allowed_next. */
export function allowedActionsFrom(status: WoStatus): WoAction[] {
  const base = (Object.keys(WO_ACTIONS) as WoAction[]).filter((a) => WO_ACTIONS[a].from.includes(status))
  // resume-from-ON_HOLD isn't in WO_ACTIONS (see its doc comment above) — add it
  // back in here so a 409 on some OTHER action from ON_HOLD still truthfully
  // reports that 'resume' (the unhold path) is available.
  if (status === 'ON_HOLD' && !base.includes('resume')) return [...base, 'resume']
  return base
}

// List view: current (non-removed) marks only — is_outdated / assembly_marks /
// qty rollups all reflect "what's actually still being produced on this WO".
const WO_LIST_INCLUDE = {
  manufacturing_order: {
    select: {
      id: true,
      mo_code: true,
      status: true,
      primary_mark_prefix_code: true,
      primary_mark_prefix: true,
    },
  },
  mrp_workcenter: { select: { id: true, code: true, name: true, machine: true } },
  subcontractor: { select: { id: true, code: true, name: true } },
  marks: {
    where: { removed_at: null },
    include: { bom_assembly: { include: { dispatch: { include: { project: true, zone: true, sub_zone: true } } } } },
  },
} satisfies Prisma.work_orderInclude

/**
 * Structural shape shared by `compareAssemblyToLatest()` / `classifyAssemblyDelta()` /
 * `specOf()` — anything with these fields can be compared, whether it's a mark's own
 * snapshotted `bom_assembly` or a candidate "currently ACTIVE row" fetched separately
 * (single lookup or batched).
 */
type BomAssemblyLike = {
  id: number
  dispatch_id: number
  assembly_mark: string
  qty: Prisma.Decimal | number | null
  weight_kg: Prisma.Decimal | null
  surface_area_m2: Prisma.Decimal | null
  length_mm: Prisma.Decimal | null
  width_mm: Prisma.Decimal | null
  height_mm: Prisma.Decimal | null
  attributes: Prisma.JsonValue
}

export interface EnrichedActivity {
  name: string; measure: string | null; per_minute: number | null; formula_code: string | null
  tools: { id: number; code: string; name: string; qty: number }[]
  consumables: { resource_id: number; code: string; name: string; formula_id?: number | null; formula_name?: string | null; formula_unit?: string | null; consume_rate?: number | null; consume_unit?: string | null }[] | null
  labors: { skill: string; qty: number; level?: string | null }[] | null
}

export interface DurationBreakdownRow {
  name: string; kind: string; formula_code: string | null
  dimension_label: string; dimension_value: number | null
  per_minute: number | null; minutes: number; is_setup: boolean
}

// Operation-level — no duration_breakdown here any more (multi-mark redesign):
// "how many minutes did this activity contribute" now depends on WHICH mark
// (each has its own bom dimensions), so it moved onto each mark entry in
// findOne()'s `marks[]` instead of living once at the WO level.
export interface SourceRoutingOp {
  id: number; op_code: string; name: string; time_mode: string
  time_cycle: unknown; time_cycle_manual: unknown; formula_expr: string | null
  op_type: { id: number; key: string; label: string; color: string } | null
  activities: EnrichedActivity[]
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly woAutoCreate: WorkOrderAutoCreateService,
  ) {}

  // ── List (filter status | mo_id | work_center_id | mark_prefix_code · search wo_code) ──
  async findAll(opts: {
    status?: WoStatus
    mo_id?: number
    work_center_id?: number
    mark_prefix_code?: string
    search?: string
    assembly_mark?: string
    project_id?: number
    zone_id?: number
  }) {
    // Sprint 24 (progress page WO panel): the assembly filter goes through
    // mark + dispatch scope, NOT raw bom_assembly_id — accept-new-version
    // re-points that FK per mark, so an id filter would silently miss WOs
    // already advanced to a newer bom_assembly row for the same physical mark
    // (same reasoning as loadCancelSiblings).
    const assemblyScope: Prisma.bom_assemblyWhereInput | null =
      opts.assembly_mark || opts.project_id || opts.zone_id
        ? {
            ...(opts.assembly_mark ? { assembly_mark: opts.assembly_mark } : {}),
            ...(opts.project_id || opts.zone_id
              ? {
                  dispatch: {
                    ...(opts.project_id ? { project_id: opts.project_id } : {}),
                    ...(opts.zone_id ? { zone_id: opts.zone_id } : {}),
                  },
                }
              : {}),
          }
        : null

    const where: Prisma.work_orderWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.mo_id ? { mo_id: opts.mo_id } : {}),
      ...(opts.work_center_id ? { work_center_id: opts.work_center_id } : {}),
      ...(opts.mark_prefix_code
        ? { manufacturing_order: { primary_mark_prefix_code: opts.mark_prefix_code } }
        : {}),
      ...(opts.search ? { wo_code: { contains: opts.search, mode: 'insensitive' } } : {}),
      ...(assemblyScope ? { marks: { some: { removed_at: null, bom_assembly: assemblyScope } } } : {}),
    }

    const rows = await this.prisma.work_order.findMany({
      where,
      include: WO_LIST_INCLUDE,
    })

    const outdatedWoIds = await this.computeOutdatedWoIds(rows)
    const mapped = rows.map((r) => this.toListRow(r, outdatedWoIds.has(r.id)))
    // Default sort: plan_start asc (nulls last), then status priority (T-WO.09).
    return mapped.sort((a, b) => {
      const ax = a.plan_start ? a.plan_start.getTime() : Number.POSITIVE_INFINITY
      const bx = b.plan_start ? b.plan_start.getTime() : Number.POSITIVE_INFINITY
      if (ax !== bx) return ax - bx
      return WO_STATUS_PRIORITY[a.status] - WO_STATUS_PRIORITY[b.status]
    })
  }

  // ── Detail (+ per-mark snapshot dispatch/bom-version status + routing op activities) ──
  async findOne(id: number) {
    const wo = await this.prisma.work_order.findUnique({
      where: { id },
      include: {
        manufacturing_order: {
          select: { id: true, mo_code: true, status: true, primary_mark_prefix_code: true, primary_mark_prefix: true },
        },
        mrp_workcenter: { select: { id: true, code: true, name: true, machine: true } },
        subcontractor: { select: { id: true, code: true, name: true } },
        marks: {
          orderBy: { id: 'asc' },
          include: { bom_assembly: { include: { dispatch: { include: { project: true, zone: true, sub_zone: true } } } } },
        },
      },
    })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)

    // Per-mark: snapshot dispatch (soft ref) + BOM-version status (multi-mark
    // redesign — a WO no longer has ONE snapshot dispatch, each mark has its
    // own). Removed marks keep their snapshot_dispatch (history) but skip the
    // version-status comparison (nothing actionable once removed).
    const marks = await Promise.all(
      wo.marks.map(async (m) => {
        const snapshotDispatch = await this.prisma.bom_dispatch.findUnique({
          where: { id: m.bom_dispatch_id_snapshot },
          include: { project: true, zone: true, sub_zone: true },
        })
        const bom_version_status = m.removed_at ? null : await this.markVersionStatus(m)
        return {
          id: m.id,
          bom_assembly_id: m.bom_assembly_id,
          bom_assembly: m.bom_assembly,
          bom_dispatch_id_snapshot: m.bom_dispatch_id_snapshot,
          snapshot_dispatch: snapshotDispatch,
          qty_planned: m.qty_planned,
          qty_not_started: m.qty_not_started,
          qty_in_progress: m.qty_in_progress,
          qty_done: m.qty_done,
          qty_qc_passed: m.qty_qc_passed,
          qty_rework: m.qty_rework,
          qty_renew: m.qty_renew,
          removed_at: m.removed_at,
          removed_by: m.removed_by,
          removed_reason: m.removed_reason,
          created_at: m.created_at,
          created_by: m.created_by,
          bom_version_status,
          duration_breakdown: [] as DurationBreakdownRow[], // filled in below once activities are resolved
        }
      }),
    )
    const marksById = new Map(marks.map((m) => [m.id, m]))

    // source_routing_op_id is a soft ref — fetch activities_snapshot + resolve machine/tool names.
    let source_routing_op: SourceRoutingOp | null = null
    if (wo.source_routing_op_id) {
      const op = await this.prisma.mrp_routing_workcenter.findUnique({
        where: { id: wo.source_routing_op_id },
        select: {
          id: true, op_code: true, name: true,
          time_mode: true, time_cycle: true, time_cycle_manual: true, formula_expr: true,
          activities_snapshot: true,
          op_type: { select: { id: true, key: true, label: true, color: true } },
          operation_template: {
            select: {
              activities: {
                select: {
                  id: true, name: true, measure: true, per_minute: true,
                  source_activity_id: true,
                  tools: { select: { resource_id: true, qty: true } },
                  skills: { select: { skill: true, qty: true, level: true } },
                },
              },
            },
          },
        },
      })
      if (op) {
        type RawTool = { id: number; qty: number } | number
        type RawAct = {
          name: string; measure: string | null; per_minute: number | null
          formula_code: string | null; source_activity_id?: number | null
          tool_ids: RawTool[] | null
          labors: { skill: string; qty: number; level?: string | null }[] | null
          consumables: { resource_id: number; code: string; name: string }[] | null
        }

        // Priority: 1) per-WO snapshot in op_attributes  2) live operation_template.activities  3) stale activities_snapshot
        const woAttr = wo.op_attributes as any
        const woSnap: RawAct[] | null = Array.isArray(woAttr?.activities) && woAttr.activities.length > 0 ? woAttr.activities : null

        const liveActivities = op.operation_template?.activities ?? []
        const acts: RawAct[] = woSnap
          ? woSnap
          : liveActivities.length > 0
          ? liveActivities.map(a => ({
              name: a.name,
              measure: a.measure ?? null,
              per_minute: a.per_minute != null ? Number(a.per_minute) : null,
              formula_code: null,
              source_activity_id: a.source_activity_id ?? null,
              tool_ids: a.tools.map(t => ({ id: t.resource_id, qty: t.qty })),
              labors: a.skills.map(s => ({ skill: s.skill, qty: s.qty, level: s.level ?? null })),
              consumables: [],
            }))
          : (Array.isArray(op.activities_snapshot) ? (op.activities_snapshot as RawAct[]) : [])

        const toolIdOf = (t: RawTool): number | null => typeof t === 'number' ? t : (t.id ?? null)
        const toolQtyOf = (t: RawTool): number => typeof t === 'number' ? 1 : (t.qty ?? 1)

        const toolIds = [...new Set(acts.flatMap(a => (a.tool_ids ?? []).map(toolIdOf).filter((x): x is number => x != null)))]
        const resources = toolIds.length > 0
          ? await this.prisma.equipment_resource.findMany({
              where: { id: { in: toolIds } },
              select: { id: true, code: true, name: true },
            })
          : []
        const resMap = new Map(resources.map(r => [r.id, r]))

        // Fetch activity time data for duration breakdown
        const sourceActivityIds = [...new Set(acts.map(a => a.source_activity_id).filter((x): x is number => x != null))]
        const activityRows = sourceActivityIds.length > 0
          ? await this.prisma.activity.findMany({
              where: { id: { in: sourceActivityIds } },
              select: { id: true, formula_code: true, per_minute: true, duration_min: true, kind: true },
            })
          : []
        const actMap = new Map(activityRows.map(a => [a.id, a]))

        // Fetch live consumables from activity_consume (snapshot may have been saved with empty consumables)
        const consumeRows = sourceActivityIds.length > 0
          ? await this.prisma.activity_consume.findMany({
              where: { activity_id: { in: sourceActivityIds } },
              include: {
                material: { select: { id: true, default_code: true, name: true } },
                formula: { select: { id: true, name: true, expr: true, result_unit: true } },
              },
            })
          : []
        const consumeMap = new Map<number, { resource_id: number; code: string; name: string; formula_id: number | null; formula_name: string | null; formula_expr: string | null; result_unit: string | null }[]>()
        for (const row of consumeRows) {
          const list = consumeMap.get(row.activity_id) ?? []
          list.push({
            resource_id: row.material_id,
            code: row.material.default_code,
            name: row.material.name,
            formula_id: row.formula?.id ?? null,
            formula_name: row.formula?.name ?? null,
            formula_expr: row.formula?.expr ?? null,
            result_unit: row.formula?.result_unit ?? null,
          })
          consumeMap.set(row.activity_id, list)
        }

        const activities = acts.map(a => ({
          name: a.name, measure: a.measure, per_minute: a.per_minute, formula_code: a.formula_code,
          tools: (a.tool_ids ?? []).flatMap(t => {
            const id = toolIdOf(t)
            if (id == null) return []
            return [{ ...(resMap.get(id) ?? { id, code: '', name: '' }), qty: toolQtyOf(t) }]
          }),
          consumables: a.source_activity_id ? (consumeMap.get(a.source_activity_id) ?? []) : (a.consumables ?? []),
          labors: a.labors ?? null,
        }))

        // Duration breakdown — one array PER MARK now (each mark has its own bom
        // dimensions), same per-activity formula-code branching as before.
        const buildBreakdown = (bom: { length_mm: unknown; surface_area_m2: unknown; width_mm: unknown }): DurationBreakdownRow[] => {
          const lengthMm = Number(bom.length_mm ?? 0)
          const areaSqM = Number(bom.surface_area_m2 ?? 0)
          const widthMm = Number(bom.width_mm ?? 0)

          return acts.map(a => {
            const srcId = a.source_activity_id
            const act = srcId ? actMap.get(srcId) : null
            const formulaCode = act?.formula_code ?? null
            const rate = Number(act?.per_minute ?? 0)
            const fixedMin = Number(act?.duration_min ?? 0)
            const kind = act?.kind ?? 'run'

            if (kind === 'setup') {
              return { name: a.name, kind, formula_code: formulaCode, dimension_label: 'fixed', dimension_value: null, per_minute: rate, minutes: fixedMin, is_setup: true }
            }

            switch (formulaCode) {
              case 'weld_length_mm': case 'cut_length_mm': case 'edge_length_mm': case 'bevel_length_mm':
                return { name: a.name, kind, formula_code: formulaCode, dimension_label: `length = ${lengthMm} mm`, dimension_value: lengthMm, per_minute: rate, minutes: rate > 0 ? Math.round(lengthMm / rate * 10) / 10 : fixedMin, is_setup: false }
              case 'product_area': case 'sumNet_surface_area':
                return { name: a.name, kind, formula_code: formulaCode, dimension_label: `area = ${areaSqM} m²`, dimension_value: areaSqM, per_minute: rate, minutes: rate > 0 ? Math.round(areaSqM / rate * 10) / 10 : fixedMin, is_setup: false }
              case 'product_perimeter': {
                const perimM = (2 * lengthMm + 2 * widthMm) / 1000
                return { name: a.name, kind, formula_code: formulaCode, dimension_label: `perimeter = ${Math.round(perimM * 10) / 10} m`, dimension_value: perimM, per_minute: rate, minutes: rate > 0 ? Math.round(perimM / rate * 10) / 10 : fixedMin, is_setup: false }
              }
              default:
                return { name: a.name, kind, formula_code: formulaCode, dimension_label: 'fixed', dimension_value: null, per_minute: rate, minutes: fixedMin, is_setup: false }
            }
          })
        }

        for (const m of wo.marks) {
          const entry = marksById.get(m.id)
          if (entry) entry.duration_breakdown = buildBreakdown(m.bom_assembly)
        }

        source_routing_op = {
          id: op.id, op_code: op.op_code, name: op.name,
          time_mode: op.time_mode,
          time_cycle: op.time_cycle,
          time_cycle_manual: op.time_cycle_manual,
          formula_expr: op.formula_expr,
          op_type: op.op_type ?? null,
          activities,
        }
      }
    }

    const consumes = await this.prisma.work_order_consume.findMany({
      where: { work_order_id: id },
      orderBy: { id: 'asc' },
      include: { material: { select: { id: true, default_code: true, name: true } } },
    })

    const parts = await this.prisma.work_order_part.findMany({
      where: { work_order_id: id },
      orderBy: { id: 'asc' },
      include: {
        bom_assembly_part: {
          include: {
            part: { select: { id: true, part_mark: true, profile: true, grade: true, weight_kg: true } },
            assembly: { select: { id: true, assembly_mark: true } }, // which mark this part belongs to — grouping in the UI
          },
        },
      },
    })

    return {
      ...wo,
      marks,
      mark_prefix: wo.manufacturing_order.primary_mark_prefix,
      source_routing_op,
      consumes,
      parts,
    }
  }

  // ── Event log (newest first) ────────────────────────────────────────────────
  async getEvents(id: number) {
    await this.requireWo(id)
    return this.prisma.work_order_event.findMany({
      where: { work_order_id: id },
      orderBy: { recorded_at: 'desc' },
    })
  }

  // ── Status transitions (T-WO.05) — release / start / pause / hold / resume(-from-pause) ──
  async transition(
    id: number,
    action: TransitionAction,
    body: { reason?: string; notes?: string },
    userName: string,
  ) {
    const wo = await this.requireWo(id)
    const spec = WO_ACTIONS[action]

    if (!spec.from.includes(wo.status)) {
      // 409 with the actions actually available from the current status.
      throw new ConflictException({
        message: `Cannot ${action} a work order in status ${wo.status}`,
        current_status: wo.status,
        allowed_next: allowedActionsFrom(wo.status),
      })
    }

    const data: Prisma.work_orderUpdateInput = { status: spec.to, updated_by: userName }
    const now = new Date()
    if (action === 'release') {
      data.released_at = now
      data.released_by = userName
    } else if (action === 'start') {
      data.actual_start = now
    } else if (action === 'hold') {
      // Manual hold (multi-mark redesign, 2026-09-17) — factory admin/manager
      // action only, never auto-triggered by BOM uploads any more. Captures the
      // WO's current status so resume() can restore it.
      data.pre_hold_status = wo.status
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.work_order.update({ where: { id }, data })
      if (spec.event) {
        await tx.work_order_event.create({
          data: {
            work_order_id: id,
            event_type: spec.event,
            notes: body.reason ?? body.notes ?? null,
            recorded_by: userName,
          },
        })
      }
      // Seed qty_not_started = qty_planned on every non-removed mark (2026-09-23,
      // user: "หลังจากกด start ที่ wo not start ทั้งหมดจะต้องมีค่าเท่ากับ
      // quantity เพื่อเป็นค่าตั้งต้น" — once the WO actually starts, the whole
      // planned qty is "not started" until the user edits it down via the Marks
      // table). Safe to do unconditionally: 'start' only fires from RELEASED,
      // reachable only from NOT_STARTED — a WO can never re-enter RELEASED once
      // IN_PROGRESS, so this always runs exactly once per WO, before any
      // qty_not_started could have been written by done().
      if (action === 'start') {
        const marks = await tx.work_order_mark.findMany({
          where: { work_order_id: id, removed_at: null },
          select: { id: true, qty_planned: true },
        })
        for (const m of marks) {
          await tx.work_order_mark.update({ where: { id: m.id }, data: { qty_not_started: m.qty_planned } })
        }
      }
    })

    return this.findOne(id)
  }

  // ── Resume (T-WO.05 + manual hold/resume) ───────────────────────────────────
  /**
   * POST /wo/:id/resume covers TWO distinct transitions depending on the WO's
   * current status:
   *   - ON_HOLD  → restores `status` from `pre_hold_status` (cleared to null),
   *     writes an UNHOLD event. Target status is dynamic (whatever the WO was
   *     doing before the manual hold), unlike every fixed-target action in
   *     WO_ACTIONS, so this can't go through transition()'s generic dispatch.
   *   - anything else (PAUSED, in practice) → delegates to the existing
   *     transition('resume', …) machinery (PAUSED → IN_PROGRESS, RESUME event) —
   *     completely unchanged operator-level pause/resume behavior.
   */
  async resume(id: number, body: { notes?: string }, userName: string) {
    const wo = await this.requireWo(id)
    if (wo.status !== 'ON_HOLD') {
      return this.transition(id, 'resume', body, userName)
    }
    if (wo.pre_hold_status == null) {
      throw new ConflictException('Work order has no prior status recorded to resume to')
    }
    const target = wo.pre_hold_status

    await this.prisma.$transaction(async (tx) => {
      await tx.work_order.update({
        where: { id },
        data: { status: target, pre_hold_status: null, updated_by: userName },
      })
      await tx.work_order_event.create({
        data: { work_order_id: id, event_type: 'UNHOLD', notes: body.notes ?? null, recorded_by: userName },
      })
    })

    return this.findOne(id)
  }

  /**
   * Sum of a mark's QC breakdown (qc_passed + rework + renew), treating
   * omitted fields as 0 (2026-09-23, replaces the old single qty_reusable
   * scalar). Shared by done()/cancel()/removeMark()/acceptNewVersion() — the
   * sum must never exceed the qty_done it's a breakdown of.
   */
  private qcBreakdownSum(input: { qty_qc_passed?: number | null; qty_rework?: number | null; qty_renew?: number | null }): number {
    return (input.qty_qc_passed ?? 0) + (input.qty_rework ?? 0) + (input.qty_renew ?? 0)
  }

  // ── Done — per-mark array (multi-mark redesign, 2026-09-17) ─────────────────
  /**
   * Must cover every non-removed work_order_mark on the WO (400 listing whichever
   * are missing/unknown otherwise). Writes each mark's qty_done + QC breakdown
   * (qty_qc_passed/qty_rework/qty_renew, 2026-09-23), sets the WO status=DONE +
   * actual_finish, and writes ONE whole-WO DONE event (work_order_mark_id null)
   * — not one event per mark.
   */
  async done(id: number, dto: WoDoneDto, userName: string) {
    const wo = await this.prisma.work_order.findUnique({
      where: { id },
      include: { marks: { where: { removed_at: null } } },
    })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)

    if (!WO_ACTIONS.done.from.includes(wo.status)) {
      throw new ConflictException({
        message: `Cannot done a work order in status ${wo.status}`,
        current_status: wo.status,
        allowed_next: allowedActionsFrom(wo.status),
      })
    }

    const byAssembly = new Map(dto.marks.map((m) => [m.bom_assembly_id, m]))
    const missing = wo.marks.filter((m) => !byAssembly.has(m.bom_assembly_id))
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing completion input for mark(s): ${missing.map((m) => m.bom_assembly_id).join(', ')}`,
      )
    }
    const activeAssemblyIds = new Set(wo.marks.map((m) => m.bom_assembly_id))
    const unknown = dto.marks.filter((m) => !activeAssemblyIds.has(m.bom_assembly_id))
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Unknown or removed mark(s) for this WO: ${unknown.map((m) => m.bom_assembly_id).join(', ')}`,
      )
    }
    // QC breakdown (2026-09-23) can never exceed the qty_done it's a breakdown of.
    const overQc = dto.marks.filter((m) => this.qcBreakdownSum(m) > m.qty_done)
    if (overQc.length > 0) {
      throw new BadRequestException(
        `QC breakdown (qc_passed + rework + renew) exceeds qty_done for mark(s): ${overQc.map((m) => m.bom_assembly_id).join(', ')}`,
      )
    }
    // Not Started + In Progress + Done (2026-09-23) can never exceed the mark's
    // planned qty — same "sum of buckets ≤ total" shape as the QC check above,
    // one level up.
    const plannedByAssembly = new Map(wo.marks.map((m) => [m.bom_assembly_id, Number(m.qty_planned)]))
    const overPlanned = dto.marks.filter((m) => {
      const total = (m.qty_not_started ?? 0) + (m.qty_in_progress ?? 0) + m.qty_done
      return total > (plannedByAssembly.get(m.bom_assembly_id) ?? 0)
    })
    if (overPlanned.length > 0) {
      throw new BadRequestException(
        `Not Started + In Progress + Done exceeds planned qty for mark(s): ${overPlanned.map((m) => m.bom_assembly_id).join(', ')}`,
      )
    }

    await this.prisma.$transaction(async (tx) => {
      for (const m of wo.marks) {
        const input = byAssembly.get(m.bom_assembly_id)!
        await tx.work_order_mark.update({
          where: { id: m.id },
          data: {
            qty_not_started: input.qty_not_started != null ? new Prisma.Decimal(input.qty_not_started) : undefined,
            qty_in_progress: input.qty_in_progress != null ? new Prisma.Decimal(input.qty_in_progress) : undefined,
            qty_done: new Prisma.Decimal(input.qty_done),
            qty_qc_passed: input.qty_qc_passed != null ? new Prisma.Decimal(input.qty_qc_passed) : undefined,
            qty_rework: input.qty_rework != null ? new Prisma.Decimal(input.qty_rework) : undefined,
            qty_renew: input.qty_renew != null ? new Prisma.Decimal(input.qty_renew) : undefined,
          },
        })
      }
      await tx.work_order.update({
        where: { id },
        data: { status: 'DONE', actual_finish: new Date(), pre_hold_status: null, updated_by: userName },
      })
      await tx.work_order_event.create({
        data: { work_order_id: id, event_type: 'DONE', notes: dto.notes ?? null, recorded_by: userName },
      })
    })

    return this.findOne(id)
  }

  // ── Cancel — whole WO (multi-mark redesign, 2026-09-17) ──────────────────────
  /**
   * Needs a reason + per-mark QC breakdown (dto.mark_disposition, 2026-09-23)
   * for every non-removed mark with qty_done > 0 — array, not a single scalar
   * like the pre-redesign WO.
   * Cascades to sibling WOs of the same mo_id sharing >=1 mark with this WO that have
   * NO output at all (see loadCancelSiblings) — those auto-cancel too, same as before.
   */
  async cancel(id: number, dto: CancelWoDto, userName: string) {
    const wo = await this.prisma.work_order.findUnique({ where: { id }, include: { marks: true } })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)

    if (!WO_ACTIONS.cancel.from.includes(wo.status)) {
      throw new ConflictException({
        message: `Cannot cancel a work order in status ${wo.status}`,
        current_status: wo.status,
        allowed_next: allowedActionsFrom(wo.status),
      })
    }

    const nonRemoved = wo.marks.filter((m) => !m.removed_at)
    const withOutput = nonRemoved.filter((m) => m.qty_done != null && Number(m.qty_done) > 0)
    const dispositionByAssembly = new Map((dto.mark_disposition ?? []).map((r) => [r.bom_assembly_id, r]))

    const missing = withOutput.filter((m) => !dispositionByAssembly.has(m.bom_assembly_id))
    if (missing.length > 0) {
      throw new BadRequestException(
        `QC breakdown (qty_qc_passed/qty_rework/qty_renew) is required for mark(s) with output: ${missing.map((m) => m.bom_assembly_id).join(', ')}`,
      )
    }
    for (const m of withOutput) {
      const disposition = dispositionByAssembly.get(m.bom_assembly_id)!
      const qcSum = this.qcBreakdownSum(disposition)
      if (qcSum > Number(m.qty_done)) {
        throw new BadRequestException(`QC breakdown exceeds qty_done for mark ${m.bom_assembly_id}`)
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const m of withOutput) {
        const disposition = dispositionByAssembly.get(m.bom_assembly_id)!
        await tx.work_order_mark.update({
          where: { id: m.id },
          data: {
            qty_qc_passed: disposition.qty_qc_passed != null ? new Prisma.Decimal(disposition.qty_qc_passed) : undefined,
            qty_rework: disposition.qty_rework != null ? new Prisma.Decimal(disposition.qty_rework) : undefined,
            qty_renew: disposition.qty_renew != null ? new Prisma.Decimal(disposition.qty_renew) : undefined,
          },
        })
      }
      await tx.work_order.update({
        where: { id },
        data: { status: 'CANCELLED', pre_hold_status: null, updated_by: userName },
      })
      await tx.work_order_event.create({
        data: { work_order_id: id, event_type: 'CANCEL', notes: dto.reason, recorded_by: userName },
      })

      // Cascade-cancel (Task 10, Sprint 20 — now per-mark): one mark → many WOs
      // (one per routing op). Cancelling one abandons every shared mark's
      // production, so sibling WOs sharing >=1 mark with zero output anywhere
      // are meaningless — auto-cancel them in the same transaction. Siblings
      // with real output are left untouched — see loadCancelSiblings().
      const { to_cancel } = await this.loadCancelSiblings(tx, wo.mo_id, wo.marks, id)
      for (const sibling of to_cancel) {
        // Defensive: to_cancel is filtered to status !== 'CANCELLED' with no
        // output, and cancel.from covers every non-DONE/non-CANCELLED status —
        // structurally unreachable. Fail loudly (rolls back the cascade) rather
        // than silently skip a sibling.
        if (!WO_ACTIONS.cancel.from.includes(sibling.status as WoStatus)) {
          throw new Error(
            `Cascade-cancel: sibling WO ${sibling.id} (${sibling.wo_code}) has status ${sibling.status}, not a valid 'cancel' source status`,
          )
        }
        await tx.work_order.update({
          where: { id: sibling.id },
          data: { status: 'CANCELLED', pre_hold_status: null, updated_by: userName },
        })
        await tx.work_order_event.create({
          data: {
            work_order_id: sibling.id,
            event_type: 'CANCEL',
            notes: `Cascade-cancelled: sibling of ${wo.wo_code}`,
            recorded_by: userName,
          },
        })
      }
    })

    return this.findOne(id)
  }

  // ── Remove ONE mark (multi-mark redesign, 2026-09-17) ────────────────────────
  /**
   * Soft-removes a single work_order_mark (removed_at/by/reason — row kept, not
   * deleted). The WO's last non-removed mark cannot be removed this way (400 —
   * cancel the whole WO instead). Cascades: the same physical mark is
   * soft-removed from any OTHER WO of the same MO where it has no output yet —
   * but never cascades into stripping a sibling's OWN last mark (that sibling
   * must be cancelled outright by its own action, not silently gutted here).
   */
  async removeMark(id: number, dto: RemoveMarkDto, userName: string) {
    const wo = await this.prisma.work_order.findUnique({ where: { id }, include: { marks: true } })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)
    if (wo.status === 'DONE' || wo.status === 'CANCELLED') {
      throw new ConflictException(`Cannot remove a mark from a work order in status ${wo.status}`)
    }

    const target = wo.marks.find((m) => m.bom_assembly_id === dto.bom_assembly_id && !m.removed_at)
    if (!target) throw new NotFoundException(`Active mark ${dto.bom_assembly_id} not found on WO ${id}`)

    const nonRemovedCount = wo.marks.filter((m) => !m.removed_at).length
    if (nonRemovedCount <= 1) {
      throw new BadRequestException('Cannot remove the last mark on a work order — cancel the whole work order instead')
    }

    // 2026-09-23: qty_reusable → QC breakdown (qty_qc_passed/qty_rework/
    // qty_renew). "provided" distinguishes "field(s) sent, even as 0" from
    // "omitted entirely" — a deliberate all-zero breakdown (everything
    // produced so far is worthless) is valid input, not a missing one.
    const provided = dto.qty_qc_passed != null || dto.qty_rework != null || dto.qty_renew != null
    if (target.qty_done != null && Number(target.qty_done) > 0 && !provided) {
      throw new BadRequestException('QC breakdown (qty_qc_passed/qty_rework/qty_renew) is required when removing a mark with qty_done > 0')
    }
    const qcSum = this.qcBreakdownSum(dto)
    if (provided && target.qty_done != null && qcSum > Number(target.qty_done)) {
      throw new BadRequestException('QC breakdown cannot exceed qty_done')
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date()
      await tx.work_order_mark.update({
        where: { id: target.id },
        data: {
          removed_at: now,
          removed_by: userName,
          removed_reason: dto.reason,
          qty_qc_passed: dto.qty_qc_passed != null ? new Prisma.Decimal(dto.qty_qc_passed) : undefined,
          qty_rework: dto.qty_rework != null ? new Prisma.Decimal(dto.qty_rework) : undefined,
          qty_renew: dto.qty_renew != null ? new Prisma.Decimal(dto.qty_renew) : undefined,
        },
      })
      await tx.work_order_event.create({
        data: {
          work_order_id: id,
          work_order_mark_id: target.id,
          event_type: 'MARK_REMOVED',
          notes: dto.reason,
          recorded_by: userName,
        },
      })
      await this.woAutoCreate.recomputeDuration(tx, id)
      await this.woAutoCreate.recomputeConsume(tx, id, userName)
      await this.woAutoCreate.recomputeParts(tx, wo.mo_id, id, userName)

      const { siblings } = await this.loadRemoveMarkCascadeCandidates(tx, wo.mo_id, target.bom_assembly_id, id)
      for (const sib of siblings) {
        await tx.work_order_mark.update({
          where: { id: sib.markId },
          data: {
            removed_at: now,
            removed_by: userName,
            removed_reason: `Cascade: removed alongside WO ${wo.wo_code} (${dto.reason})`,
          },
        })
        await tx.work_order_event.create({
          data: {
            work_order_id: sib.woId,
            work_order_mark_id: sib.markId,
            event_type: 'MARK_REMOVED',
            notes: `Cascade-removed: sibling of ${wo.wo_code}`,
            recorded_by: userName,
          },
        })
        await this.woAutoCreate.recomputeDuration(tx, sib.woId)
        await this.woAutoCreate.recomputeConsume(tx, sib.woId, userName)
        await this.woAutoCreate.recomputeParts(tx, wo.mo_id, sib.woId, userName)
      }
    })

    return this.findOne(id)
  }

  /**
   * PATCH /wo/:id/consume (2026-09-17) — records real material usage against
   * the WO's already-computed planned consume. No upper-bound check on
   * `qty_actual` (real usage can exceed the plan). 400s if any `material_id`
   * doesn't already have a `work_order_consume` row on this WO — actuals are
   * recorded against materials the system already knows this WO consumes, not
   * arbitrary ones (the picker doesn't offer material selection, per the
   * approved design).
   */
  async updateConsumeActuals(id: number, dto: UpdateConsumeDto, userName: string) {
    await this.requireWo(id)
    const existing = await this.prisma.work_order_consume.findMany({
      where: { work_order_id: id },
      select: { material_id: true },
    })
    const existingIds = new Set(existing.map((r) => r.material_id))
    const unknown = dto.consume.filter((c) => !existingIds.has(c.material_id))
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Material(s) not planned on this WO: ${unknown.map((c) => c.material_id).join(', ')}`,
      )
    }

    await this.prisma.$transaction(
      dto.consume.map((c) =>
        this.prisma.work_order_consume.update({
          where: { work_order_id_material_id: { work_order_id: id, material_id: c.material_id } },
          data: { qty_actual: c.qty_actual, updated_by: userName },
        }),
      ),
    )

    return this.findOne(id)
  }

  /**
   * PATCH /wo/:id/parts (2026-09-17) — sets weight_kg directly (no plan to
   * compare against, unlike /consume — see work_order_part's own doc comment
   * for why). No upper bound. 400s on a bom_assembly_part_id that doesn't
   * already have a work_order_part row on this WO.
   */
  async updatePartActuals(id: number, dto: UpdatePartsDto, userName: string) {
    const wo = await this.requireWo(id)
    const existing = await this.prisma.work_order_part.findMany({
      where: { work_order_id: id },
      select: { bom_assembly_part_id: true },
    })
    const existingIds = new Set(existing.map((r) => r.bom_assembly_part_id))
    const unknown = dto.parts.filter((p) => !existingIds.has(p.bom_assembly_part_id))
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Part(s) not planned on this WO: ${unknown.map((p) => p.bom_assembly_part_id).join(', ')}`,
      )
    }

    // Real physical cap (2026-09-18, qty-based 2026-09-21): every operation
    // may enter a withdrawal for the same part, but the sum across the MO's
    // WOs must never exceed the mark's true total (in pieces) — unlike
    // consume, which may legitimately exceed its plan. Exclude THIS WO's own
    // current row from "already committed" since we're replacing its value,
    // not adding to it.
    for (const p of dto.parts) {
      const { total, committed } = await this.woAutoCreate.computePartBudget(this.prisma, wo.mo_id, p.bom_assembly_part_id, id)
      if (p.qty > total - committed) {
        throw new BadRequestException(
          `qty ${p.qty} for part ${p.bom_assembly_part_id} exceeds the remaining budget (${Math.max(0, total - committed).toFixed(3)} pcs left of ${total.toFixed(3)} pcs total for this MO)`,
        )
      }
    }

    const baps = await this.prisma.bom_assembly_part.findMany({
      where: { id: { in: dto.parts.map((p) => p.bom_assembly_part_id) } },
      select: { id: true, part: { select: { weight_kg: true } } },
    })
    const unitWeightById = new Map(baps.map((b) => [b.id, Number(b.part.weight_kg ?? 0)]))

    await this.prisma.$transaction(
      dto.parts.map((p) =>
        this.prisma.work_order_part.update({
          where: { work_order_id_bom_assembly_part_id: { work_order_id: id, bom_assembly_part_id: p.bom_assembly_part_id } },
          data: {
            qty: new Prisma.Decimal(p.qty),
            weight_kg: new Prisma.Decimal(p.qty * (unitWeightById.get(p.bom_assembly_part_id) ?? 0)),
            updated_by: userName,
          },
        }),
      ),
    )

    return this.findOne(id)
  }

  /**
   * Sibling WOs of the same MO carrying the SAME physical mark as `bom_assembly_id`
   * (resolved by assembly_mark + dispatch group, not the raw FK — same
   * re-pointing-drift reasoning as loadCancelSiblings) that have that mark with no
   * output yet. Skips a sibling entirely when the matching mark is that sibling's
   * OWN last non-removed mark — removing it there would violate the same
   * last-mark invariant this method's caller already enforces for the primary WO,
   * and this cascade has no reason/actor context to auto-cancel that sibling WO
   * outright instead.
   */
  private async loadRemoveMarkCascadeCandidates(
    client: Prisma.TransactionClient,
    mo_id: number,
    bom_assembly_id: number,
    excludeWoId: number,
  ): Promise<{ siblings: { woId: number; markId: number }[] }> {
    const target = await client.bom_assembly.findUnique({
      where: { id: bom_assembly_id },
      select: { assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
    })
    if (!target) return { siblings: [] }

    const siblingWos = await client.work_order.findMany({
      where: {
        mo_id,
        id: { not: excludeWoId },
        status: { notIn: ['DONE', 'CANCELLED'] },
        marks: {
          some: {
            removed_at: null,
            bom_assembly: {
              assembly_mark: target.assembly_mark,
              dispatch: {
                project_id: target.dispatch.project_id,
                zone_id: target.dispatch.zone_id,
                sub_zone_id: target.dispatch.sub_zone_id,
              },
            },
          },
        },
      },
      select: {
        id: true,
        marks: {
          where: { removed_at: null },
          select: {
            id: true,
            qty_done: true,
            bom_assembly: {
              select: { assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
            },
          },
        },
      },
    })

    const siblings: { woId: number; markId: number }[] = []
    for (const sw of siblingWos) {
      if (sw.marks.length <= 1) continue // would strip the sibling's LAST mark — leave it
      for (const m of sw.marks) {
        const d = m.bom_assembly.dispatch
        const sameMark =
          m.bom_assembly.assembly_mark === target.assembly_mark &&
          d.project_id === target.dispatch.project_id &&
          d.zone_id === target.dispatch.zone_id &&
          d.sub_zone_id === target.dispatch.sub_zone_id
        if (!sameMark) continue
        if (m.qty_done != null && Number(m.qty_done) > 0) continue // has output — leave it
        siblings.push({ woId: sw.id, markId: m.id })
      }
    }
    return { siblings }
  }

  // ── Cancel preview (Task 10, Sprint 20 · cascade-cancel siblings) ────────────
  /**
   * Preview for the cancel confirmation UI: splits non-CANCELLED sibling WOs of
   * the same mo_id sharing >=1 non-removed mark with this WO into `to_cancel`
   * (no output anywhere — will be auto-cascade-cancelled alongside the primary
   * WO by `cancel()`) and `needs_disposition` (DONE, or some mark's qty_done > 0
   * — real output exists, left untouched).
   */
  async cancelSiblings(id: number) {
    const wo = await this.prisma.work_order.findUnique({ where: { id }, include: { marks: true } })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)
    return this.loadCancelSiblings(this.prisma, wo.mo_id, wo.marks, id)
  }

  /**
   * Shared by `cancelSiblings()` (preview, reads via `this.prisma`) and
   * `cancel()`'s cascade (reads inside the same `tx` as the writes, so the split
   * is computed against the same snapshot it acts on). Already-CANCELLED
   * siblings are excluded entirely — terminal, nothing to do with them either
   * way. `hasOutput` is evaluated at the WHOLE-sibling level (its status, or ANY
   * of its non-removed marks having qty_done > 0) because a to_cancel sibling
   * gets its ENTIRE WO cancelled, not just the shared mark — cancelling a
   * sibling that has real output on some OTHER, unrelated mark would destroy it.
   */
  private async loadCancelSiblings(
    client: PrismaService | Prisma.TransactionClient,
    mo_id: number,
    marks: { bom_assembly_id: number; removed_at: Date | null }[],
    excludeWoId: number,
  ) {
    const nonRemoved = marks.filter((m) => !m.removed_at)
    if (nonRemoved.length === 0) return { to_cancel: [], needs_disposition: [] }

    // Resolve by (assembly_mark, project_id, zone_id, sub_zone_id) — not the raw
    // bom_assembly_id FK. acceptNewVersion() re-points a mark's bom_assembly_id
    // to the newest active row for it once accepted, so a mark that already
    // resolved its BOM-version alert can end up with a different bom_assembly_id
    // than a sibling's still-outdated mark of the exact same physical mark. Same
    // pattern as MoAllocationService.allocatedFor().
    const targets = (
      await Promise.all(
        nonRemoved.map((m) =>
          client.bom_assembly.findUnique({
            where: { id: m.bom_assembly_id },
            select: { assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
          }),
        ),
      )
    ).filter((a): a is NonNullable<typeof a> => a != null)
    if (targets.length === 0) return { to_cancel: [], needs_disposition: [] }

    const siblingWos = await client.work_order.findMany({
      where: {
        mo_id,
        id: { not: excludeWoId },
        status: { not: 'CANCELLED' },
        marks: {
          some: {
            removed_at: null,
            bom_assembly: {
              OR: targets.map((t) => ({
                assembly_mark: t.assembly_mark,
                dispatch: { project_id: t.dispatch.project_id, zone_id: t.dispatch.zone_id, sub_zone_id: t.dispatch.sub_zone_id },
              })),
            },
          },
        },
      },
      select: {
        id: true,
        wo_code: true,
        sequence: true,
        status: true,
        source_routing_op_id: true,
        marks: { where: { removed_at: null }, select: { qty_done: true } },
      },
    })

    const hasOutput = (s: (typeof siblingWos)[number]) =>
      s.status === 'DONE' || s.marks.some((m) => m.qty_done != null && Number(m.qty_done) > 0)

    return {
      to_cancel: siblingWos.filter((s) => !hasOutput(s)),
      needs_disposition: siblingWos.filter(hasOutput),
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  async requireWo(id: number) {
    const wo = await this.prisma.work_order.findUnique({ where: { id } })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)
    return wo
  }

  private toListRow(
    r: Prisma.work_orderGetPayload<{ include: typeof WO_LIST_INCLUDE }>,
    isOutdated: boolean,
  ) {
    return {
      id: r.id,
      wo_code: r.wo_code,
      status: r.status,
      sequence: r.sequence,
      mo: { id: r.manufacturing_order.id, mo_code: r.manufacturing_order.mo_code },
      mark_prefix: r.manufacturing_order.primary_mark_prefix,
      work_center: r.mrp_workcenter,
      // Multi-mark redesign (2026-09-17): a WO can carry many marks now — this
      // replaces the old singular `assembly_mark` field (frontend contract
      // change, WoList.tsx needs updating to read this instead).
      assembly_marks: r.marks.map((m) => m.bom_assembly.assembly_mark),
      mark_count: r.marks.length,
      qty_planned_total: r.marks.reduce((s, m) => s + Number(m.qty_planned), 0),
      qty_done_total: r.marks.reduce((s, m) => s + (m.qty_done != null ? Number(m.qty_done) : 0), 0),
      plan_start: r.plan_start,
      plan_finish: r.plan_finish,
      actual_start: r.actual_start,
      actual_finish: r.actual_finish,
      assigned_to: r.assigned_to,
      subcontractor: r.subcontractor,
      // T-WO.09 · WO list "Newer BOM version available" badge — true when ANY of
      // the WO's non-removed marks has a significant delta. Mirrors
      // bomVersionStatus()'s per-mark is_outdated && isSignificantDelta(...)
      // semantics, computed in a batch by computeOutdatedWoIds(), not one query
      // per row. Field name/shape is a frontend contract (WoList.tsx reads
      // `w.is_outdated` directly) — do not rename.
      is_outdated: isOutdated,
    }
  }

  // ── BOM Version Alert (T-WO.04) — now per-mark ───────────────────────────────
  /**
   * Per-mark BOM-version comparison: given an already-loaded mark (its own
   * snapshotted assembly + snapshot dispatch id), classify the delta against
   * whatever's currently ACTIVE for the same mark+group. Shared by the public
   * `bomVersionStatus()` (one call per non-removed mark) and `acceptNewVersion()`.
   */
  private async markVersionStatus(mark: {
    id: number
    bom_assembly_id: number
    bom_dispatch_id_snapshot: number
    bom_assembly: BomAssemblyLike
  }) {
    const base = {
      work_order_mark_id: mark.id,
      bom_assembly_id: mark.bom_assembly_id,
      assembly_mark: mark.bom_assembly.assembly_mark,
      snapshot_dispatch_id: mark.bom_dispatch_id_snapshot,
    }

    const snap = await this.prisma.bom_dispatch.findUnique({ where: { id: mark.bom_dispatch_id_snapshot } })
    // Snapshot dispatch row no longer exists → nothing to compare against.
    if (!snap) {
      return {
        is_outdated: false,
        delta_types: [] as string[],
        delta_details: null,
        latest_dispatch_id: mark.bom_dispatch_id_snapshot,
        ...base,
      }
    }

    const cmp = await this.compareAssemblyToLatest(mark.bom_assembly, snap)
    return { ...cmp, ...base }
  }

  /**
   * GET /wo/:id/bom-version-status — one entry per non-removed mark on the WO
   * (multi-mark redesign: a single WO-level is_outdated boolean no longer makes
   * sense once a WO can carry marks in unrelated BOM-version states).
   */
  async bomVersionStatus(id: number) {
    const wo = await this.prisma.work_order.findUnique({
      where: { id },
      include: { marks: { where: { removed_at: null }, include: { bom_assembly: true } } },
    })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)
    return Promise.all(wo.marks.map((m) => this.markVersionStatus(m)))
  }

  /**
   * Accept a newer BOM version for ONE mark (WO BOM-Version Hold, Sprint 20 —
   * now per-mark, multi-mark redesign 2026-09-17). Re-points that ONE
   * work_order_mark's bom_assembly_id/bom_dispatch_id_snapshot/qty_planned to the
   * latest version — same re-pointing logic the old whole-WO acceptNewVersion
   * had, just scoped to one mark. Preserves the existing
   * qty-reusable-required-when-exceeds-target validation (now unconditional,
   * not gated on the WO being ON_HOLD — there's no more auto-hold tying accept
   * to a hold-resolution flow). `note` is always optional now, for the same
   * reason. If `apply_to_other_wos`, re-points every OTHER WO's matching mark
   * (same original bom_assembly_id) in the same MO too.
   */
  async acceptNewVersion(id: number, userName: string, dto: AcceptVersionDto) {
    const wo = await this.prisma.work_order.findUnique({ where: { id }, select: { id: true, mo_id: true } })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)

    const mark = await this.prisma.work_order_mark.findFirst({
      where: { work_order_id: id, bom_assembly_id: dto.bom_assembly_id, removed_at: null },
      include: { bom_assembly: true },
    })
    if (!mark) throw new NotFoundException(`Active mark ${dto.bom_assembly_id} not found on WO ${id}`)

    const status = await this.markVersionStatus(mark)
    // REMOVED is checked first (Task 6, preserved): compareAssemblyToLatest()'s
    // mark-scoped ACTIVE lookup has no "latest dispatch for the group" left to
    // report for a genuinely-removed mark, so latest_dispatch_id falls back to
    // the mark's own snapshot dispatch id — which would otherwise equal
    // snapshot_dispatch_id and trip the "already on latest version" guard below,
    // masking the more specific REMOVED error.
    if (status.delta_types.includes('REMOVED')) {
      throw new ConflictException({
        message: 'Assembly was REMOVED in the new version — remove the mark instead of accepting',
        delta_types: status.delta_types,
      })
    }
    if (!status.is_outdated || status.latest_dispatch_id === status.snapshot_dispatch_id) {
      throw new ConflictException('This mark is already on the latest BOM version')
    }
    const latestAsm = await this.prisma.bom_assembly.findFirst({
      where: { dispatch_id: status.latest_dispatch_id, assembly_mark: status.assembly_mark },
    })
    if (!latestAsm) throw new ConflictException('Matching assembly not found in latest version')

    // 2026-09-23: qty_reusable → QC breakdown, same "provided" distinction as
    // removeMark() (a deliberate all-zero breakdown is valid, not missing).
    const provided = dto.qty_qc_passed != null || dto.qty_rework != null || dto.qty_renew != null
    const newQty = latestAsm.qty == null ? null : Number(latestAsm.qty)
    if (mark.qty_done != null && newQty != null && Number(mark.qty_done) > newQty) {
      if (!provided) {
        throw new BadRequestException(
          'QC breakdown (qty_qc_passed/qty_rework/qty_renew) is required when qty_done already exceeds the newly-adopted qty',
        )
      }
    }
    // Server-side upper bound: the frontend caps the breakdown at qty_done, but a
    // direct API caller bypasses that — reject here too, regardless of whether
    // it was required above.
    const qcSum = this.qcBreakdownSum(dto)
    if (provided && mark.qty_done != null && qcSum > Number(mark.qty_done)) {
      throw new BadRequestException('QC breakdown cannot exceed qty_done')
    }

    const newQtyPlanned = latestAsm.qty ?? mark.qty_planned
    const originalBomAssemblyId = dto.bom_assembly_id

    await this.prisma.$transaction(async (tx) => {
      await tx.work_order_mark.update({
        where: { id: mark.id },
        data: {
          bom_assembly_id: latestAsm.id,
          bom_dispatch_id_snapshot: status.latest_dispatch_id,
          qty_planned: newQtyPlanned,
          qty_qc_passed: dto.qty_qc_passed ?? undefined,
          qty_rework: dto.qty_rework ?? undefined,
          qty_renew: dto.qty_renew ?? undefined,
        },
      })
      await tx.work_order_event.create({
        data: {
          work_order_id: id,
          work_order_mark_id: mark.id,
          event_type: 'ACCEPT_VERSION',
          notes: `Accepted BOM version → dispatch ${status.latest_dispatch_id}${status.delta_types.length ? ` (${status.delta_types.join(', ')})` : ''}${dto.note ? ` — ${dto.note}` : ''}`,
          recorded_by: userName,
        },
      })
      await this.woAutoCreate.recomputeDuration(tx, id)
      await this.woAutoCreate.recomputeConsume(tx, id, userName)
      await this.woAutoCreate.recomputeParts(tx, wo.mo_id, id, userName)

      if (dto.apply_to_other_wos) {
        const others = await tx.work_order_mark.findMany({
          where: {
            bom_assembly_id: originalBomAssemblyId,
            removed_at: null,
            work_order_id: { not: id },
            work_order: { mo_id: wo.mo_id },
          },
        })
        for (const other of others) {
          await tx.work_order_mark.update({
            where: { id: other.id },
            data: {
              bom_assembly_id: latestAsm.id,
              bom_dispatch_id_snapshot: status.latest_dispatch_id,
              qty_planned: newQtyPlanned,
            },
          })
          await tx.work_order_event.create({
            data: {
              work_order_id: other.work_order_id,
              work_order_mark_id: other.id,
              event_type: 'ACCEPT_VERSION',
              notes: `Accepted BOM version → dispatch ${status.latest_dispatch_id} (applied from WO ${id})`,
              recorded_by: userName,
            },
          })
          await this.woAutoCreate.recomputeDuration(tx, other.work_order_id)
          await this.woAutoCreate.recomputeConsume(tx, other.work_order_id, userName)
          await this.woAutoCreate.recomputeParts(tx, wo.mo_id, other.work_order_id, userName)
        }
      }
    })
    return this.findOne(id)
  }

  /**
   * Shared significance filter: a newer dispatch existing for the group
   * (`is_outdated: true`) is NOT by itself grounds to warn on a mark or a DRAFT
   * MO line — e.g. a re-upload can reintroduce an assembly with byte-identical
   * qty/weight/dims, in which case `delta_types` is genuinely empty. Only a
   * REMOVED, SPEC_CHANGED, or qty-decrease delta is "significant" (qty-increase-
   * only is informational, not a warning). Shared by `computeOutdatedWoIds()`'s
   * list-badge loop and `ManufacturingOrdersService.findOne()`'s stale-line-
   * warning check.
   */
  isSignificantDelta(cmp: { delta_types: string[]; delta_details: Record<string, unknown> | null }): boolean {
    const isRemoved = cmp.delta_types.includes('REMOVED')
    const isSpecChanged = cmp.delta_types.includes('SPEC_CHANGED')
    const qtyDelta = cmp.delta_details?.qty as { from: number; to: number } | undefined
    const isQtyDecrease = cmp.delta_types.includes('QTY_CHANGED') && !!qtyDelta && qtyDelta.to < qtyDelta.from
    return isRemoved || isSpecChanged || isQtyDecrease
  }

  // ── BOM-version helpers ─────────────────────────────────────────────────────
  /**
   * Given an already-loaded assembly and the (project, zone, sub_zone) group it
   * belongs to, find the currently ACTIVE assembly row for the same
   * assembly_mark anywhere in the group and classify the delta (REMOVED /
   * QTY_CHANGED / SPEC_CHANGED) against it.
   *
   * Task 6 (Sprint 20 WO BOM-Version Hold false-positive bugfix): the lookup is a
   * direct `status: 'ACTIVE'` query scoped to the mark + group, NOT to "the single
   * most-recently-uploaded dispatch in the group". Main and Acc slots — and, more
   * generally, any two dispatches in the same group — are uploaded independently,
   * so the newest dispatch overall is not necessarily the dispatch that owns this
   * mark's current active row.
   *
   * Deliberately not `private` — `ManufacturingOrdersService` (Task 5) calls it
   * directly for stale-assembly warnings.
   */
  async compareAssemblyToLatest(
    assembly: BomAssemblyLike,
    group: { project_id: number; zone_id: number; sub_zone_id: number | null },
  ) {
    const latestAsm = await this.prisma.bom_assembly.findFirst({
      where: {
        assembly_mark: assembly.assembly_mark,
        status: 'ACTIVE',
        dispatch: { project_id: group.project_id, zone_id: group.zone_id, sub_zone_id: group.sub_zone_id },
      },
    })
    return this.classifyAssemblyDelta(assembly, latestAsm)
  }

  /**
   * Pure delta classifier extracted from `compareAssemblyToLatest()` (Task 8, Sprint 20 WO
   * BOM-Version Hold): given a mark's own snapshotted assembly and the assembly currently
   * ACTIVE for the same mark+group (or `null` if none exists), classifies is_outdated /
   * delta_types / delta_details. No DB access — this is the ONE place "what counts as a
   * meaningful BOM change" is defined. Shared by `compareAssemblyToLatest()` (single-mark
   * path: one `findFirst` per call — `markVersionStatus()`, `ManufacturingOrdersService.findOne()`)
   * and `computeOutdatedWoIds()` (list path: one batched query for every WO/mark on the page,
   * no per-row lookups).
   */
  private classifyAssemblyDelta(
    assembly: BomAssemblyLike,
    latestAsm: BomAssemblyLike | null,
  ): { is_outdated: boolean; delta_types: string[]; delta_details: Record<string, unknown> | null; latest_dispatch_id: number } {
    // No ACTIVE row anywhere in the group for this mark → genuinely removed.
    // (No "latest dispatch for the group" concept survives this fix to report here —
    // fall back to the mark's own dispatch, mirroring the pre-Task-6 fallback shape.)
    if (!latestAsm) {
      return {
        is_outdated: true,
        delta_types: ['REMOVED'],
        delta_details: null,
        latest_dispatch_id: assembly.dispatch_id,
      }
    }

    // The currently ACTIVE row for this mark IS this mark's own snapshotted row →
    // already on the latest version for this group, nothing to alert.
    if (latestAsm.id === assembly.id) {
      return {
        is_outdated: false,
        delta_types: [],
        delta_details: null,
        latest_dispatch_id: latestAsm.dispatch_id,
      }
    }

    const delta_types: string[] = []
    const delta_details: Record<string, unknown> = {}
    const fromQty = Number(assembly.qty ?? 0)
    const toQty = Number(latestAsm.qty ?? 0)
    if (fromQty !== toQty) {
      delta_types.push('QTY_CHANGED')
      delta_details.qty = { from: fromQty, to: toQty }
    }
    const fromSpec = this.specOf(assembly)
    const toSpec = this.specOf(latestAsm)
    if (JSON.stringify(fromSpec) !== JSON.stringify(toSpec)) {
      delta_types.push('SPEC_CHANGED')
      delta_details.spec = { from: fromSpec, to: toSpec }
    }

    return {
      is_outdated: true, // a different ACTIVE row exists for this mark elsewhere in the group
      delta_types,
      delta_details: Object.keys(delta_details).length ? delta_details : null,
      latest_dispatch_id: latestAsm.dispatch_id,
    }
  }

  private specOf(a: {
    weight_kg: Prisma.Decimal | null
    surface_area_m2: Prisma.Decimal | null
    length_mm: Prisma.Decimal | null
    width_mm: Prisma.Decimal | null
    height_mm: Prisma.Decimal | null
    attributes: Prisma.JsonValue
  }) {
    return {
      weight_kg: a.weight_kg ? Number(a.weight_kg) : null,
      surface_area_m2: a.surface_area_m2 ? Number(a.surface_area_m2) : null,
      length_mm: a.length_mm ? Number(a.length_mm) : null,
      width_mm: a.width_mm ? Number(a.width_mm) : null,
      height_mm: a.height_mm ? Number(a.height_mm) : null,
      attributes: a.attributes ?? {},
    }
  }

  /**
   * Set of WO ids where ANY non-removed mark's snapshotted assembly is
   * significantly behind the currently ACTIVE row for its mark — i.e.
   * `is_outdated: true` badge on the list (T-WO.09). Multi-mark redesign: a WO
   * can carry several marks in unrelated BOM-version states, so this rolls them
   * up to one boolean per WO (any-significant-mark, not "the WO's one mark").
   *
   * Batched, mark-level equivalent of `bomVersionStatus()` /
   * `compareAssemblyToLatest()`: does NOT issue one `bom_assembly` query per
   * mark (`findAll()` is unpaginated — dozens-to-hundreds of WOs per call,
   * each with potentially several marks). Instead:
   *   1. Collect every row's marks' distinct (assembly_mark, project_id,
   *      zone_id, sub_zone_id) tuples from the already-loaded
   *      `marks[].bom_assembly.dispatch` (WO_LIST_INCLUDE already carries
   *      everything this needs — no extra fields required).
   *   2. ONE query fetches the currently-ACTIVE bom_assembly row for every such tuple.
   *   3. Each mark is classified in-memory via `classifyAssemblyDelta()` — the same pure
   *      comparison `compareAssemblyToLatest()` uses — and gated through
   *      `isSignificantDelta(); a WO is flagged the moment any one of its marks qualifies.
   */
  private async computeOutdatedWoIds(
    rows: Prisma.work_orderGetPayload<{ include: typeof WO_LIST_INCLUDE }>[],
  ): Promise<Set<number>> {
    const keyOf = (mark: string, projectId: number, zoneId: number, subZoneId: number | null) =>
      `${mark}::${projectId}/${zoneId}/${subZoneId ?? 'null'}`

    const tuples = new Map<
      string,
      { assembly_mark: string; project_id: number; zone_id: number; sub_zone_id: number | null }
    >()
    for (const r of rows) {
      for (const m of r.marks) {
        const d = m.bom_assembly.dispatch
        const key = keyOf(m.bom_assembly.assembly_mark, d.project_id, d.zone_id, d.sub_zone_id)
        if (!tuples.has(key)) {
          tuples.set(key, {
            assembly_mark: m.bom_assembly.assembly_mark,
            project_id: d.project_id,
            zone_id: d.zone_id,
            sub_zone_id: d.sub_zone_id,
          })
        }
      }
    }
    if (tuples.size === 0) return new Set()

    // Single batched query — NOT one per mark. `dispatch` is included (not just
    // dispatch_id) because the currently-ACTIVE row for a tuple may live on a dispatch
    // none of `rows` reference at all (e.g. a brand-new upload nobody has snapshotted yet).
    const activeRows = await this.prisma.bom_assembly.findMany({
      where: {
        status: 'ACTIVE',
        OR: [...tuples.values()].map((t) => ({
          assembly_mark: t.assembly_mark,
          dispatch: { project_id: t.project_id, zone_id: t.zone_id, sub_zone_id: t.sub_zone_id },
        })),
      },
      include: { dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
    })

    // At most one ACTIVE row is expected per (mark, group) by design (supersession stamps
    // the old row INACTIVE on re-upload) — same assumption compareAssemblyToLatest()'s
    // findFirst() already makes. Last-wins here is no worse than that arbitrary pick.
    const activeByKey = new Map<string, (typeof activeRows)[number]>()
    for (const a of activeRows) {
      activeByKey.set(keyOf(a.assembly_mark, a.dispatch.project_id, a.dispatch.zone_id, a.dispatch.sub_zone_id), a)
    }

    const outdated = new Set<number>()
    for (const r of rows) {
      for (const m of r.marks) {
        const d = m.bom_assembly.dispatch
        const key = keyOf(m.bom_assembly.assembly_mark, d.project_id, d.zone_id, d.sub_zone_id)
        const cmp = this.classifyAssemblyDelta(m.bom_assembly, activeByKey.get(key) ?? null)
        if (cmp.is_outdated && this.isSignificantDelta(cmp)) {
          outdated.add(r.id)
          break
        }
      }
    }
    return outdated
  }
}
