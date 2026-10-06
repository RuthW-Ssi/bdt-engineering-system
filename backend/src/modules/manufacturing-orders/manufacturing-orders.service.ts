import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { MoStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { MailMessageService } from '../mail/mail-message.service'
import { MoCodeGenerator } from './mo-code.generator'
import { MoAllocationService, ALLOCATING_STATUSES } from './mo-allocation.service'
import { WorkOrderAutoCreateService } from '../work-orders/wo-auto-create.service'
import { WorkOrdersService } from '../work-orders/work-orders.service'
import { CreateMoDto, MoAssemblyLineInputDto } from './dto/create-mo.dto'
import { UpdateMoDto } from './dto/update-mo.dto'
import { ChangeStatusDto } from './dto/change-status.dto'
import { UpdateMoActualDatesDto } from './dto/update-actual-dates.dto'
import { CreateWoDto, PreviewWoDto } from './dto/create-wo.dto'
import { actualsTracking, parseActualDates } from '../../common/actual-dates'

/**
 * P3 status state machine: allowed forward transitions.
 * IN_PROGRESS → CANCELLED added 2026-09-23 (user: "mo ต้องมี ปุ่ม complete
 * แล้วก็ cancel ด้วย" — an in-progress MO needs both a Complete and a Cancel
 * button, not Complete-only). Needs no extra logic beyond allowing the
 * transition: `MoAllocationService`'s ALLOCATING_STATUSES already excludes
 * CANCELLED regardless of which status it came from, so "allocation
 * returned" (P15) just works; like every other MO status change, this never
 * touches the MO's own WOs — they're left exactly as they are, independently
 * manageable via their own status actions.
 */
const ALLOWED_TRANSITIONS: Record<MoStatus, MoStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
}

