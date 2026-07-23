import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, WoEventType, WoStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { UpdateWoDto } from './dto/update-wo.dto'
import { AcceptVersionDto } from './dto/accept-version.dto'

/**
 * WO list default sort tiebreak (T-WO.09): active work first, terminal last.
 * Primary sort is earliest_start_at asc (nulls last); this is the secondary key.
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

export type WoAction = 'release' | 'start' | 'pause' | 'resume' | 'done' | 'cancel'

interface WoActionSpec {
  from: WoStatus[]
  to: WoStatus
  event?: WoEventType // release has no event (sets released_at/by only)
}

/** T-WO.05 status state machine. `from` lists the statuses the action is valid in. */
export const WO_ACTIONS: Record<WoAction, WoActionSpec> = {
  release: { from: ['NOT_STARTED'], to: 'RELEASED' },
  start: { from: ['RELEASED'], to: 'IN_PROGRESS', event: 'START' },
  pause: { from: ['IN_PROGRESS'], to: 'PAUSED', event: 'PAUSE' },
  resume: { from: ['PAUSED'], to: 'IN_PROGRESS', event: 'RESUME' },
  done: { from: ['IN_PROGRESS', 'PAUSED'], to: 'DONE', event: 'DONE' },
  cancel: { from: ['NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'ON_HOLD'], to: 'CANCELLED', event: 'CANCEL' },
}

/** Action names valid from a given status — surfaced in the 409 body as allowed_next. */
export function allowedActionsFrom(status: WoStatus): WoAction[] {
  return (Object.keys(WO_ACTIONS) as WoAction[]).filter((a) => WO_ACTIONS[a].from.includes(status))
}

const WO_DETAIL_INCLUDE = {
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
  bom_assembly: {
    include: { dispatch: { include: { project: true, zone: true, sub_zone: true } } },
  },
} satisfies Prisma.work_orderInclude

/**
 * Structural shape shared by `compareAssemblyToLatest()` / `classifyAssemblyDelta()` /
 * `specOf()` — anything with these fields can be compared, whether it's a WO's own
 * snapshotted `bom_assembly` (loaded via `WO_DETAIL_INCLUDE`) or a candidate "currently
 * ACTIVE row" fetched separately (single lookup or batched).
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

export interface SourceRoutingOp {
  id: number; op_code: string; name: string; time_mode: string
  time_cycle: unknown; time_cycle_manual: unknown; formula_expr: string | null
  op_type: { id: number; key: string; label: string; color: string } | null
  activities: EnrichedActivity[]
  duration_breakdown: DurationBreakdownRow[]
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name)

  constructor(private readonly prisma: PrismaService) {}

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
    // re-points that FK, so an id filter would silently miss WOs already
    // advanced to a newer bom_assembly row for the same physical mark
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
      ...(assemblyScope ? { bom_assembly: assemblyScope } : {}),
    }

    const rows = await this.prisma.work_order.findMany({
      where,
      include: WO_DETAIL_INCLUDE,
    })

    const outdatedWoIds = await this.computeOutdatedWoIds(rows)
    const mapped = rows.map((r) => this.toListRow(r, outdatedWoIds.has(r.id)))
    // Default sort: earliest_start_at asc (nulls last), then status priority (T-WO.09).
    return mapped.sort((a, b) => {
      const ax = a.earliest_start_at ? a.earliest_start_at.getTime() : Number.POSITIVE_INFINITY
      const bx = b.earliest_start_at ? b.earliest_start_at.getTime() : Number.POSITIVE_INFINITY
      if (ax !== bx) return ax - bx
      return WO_STATUS_PRIORITY[a.status] - WO_STATUS_PRIORITY[b.status]
    })
  }

  // ── Detail (+ snapshot dispatch + routing op activities · soft refs) ──────
  async findOne(id: number) {
    const wo = await this.prisma.work_order.findUnique({
      where: { id },
      include: WO_DETAIL_INCLUDE,
    })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)

    // bom_dispatch_id_snapshot is a soft ref (no FK) — fetch it explicitly.
    const snapshotDispatch = await this.prisma.bom_dispatch.findUnique({
      where: { id: wo.bom_dispatch_id_snapshot },
      include: { project: true, zone: true, sub_zone: true },
    })

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

        // Duration breakdown — one row per activity showing how minutes were calculated
        const bom = wo.bom_assembly
        const lengthMm  = Number(bom.length_mm       ?? 0)
        const areaSqM   = Number(bom.surface_area_m2  ?? 0)
        const widthMm   = Number(bom.width_mm         ?? 0)

        const duration_breakdown = acts.map(a => {
          const srcId = a.source_activity_id
          const act   = srcId ? actMap.get(srcId) : null
          const formulaCode = act?.formula_code ?? null
          const rate        = Number(act?.per_minute ?? 0)
          const fixedMin    = Number(act?.duration_min ?? 0)
          const kind        = act?.kind ?? 'run'

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

        source_routing_op = {
          id: op.id, op_code: op.op_code, name: op.name,
          time_mode: op.time_mode,
          time_cycle: op.time_cycle,
          time_cycle_manual: op.time_cycle_manual,
          formula_expr: op.formula_expr,
          op_type: op.op_type ?? null,
          activities,
          duration_breakdown,
        }
      }
    }

    return {
      ...wo,
      mark_prefix: wo.manufacturing_order.primary_mark_prefix,
      snapshot_dispatch: snapshotDispatch,
      source_routing_op,
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

  // ── Edit — NOT_STARTED only (409 otherwise) ─────────────────────────────────
  async update(id: number, dto: UpdateWoDto, userName: string) {
    const wo = await this.requireWo(id)
    if (wo.status !== 'NOT_STARTED') {
      throw new ConflictException(
        `Only NOT_STARTED work orders can be edited (current: ${wo.status})`,
      )
    }
    await this.prisma.work_order.update({
      where: { id },
      data: {
        ...(dto.assigned_to !== undefined ? { assigned_to: dto.assigned_to } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.earliest_start_at !== undefined
          ? { earliest_start_at: dto.earliest_start_at ? new Date(dto.earliest_start_at) : null }
          : {}),
        updated_by: userName,
      },
    })
    return this.findOne(id)
  }

  // ── Status transitions (T-WO.05) ────────────────────────────────────────────
  async transition(
    id: number,
    action: WoAction,
    body: { reason?: string; qty_done?: number; qty_scrapped?: number; notes?: string; qty_reusable?: number },
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

    // Cancel-only guard (WO BOM-Version Hold, Sprint 20): qty_done-based, not
    // status-based — applies to any cancel where work has already been done,
    // not just cancellation out of ON_HOLD. Scoped strictly to 'cancel' so the
    // other four actions (release/start/pause/resume/done) are untouched.
    if (action === 'cancel' && wo.qty_done != null && Number(wo.qty_done) > 0 && body.qty_reusable == null) {
      throw new BadRequestException('qty_reusable is required when cancelling a WO with qty_done > 0')
    }
    // Server-side upper bound: the frontend caps qty_reusable at qty_done, but a
    // direct API caller bypasses that — reject here too, regardless of whether
    // qty_reusable was required above.
    if (action === 'cancel' && body.qty_reusable != null && wo.qty_done != null && Number(body.qty_reusable) > Number(wo.qty_done)) {
      throw new BadRequestException('qty_reusable cannot exceed qty_done')
    }

    const data: Prisma.work_orderUpdateInput = { status: spec.to, updated_by: userName }
    const now = new Date()
    if (action === 'release') {
      data.released_at = now
      data.released_by = userName
    } else if (action === 'start') {
      data.actual_start_at = now
    } else if (action === 'done') {
      data.actual_end_at = now
      data.qty_done = new Prisma.Decimal(body.qty_done ?? 0)
      if (body.qty_scrapped !== undefined) data.qty_scrapped = new Prisma.Decimal(body.qty_scrapped)
    } else if (action === 'cancel') {
      data.qty_reusable = body.qty_reusable ?? undefined
      data.pre_hold_status = null // terminal status now — clear so a stale value doesn't confuse future debugging
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

      // Cascade-cancel (Task 10, Sprint 20): one BOM mark → many WOs (one per
      // routing op, all sharing mo_id + bom_assembly_id). Cancelling one WO
      // abandons the mark's production, so sibling WOs with zero output are
      // meaningless (nothing to weld if the cut was cancelled) — auto-cancel
      // them in the same transaction. Siblings with real output (DONE, or
      // qty_done > 0) are left untouched — see loadCancelSiblings().
      if (action === 'cancel') {
        const { to_cancel } = await this.loadCancelSiblings(tx, wo.mo_id, wo.bom_assembly_id, id)
        for (const sibling of to_cancel) {
          // Defensive: to_cancel is filtered to status !== 'CANCELLED' && !== 'DONE'
          // with no output, and cancel.from covers every non-DONE/non-CANCELLED
          // status — so this should be structurally unreachable. Fail loudly
          // (rolls back the whole cascade) rather than silently skip a sibling.
          if (!WO_ACTIONS.cancel.from.includes(sibling.status)) {
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
              // wo.wo_code already carries the "WO-" prefix (WO-NNNNNNNN) — don't
              // double it up into "sibling of WO-WO-00000001".
              notes: `Cascade-cancelled: sibling of ${wo.wo_code}`,
              recorded_by: userName,
            },
          })
        }
      }
    })

    return this.findOne(id)
  }

  // ── Cancel preview (Task 10, Sprint 20 · cascade-cancel siblings) ────────────
  /**
   * Preview for the cancel confirmation UI: splits non-CANCELLED sibling WOs
   * (same mo_id + bom_assembly_id — i.e. other routing-op WOs for the same
   * mark within the same MO) into `to_cancel` (no output — will be
   * auto-cascade-cancelled alongside the primary WO by `transition()`) and
   * `needs_disposition` (DONE, or qty_done > 0 — real output exists, left
   * untouched; UI shows a non-functional "Move to Stock" placeholder — no
   * stock/inventory concept exists in this codebase yet).
   */
  async cancelSiblings(id: number) {
    const wo = await this.requireWo(id)
    return this.loadCancelSiblings(this.prisma, wo.mo_id, wo.bom_assembly_id, id)
  }

  /**
   * Shared by `cancelSiblings()` (preview, reads via `this.prisma`) and
   * `transition()`'s cancel cascade (reads inside the same `tx` as the
   * writes, so the split is computed against the same snapshot it acts on).
   * Already-CANCELLED siblings are excluded entirely — terminal, nothing to
   * do with them either way.
   */
  private async loadCancelSiblings(
    client: PrismaService | Prisma.TransactionClient,
    mo_id: number,
    bom_assembly_id: number,
    excludeWoId: number,
  ) {
    // Resolve siblings by (assembly_mark, project_id, zone_id, sub_zone_id) — not the raw
    // bom_assembly_id FK. acceptNewVersion() re-points a WO's bom_assembly_id to the newest
    // active row for its mark once accepted, so a WO that already resolved its ON_HOLD ends up
    // with a different bom_assembly_id than sibling WOs of the exact same physical mark that are
    // still ON_HOLD (and still reference the old, now-INACTIVE row) — a raw-FK filter would drop
    // it from the result entirely. Same pattern as MoAllocationService.allocatedFor().
    const target = await client.bom_assembly.findUnique({
      where: { id: bom_assembly_id },
      select: { assembly_mark: true, dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } } },
    })
    if (!target) return { to_cancel: [], needs_disposition: [] }

    const siblings = await client.work_order.findMany({
      where: {
        mo_id,
        id: { not: excludeWoId },
        status: { not: 'CANCELLED' },
        bom_assembly: {
          assembly_mark: target.assembly_mark,
          dispatch: {
            project_id: target.dispatch.project_id,
            zone_id: target.dispatch.zone_id,
            sub_zone_id: target.dispatch.sub_zone_id,
          },
        },
      },
      select: { id: true, wo_code: true, sequence: true, status: true, qty_done: true, source_routing_op_id: true },
    })
    const hasOutput = (s: (typeof siblings)[number]) => s.status === 'DONE' || (s.qty_done != null && Number(s.qty_done) > 0)
    return {
      to_cancel: siblings.filter((s) => !hasOutput(s)),
      needs_disposition: siblings.filter(hasOutput),
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  async requireWo(id: number) {
    const wo = await this.prisma.work_order.findUnique({ where: { id } })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)
    return wo
  }

  private toListRow(
    r: Prisma.work_orderGetPayload<{ include: typeof WO_DETAIL_INCLUDE }>,
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
      assembly_mark: r.bom_assembly.assembly_mark,
      earliest_start_at: r.earliest_start_at,
      actual_start_at: r.actual_start_at,
      actual_end_at: r.actual_end_at,
      target_end_at: r.target_end_at,
      qty_done: r.qty_done,
      qty_scrapped: r.qty_scrapped,
      assigned_to: r.assigned_to,
      // T-WO.09 · WO list "Newer BOM version available" badge. Mirrors bomVersionStatus()'s
      // is_outdated && isSignificantDelta(...) semantics per-WO (Task 8) — computed in a
      // batch by computeOutdatedWoIds(), not one query per row. Field name/shape is a
      // frontend contract (WoList.tsx reads `w.is_outdated` directly) — do not rename.
      is_outdated: isOutdated,
    }
  }

  // ── BOM Version Alert (T-WO.04) ──────────────────────────────────────────────
  /**
   * Compare the WO's snapshot dispatch against the latest dispatch for the same
   * (project, zone, sub_zone) group, classifying the delta on this WO's assembly.
   *
   * Thin wrapper: loads the WO's assembly + snapshot dispatch, then delegates the
   * actual comparison to `compareAssemblyToLatest()` (shared with `applyBomChangeHolds()`
   * and, per Task 5, `ManufacturingOrdersService`).
   */
  async bomVersionStatus(id: number) {
    const wo = await this.prisma.work_order.findUnique({
      where: { id },
      include: { bom_assembly: true },
    })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)

    const base = {
      snapshot_dispatch_id: wo.bom_dispatch_id_snapshot,
      assembly_mark: wo.bom_assembly.assembly_mark,
    }

    const snap = await this.prisma.bom_dispatch.findUnique({
      where: { id: wo.bom_dispatch_id_snapshot },
    })
    // Snapshot dispatch row no longer exists → nothing to compare against.
    if (!snap) {
      return {
        is_outdated: false,
        delta_types: [] as string[],
        delta_details: null,
        latest_dispatch_id: wo.bom_dispatch_id_snapshot,
        ...base,
      }
    }

    const cmp = await this.compareAssemblyToLatest(wo.bom_assembly, snap)
    return { ...cmp, ...base }
  }

  /**
   * Move the snapshot to the latest version + re-point the assembly + log an event.
   *
   * When resolving a WO out of ON_HOLD (WO BOM-Version Hold, Sprint 20), a `note`
   * is required, and if `qty_done` already exceeds the newly-adopted qty, so is
   * `qty_reusable` — both are checked here (not in the DTO) since only the WO's
   * *current* status determines whether they're mandatory. On success the WO's
   * status is restored to whatever it was right before the hold (`pre_hold_status`,
   * set by `applyBomChangeHolds()`), which is then cleared. A WO that was never
   * held (`pre_hold_status` null) keeps its current status unchanged — today's
   * pre-existing accept behavior.
   */
  async acceptNewVersion(id: number, userName: string, dto: AcceptVersionDto) {
    const wo = await this.requireWo(id)
    const status = await this.bomVersionStatus(id)
    // REMOVED is checked first (Task 6): compareAssemblyToLatest()'s mark-scoped
    // ACTIVE lookup has no "latest dispatch for the group" left to report for a
    // genuinely-removed mark, so latest_dispatch_id falls back to the WO's own
    // snapshot dispatch id in that case — which would otherwise equal
    // snapshot_dispatch_id and trip the "already on latest version" guard below,
    // masking the more specific REMOVED error.
    if (status.delta_types.includes('REMOVED')) {
      throw new ConflictException({
        message: 'Assembly was REMOVED in the new version — cancel the WO instead of accepting',
        delta_types: status.delta_types,
      })
    }
    if (!status.is_outdated || status.latest_dispatch_id === status.snapshot_dispatch_id) {
      throw new ConflictException('Work order is already on the latest BOM version')
    }
    const latestAsm = await this.prisma.bom_assembly.findFirst({
      where: { dispatch_id: status.latest_dispatch_id, assembly_mark: status.assembly_mark },
    })
    if (!latestAsm) throw new ConflictException('Matching assembly not found in latest version')

    if (wo.status === 'ON_HOLD') {
      if (!dto?.note?.trim()) {
        throw new BadRequestException('A note is required to resolve a work order from ON_HOLD')
      }
      const newQty = latestAsm.qty == null ? null : Number(latestAsm.qty)
      if (wo.qty_done != null && newQty != null && Number(wo.qty_done) > newQty) {
        if (dto.qty_reusable == null) {
          throw new BadRequestException(
            'qty_reusable is required when qty_done already exceeds the newly-adopted qty',
          )
        }
      }
      // Server-side upper bound: the frontend caps qty_reusable at qty_done, but a
      // direct API caller bypasses that — reject here too, regardless of whether
      // qty_reusable was required above.
      if (dto.qty_reusable != null && wo.qty_done != null && Number(dto.qty_reusable) > Number(wo.qty_done)) {
        throw new BadRequestException('qty_reusable cannot exceed qty_done')
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.work_order.update({
        where: { id },
        data: {
          bom_assembly_id: latestAsm.id,
          bom_dispatch_id_snapshot: status.latest_dispatch_id,
          updated_by: userName,
          status: wo.pre_hold_status ?? wo.status,
          pre_hold_status: null,
          qty_reusable: dto?.qty_reusable ?? undefined,
        },
      })
      await tx.work_order_event.create({
        data: {
          work_order_id: id,
          event_type: 'ACCEPT_VERSION',
          notes: `Accepted BOM version → dispatch ${status.latest_dispatch_id}${status.delta_types.length ? ` (${status.delta_types.join(', ')})` : ''}${dto?.note ? ` — ${dto.note}` : ''}`,
          recorded_by: userName,
        },
      })
    })
    return this.findOne(id)
  }

  /**
   * Shared significance filter: a newer dispatch existing for the group
   * (`is_outdated: true`) is NOT by itself grounds to hold a WO or warn on a
   * DRAFT MO line — e.g. a re-upload can reintroduce an assembly with byte-identical
   * qty/weight/dims, in which case `delta_types` is genuinely empty. Only a REMOVED,
   * SPEC_CHANGED, or qty-decrease delta is "significant" (qty-increase-only is
   * informational, not a hold/warning). Shared by `applyBomChangeHolds()`'s WO-hold
   * loop and `ManufacturingOrdersService.findOne()`'s stale-line-warning check.
   */
  isSignificantDelta(cmp: { delta_types: string[]; delta_details: Record<string, unknown> | null }): boolean {
    const isRemoved = cmp.delta_types.includes('REMOVED')
    const isSpecChanged = cmp.delta_types.includes('SPEC_CHANGED')
    const qtyDelta = cmp.delta_details?.qty as { from: number; to: number } | undefined
    const isQtyDecrease = cmp.delta_types.includes('QTY_CHANGED') && !!qtyDelta && qtyDelta.to < qtyDelta.from
    return isRemoved || isSpecChanged || isQtyDecrease
  }

  // ── BOM Change Hold (T-WO.10-ish · WO BOM-Version Hold) ──────────────────────
  /**
   * Called after a BOM upload commits. Any active (non-terminal, non-already-held)
   * WO whose snapshotted assembly lives in the same (project, zone, sub_zone) group
   * as the new dispatch gets re-checked via `bomVersionStatus()`; a significant delta
   * (see `isSignificantDelta()`) flips it to ON_HOLD.
   */
  async applyBomChangeHolds(dispatchId: number) {
    const dispatch = await this.prisma.bom_dispatch.findUnique({ where: { id: dispatchId } })
    if (!dispatch) return { held_wo_ids: [] as number[] }

    const candidates = await this.prisma.work_order.findMany({
      where: {
        status: { notIn: ['DONE', 'CANCELLED', 'ON_HOLD'] },
        bom_assembly: {
          dispatch: {
            project_id: dispatch.project_id,
            zone_id: dispatch.zone_id,
            sub_zone_id: dispatch.sub_zone_id,
          },
        },
      },
      select: { id: true, status: true }, // status needed to populate pre_hold_status
    })

    const held_wo_ids: number[] = []
    for (const { id, status: currentStatus } of candidates) {
      const status = await this.bomVersionStatus(id)
      if (!status.is_outdated) continue
      if (!this.isSignificantDelta(status)) continue // qty-increase-only or byte-identical → informational, no hold

      // Each candidate's hold-write is isolated: if WO #3 of 5 throws (e.g. a
      // transient DB error), WOs already held earlier in this loop must stay held
      // and the remaining candidates must still be evaluated — one bad WO can't be
      // allowed to abort the whole post-commit phase of a BOM upload (which would
      // otherwise report the entire upload as failed even though the dispatch was
      // already committed and some WOs are now silently, permanently on hold).
      // The failure is still surfaced loudly via the logger, never swallowed.
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.work_order.update({ where: { id }, data: { status: 'ON_HOLD', pre_hold_status: currentStatus } })
          await tx.work_order_event.create({
            data: {
              work_order_id: id,
              event_type: 'HOLD',
              notes: `Auto-held: BOM upload changed this WO's assembly (${status.delta_types.join(', ')})`,
              recorded_by: 'system',
            },
          })
        })
        held_wo_ids.push(id)
      } catch (err) {
        this.logger.error(
          `applyBomChangeHolds: failed to hold WO ${id} (dispatch ${dispatchId}) — continuing with remaining candidates`,
          err instanceof Error ? err.stack : err,
        )
      }
    }

    return { held_wo_ids }
  }

  // ── BOM-version helpers ─────────────────────────────────────────────────────
  /**
   * Shared comparison extracted from `bomVersionStatus()`: given an already-loaded
   * assembly and the (project, zone, sub_zone) group it belongs to, find the
   * currently ACTIVE assembly row for the same assembly_mark anywhere in the group
   * and classify the delta (REMOVED / QTY_CHANGED / SPEC_CHANGED) against it.
   *
   * Task 6 (Sprint 20 WO BOM-Version Hold false-positive bugfix): the lookup is a
   * direct `status: 'ACTIVE'` query scoped to the mark + group, NOT to "the single
   * most-recently-uploaded dispatch in the group" (the old `latestDispatchForGroup()`
   * mechanism, deleted here). Main and Acc slots — and, more generally, any two
   * dispatches in the same group — are uploaded independently, so the newest
   * dispatch overall is not necessarily the dispatch that owns this mark's current
   * active row. Scoping the mark lookup to "the latest dispatch" was blind to that
   * and produced a false REMOVED (and, via `applyBomChangeHolds()`, a false
   * ON_HOLD) for an untouched Main-slot WO whenever an unrelated Acc-only upload
   * happened to be the newest dispatch in the group — same bug class already fixed
   * in Tasks 4/5 for BOM Diff and the mark-prefix/assembly-picker endpoints.
   *
   * Deliberately not `private` — `applyBomChangeHolds()` uses it for WO holds, and
   * `ManufacturingOrdersService` (Task 5) calls it directly for stale-assembly warnings.
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
   * BOM-Version Hold): given a WO's own snapshotted assembly and the assembly currently
   * ACTIVE for the same mark+group (or `null` if none exists), classifies is_outdated /
   * delta_types / delta_details. No DB access — this is the ONE place "what counts as a
   * meaningful BOM change" is defined. Shared by `compareAssemblyToLatest()` (single-WO
   * path: one `findFirst` per call — `bomVersionStatus()`, `applyBomChangeHolds()`,
   * `ManufacturingOrdersService.findOne()`) and `computeOutdatedWoIds()` (list path: one
   * batched query for every WO on the page, no per-row lookups).
   */
  private classifyAssemblyDelta(
    assembly: BomAssemblyLike,
    latestAsm: BomAssemblyLike | null,
  ): { is_outdated: boolean; delta_types: string[]; delta_details: Record<string, unknown> | null; latest_dispatch_id: number } {
    // No ACTIVE row anywhere in the group for this mark → genuinely removed.
    // (No "latest dispatch for the group" concept survives this fix to report here —
    // fall back to the WO's own dispatch, mirroring the pre-Task-6 fallback shape.)
    if (!latestAsm) {
      return {
        is_outdated: true,
        delta_types: ['REMOVED'],
        delta_details: null,
        latest_dispatch_id: assembly.dispatch_id,
      }
    }

    // The currently ACTIVE row for this mark IS this WO's own snapshotted row →
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
   * Set of WO ids whose snapshotted assembly is significantly behind the currently
   * ACTIVE row for its mark — i.e. `is_outdated: true` badge on the list (T-WO.09).
   *
   * Replaces the old `outdatedSnapshotDispatchIds()` (Task 8, Sprint 20 WO BOM-Version
   * Hold — 6th consumer of the same bug class Tasks 1-7 fixed): that method picked a
   * single most-recently-uploaded `bom_dispatch` per (project, zone, sub_zone) group and
   * flagged every WO NOT snapshotted on it — blind to independent Main/Acc uploads, so
   * an Acc-only upload falsely badged every untouched Main-slot WO as outdated on the
   * list even though the (already-fixed) detail page correctly showed no issue.
   *
   * This is a batched, mark-level equivalent of `bomVersionStatus()` /
   * `compareAssemblyToLatest()`: it does NOT issue one `bom_assembly` query per WO row
   * (`findAll()` is unpaginated — dozens-to-hundreds of rows per call). Instead:
   *   1. Collect each row's distinct (assembly_mark, project_id, zone_id, sub_zone_id)
   *      tuple from the already-loaded `bom_assembly.dispatch` (WO_DETAIL_INCLUDE already
   *      carries everything this needs — no extra fields required).
   *   2. ONE query fetches the currently-ACTIVE bom_assembly row for every such tuple.
   *   3. Each row is classified in-memory via `classifyAssemblyDelta()` — the same pure
   *      comparison `compareAssemblyToLatest()` uses, so there is exactly one place that
   *      defines "what counts as a meaningful BOM change" — and gated through
   *      `isSignificantDelta()`, mirroring the MO `stale_assembly_warnings` pattern
   *      (`is_outdated && isSignificantDelta(...)`, not raw `is_outdated`): a re-upload
   *      that reintroduces a byte-identical assembly under a new dispatch_id must not
   *      re-trigger the same false-positive class this whole plan has been fixing.
   */
  private async computeOutdatedWoIds(
    rows: Prisma.work_orderGetPayload<{ include: typeof WO_DETAIL_INCLUDE }>[],
  ): Promise<Set<number>> {
    const keyOf = (mark: string, projectId: number, zoneId: number, subZoneId: number | null) =>
      `${mark}::${projectId}/${zoneId}/${subZoneId ?? 'null'}`

    const tuples = new Map<
      string,
      { assembly_mark: string; project_id: number; zone_id: number; sub_zone_id: number | null }
    >()
    for (const r of rows) {
      const d = r.bom_assembly.dispatch
      const key = keyOf(r.bom_assembly.assembly_mark, d.project_id, d.zone_id, d.sub_zone_id)
      if (!tuples.has(key)) {
        tuples.set(key, {
          assembly_mark: r.bom_assembly.assembly_mark,
          project_id: d.project_id,
          zone_id: d.zone_id,
          sub_zone_id: d.sub_zone_id,
        })
      }
    }
    if (tuples.size === 0) return new Set()

    // Single batched query — NOT one per row. `dispatch` is included (not just
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
      const d = r.bom_assembly.dispatch
      const key = keyOf(r.bom_assembly.assembly_mark, d.project_id, d.zone_id, d.sub_zone_id)
      const cmp = this.classifyAssemblyDelta(r.bom_assembly, activeByKey.get(key) ?? null)
      if (cmp.is_outdated && this.isSignificantDelta(cmp)) outdated.add(r.id)
    }
    return outdated
  }
}
