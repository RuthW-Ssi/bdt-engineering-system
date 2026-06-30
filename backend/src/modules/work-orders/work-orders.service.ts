import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, WoEventType, WoStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { UpdateWoDto } from './dto/update-wo.dto'

/**
 * WO list default sort tiebreak (T-WO.09): active work first, terminal last.
 * Primary sort is earliest_start_at asc (nulls last); this is the secondary key.
 */
export const WO_STATUS_PRIORITY: Record<WoStatus, number> = {
  IN_PROGRESS: 0,
  PAUSED: 1,
  RELEASED: 2,
  NOT_STARTED: 3,
  DONE: 4,
  CANCELLED: 5,
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
  cancel: { from: ['NOT_STARTED', 'RELEASED', 'IN_PROGRESS', 'PAUSED'], to: 'CANCELLED', event: 'CANCEL' },
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
  constructor(private readonly prisma: PrismaService) {}

  // ── List (filter status | mo_id | work_center_id | mark_prefix_code · search wo_code) ──
  async findAll(opts: {
    status?: WoStatus
    mo_id?: number
    work_center_id?: number
    mark_prefix_code?: string
    search?: string
  }) {
    const where: Prisma.work_orderWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.mo_id ? { mo_id: opts.mo_id } : {}),
      ...(opts.work_center_id ? { work_center_id: opts.work_center_id } : {}),
      ...(opts.mark_prefix_code
        ? { manufacturing_order: { primary_mark_prefix_code: opts.mark_prefix_code } }
        : {}),
      ...(opts.search ? { wo_code: { contains: opts.search, mode: 'insensitive' } } : {}),
    }

    const rows = await this.prisma.work_order.findMany({
      where,
      include: WO_DETAIL_INCLUDE,
    })

    const outdated = await this.outdatedSnapshotDispatchIds()
    const mapped = rows.map((r) => this.toListRow(r, outdated.has(r.bom_dispatch_id_snapshot)))
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
        const acts = Array.isArray(op.activities_snapshot) ? (op.activities_snapshot as RawAct[]) : []

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
    body: { reason?: string; qty_done?: number; qty_scrapped?: number; notes?: string },
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
      data.actual_start_at = now
    } else if (action === 'done') {
      data.actual_end_at = now
      data.qty_done = new Prisma.Decimal(body.qty_done ?? 0)
      if (body.qty_scrapped !== undefined) data.qty_scrapped = new Prisma.Decimal(body.qty_scrapped)
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
    })

    return this.findOne(id)
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
      is_outdated: isOutdated, // T-WO.04 · BOM Version Alert badge (newer dispatch exists for the snapshot's group)
    }
  }

  // ── BOM Version Alert (T-WO.04) ──────────────────────────────────────────────
  /**
   * Compare the WO's snapshot dispatch against the latest dispatch for the same
   * (project, zone, sub_zone) group, classifying the delta on this WO's assembly.
   */
  async bomVersionStatus(id: number) {
    const wo = await this.prisma.work_order.findUnique({
      where: { id },
      include: { bom_assembly: true },
    })
    if (!wo) throw new NotFoundException(`WO ${id} not found`)

    const snap = await this.prisma.bom_dispatch.findUnique({
      where: { id: wo.bom_dispatch_id_snapshot },
    })
    const latest = snap ? await this.latestDispatchForGroup(snap) : null

    const base = {
      snapshot_dispatch_id: wo.bom_dispatch_id_snapshot,
      latest_dispatch_id: latest?.id ?? wo.bom_dispatch_id_snapshot,
      assembly_mark: wo.bom_assembly.assembly_mark,
    }
    // On the latest version already → nothing to alert.
    if (!snap || !latest || latest.id === snap.id) {
      return { is_outdated: false, delta_types: [] as string[], delta_details: null, ...base }
    }

    const latestAsm = await this.prisma.bom_assembly.findFirst({
      where: { dispatch_id: latest.id, assembly_mark: wo.bom_assembly.assembly_mark },
    })

    const delta_types: string[] = []
    const delta_details: Record<string, unknown> = {}
    if (!latestAsm) {
      delta_types.push('REMOVED')
    } else {
      const fromQty = Number(wo.bom_assembly.qty ?? 0)
      const toQty = Number(latestAsm.qty ?? 0)
      if (fromQty !== toQty) {
        delta_types.push('QTY_CHANGED')
        delta_details.qty = { from: fromQty, to: toQty }
      }
      const fromSpec = this.specOf(wo.bom_assembly)
      const toSpec = this.specOf(latestAsm)
      if (JSON.stringify(fromSpec) !== JSON.stringify(toSpec)) {
        delta_types.push('SPEC_CHANGED')
        delta_details.spec = { from: fromSpec, to: toSpec }
      }
    }

    return {
      is_outdated: true, // a newer dispatch exists for this group
      delta_types,
      delta_details: Object.keys(delta_details).length ? delta_details : null,
      ...base,
    }
  }

  /** Move the snapshot to the latest version + re-point the assembly + log an event. */
  async acceptNewVersion(id: number, userName: string) {
    const status = await this.bomVersionStatus(id)
    if (!status.is_outdated || status.latest_dispatch_id === status.snapshot_dispatch_id) {
      throw new ConflictException('Work order is already on the latest BOM version')
    }
    if (status.delta_types.includes('REMOVED')) {
      throw new ConflictException({
        message: 'Assembly was REMOVED in the new version — cancel the WO instead of accepting',
        delta_types: status.delta_types,
      })
    }
    const latestAsm = await this.prisma.bom_assembly.findFirst({
      where: { dispatch_id: status.latest_dispatch_id, assembly_mark: status.assembly_mark },
    })
    if (!latestAsm) throw new ConflictException('Matching assembly not found in latest version')

    await this.prisma.$transaction(async (tx) => {
      await tx.work_order.update({
        where: { id },
        data: {
          bom_assembly_id: latestAsm.id,
          bom_dispatch_id_snapshot: status.latest_dispatch_id,
          updated_by: userName,
        },
      })
      await tx.work_order_event.create({
        data: {
          work_order_id: id,
          event_type: 'ACCEPT_VERSION',
          notes: `Accepted BOM version → dispatch ${status.latest_dispatch_id}${status.delta_types.length ? ` (${status.delta_types.join(', ')})` : ''}`,
          recorded_by: userName,
        },
      })
    })
    return this.findOne(id)
  }

  // ── BOM-version helpers ─────────────────────────────────────────────────────
  private async latestDispatchForGroup(d: {
    project_id: number
    zone_id: number
    sub_zone_id: number | null
  }) {
    return this.prisma.bom_dispatch.findFirst({
      where: { project_id: d.project_id, zone_id: d.zone_id, sub_zone_id: d.sub_zone_id },
      orderBy: [{ uploaded_at: 'desc' }, { id: 'desc' }],
    })
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
   * Set of dispatch ids that are NOT the newest in their (project, zone, sub_zone)
   * group — i.e. any WO snapshotting one of these has a newer version available.
   * One pass over bom_dispatch; used to flag list rows (T-WO.09 badge).
   */
  private async outdatedSnapshotDispatchIds(): Promise<Set<number>> {
    const dispatches = await this.prisma.bom_dispatch.findMany({
      select: { id: true, project_id: true, zone_id: true, sub_zone_id: true, uploaded_at: true },
      orderBy: [{ uploaded_at: 'asc' }, { id: 'asc' }],
    })
    const latestPerGroup = new Map<string, number>()
    for (const d of dispatches) {
      latestPerGroup.set(`${d.project_id}/${d.zone_id}/${d.sub_zone_id ?? 'null'}`, d.id) // ascending → last wins
    }
    const outdated = new Set<number>()
    for (const d of dispatches) {
      const key = `${d.project_id}/${d.zone_id}/${d.sub_zone_id ?? 'null'}`
      if (latestPerGroup.get(key) !== d.id) outdated.add(d.id)
    }
    return outdated
  }
}