const DETAIL_INCLUDE = {
  primary_mark_prefix: true,
  project: { select: { id: true, project_code: true, name: true } },
  part_marks: { orderBy: { mark: 'asc' as const } },
  part_lines: { orderBy: { line_seq: 'asc' as const }, include: { mark: { select: { mark: true } } } },
  create_user: { select: { id: true, name: true, login: true } },
  write_user: { select: { id: true, name: true, login: true } },
  routing_template: {
    select: {
      id: true,
      code: true,
      name: true,
      // Routing op snapshot source (replaces mo_operation · read live from template)
      operations: {
        orderBy: { sequence: 'asc' as const },
        select: {
          id: true,
          sequence: true,
          op_code: true,
          name: true,
          time_cycle: true,
          time_cycle_manual: true,
          workcenter: { select: { id: true, code: true, name: true, machine: true } },
          op_type: { select: { id: true, key: true, label: true, color: true } },
          activities_snapshot: true,
          operation_template: {
            select: {
              id: true,
              activities: {
                orderBy: { sequence: 'asc' as const },
                select: {
                  id: true, name: true, measure: true, per_minute: true, source_activity_id: true,
                  skills: { select: { skill: true, qty: true, level: true } },
                  tools: { include: { resource: { select: { id: true, name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  },
  assembly_lines: {
    orderBy: { line_seq: 'asc' as const },
    include: {
      bom_assembly: {
        include: {
          dispatch: {
            include: {
              project: true,
              zone: true,
              sub_zone: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.manufacturing_orderInclude

@Injectable()
export class ManufacturingOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailMessageService,
    private readonly codeGen: MoCodeGenerator,
    private readonly alloc: MoAllocationService,
    private readonly woAutoCreate: WorkOrderAutoCreateService,
    // Task 5 (WO BOM-Version Hold, Sprint 20): reuses WorkOrdersService.compareAssemblyToLatest()
    // for stale_assembly_warnings — see findOne(). WorkOrdersModule already imports one-way
    // into ManufacturingOrdersModule (no cycle: WorkOrdersModule never imports back).
    private readonly workOrders: WorkOrdersService,
  ) {}

  // ── List (filter status | mark_prefix | project · search mo_code) ──────────
  async findAll(opts: {
    status?: MoStatus
    mark_prefix?: string
    project_id?: number
    search?: string
  }) {
    const where: Prisma.manufacturing_orderWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.mark_prefix ? { primary_mark_prefix_code: opts.mark_prefix } : {}),
      ...(opts.search
        ? { mo_code: { contains: opts.search, mode: 'insensitive' } }
        : {}),
      // ASSEMBLY MOs reach their project through their lines; PART MOs carry
      // project_id themselves.
      ...(opts.project_id
        ? {
            OR: [
              { assembly_lines: { some: { bom_assembly: { dispatch: { project_id: opts.project_id } } } } },
              { project_id: opts.project_id },
            ],
          }
        : {}),
    }

    const rows = await this.prisma.manufacturing_order.findMany({
      where,
      orderBy: { id: 'desc' },
      include: {
        primary_mark_prefix: true,
        routing_template: {
          select: { id: true, code: true, name: true, _count: { select: { operations: true } } },
        },
        _count: { select: { assembly_lines: true, part_lines: true } },
      },
    })
    return rows.map((r) => ({
      id: r.id,
      mo_code: r.mo_code,
      status: r.status,
      kind: r.kind,
      plan_start: r.plan_start,
      plan_finish: r.plan_finish,
      mark_prefix: r.primary_mark_prefix,
      routing_template: { id: r.routing_template.id, code: r.routing_template.code, name: r.routing_template.name },
      assembly_count: r._count.assembly_lines,
      part_line_count: r._count.part_lines,
      operation_count: r.routing_template._count.operations, // from routing template (ops no longer stored on MO)
      create_date: r.create_date,
    }))
  }

  // ── Detail (+ derived project/zone/sub-zone · P20) ──────────────────────────
  async findOne(id: number) {
    const mo = await this.prisma.manufacturing_order.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    })
    if (!mo) throw new NotFoundException(`MO ${id} not found`)

    const projectsMap = new Map<number, { id: number; project_code: string; name: string }>()
    const zonesMap = new Map<number, { id: number; label: string }>()
    const subZonesMap = new Map<number, { id: number; name: string }>()
    // Task 5 (WO BOM-Version Hold, Sprint 20): DRAFT MOs have no WOs yet (auto-create only
    // runs on confirm), so a superseded bom_assembly on a line has nothing to hold — surface
    // it here instead. Once CONFIRMED, the WO-level ON_HOLD banner is the correct surface
    // (design Q22), so this stays [] there even if the underlying line is stale.
    const staleWarnings: { mo_assembly_line_id: number; assembly_mark: string; delta_types: string[] }[] = []
    for (const line of mo.assembly_lines) {
      const dispatch = line.bom_assembly.dispatch
      const project = dispatch.project
      if (project) {
        projectsMap.set(project.id, {
          id: project.id,
          project_code: project.project_code,
          name: project.name,
        })
      }
      if (dispatch.zone) zonesMap.set(dispatch.zone.id, { id: dispatch.zone.id, label: dispatch.zone.label })
      if (dispatch.sub_zone) subZonesMap.set(dispatch.sub_zone.id, { id: dispatch.sub_zone.id, name: dispatch.sub_zone.name })

      if (mo.status === 'DRAFT') {
        const cmp = await this.workOrders.compareAssemblyToLatest(line.bom_assembly, {
          project_id: dispatch.project_id,
          zone_id: dispatch.zone_id,
          sub_zone_id: dispatch.sub_zone_id,
        })
        // is_outdated alone isn't enough — a re-upload can reintroduce an assembly
        // with byte-identical qty/weight/dims (delta_types: []), which is not a
        // meaningful change worth warning about. See isSignificantDelta().
        if (cmp.is_outdated && this.workOrders.isSignificantDelta(cmp)) {
          staleWarnings.push({
            mo_assembly_line_id: line.id,
            assembly_mark: line.bom_assembly.assembly_mark,
            delta_types: cmp.delta_types,
          })
        }
      }
    }

    // Collect source_activity_ids for consumable lookup across all ops
    const allActivityIds = new Set<number>()
    for (const op of mo.routing_template.operations) {
      if ((op as any).operation_template?.activities?.length) {
        for (const a of (op as any).operation_template.activities) {
          if (a.source_activity_id) allActivityIds.add(a.source_activity_id)
        }
      } else {
        const snap = Array.isArray(op.activities_snapshot) ? (op.activities_snapshot as any[]) : []
        for (const a of snap) { if (a.source_activity_id) allActivityIds.add(a.source_activity_id) }
      }
    }

    const consumeRows = allActivityIds.size > 0
      ? await this.prisma.activity_consume.findMany({
          where: { activity_id: { in: [...allActivityIds] } },
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

    const enrichedOperations = mo.routing_template.operations.map(op => {
      const opAny = op as any
      let activities: { name: string; measure: string | null; labors: { skill: string; qty: number; level?: string | null }[]; consumables: { resource_id: number; code: string; name: string }[] }[]

      if (opAny.operation_template?.activities?.length) {
        // Live path: from Operation Library FK
        activities = opAny.operation_template.activities.map((a: any) => ({
          name: a.name,
          measure: a.measure ?? null,
          labors: (a.skills ?? []).map((s: any) => ({ skill: s.skill, qty: s.qty, level: s.level })),
          tools: (a.tools ?? []).map((t: any) => ({ id: t.resource_id, name: t.resource.name, qty: t.qty })),
          consumables: a.source_activity_id ? (consumeMap.get(a.source_activity_id) ?? []) : [],
        }))
      } else {
        // Fallback: snapshot path
        const snap = Array.isArray(op.activities_snapshot) ? (op.activities_snapshot as any[]) : []
        activities = snap.map(a => ({
          name: a.name,
          measure: a.measure ?? null,
          labors: a.labors ?? [],
          tools: [],
          consumables: a.source_activity_id ? (consumeMap.get(a.source_activity_id) ?? (a.consumables ?? [])) : (a.consumables ?? []),
        }))
      }

      return { ...op, activities }
    })

    return {
      ...mo,
      mark_prefix: mo.primary_mark_prefix, // alias so detail matches list shape (FE reads mo.mark_prefix)
      projects_involved: [...projectsMap.values()],
      zones_involved: [...zonesMap.values()],
      sub_zones_involved: [...subZonesMap.values()],
      routing_template: { ...mo.routing_template, operations: enrichedOperations },
      stale_assembly_warnings: mo.status === 'DRAFT' ? staleWarnings : [],
    }
  }

  // Shared by getConsumeSummary (merged MO total) and
  // getConsumeSummaryByWorkOrder (per-WO breakdown, for the print packet's
  // per-WO traveler "Consume" table). Reads each WO's own work_order_consume
  // rows directly (2026-09-22 fix) — these are the WO's authoritative,
  // already-computed-at-creation-time record (set by
  // WorkOrderAutoCreateService.recomputeConsume(), formula-driven materials
  // and, since the upsert fix, manually-entered no-formula ones alike), the
  // same source WO Detail's own Consume card reads. Previously recomputed
  // straight from activity_consume formulas at read-time, which silently
  // dropped any material with no formula to evaluate — the print packet's
  // Consume table came out completely blank for a WO whose only consumable
  // was a no-formula material (user report: "consume ไม่แสดง" on a printed
  // WO traveler). qty_planned here is already whole-unit-rounded (rounded
  // once, at creation) rather than raw, so both callers just pass it through.
  private async computeConsumeByWorkOrder(moId: number) {
    const rows = await this.prisma.work_order_consume.findMany({
      where: { work_order: { mo_id: moId } },
      select: {
        work_order_id: true,
        material_id: true,
        qty_planned: true,
        unit: true,
        material: { select: { default_code: true, name: true } },
      },
    })

    const byWo = new Map<number, { material_id: number; code: string; name: string; qty: number; unit: string | null }[]>()
    for (const r of rows) {
      const list = byWo.get(r.work_order_id) ?? []
      list.push({ material_id: r.material_id, code: r.material.default_code, name: r.material.name, qty: Number(r.qty_planned), unit: r.unit })
      byWo.set(r.work_order_id, list)
    }
    return byWo
  }

  // ── Consume Summary: planned material totals across all WOs ─────────────────
  async getConsumeSummary(moId: number) {
    await this.requireMo(moId)
    const byWo = await this.computeConsumeByWorkOrder(moId)

    const totals = new Map<number, { material_id: number; code: string; name: string; qty: number; unit: string | null }>()
    for (const items of byWo.values()) {
      for (const item of items) {
        const existing = totals.get(item.material_id)
        if (existing) existing.qty += item.qty
        else totals.set(item.material_id, { ...item })
      }
    }

    // Whole units only (2026-09-21) — matches WorkOrderAutoCreateService
    // .recomputeConsume()'s rounding, so this summary agrees with the WO
    // detail page's own Consume card.
    return [...totals.values()]
      .sort((a, b) => b.qty - a.qty)
      .map(r => ({ ...r, qty: Math.round(r.qty) }))
  }

  // ── Consume Summary keyed per Work Order — same computation as
  // getConsumeSummary but grouped by WO instead of merged into one MO
  // total. Powers the print packet's per-WO traveler "Consume" table, so
  // an operator sees + signs off on what THIS operation planned to use.
  async getConsumeSummaryByWorkOrder(moId: number) {
    await this.requireMo(moId)
    const byWo = await this.computeConsumeByWorkOrder(moId)

    // Whole units only (2026-09-21) — same as getConsumeSummary above.
    const rounded = new Map<number, { material_id: number; code: string; name: string; qty: number; unit: string | null }[]>()
    for (const [woId, items] of byWo) {
      rounded.set(
        woId,
        items
          .map(r => ({ ...r, qty: Math.round(r.qty) }))
          .sort((a, b) => b.qty - a.qty),
      )
    }
    return rounded
  }

  // ── Assemblies tab: lines + total + remaining + allocation breakdown ────────
  // `operationId`, when given, adds `wo_remaining` per line — qty of this
  // mark still unplanned for THAT operation within THIS mo, after sibling
  // work orders of the same operation. Mirrors WoAutoCreateService's private
  // computeMarkBudget() (inlined here, not imported, to avoid a cross-module
  // dependency for one read-only query) — kept in sync manually if that
  // logic changes. Distinct from the always-present `remaining` field above,
  // which is the mark's cross-MO allocation remainder, not operation-scoped.
  async getAssemblies(id: number, operationId?: number) {
    await this.requireMo(id)
    const lines = await this.prisma.mo_assembly_line.findMany({
      where: { mo_id: id },
      orderBy: { line_seq: 'asc' },
      include: {
        bom_assembly: {
          include: { dispatch: { include: { project: true, zone: true, sub_zone: true } } },
        },
      },
    })

    return Promise.all(
      lines.map(async (line) => {
        const breakdown = await this.alloc.allocationBreakdown(line.bom_assembly_id)
        const total = Number(line.bom_assembly.qty ?? 0)
        const allocated = breakdown.reduce((s, b) => s + b.qty, 0)
        let wo_remaining: number | null = null
        if (operationId !== undefined) {
          const committed = await this.prisma.work_order_mark.aggregate({
            where: {
              bom_assembly_id: line.bom_assembly_id,
              removed_at: null,
              work_order: { mo_id: id, source_routing_op_id: operationId },
            },
            _sum: { qty_planned: true },
          })
          wo_remaining = Math.max(0, Number(line.qty) - Number(committed._sum.qty_planned ?? 0))
        }
        return {
          id: line.id,
          line_seq: line.line_seq,
          bom_assembly_id: line.bom_assembly_id,
          assembly_mark: line.bom_assembly.assembly_mark,
          name: line.bom_assembly.name,
          project: line.bom_assembly.dispatch.project?.name ?? null,
          zone: line.bom_assembly.dispatch.zone?.label ?? null,
          sub_zone: line.bom_assembly.dispatch.sub_zone?.name ?? null,
          qty: Number(line.qty),
          total,
          allocated,
          remaining: total - allocated,
          wo_remaining,
          allocation_breakdown: breakdown, // [{ mo_code, qty }]
        }
      }),
    )
  }

  async getParts(id: number) {
    await this.requireMo(id)

    // 1. Fetch all assembly lines for this MO with their parts
    const lines = await this.prisma.mo_assembly_line.findMany({
      where: { mo_id: id },
      include: {
        bom_assembly: {
          include: {
            assembly_parts: {
              include: { part: true },
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
    })

    // 2. Build lookup: assemblyId → [{ partMark, partId, apQty }]
    const assemblyPartLookup = new Map<number, { partMark: string; partId: number; apQty: number }[]>()
    for (const line of lines) {
      if (!assemblyPartLookup.has(line.bom_assembly_id)) {
        assemblyPartLookup.set(
          line.bom_assembly_id,
          line.bom_assembly.assembly_parts.map(ap => ({
            partMark: ap.part.part_mark,
            partId: ap.part_id,
            apQty: Number(ap.qty) || 1,
          })),
        )
      }
    }

    // 3. Aggregate parts from THIS MO
    const partMap = new Map<string, {
      part_mark: string
      description: string | null
      profile: string | null
      grade: string | null
      length_mm: number | null
      weight_kg_each: number | null
      total_qty: number
      total_weight_kg: number | null
      assembly_marks: string[]
      mo_breakdown: { mo_code: string; qty: number }[]
    }>()

    for (const line of lines) {
      const moQty = Number(line.qty) || 1
      for (const ap of line.bom_assembly.assembly_parts) {
        const part = ap.part
        const lineQty = moQty * (Number(ap.qty) || 1)
        const existing = partMap.get(part.part_mark)
        if (existing) {
          existing.total_qty += lineQty
          if (existing.total_weight_kg != null && part.weight_kg != null)
            existing.total_weight_kg += Number(part.weight_kg) * lineQty
          if (!existing.assembly_marks.includes(line.bom_assembly.assembly_mark))
            existing.assembly_marks.push(line.bom_assembly.assembly_mark)
        } else {
          partMap.set(part.part_mark, {
            part_mark: part.part_mark,
            description: part.description ?? null,
            profile: part.profile ?? null,
            grade: part.grade ?? null,
            length_mm: part.length_mm != null ? Number(part.length_mm) : null,
            weight_kg_each: part.weight_kg != null ? Number(part.weight_kg) : null,
            total_qty: lineQty,
            total_weight_kg: part.weight_kg != null ? Number(part.weight_kg) * lineQty : null,
            assembly_marks: [line.bom_assembly.assembly_mark],
            mo_breakdown: [],
          })
        }
      }
    }

    // 4. Fetch all mo_assembly_lines across active MOs for the same assembly IDs
    //    to compute cross-MO breakdown per part
    const assemblyIds = [...assemblyPartLookup.keys()]
    const crossLines = await this.prisma.mo_assembly_line.findMany({
      where: {
        bom_assembly_id: { in: assemblyIds },
        mo: { status: { in: ALLOCATING_STATUSES } },
      },
      include: { mo: { select: { mo_code: true } } },
    })

    for (const cl of crossLines) {
      const moCode = cl.mo.mo_code
      const clQty = Number(cl.qty) || 1
      for (const { partMark, apQty } of assemblyPartLookup.get(cl.bom_assembly_id) ?? []) {
        const entry = partMap.get(partMark)
        if (!entry) continue
        const contrib = clQty * apQty
        const existing = entry.mo_breakdown.find(b => b.mo_code === moCode)
        if (existing) existing.qty += contrib
        else entry.mo_breakdown.push({ mo_code: moCode, qty: contrib })
      }
    }

    // Sort breakdown by mo_code
    for (const entry of partMap.values()) {
      entry.mo_breakdown.sort((a, b) => a.mo_code.localeCompare(b.mo_code))
    }

    return [...partMap.values()].sort((a, b) => a.part_mark.localeCompare(b.part_mark))
  }

  async getHistory(id: number) {
    await this.requireMo(id)
    return this.prisma.mo_status_history.findMany({
      where: { mo_id: id },
      orderBy: { changed_at: 'asc' },
    })
  }

  // ── Create (snapshot + P13 validate + P15 lock) ─────────────────────────────
  async create(dto: CreateMoDto, userId: number, userName: string) {
    const template = await this.prisma.routing_template.findUnique({
      where: { id: dto.routing_template_id },
    })
    if (!template) throw new NotFoundException(`Routing template ${dto.routing_template_id} not found`)

    const prefix = await this.prisma.mark_prefix_master.findUnique({
      where: { code: dto.primary_mark_prefix_code },
    })
    if (!prefix) throw new NotFoundException(`Mark prefix ${dto.primary_mark_prefix_code} not found`)

    await this.assertQtyWithinRemaining(dto.assembly_lines)

    const confirm = dto.confirm === true
    const status: MoStatus = confirm ? 'CONFIRMED' : 'DRAFT'

    const mo = await this.prisma.$transaction(async (tx) => {
      const mo_code = await this.codeGen.generate(tx)
      const created = await tx.manufacturing_order.create({
        data: {
          mo_code,
          primary_mark_prefix_code: dto.primary_mark_prefix_code,
          routing_template_id: dto.routing_template_id,
          status,
          plan_start: dto.plan_start ? new Date(dto.plan_start) : null,
          plan_finish: dto.plan_finish ? new Date(dto.plan_finish) : null,
          create_uid: userId,
          write_uid: userId,
          assembly_lines: {
            create: dto.assembly_lines.map((l, i) => ({
              bom_assembly_id: l.bom_assembly_id,
              qty: new Prisma.Decimal(l.qty),
              line_seq: i,
            })),
          },
        },
      })

      if (confirm) {
        await tx.mo_status_history.create({
          data: {
            mo_id: created.id,
            from_status: 'DRAFT',
            to_status: 'CONFIRMED',
            reason: 'Created with Save + Confirm',
            changed_by: userName,
          },
        })
        // Multi-mark redesign (2026-09-17): WO creation is no longer automatic on
        // confirm — see createWorkOrder() / POST /mo/:id/work-orders below.
      }
      return created
    })

    await this.mail.log({
      model: 'manufacturing_order',
      res_id: mo.id,
      author_id: userId,
      message_type: 'audit',
      subject: `MO ${mo.mo_code} created (${status})`,
    })
    return this.findOne(mo.id)
  }

  // ── Edit DRAFT only ─────────────────────────────────────────────────────────
  async update(id: number, dto: UpdateMoDto, userId: number) {
    const mo = await this.requireMo(id)
    if (mo.status !== 'DRAFT') {
      throw new ConflictException(`Only DRAFT MOs can be edited (current: ${mo.status})`)
    }
    if (mo.kind === 'PART') {
      throw new ConflictException(`MO ${id} is an MO Part — edit it with PATCH /mo/part/${id}`)
    }

    if (dto.assembly_lines) {
      await this.assertQtyWithinRemaining(dto.assembly_lines, id)
    }
    if (dto.routing_template_id && dto.routing_template_id !== mo.routing_template_id) {
      const template = await this.prisma.routing_template.findUnique({
        where: { id: dto.routing_template_id },
      })
      if (!template) throw new NotFoundException(`Routing template ${dto.routing_template_id} not found`)
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.manufacturing_order.update({
        where: { id },
        data: {
          ...(dto.routing_template_id ? { routing_template_id: dto.routing_template_id } : {}),
          ...(dto.plan_start !== undefined
            ? { plan_start: dto.plan_start ? new Date(dto.plan_start) : null }
            : {}),
          ...(dto.plan_finish !== undefined
            ? { plan_finish: dto.plan_finish ? new Date(dto.plan_finish) : null }
            : {}),
          write_uid: userId,
        },
      })

      if (dto.assembly_lines) {
        await tx.mo_assembly_line.deleteMany({ where: { mo_id: id } })
        await tx.mo_assembly_line.createMany({
          data: dto.assembly_lines.map((l, i) => ({
            mo_id: id,
            bom_assembly_id: l.bom_assembly_id,
            qty: new Prisma.Decimal(l.qty),
            line_seq: i,
          })),
        })
      }

    })

    return this.findOne(id)
  }

  // ── Change status (+ required reason → history) ─────────────────────────────
  async changeStatus(id: number, dto: ChangeStatusDto, userId: number, userName: string) {
    const mo = await this.requireMo(id)
    this.assertTransition(mo.status, dto.to_status)
    // Actual dates are user-typed at Complete, never system-stamped on Start
    // or Complete (2026-10-01, replaces the 09-23/09-29 auto-stamps).
    let actuals: { actual_start: Date; actual_finish: Date } | undefined
    if (dto.to_status === 'DONE') {
      actuals = parseActualDates(dto.actual_start, dto.actual_finish)
    } else if (dto.actual_start != null || dto.actual_finish != null) {
      throw new BadRequestException('Actual dates can only be set when completing the MO')
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.manufacturing_order.update({
        where: { id },
        data: { status: dto.to_status, write_uid: userId, ...actuals },
      })
      await tx.mo_status_history.create({
        data: {
          mo_id: id,
          from_status: mo.status,
          to_status: dto.to_status,
          reason: dto.reason,
          changed_by: userName,
        },
      })
      // Multi-mark redesign (2026-09-17): confirming a DRAFT no longer
      // auto-creates WOs — see createWorkOrder() / POST /mo/:id/work-orders below.
    })

    await this.mail.log({
      model: 'manufacturing_order',
      res_id: id,
      author_id: userId,
      message_type: 'audit',
      subject: `MO ${mo.mo_code} status ${mo.status} → ${dto.to_status}`,
      ...(actuals ? { tracking: actualsTracking(mo, actuals) } : {}),
    })
    return this.findOne(id)
  }

  // ── Edit actual dates — DONE only (2026-10-01) ──────────────────────────────
  async updateActualDates(id: number, dto: UpdateMoActualDatesDto, userId: number) {
    const mo = await this.requireMo(id)
    if (mo.status !== 'DONE') {
      throw new ConflictException('Actual dates can only be edited after the MO is DONE')
    }
    const actuals = parseActualDates(dto.actual_start, dto.actual_finish)
    const tracking = actualsTracking(mo, actuals)
    if (tracking.length > 0) {
      await this.prisma.manufacturing_order.update({ where: { id }, data: { ...actuals, write_uid: userId } })
      await this.mail.log({
        model: 'manufacturing_order',
        res_id: id,
        author_id: userId,
        message_type: 'audit',
        subject: `MO ${mo.mo_code} actual dates edited`,
        tracking,
      })
    }
    return this.findOne(id)
  }

  // ── Cancel (DELETE) — DRAFT/CONFIRMED only · returns qty (P15) ───────────────
  async cancel(id: number, userId: number, userName: string) {
    const mo = await this.requireMo(id)
    if (mo.status !== 'DRAFT' && mo.status !== 'CONFIRMED') {
      throw new ConflictException(
        `Only DRAFT or CONFIRMED MOs can be cancelled (current: ${mo.status})`,
      )
    }
    return this.changeStatus(
      id,
      { to_status: 'CANCELLED', reason: 'Cancelled — allocation returned' },
      userId,
      userName,
    )
  }

  // ── Create WO / add marks (multi-mark redesign, 2026-09-17) ─────────────────
  // Manual replacement for the old auto-create-on-confirm flow: find-or-create
  // the WO for (this MO, operation_id), then add a work_order_mark row for each
  // assembly_line_id not already on it. See WorkOrderAutoCreateService.createOrAddMarks().
  async createWorkOrder(moId: number, dto: CreateWoDto, userName: string, userId: number) {
    const mo = await this.requireMo(moId)
    if (mo.kind === 'PART') throw new ConflictException('Work orders for MO Part are not supported yet')
    // Internal teams cap headcount at their own active-operator count — the
    // frontend auto-fills and clamps this, but re-check server-side since
    // that's just UX, not enforcement (2026-09-25). External teams have no
    // roster to check against, so no cap.
    const team = await this.prisma.team.findUnique({ where: { id: dto.team_id }, select: { team_type: true } })
    if (team?.team_type === 'internal') {
      const activeCount = await this.prisma.operator.count({ where: { team_id: dto.team_id, active: true } })
      if (dto.team_headcount > activeCount) {
        throw new BadRequestException(
          `Headcount (${dto.team_headcount}) exceeds this internal team's active operator count (${activeCount}).`,
        )
      }
    }
    const marks = dto.marks.map((m) => ({ assembly_line_id: m.assembly_line_id, qty: m.qty }))
    return this.prisma.$transaction(async (tx) => {
      const result = await this.woAutoCreate.createOrAddMarks(
        tx, moId, dto.operation_id, marks, userName, dto.assigned_to,
        dto.plan_start ? new Date(dto.plan_start) : undefined,
        dto.plan_finish ? new Date(dto.plan_finish) : undefined,
        dto.team_id,
        dto.team_headcount,
      )

      // Optional overrides on top of recomputeParts()/recomputeConsume()'s auto
      // suggestions — the single-page form previews those suggestions before
      // Create is ever pressed, so the one submit carries any edits the user
      // already made to them (2026-09-17 single-page revision).
      // Parts get the same real-total budget check as PATCH /wo/:id/parts
      // (2026-09-18, qty-based 2026-09-21) — consume has no such cap, parts do.
      for (const p of dto.parts ?? []) {
        const { total, committed } = await this.woAutoCreate.computePartBudget(tx, moId, p.bom_assembly_part_id, result.work_order_id)
        if (p.qty > total - committed) {
          throw new BadRequestException(
            `qty ${p.qty} for part ${p.bom_assembly_part_id} exceeds the remaining budget (${Math.max(0, total - committed).toFixed(3)} pcs left of ${total.toFixed(3)} pcs total for this MO)`,
          )
        }
      }
      for (const p of dto.parts ?? []) {
        const bap = await tx.bom_assembly_part.findUniqueOrThrow({
          where: { id: p.bom_assembly_part_id },
          select: { part: { select: { weight_kg: true } } },
        })
        await tx.work_order_part.update({
          where: { work_order_id_bom_assembly_part_id: { work_order_id: result.work_order_id, bom_assembly_part_id: p.bom_assembly_part_id } },
          data: {
            qty: new Prisma.Decimal(p.qty),
            weight_kg: new Prisma.Decimal(p.qty * Number(bap.part.weight_kg ?? 0)),
            updated_by: userName,
          },
        })
      }
      for (const c of dto.consume ?? []) {
        // upsert, not update (2026-09-22 fix) — a material with no formula
        // (see previewMarksImpact's qty: null case) never gets a row from
        // recomputeConsume() above, since that only creates rows for
        // materials with a positive COMPUTED qty. The Consume picker now
        // lets the user type an actual for exactly those materials too, so
        // this must be able to create the row, not just update one that may
        // not exist (was: unconditional .update() → P2025 → 500, caught in
        // manual testing).
        await tx.work_order_consume.upsert({
          where: { work_order_id_material_id: { work_order_id: result.work_order_id, material_id: c.material_id } },
          create: {
            work_order_id: result.work_order_id,
            material_id: c.material_id,
            qty_planned: 0,
            qty_actual: c.qty_actual,
            unit: null,
            created_by: userName,
          },
          update: { qty_actual: c.qty_actual, updated_by: userName },
        })
      }
      return result
    })
  }

  /** POST /mo/:id/work-orders/preview — read-only, see WorkOrderAutoCreateService.previewMarksImpact(). */
  async previewWorkOrder(moId: number, dto: PreviewWoDto) {
    const mo = await this.requireMo(moId)
    if (mo.kind === 'PART') throw new ConflictException('Work orders for MO Part are not supported yet')
    const marks = dto.marks.map((m) => ({ assembly_line_id: m.assembly_line_id, qty: m.qty }))
    return this.woAutoCreate.previewMarksImpact(this.prisma, moId, dto.operation_id, marks)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private async requireMo(id: number) {
    const mo = await this.prisma.manufacturing_order.findUnique({ where: { id } })
    if (!mo) throw new NotFoundException(`MO ${id} not found`)
    return mo
  }

  private assertTransition(from: MoStatus, to: MoStatus) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(`Invalid status transition: ${from} → ${to}`)
    }
  }

  /** P13: each line qty ≤ remaining. Aggregates a 400 listing all offending lines. */
  private async assertQtyWithinRemaining(
    lines: MoAssemblyLineInputDto[],
    excludeMoId?: number,
  ) {
    const errors: string[] = []
    for (const line of lines) {
      const assembly = await this.prisma.bom_assembly.findUnique({
        where: { id: line.bom_assembly_id },
      })
      if (!assembly) {
        errors.push(`Assembly ${line.bom_assembly_id} not found`)
        continue
      }
      const remaining = await this.alloc.remainingFor(line.bom_assembly_id, excludeMoId)
      if (line.qty > remaining) {
        errors.push(
          `Assembly ${assembly.assembly_mark}: qty ${line.qty} exceeds remaining ${remaining}`,
        )
      }
    }
    if (errors.length) throw new BadRequestException(errors)
  }
}
