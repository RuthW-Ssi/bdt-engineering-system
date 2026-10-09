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
import { CreateMoDto, LinkBomDto, LinkBomMarkDto, MergePreshopDto, MoAssemblyLineInputDto, PreshopPartDto } from './dto/create-mo.dto'
import { UpdateMoDto } from './dto/update-mo.dto'
import { ChangeStatusDto } from './dto/change-status.dto'
import { UpdateMoActualDatesDto } from './dto/update-actual-dates.dto'
import { CreateWoDto, PreviewWoDto } from './dto/create-wo.dto'
import { ASM_FIELDS, ASM_SELECT, asmValues, valueChanges, valueText, type AsmValues } from './preshop/asm-fields'
import { PreshopService } from './preshop/preshop.service'
import { PRESHOP_TEMPLATE_CODE } from './preshop/preshop-op'
import { fmtBkk } from '../../common/history-format'
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
  // last packet printed — the MO page warns when its Rev is older than the MO's (2026-10-09)
  print_logs: { orderBy: { printed_at: 'desc' as const }, take: 1, select: { revision: true, printed_by: true, printed_at: true } },
  project: { select: { id: true, project_code: true, name: true } },
  zone: { select: { id: true, code: true, label: true } },
  sub_zone: { select: { id: true, name: true, code: true } },
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

/** One part as History shows it: "C-f1 PL25x400 SM520 L10550 ×2/ชุด 828.17 kg/ชิ้น". */
function partText(p: { part_mark: string; profile: string; grade: string; length_mm: number; qty: number; unit_weight_kg: number }) {
  return `${p.part_mark} ${p.profile}${p.grade ? ` ${p.grade}` : ''} L${p.length_mm} ×${p.qty}/ชุด ${p.unit_weight_kg} kg/ชิ้น`
}

/** Field-level differences between two versions of one assembly, as History
 *  lines (same wording as applyAssemblyState / applyParts). */
function assemblyDiff(
  mark: string,
  was: Partial<AsmValues> & { parts: Parameters<typeof partText>[0][] },
  now: Partial<AsmValues> & { parts: Parameters<typeof partText>[0][] },
): string[] {
  // every value (2026-10-09): name, L, W, H, kg/set, area/set
  const out: string[] = valueChanges(was, now).map(c => `${mark} ${c.label} ${valueText(c.from)} → ${valueText(c.to)}`)
  const after = new Map(now.parts.map(p => [p.part_mark, p]))
  const before = new Set(was.parts.map(p => p.part_mark))
  for (const p of was.parts) {
    const q = after.get(p.part_mark)
    if (!q) continue
    if (p.qty !== q.qty) out.push(`${mark} ${p.part_mark} ต่อชุด ${p.qty} → ${q.qty}`)
    if (p.profile !== q.profile) out.push(`${mark} ${p.part_mark} profile ${p.profile} → ${q.profile}`)
    if (p.grade !== q.grade) out.push(`${mark} ${p.part_mark} grade ${p.grade || '—'} → ${q.grade || '—'}`)
    if (p.length_mm !== q.length_mm) out.push(`${mark} ${p.part_mark} L ${p.length_mm} → ${q.length_mm}`)
    if (p.unit_weight_kg !== q.unit_weight_kg) out.push(`${mark} ${p.part_mark} kg ${p.unit_weight_kg} → ${q.unit_weight_kg}`)
  }
  for (const p of was.parts) if (!after.has(p.part_mark)) out.push(`${mark} ลบ ${p.part_mark}`)
  for (const q of now.parts) if (!before.has(q.part_mark)) out.push(`${mark} เพิ่ม ${partText(q)}`)
  return out
}

/** A mark new to the MO, with every value and part it brings (History). */
function newMarkLog(a: Partial<AsmValues> & { assembly_mark: string; qty: number; parts: Parameters<typeof partText>[0][] }) {
  const m = a.assembly_mark.trim()
  const v = asmValues(a)
  // sets, then every value the mark brings (2026-10-09: name / W / H / area too)
  const values = ASM_FIELDS.filter(f => v[f.key] != null).map(f => `${f.label} ${valueText(v[f.key])}`)
  return [`เพิ่ม ${m} (${[`ชุด ${a.qty}`, ...values].join(', ')})`, ...a.parts.map(p => `${m} part ${partText(p)}`)]
}

/** A pre-shop part must be complete enough to pick and build with
 *  (2026-10-08): mark, profile, L, kg each and count per set; grade optional. */
function partProblems(parts: { part_mark: string; profile: string; length_mm: number; unit_weight_kg: number; qty: number }[]): string[] {
  const out: string[] = []
  parts.forEach((p, i) => {
    const m = p.part_mark.trim()
    if (!m) { out.push(`part แถว ${i + 1}: ยังไม่ใส่ part mark`); return }
    if (!p.profile.trim()) out.push(`${m}: ยังไม่ใส่ profile`)
    if (!(p.length_mm > 0)) out.push(`${m}: ยังไม่ใส่ L`)
    if (!(p.unit_weight_kg > 0)) out.push(`${m}: ยังไม่ใส่ kg/ชิ้น`)
    if (!(p.qty > 0)) out.push(`${m}: จำนวนต่อชุดต้องมากกว่า 0`)
  })
  const names = parts.map(p => p.part_mark.trim()).filter(Boolean)
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
  if (dupes.length) out.push(`part ซ้ำ: ${dupes.join(', ')}`)
  return out
}

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
    // Pre-shop MO (2026-10-07) — writes the PRE_SHOP BOM dispatch of an upload.
    private readonly preshop: PreshopService = new PreshopService(),
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
        zone: { select: { id: true, code: true, label: true } },
        _count: { select: { assembly_lines: true, part_lines: true } },
      },
    })
    return rows.map((r) => ({
      id: r.id,
      mo_code: r.mo_code,
      status: r.status,
      kind: r.kind,
      shop_type: r.shop_type,
      revision: r.revision,
      plan_start: r.plan_start,
      plan_finish: r.plan_finish,
      mark_prefix: r.primary_mark_prefix,
      // MO Parts may have no routing (routing_template_id is optional for PART).
      routing_template: r.routing_template ? { id: r.routing_template.id, code: r.routing_template.code, name: r.routing_template.name } : null,
      assembly_count: r._count.assembly_lines,
      part_line_count: r._count.part_lines,
      zone: r.zone ?? null,
      operation_count: r.routing_template?._count.operations ?? 0, // from routing template (ops no longer stored on MO)
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
    // PRE_SHOP: op 000 "Build-up(Pre-Shop)" leads the routing's operations.
    if (mo.shop_type === 'PRE_SHOP' && mo.routing_template) {
      const sys = await this.prisma.mrp_routing_workcenter.findMany({
        where: { template: { code: PRESHOP_TEMPLATE_CODE } },
        orderBy: { sequence: 'asc' },
        select: DETAIL_INCLUDE.routing_template.select.operations.select,
      })
      mo.routing_template.operations = [...sys, ...mo.routing_template.operations] as typeof mo.routing_template.operations
    }

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
    for (const op of mo.routing_template?.operations ?? []) {
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

    const enrichedOperations = (mo.routing_template?.operations ?? []).map(op => {
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
      routing_template: mo.routing_template ? { ...mo.routing_template, operations: enrichedOperations } : null,
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
          include: {
            dispatch: { include: { project: true, zone: true, sub_zone: true } },
            assembly_parts: { include: { part: true }, orderBy: { sequence: 'asc' } },
          },
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
          ...asmValues(line.bom_assembly), // name, L, W, H, kg/set, area/set (2026-10-09)
          project: line.bom_assembly.dispatch.project?.name ?? null,
          zone: line.bom_assembly.dispatch.zone?.label ?? null,
          sub_zone: line.bom_assembly.dispatch.sub_zone?.name ?? null,
          qty: Number(line.qty),
          total,
          allocated,
          remaining: total - allocated,
          wo_remaining,
          allocation_breakdown: breakdown, // [{ mo_code, qty }]
          preshop: line.bom_assembly.dispatch.source === 'PRE_SHOP', // its parts are editable on the MO
          // where this mark's data comes from (2026-10-09): Pre-shop or the BOM revision
          source_label: line.bom_assembly.dispatch.source === 'PRE_SHOP' ? 'Pre-shop' : `BOM rev ${line.bom_assembly.dispatch.revision}`,
          // parts per set (2026-10-08: Assemblies tab shows what each assembly uses)
          parts: line.bom_assembly.assembly_parts.map(ap => ({
            part_mark: ap.part.part_mark,
            profile: ap.part.profile,
            grade: ap.part.grade,
            length_mm: ap.part.length_mm == null ? null : Number(ap.part.length_mm),
            qty_per_set: Number(ap.qty),
            weight_kg: ap.part.weight_kg == null ? null : Number(ap.part.weight_kg),
          })),
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
            dispatch: { select: { project_id: true, zone_id: true, sub_zone_id: true } },
            assembly_parts: {
              include: { part: true },
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
    })

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

    // 4. Cross-MO breakdown: every allocating MO line of the same assembly mark
    //    in the same project/zone/sub-zone — the Assemblies tab's rule (mark +
    //    group, MoAllocationService), not the bom_assembly id: pre-shop MOs of one
    //    zone come from different uploads (2026-10-07, user chose "ก"). Each
    //    MO's own assembly parts give its part quantities.
    const groups = new Map<string, { assembly_mark: string; dispatch: { project_id: number; zone_id: number; sub_zone_id: number | null } }>()
    for (const l of lines) {
      const d = l.bom_assembly.dispatch
      groups.set(`${l.bom_assembly.assembly_mark}|${d.project_id}|${d.zone_id}|${d.sub_zone_id}`, {
        assembly_mark: l.bom_assembly.assembly_mark,
        dispatch: { project_id: d.project_id, zone_id: d.zone_id, sub_zone_id: d.sub_zone_id },
      })
    }
    const crossLines = groups.size
      ? await this.prisma.mo_assembly_line.findMany({
          where: {
            mo: { status: { in: ALLOCATING_STATUSES } },
            OR: [...groups.values()].map(g => ({ bom_assembly: g })),
          },
          include: {
            mo: { select: { mo_code: true } },
            bom_assembly: { include: { assembly_parts: { include: { part: { select: { part_mark: true } } } } } },
          },
        })
      : []

    for (const cl of crossLines) {
      const moCode = cl.mo.mo_code
      const clQty = Number(cl.qty) || 1
      for (const ap of cl.bom_assembly.assembly_parts) {
        const entry = partMap.get(ap.part.part_mark)
        if (!entry) continue
        const contrib = clQty * (Number(ap.qty) || 1)
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

  // ── Upload: add assemblies to an MO from ONE source (2026-10-07/08) ─────────
  // Any status but DONE / CANCELLED; a Full shop MO takes BOM picks only. New
  // marks are added. For a mark the MO already has, the user compared old vs
  // new and chose (or typed) every value (2026-10-08) — the upload carries
  // that FINAL state (sets, L, kg/set, parts) and it is applied as is; sets
  // never below what WOs planned, parts on a WO never removed. dry_run
  // returns the MO's current values per mark to compare against. Logged.
  async mergePreshop(id: number, dto: MergePreshopDto, userId: number, userName: string) {
    const mo = await this.requireMo(id)
    if (mo.status === 'DONE' || mo.status === 'CANCELLED') throw new ConflictException(`MO ${mo.mo_code} is ${mo.status} — nothing can be added`)
    if (mo.shop_type !== 'PRE_SHOP' && (dto.source !== 'BOM' || dto.preshop_assemblies?.length)) throw new BadRequestException('A Full shop MO takes assemblies from the BOM only')
    if (mo.shop_type === 'PRE_SHOP' && (dto.source === 'BOM' || dto.assembly_lines?.length)) {
      throw new BadRequestException('MO Pre-shop รับข้อมูลจาก BOM ผ่าน "เทียบกับ BOM" เท่านั้น')
    }
    if (!mo.project_id || !mo.zone_id) throw new BadRequestException(`MO ${mo.mo_code} has no project/zone`)

    const lines = await this.prisma.mo_assembly_line.findMany({
      where: { mo_id: id }, orderBy: { line_seq: 'asc' },
      include: { bom_assembly: { select: {
        id: true, assembly_mark: true, dispatch_id: true, ...ASM_SELECT, dispatch: { select: { source: true } },
        assembly_parts: { orderBy: { sequence: 'asc' }, select: { id: true, qty: true, part_id: true, _count: { select: { work_order_parts: { where: { updated_by: { not: null } } } } }, part: { select: { part_mark: true, profile: true, length_mm: true, grade: true, weight_kg: true } } } },
      } } },
    })
    const byMark = new Map(lines.map(l => [l.bom_assembly.assembly_mark, l]))
    const n = (v: unknown) => (v == null ? null : Number(v))
    const partsOf = (l: (typeof lines)[number]) => l.bom_assembly.assembly_parts.map(ap => ({
      part_mark: ap.part.part_mark, profile: ap.part.profile ?? '', length_mm: n(ap.part.length_mm) ?? 0, grade: ap.part.grade ?? '', qty: Number(ap.qty), unit_weight_kg: n(ap.part.weight_kg) ?? 0,
    }))
    const planned = await this.prisma.work_order_mark.findMany({
      where: { removed_at: null, bom_assembly_id: { in: lines.map(l => l.bom_assembly_id) }, work_order: { mo_id: id, status: { not: 'CANCELLED' } } },
      select: { bom_assembly_id: true, qty_planned: true, work_order: { select: { source_routing_op_id: true } } },
    })
    // Sets already issued for a mark = the most any one operation's WOs planned.
    const issued = (asmId: number) => {
      const perOp = new Map<number | null, number>()
      for (const p of planned) if (p.bom_assembly_id === asmId) perOp.set(p.work_order.source_routing_op_id, (perOp.get(p.work_order.source_routing_op_id) ?? 0) + Number(p.qty_planned))
      return Math.max(0, ...perOp.values())
    }

    const pre = (dto.preshop_assemblies ?? []).map(a => ({ ...a, assembly_mark: a.assembly_mark.trim() }))
    const rows = pre.map(a => {
      const line = byMark.get(a.assembly_mark)
      if (!line) return { assembly_mark: a.assembly_mark, status: 'new' as const, existing: null }
      const b = line.bom_assembly
      const was = { ...asmValues(b), parts: partsOf(line) }
      const changes = this.preshop.sizeChanges(was, { ...asmValues(a), parts: a.parts })
      return {
        assembly_mark: a.assembly_mark, status: changes.length ? 'changed' as const : 'same' as const,
        existing: { qty: Number(line.qty), ...was, wo_qty: issued(line.bom_assembly_id), wo_parts: b.assembly_parts.filter(ap => ap._count.work_order_parts > 0).map(ap => ap.part.part_mark) },
      }
    })
    if (dto.dry_run) return { rows }
    // sets are checked only on save — the dry run compares as soon as a file
    // is read, before the user typed them (a pre-shop PDF has none)
    const unset = pre.filter(a => !(a.qty > 0)).map(a => a.assembly_mark)
    if (unset.length) throw new BadRequestException(`${unset.join(', ')}: ยังไม่ได้กรอกจำนวนชุด`)

    // Every mark must end up with complete parts (2026-10-08, user: a Dispatch
    // Note means production starts — estimates are fine, blanks are not).
    const noParts = pre.filter(a => !a.parts.length && !byMark.get(a.assembly_mark)?.bom_assembly.assembly_parts.length).map(a => a.assembly_mark)
    if (noParts.length) throw new BadRequestException(`${noParts.join(', ')}: ยังไม่มี part — ใส่ part ก่อนบันทึก`)
    const badParts = pre.flatMap(a => partProblems(a.parts).map(e => `${a.assembly_mark} · ${e}`))
    if (badParts.length) throw new BadRequestException(badParts.join(' · '))
    for (const a of pre) {
      const line = byMark.get(a.assembly_mark)
      const floor = line ? issued(line.bom_assembly_id) : 0
      if (line && a.qty < floor) throw new BadRequestException(`${a.assembly_mark}: ออก WO ไปแล้ว ${floor} ชุด — ต่ำกว่านี้ไม่ได้`)
    }

    // A new mark is logged with every value it brings (2026-10-08, user: every
    // assembly / part field in History — what, when, who).
    const log: string[] = pre.filter(a => !byMark.has(a.assembly_mark)).flatMap(newMarkLog)
    const fresh = pre.filter(a => !byMark.has(a.assembly_mark))
    const warnings: string[] = []

    let bomLines = dto.assembly_lines ?? []
    if (bomLines.length) {
      const marks = new Map((await this.prisma.bom_assembly.findMany({ where: { id: { in: bomLines.map(l => l.bom_assembly_id) } }, select: { id: true, assembly_mark: true } })).map(a => [a.id, a.assembly_mark]))
      bomLines = bomLines.filter(l => {
        const m = marks.get(l.bom_assembly_id)
        if (m && byMark.has(m)) { warnings.push(`${m} มีใน MO อยู่แล้ว — ข้าม`); return false }
        return true
      })
      if (bomLines.length) {
        await this.resolveZone(bomLines.map(l => l.bom_assembly_id), undefined, mo.zone_id)
        await this.assertQtyWithinRemaining(bomLines, id)
        for (const l of bomLines) log.push(`เพิ่ม ${marks.get(l.bom_assembly_id) ?? l.bom_assembly_id} (${l.qty}) จาก BOM`)
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const a of pre) {
        const line = byMark.get(a.assembly_mark)
        if (!line) continue
        const changed = await this.applyAssemblyState(tx, line, a, userId)
        log.push(...changed)
        if (changed.length) await this.syncWos(tx, id, [line.bom_assembly_id], userName, changed)
      }
      let seq = lines.length
      if (fresh.length) {
        const ids = await this.preshop.createDispatch(tx, { project_id: mo.project_id!, zone_id: mo.zone_id!, sub_zone_id: mo.sub_zone_id ?? null }, fresh, userId)
        await tx.mo_assembly_line.createMany({ data: fresh.map(a => ({ mo_id: id, bom_assembly_id: ids.get(a.assembly_mark)!, qty: new Prisma.Decimal(a.qty), line_seq: seq++ })) })
      }
      if (bomLines.length) {
        await tx.mo_assembly_line.createMany({ data: bomLines.map(l => ({ mo_id: id, bom_assembly_id: l.bom_assembly_id, qty: new Prisma.Decimal(l.qty), line_seq: seq++ })) })
      }
      if (log.length) {
        await this.bumpRevision(tx, mo, log)
        for (const note of dto.notes ?? []) log.push(`คำเตือนตอนอ่านไฟล์: ${note}`)
        const label = { DISPATCH_NOTE: 'Dispatch Note', PRESHOP_PDF: 'Pre-shop drawing', DN_PDF: 'Dispatch Note + Pre-shop drawing', BOM: 'BOM' }[dto.source]
        await tx.mo_status_history.create({
          data: { mo_id: id, from_status: mo.status, to_status: mo.status, changed_by: userName, reason: `เพิ่มข้อมูลจาก ${label}${dto.filename ? ` (${dto.filename})` : ''}: ${log.join(' · ')}` },
        })
      }
    })
    return { mo: await this.findOne(id), rows, warnings, changed: log.length }
  }

  /** Puts one MO line's assembly into the state the user chose: sets (part
   *  totals follow), L, kg/set and parts. A BOM-sourced line only takes the
   *  sets. Returns the History lines, "<mark> <what> old → new". */
  private async applyAssemblyState(
    tx: Prisma.TransactionClient,
    line: { id: number; qty: Prisma.Decimal | string | number; bom_assembly_id: number; bom_assembly: { assembly_mark: string; dispatch_id: number; dispatch: { source: string } } & Parameters<typeof asmValues>[0] },
    a: Partial<AsmValues> & { qty: number; parts: PreshopPartDto[] },
    userId: number,
  ): Promise<string[]> {
    const mark = line.bom_assembly.assembly_mark
    const n = (v: unknown) => (v == null ? null : Number(v))
    const preshop = line.bom_assembly.dispatch.source === 'PRE_SHOP'
    const log: string[] = []
    const oldSets = Number(line.qty)
    if (a.qty !== oldSets) {
      await tx.mo_assembly_line.update({ where: { id: line.id }, data: { qty: new Prisma.Decimal(a.qty) } })
      log.push(`${mark} ชุด ${oldSets} → ${a.qty}`)
    }
    if (!preshop) return log
    const data: Prisma.bom_assemblyUpdateInput = {}
    if (a.qty !== oldSets) data.qty = new Prisma.Decimal(a.qty)
    // undefined = not sent; null = cleared by the user — logged either way it changes
    const dec = (v: number | null) => (v == null ? null : new Prisma.Decimal(v))
    // every value (2026-10-09): name, L, W, H, kg/set, area/set
    const cur = asmValues(line.bom_assembly)
    const sent = Object.fromEntries(ASM_FIELDS.filter(f => a[f.key] !== undefined).map(f => [f.key, a[f.key]]))
    for (const c of valueChanges(cur, asmValues({ ...cur, ...sent }))) {
      if (c.key === 'name') data.name = c.to as string | null
      else data[c.key] = dec(c.to as number | null)
      log.push(`${mark} ${c.label} ${valueText(c.from)} → ${valueText(c.to)}`)
    }
    if (Object.keys(data).length) await tx.bom_assembly.update({ where: { id: line.bom_assembly_id }, data })
    if (a.qty !== oldSets) {
      // part totals follow the sets, at the current count per set
      const cur = await tx.bom_assembly_part.findMany({ where: { assembly_id: line.bom_assembly_id }, select: { qty: true, part_id: true } })
      for (const ap of cur) await tx.bom_part.update({ where: { id: ap.part_id }, data: { qty: { increment: new Prisma.Decimal(Number(ap.qty) * (a.qty - oldSets)) } } })
    }
    if (a.parts.length) log.push(...(await this.applyParts(tx, line.bom_assembly_id, line.bom_assembly.dispatch_id, a.parts, a.qty, userId)).map(x => `${mark} ${x}`))
    return log
  }

  /** Full shop mark → the new BOM version (2026-10-09): the MO line and its
   *  WO marks point at the new row; each WO part row moves to the same part
   *  mark in the new version, an untouched one whose part is gone is dropped
   *  (one with a withdrawal entered blocks the switch); then the WOs pick up
   *  added parts. Sets stay what the user chose. Returns History lines. */
  private async switchToBomVersion(
    tx: Prisma.TransactionClient, moId: number,
    line: { id: number; qty: Prisma.Decimal | string | number; bom_assembly_id: number; bom_assembly: { assembly_mark: string } },
    was: Partial<AsmValues> & { qty: number; parts: PreshopPartDto[] },
    now: Partial<AsmValues> & { assembly_id: number; assembly_mark?: string; parts: PreshopPartDto[] },
    qty: number, dispatchId: number, userName: string,
    headline = 'ใช้ BOM version ใหม่',
    partMap?: { from: string; to: string | null }[], // old part mark → new (renamed parts, 2026-10-09); default: same name
  ): Promise<string[]> {
    const oldMark = line.bom_assembly.assembly_mark
    const mark = now.assembly_mark ?? oldMark
    const rename = new Map((partMap ?? []).map(p => [p.from, p.to]))
    const target = (m: string) => (rename.has(m) ? rename.get(m)! : m)
    const oldParts = await tx.bom_assembly_part.findMany({ where: { assembly_id: line.bom_assembly_id }, select: { id: true, part: { select: { part_mark: true } } } })
    const newParts = await tx.bom_assembly_part.findMany({ where: { assembly_id: now.assembly_id }, select: { id: true, part: { select: { part_mark: true } } } })
    const newIdByMark = new Map(newParts.map(p => [p.part.part_mark, p.id]))
    const oldMarkById = new Map(oldParts.map(p => [p.id, p.part.part_mark]))
    const newIdFor = (oldPartId: number) => { const t = target(oldMarkById.get(oldPartId)!); return t ? newIdByMark.get(t) : undefined }

    const woMarks = await tx.work_order_mark.findMany({ where: { bom_assembly_id: line.bom_assembly_id, removed_at: null, work_order: { mo_id: moId } }, select: { id: true, work_order_id: true } })
    const woIds = [...new Set(woMarks.map(w => w.work_order_id))]
    const woParts = woIds.length
      ? await tx.work_order_part.findMany({ where: { work_order_id: { in: woIds }, bom_assembly_part_id: { in: oldParts.map(p => p.id) } }, select: { id: true, bom_assembly_part_id: true, updated_by: true, work_order: { select: { wo_code: true } } } })
      : []
    const stuck = woParts.filter(wp => !newIdFor(wp.bom_assembly_part_id) && wp.updated_by)
    if (stuck.length) {
      throw new ConflictException(stuck.map(wp => `${oldMark}: ${oldMarkById.get(wp.bom_assembly_part_id)} ไม่มีใน BOM ใหม่ แต่ ${wp.work_order?.wo_code ?? 'WO'} กรอกยอดเบิกแล้ว`).join(' · ') + ' — แก้ยอดเบิกใน WO ก่อน')
    }

    await tx.mo_assembly_line.update({ where: { id: line.id }, data: { bom_assembly_id: now.assembly_id, qty: new Prisma.Decimal(qty) } })
    if (woMarks.length) await tx.work_order_mark.updateMany({ where: { id: { in: woMarks.map(w => w.id) } }, data: { bom_assembly_id: now.assembly_id, bom_dispatch_id_snapshot: dispatchId } })
    for (const wp of woParts) {
      const to = newIdFor(wp.bom_assembly_part_id)
      if (to) await tx.work_order_part.update({ where: { id: wp.id }, data: { bom_assembly_part_id: to } })
      else await tx.work_order_part.delete({ where: { id: wp.id } })
    }
    // compare under the new names, so a renamed part reads as a rename, not remove + add
    const partRenames = [...rename].filter(([f, t]) => t && t !== f).map(([f, t]) => `${mark} ${f} ชื่อ ${f} → ${t}`)
    const wasRenamed = { ...was, parts: was.parts.map(p => ({ ...p, part_mark: target(p.part_mark) ?? p.part_mark })) }
    const diff = assemblyDiff(mark, wasRenamed, now)
    for (const woId of woIds) {
      await this.woAutoCreate.recomputeParts(tx, moId, woId, userName)
      await this.woAutoCreate.recomputeDuration(tx, woId)
      const what = [...(mark !== oldMark ? [`${mark} ชื่อ mark ${oldMark} → ${mark}`] : []), ...partRenames, ...diff]
      await tx.work_order_event.create({ data: { work_order_id: woId, event_type: 'EDIT', recorded_by: userName,
        notes: `${mark} ย้ายไป BOM version ใหม่ (dispatch ${dispatchId}) ตามการเทียบที่ MO${what.length ? `: ${what.join(' · ')}` : ' — ไม่มีค่าเปลี่ยน'}` } })
    }
    return [
      ...(mark !== oldMark ? [`${mark} ชื่อ mark ${oldMark} → ${mark}`] : []),
      `${mark} ${headline}`,
      ...(qty !== was.qty ? [`${mark} ชุด ${was.qty} → ${qty}`] : []),
      ...partRenames, ...diff,
    ]
  }

  /** MO version (2026-10-09): +1 once the MO is past DRAFT and its printed
   *  assembly / part data changed; the History entry says so. */
  private async bumpRevision(tx: Prisma.TransactionClient, mo: { id: number; status: string; revision?: number | null }, log: string[]) {
    if (mo.status === 'DRAFT') return
    const r = mo.revision ?? 0
    await tx.manufacturing_order.update({ where: { id: mo.id }, data: { revision: { increment: 1 } } })
    log.push(`Rev.${r} → Rev.${r + 1}`)
  }

  /** WOs already issued follow the MO (2026-10-09): every open WO carrying
   *  one of these assemblies gets its parts list topped up and its time redone. */
  private async syncWos(tx: Prisma.TransactionClient, moId: number, assemblyIds: number[], userName: string, changes: string[] = []) {
    if (!assemblyIds.length) return
    const marks = await tx.work_order_mark.findMany({
      where: { removed_at: null, bom_assembly_id: { in: assemblyIds }, work_order: { mo_id: moId, status: { notIn: ['CANCELLED', 'DONE'] } } },
      select: { work_order_id: true },
    })
    for (const woId of [...new Set(marks.map(m => m.work_order_id))]) {
      await this.woAutoCreate.recomputeParts(tx, moId, woId, userName)
      await this.woAutoCreate.recomputeDuration(tx, woId)
      // the WO's own History says what came from the MO (History standard 2026-10-08)
      if (changes.length) await tx.work_order_event.create({ data: { work_order_id: woId, event_type: 'EDIT', recorded_by: userName, notes: `อัปเดตตามการแก้ที่ MO: ${changes.join(' · ')}` } })
    }
  }

  /** Replaces one pre-shop assembly's part list (per set) at `sets` sets. A
   *  part mark is one part in the dispatch: spec on bom_part (shared by every
   *  assembly using it), count per set on bom_assembly_part; bom_part.qty
   *  (pieces over all sets) follows. A part already on a WO can't be removed —
   *  work_order_part cascades off bom_assembly_part. Returns History lines. */
  private async applyParts(tx: Prisma.TransactionClient, assemblyId: number, dispatchId: number, parts: PreshopPartDto[], sets: number, userId: number): Promise<string[]> {
    const list = parts.map(p => ({ ...p, part_mark: p.part_mark.trim(), profile: p.profile.trim(), grade: p.grade.trim() }))
    const rows = await tx.bom_assembly_part.findMany({
      where: { assembly_id: assemblyId },
      include: { part: true, _count: { select: { work_order_parts: { where: { updated_by: { not: null } } } } } },
    })
    const now = new Map(list.map(p => [p.part_mark, p]))
    const removed = rows.filter(r => !now.has(r.part.part_mark))
    const onWo = removed.filter(r => r._count.work_order_parts > 0).map(r => r.part.part_mark)
    // only a part whose withdrawal was entered on a WO is locked (2026-10-09) —
    // an untouched WO part row goes with it (cascade)
    if (onWo.length) throw new ConflictException(`${onWo.join(', ')} กรอกยอดเบิกใน WO แล้ว — เอาออกไม่ได้`)

    const log: string[] = []
    const num = (v: unknown) => (v == null ? null : Number(v))
    const specData = (p: (typeof list)[number]) => ({ profile: p.profile, grade: p.grade, length_mm: new Prisma.Decimal(p.length_mm), weight_kg: new Prisma.Decimal(p.unit_weight_kg) })
    const specDiff = (old: { profile: string | null; grade: string | null; length_mm: unknown; weight_kg: unknown }, p: (typeof list)[number]) => {
      const out: string[] = []
      if ((old.profile ?? '') !== p.profile) out.push(`${p.part_mark} profile ${old.profile ?? '—'} → ${p.profile}`)
      if ((old.grade ?? '') !== p.grade) out.push(`${p.part_mark} grade ${old.grade ?? '—'} → ${p.grade}`)
      if (num(old.length_mm) !== p.length_mm) out.push(`${p.part_mark} L ${num(old.length_mm) ?? '—'} → ${p.length_mm}`)
      if (num(old.weight_kg) !== p.unit_weight_kg) out.push(`${p.part_mark} kg ${num(old.weight_kg) ?? '—'} → ${p.unit_weight_kg}`)
      return out
    }

    // A part mark is one part across the dispatch: a spec change reaches every
    // assembly using it — History names them.
    const alsoIn = async (partId: number) => {
      const others = await tx.bom_assembly_part.findMany({ where: { part_id: partId, assembly_id: { not: assemblyId } }, select: { assembly: { select: { assembly_mark: true } } } })
      return others.length ? ` (มีผลกับ ${[...new Set(others.map(o => o.assembly.assembly_mark))].join(', ')} ด้วย)` : ''
    }
    for (const r of rows) {
      const p = now.get(r.part.part_mark)
      if (!p) continue
      const delta = p.qty - Number(r.qty)
      const spec = specDiff(r.part, p)
      if (spec.length) { const note = await alsoIn(r.part_id); if (note) spec[spec.length - 1] += note }
      if (delta) {
        await tx.bom_assembly_part.update({ where: { id: r.id }, data: { qty: new Prisma.Decimal(p.qty) } })
        log.push(`${p.part_mark} ต่อชุด ${Number(r.qty)} → ${p.qty}`)
      }
      log.push(...spec)
      if (delta || spec.length) {
        await tx.bom_part.update({ where: { id: r.part_id }, data: { ...specData(p), qty: { increment: new Prisma.Decimal(delta * sets) }, write_uid: userId } })
      }
    }
    const had = new Set(rows.map(r => r.part.part_mark))
    let seq = rows.length
    for (const p of list.filter(x => !had.has(x.part_mark))) {
      const existing = await tx.bom_part.findFirst({ where: { dispatch_id: dispatchId, part_mark: p.part_mark } })
      let partId: number
      if (existing) {
        await tx.bom_part.update({ where: { id: existing.id }, data: { ...specData(p), qty: { increment: new Prisma.Decimal(p.qty * sets) }, write_uid: userId } })
        const spec = specDiff(existing, p)
        if (spec.length) { const note = await alsoIn(existing.id); if (note) spec[spec.length - 1] += note }
        log.push(...spec)
        partId = existing.id
      } else {
        partId = (await tx.bom_part.create({ data: { dispatch_id: dispatchId, part_mark: p.part_mark, ...specData(p), qty: new Prisma.Decimal(p.qty * sets), create_uid: userId, write_uid: userId } })).id
      }
      await tx.bom_assembly_part.create({ data: { assembly_id: assemblyId, part_id: partId, qty: new Prisma.Decimal(p.qty), sequence: seq++, create_uid: userId } })
      log.push(`เพิ่ม ${partText(p)}`)
    }
    for (const r of removed) {
      await tx.bom_assembly_part.delete({ where: { id: r.id } })
      const others = await tx.bom_assembly_part.count({ where: { part_id: r.part_id } })
      if (others) await tx.bom_part.update({ where: { id: r.part_id }, data: { qty: { decrement: new Prisma.Decimal(Number(r.qty) * sets) }, write_uid: userId } })
      else await tx.bom_part.delete({ where: { id: r.part_id } })
      log.push(`ลบ ${r.part.part_mark}`)
    }
    return log
  }

  // ── Pre-shop MO vs the zone's real BOM (2026-10-08) ─────────────────────────
  // The user sees every difference and decides every value — the same old-vs-
  // new compare as an upload. Results land on the MO's own pre-shop rows (the
  // shared BOM rows are never edited) and each row remembers the BOM row it was
  // checked against in attributes.bom_ref, so the prompt returns only when a
  // newer BOM revision arrives.
  private async preshopLines(id: number) {
    return this.prisma.mo_assembly_line.findMany({
      where: { mo_id: id }, orderBy: { line_seq: 'asc' },
      include: { bom_assembly: { select: {
        id: true, assembly_mark: true, dispatch_id: true, ...ASM_SELECT, attributes: true, dispatch: { select: { source: true } },
        assembly_parts: { orderBy: { sequence: 'asc' }, select: { id: true, qty: true, part_id: true, _count: { select: { work_order_parts: { where: { updated_by: { not: null } } } } }, part: { select: { part_mark: true, profile: true, length_mm: true, grade: true, weight_kg: true } } } },
      } } },
    })
  }

  /** Sets already issued per assembly = the most any one operation's WOs planned. */
  private async issuedSets(moId: number, assemblyIds: number[]) {
    const planned = await this.prisma.work_order_mark.findMany({
      where: { removed_at: null, bom_assembly_id: { in: assemblyIds }, work_order: { mo_id: moId, status: { not: 'CANCELLED' } } },
      select: { bom_assembly_id: true, qty_planned: true, work_order: { select: { source_routing_op_id: true } } },
    })
    return (asmId: number) => {
      const perOp = new Map<number | null, number>()
      for (const p of planned) if (p.bom_assembly_id === asmId) perOp.set(p.work_order.source_routing_op_id, (perOp.get(p.work_order.source_routing_op_id) ?? 0) + Number(p.qty_planned))
      return Math.max(0, ...perOp.values())
    }
  }

  async bomCompare(id: number) {
    const mo = await this.requireMo(id)
    const empty = { bom: null, rows: [], bom_only: [], pool: [], pending: 0 }
    if (!mo.zone_id || mo.kind !== 'ASSEMBLY') return empty
    const scope = { project_id: mo.project_id!, zone_id: mo.zone_id, sub_zone_id: mo.sub_zone_id ?? null }
    const dispatch = await this.prisma.bom_dispatch.findFirst({ where: { ...scope, source: 'BOM_UPLOAD' }, orderBy: { id: 'desc' }, select: { id: true, revision: true, uploaded_at: true } })
    if (!dispatch) return empty
    const bomRows = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { ...scope, source: 'BOM_UPLOAD' } },
      select: { id: true, assembly_mark: true, qty: true, ...ASM_SELECT,
        assembly_parts: { orderBy: { sequence: 'asc' }, select: { qty: true, part: { select: { part_mark: true, profile: true, length_mm: true, grade: true, weight_kg: true } } } } },
    })
    const lines = await this.preshopLines(id)
    const issued = await this.issuedSets(id, lines.map(l => l.bom_assembly_id))
    const n = (v: unknown) => (v == null ? null : Number(v))
    const partsOf = (aps: { qty: unknown; part: { part_mark: string; profile: string | null; length_mm: unknown; grade: string | null; weight_kg: unknown } }[]) =>
      aps.map(ap => ({ part_mark: ap.part.part_mark, profile: ap.part.profile ?? '', length_mm: n(ap.part.length_mm) ?? 0, grade: ap.part.grade ?? '', qty: Number(ap.qty), unit_weight_kg: n(ap.part.weight_kg) ?? 0 }))
    const bomByMark = new Map(bomRows.map(b => [b.assembly_mark, b]))
    const inMo = new Set(lines.map(l => l.bom_assembly.assembly_mark))

    // pre-shop lines: compare with the BOM, user picks every value · BOM lines
    // (Full shop): on an older version → new version or keep (2026-10-09)
    const rows = lines.filter(l => l.bom_assembly.dispatch.source === 'PRE_SHOP' || l.bom_assembly.dispatch.source === 'BOM_UPLOAD').map(l => {
      const b = l.bom_assembly
      const kind = b.dispatch.source === 'PRE_SHOP' ? 'preshop' as const : 'bom' as const
      const existing = { qty: Number(l.qty), ...asmValues(b), parts: partsOf(b.assembly_parts),
        wo_qty: issued(l.bom_assembly_id), wo_parts: b.assembly_parts.filter(ap => ap._count.work_order_parts > 0).map(ap => ap.part.part_mark) }
      const ref = (b.attributes as { bom_ref?: { assembly_id: number | null; dispatch_id?: number } } | null)?.bom_ref
      const bomA = bomByMark.get(b.assembly_mark)
      const bom = bomA ? { assembly_id: bomA.id, assembly_mark: bomA.assembly_mark, qty: Number(bomA.qty ?? 0), ...asmValues(bomA), parts: partsOf(bomA.assembly_parts) } : null
      const onLatest = kind === 'bom' && bom?.assembly_id === l.bom_assembly_id
      const status = !bom ? 'not_in_bom' as const : onLatest || !this.preshop.sizeChanges(existing, bom, { strict: true }).length ? 'same' as const : 'changed' as const
      const reviewed = onLatest || (bom ? ref?.assembly_id === bom.assembly_id : ref?.assembly_id === null && ref?.dispatch_id === dispatch.id)
      return { line_id: l.id, assembly_mark: b.assembly_mark, kind, status, reviewed, existing, bom,
        part_pairs: bom ? this.preshop.pairParts(existing.parts, bom.parts) : [] }
    })
    // A Full shop MO is a chosen subset of its BOM — offer only marks this
    // upload brought in, not ones the MO left out of the version it was made from.
    // (versions before this one only — a mark already taken from this version doesn't make it "old")
    const oldDispatchIds = [...new Set(lines.filter(l => l.bom_assembly.dispatch.source === 'BOM_UPLOAD' && l.bom_assembly.dispatch_id !== dispatch.id).map(l => l.bom_assembly.dispatch_id))]
    const knownBefore = oldDispatchIds.length
      ? new Set((await this.prisma.bom_assembly.findMany({ where: { dispatch_id: { in: oldDispatchIds } }, select: { assembly_mark: true } })).map(a => a.assembly_mark))
      : new Set<string>()
    const bom_only = bomRows.filter(b => !inMo.has(b.assembly_mark) && !knownBefore.has(b.assembly_mark)).map(b => ({
      assembly_id: b.id, assembly_mark: b.assembly_mark, qty: Number(b.qty ?? 0), ...asmValues(b), parts: partsOf(b.assembly_parts),
    }))
    // BOM marks the MO doesn't have — what a renamed mark may be now (2026-10-09).
    // Each mark missing from the BOM gets the likeliest ones suggested; the
    // user confirms, or picks any of the pool.
    const pool = bomRows.filter(b => !inMo.has(b.assembly_mark)).map(b => ({
      assembly_id: b.id, assembly_mark: b.assembly_mark, qty: Number(b.qty ?? 0), ...asmValues(b), parts: partsOf(b.assembly_parts),
    }))
    const withCandidates = rows.map(r => (r.bom ? r : {
      ...r,
      candidates: pool
        .map(c => ({ ...c, score: this.preshop.pairScore(r.assembly_mark, r.existing, c.assembly_mark, c), part_pairs: this.preshop.pairParts(r.existing.parts, c.parts) }))
        .filter(c => c.score >= 30).sort((x, y) => y.score - x.score).slice(0, 3),
    }))
    return { bom: { dispatch_id: dispatch.id, revision: dispatch.revision, uploaded_at: dispatch.uploaded_at }, rows: withCandidates, bom_only, pool, pending: rows.filter(r => !r.reviewed).length }
  }

  async linkBom(id: number, dto: LinkBomDto, userId: number, userName: string) {
    const mo = await this.requireMo(id)
    if (mo.status === 'DONE' || mo.status === 'CANCELLED') throw new ConflictException(`MO ${mo.mo_code} is ${mo.status} — nothing can change`)
    const cmp = await this.bomCompare(id)
    if (!cmp.bom || cmp.bom.dispatch_id !== dto.dispatch_id) throw new ConflictException('BOM ของ zone นี้เปลี่ยนแล้ว — เปิดหน้าเทียบใหม่')
    const lines = await this.preshopLines(id)
    const lineByMark = new Map(lines.map(l => [l.bom_assembly.assembly_mark, l]))
    const rowByMark = new Map(cmp.rows.map(r => [r.assembly_mark, r]))
    const bomOnly = new Map(cmp.bom_only.map(b => [b.assembly_id, b]))
    const ref = (assemblyId: number | null) => ({ bom_ref: { assembly_id: assemblyId, dispatch_id: cmp.bom!.dispatch_id, revision: cmp.bom!.revision } })
    const poolById = new Map(cmp.pool.map(b => [b.assembly_id, b]))
    // the BOM row a mark is compared with: same name, or the one the user paired it with (renamed)
    const targetOf = (m: LinkBomMarkDto, row: (typeof cmp.rows)[number]) => (m.pair_with ? poolById.get(m.pair_with) ?? null : row.bom)
    const keyOf = (p: PreshopPartDto) => `${p.part_mark}|${p.profile}|${p.grade}|${p.length_mm}|${p.qty}|${p.unit_weight_kg}`
    const sameParts = (a: PreshopPartDto[], b: PreshopPartDto[]) => a.length === b.length && a.map(keyOf).sort().join() === b.map(keyOf).sort().join()
    // a pre-shop mark taken exactly as the real BOM has it is linked to that row
    const willLink = (m: LinkBomMarkDto, target: NonNullable<ReturnType<typeof targetOf>>) => !valueChanges(m.final!, target).length && sameParts(m.final!.parts, target.parts)

    for (const m of dto.marks ?? []) {
      const row = rowByMark.get(m.assembly_mark)
      if (!row) throw new BadRequestException(`${m.assembly_mark} ไม่ใช่ mark pre-shop ของ MO นี้`)
      if (m.action === 'remove' && (row.existing.wo_qty > 0)) throw new ConflictException(`${m.assembly_mark} มีใน WO แล้ว — เอาออกไม่ได้`)
      if (m.pair_with) {
        if (row.bom) throw new BadRequestException(`${m.assembly_mark} มีชื่อตรงใน BOM อยู่แล้ว — ไม่ต้องจับคู่`)
        if (!poolById.has(m.pair_with)) throw new BadRequestException(`${m.assembly_mark}: mark ที่จับคู่ไม่ได้อยู่ใน BOM ที่ยังว่าง`)
        if (dto.marks!.filter(x => x.pair_with === m.pair_with).length > 1) throw new BadRequestException(`${poolById.get(m.pair_with)!.assembly_mark} ถูกจับคู่กับหลาย mark`)
      }
      if (m.action === 'apply') {
        const f = m.final
        if (!f) throw new BadRequestException(`${m.assembly_mark}: ไม่มีค่าที่เลือก`)
        if (!(f.qty > 0)) throw new BadRequestException(`${m.assembly_mark}: จำนวนชุดต้องมากกว่า 0`)
        if (f.qty < row.existing.wo_qty) throw new BadRequestException(`${m.assembly_mark}: ออก WO ไปแล้ว ${row.existing.wo_qty} ชุด — ต่ำกว่านี้ไม่ได้`)
        if (row.kind === 'bom' && !targetOf(m, row)) throw new BadRequestException(`${m.assembly_mark}: ไม่มีใน BOM ใหม่ — เก็บไว้ เอาออก หรือจับคู่กับ mark ใน BOM`)
        if (row.kind === 'preshop') {
          if (!f.parts.length) throw new BadRequestException(`${m.assembly_mark}: ต้องมีอย่างน้อย 1 part`)
          const bad = partProblems(f.parts)
          if (bad.length) throw new BadRequestException(bad.map(e => `${m.assembly_mark} · ${e}`).join(' · '))
        }
        // moving onto a real BOM row claims its sets — never more than it has left (security review M2)
        const target = targetOf(m, row)
        if (target && (row.kind === 'bom' || willLink(m, target))) await this.assertQtyWithinRemaining([{ bom_assembly_id: target.assembly_id, qty: f.qty }], id)
      }
      if (m.action === 'keep' && row.kind === 'bom' && row.status === 'same' && row.bom) {
        await this.assertQtyWithinRemaining([{ bom_assembly_id: row.bom.assembly_id, qty: row.existing.qty }], id)
      }
    }
    const paired = new Set((dto.marks ?? []).flatMap(m => (m.pair_with ? [m.pair_with] : [])))
    const adds = (dto.add ?? []).map(a => {
      if (paired.has(a.bom_assembly_id)) throw new BadRequestException(`BOM assembly ${a.bom_assembly_id} ถูกจับคู่กับ mark ใน MO แล้ว`)
      const b = bomOnly.get(a.bom_assembly_id)
      if (!b) throw new BadRequestException(`BOM assembly ${a.bom_assembly_id} ไม่ได้อยู่ในรายการที่เพิ่มได้`)
      if (!(a.qty > 0)) throw new BadRequestException(`${b.assembly_mark}: จำนวนชุดต้องมากกว่า 0`)
      return { ...a, b }
    })
    if (adds.length) await this.assertQtyWithinRemaining(adds.map(a => ({ bom_assembly_id: a.bom_assembly_id, qty: a.qty })), id)

    await this.prisma.$transaction(async (tx) => {
      const log: string[] = []
      let onPaper = false // anything but a plain keep changes what is printed → Rev bump (QA review F-004)
      for (const m of dto.marks ?? []) {
        const line = lineByMark.get(m.assembly_mark)!
        const row = rowByMark.get(m.assembly_mark)!
        const attrs = { ...((line.bom_assembly.attributes as object | null) ?? {}) }
        const target = targetOf(m, row)
        // parts move by name unless the user confirmed a map (spec pairs are suggestions on screen only)
        const partMap = m.part_map ?? []
        if (m.action === 'apply' && row.kind === 'bom') {
          log.push(...(await this.switchToBomVersion(tx, id, line, row.existing, target!, m.final!.qty, cmp.bom!.dispatch_id, userName, 'ใช้ BOM version ใหม่', partMap)))
        } else if (m.action === 'apply' && target && willLink(m, target)) {
          // pre-shop mark taken exactly as the real BOM has it → link the line to the real BOM row (2026-10-09)
          log.push(...(await this.switchToBomVersion(tx, id, line, row.existing, target, m.final!.qty, cmp.bom!.dispatch_id, userName, 'ผูกกับ BOM จริง', partMap)))
        } else if (m.action === 'apply') {
          // own values chosen somewhere → the MO keeps its own data, under the BOM's names
          const renamed = target && target.assembly_mark !== m.assembly_mark ? target.assembly_mark : null
          if (renamed) {
            await tx.bom_assembly.update({ where: { id: line.bom_assembly_id }, data: { assembly_mark: renamed } })
            log.push(`${renamed} ชื่อ mark ${m.assembly_mark} → ${renamed}`)
          }
          const mark = renamed ?? m.assembly_mark
          for (const pm of partMap) {
            if (!pm.to || pm.to === pm.from) continue
            const ap = line.bom_assembly.assembly_parts.find(x => x.part.part_mark === pm.from)
            if (!ap) continue
            await tx.bom_part.update({ where: { id: ap.part_id }, data: { part_mark: pm.to } })
            log.push(`${mark} ${pm.from} ชื่อ ${pm.from} → ${pm.to}`)
          }
          const changed = await this.applyAssemblyState(tx, { ...line, bom_assembly: { ...line.bom_assembly, assembly_mark: mark } }, m.final!, userId)
          log.push(...changed)
          if (changed.length || renamed) await this.syncWos(tx, id, [line.bom_assembly_id], userName, changed)
          await tx.bom_assembly.update({ where: { id: line.bom_assembly_id }, data: { attributes: { ...attrs, ...ref(target?.assembly_id ?? null) } } })
        } else if (m.action === 'keep' && row.kind === 'bom' && row.status === 'same' && row.bom) {
          // identical in the new version — follow it so the MO and its WOs sit on the latest BOM
          await this.switchToBomVersion(tx, id, line, row.existing, row.bom, row.existing.qty, cmp.bom!.dispatch_id, userName)
          log.push(`${m.assembly_mark} ตรงกับ BOM version ใหม่`)
        } else if (m.action === 'keep') {
          await tx.bom_assembly.update({ where: { id: line.bom_assembly_id }, data: { attributes: { ...attrs, ...ref(row.bom?.assembly_id ?? null) } } })
          log.push(`${m.assembly_mark} เก็บค่าเดิม${row.bom ? '' : ' (ไม่มีใน BOM)'}`)
          continue
        } else {
          await tx.mo_assembly_line.delete({ where: { id: line.id } })
          log.push(`เอา ${m.assembly_mark} ออกจาก MO`)
        }
        onPaper = true // every branch but the plain keep (which continues above)
      }
      if (adds.length) {
        let seq = lines.length
        await tx.mo_assembly_line.createMany({ data: adds.map(a => ({ mo_id: id, bom_assembly_id: a.bom_assembly_id, qty: new Prisma.Decimal(a.qty), line_seq: seq++ })) })
        for (const a of adds) log.push(`เพิ่ม ${a.b.assembly_mark} (ชุด ${a.qty}) จาก BOM`, ...a.b.parts.map(p => `${a.b.assembly_mark} part ${partText(p)}`))
      }
      // "keep as is" changes nothing on paper — anything else bumps the MO Rev
      if (onPaper || adds.length) await this.bumpRevision(tx, mo, log)
      if (log.length) {
        await tx.mo_status_history.create({
          data: { mo_id: id, from_status: mo.status, to_status: mo.status, changed_by: userName, reason: `เทียบกับ BOM จริง (rev ${cmp.bom!.revision}): ${log.join(' · ')}` },
        })
      }
    })
    return this.bomCompare(id)
  }

  // ── Pre-shop parts of one MO line (2026-10-08) — see applyParts() ───────────
  async updatePreshopParts(id: number, lineId: number, parts: PreshopPartDto[], userId: number, userName: string) {
    const mo = await this.requireMo(id)
    if (mo.status === 'DONE' || mo.status === 'CANCELLED') throw new ConflictException(`MO ${mo.mo_code} is ${mo.status} — parts can't change`)
    const line = await this.prisma.mo_assembly_line.findFirst({
      where: { id: lineId, mo_id: id },
      include: { bom_assembly: { select: { id: true, assembly_mark: true, dispatch_id: true, dispatch: { select: { source: true } } } } },
    })
    if (!line) throw new NotFoundException(`Line ${lineId} is not on MO ${mo.mo_code}`)
    const mark = line.bom_assembly.assembly_mark
    if (line.bom_assembly.dispatch.source !== 'PRE_SHOP') throw new BadRequestException(`${mark} มาจาก BOM — แก้ part ที่ BOM`)
    if (!parts.length) throw new BadRequestException(`${mark}: ต้องมีอย่างน้อย 1 part`)
    const bad = partProblems(parts)
    if (bad.length) throw new BadRequestException(bad.join(' · '))

    await this.prisma.$transaction(async (tx) => {
      const log = await this.applyParts(tx, line.bom_assembly_id, line.bom_assembly.dispatch_id, parts, Number(line.qty), userId)
      if (log.length) await this.syncWos(tx, id, [line.bom_assembly_id], userName, log.map(x => `${mark} ${x}`))
      if (log.length) await this.bumpRevision(tx, mo, log)
      if (log.length) {
        await tx.mo_status_history.create({
          data: { mo_id: id, from_status: mo.status, to_status: mo.status, changed_by: userName, reason: `แก้ part ${mark}: ${log.join(' · ')}` },
        })
      }
    })
    return this.getAssemblies(id)
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
    const shopType = dto.shop_type ?? 'FULL_SHOP'
    // Every MO picks its routing at create, pre-shop too (2026-10-08).
    if (!dto.routing_template_id) throw new BadRequestException('routing_template_id is required')
    {
      const template = await this.prisma.routing_template.findUnique({
        where: { id: dto.routing_template_id },
      })
      if (!template) throw new NotFoundException(`Routing template ${dto.routing_template_id} not found`)
    }

    if (dto.primary_mark_prefix_code) {
      const prefix = await this.prisma.mark_prefix_master.findUnique({
        where: { code: dto.primary_mark_prefix_code },
      })
      if (!prefix) throw new NotFoundException(`Mark prefix ${dto.primary_mark_prefix_code} not found`)
    }

    const pre = dto.preshop_assemblies ?? []
    if (shopType === 'FULL_SHOP' && pre.length) throw new BadRequestException('Uploaded assemblies are only for a PRE_SHOP MO')
    // PRE_SHOP may start EMPTY (project, zone, plan) — assemblies come later
    // from an upload on the MO page (2026-10-07). FULL_SHOP picks them now.
    if (shopType === 'FULL_SHOP' && !dto.assembly_lines.length) throw new BadRequestException('At least one assembly is required')
    if (shopType === 'PRE_SHOP') {
      if (!dto.project_id || !dto.zone_id) throw new BadRequestException('A pre-shop MO needs project_id and zone_id')
      await this.assertZone(dto.project_id, dto.zone_id, dto.sub_zone_id)
      // the real BOM is in → pick from it (Full shop) instead (2026-10-09, user)
      if (await this.zoneHasBom(dto.zone_id)) throw new BadRequestException('Zone นี้มี BOM แล้ว — สร้างเป็น Full shop แทน')
    }

    // One MO per zone (2026-10-07): the MO's zone is the one picked, or its BOM
    // lines' zone; every line must be in it; no other live MO may hold it.
    const scope = await this.resolveZone(dto.assembly_lines.map(l => l.bom_assembly_id), dto.project_id, dto.zone_id)
    if (scope.zone_id != null) {
      const other = await this.zoneMo(scope.zone_id)
      if (other) throw new ConflictException(`Zone นี้มี ${other.mo_code} อยู่แล้ว (1 zone ได้ 1 MO)`)
    }

    if (dto.assembly_lines.length) await this.assertQtyWithinRemaining(dto.assembly_lines)

    const confirm = dto.confirm === true
    const status: MoStatus = confirm ? 'CONFIRMED' : 'DRAFT'

    const mo = await this.prisma.$transaction(async (tx) => {
      const mo_code = await this.codeGen.generate(tx, shopType)
      const created = await tx.manufacturing_order.create({
        data: {
          mo_code,
          shop_type: shopType,
          primary_mark_prefix_code: dto.primary_mark_prefix_code ?? null,
          project_id: scope.project_id,
          zone_id: scope.zone_id,
          sub_zone_id: dto.sub_zone_id ?? null,
          routing_template_id: dto.routing_template_id ?? null,
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

      // Pre-shop upload → PRE_SHOP BOM dispatch; its assemblies become lines
      // after any picked from the BOM (qty = the sets entered).
      if (pre.length) {
        const ids = await this.preshop.createDispatch(tx, { project_id: dto.project_id!, zone_id: dto.zone_id!, sub_zone_id: dto.sub_zone_id ?? null }, pre, userId)
        await tx.mo_assembly_line.createMany({
          data: pre.map((a, i) => ({
            mo_id: created.id,
            bom_assembly_id: ids.get(a.assembly_mark.trim())!,
            qty: new Prisma.Decimal(a.qty),
            line_seq: dto.assembly_lines.length + i,
          })),
        })
      }

      // History starts at creation (2026-10-08: every change is in History).
      await tx.mo_status_history.create({
        data: { mo_id: created.id, from_status: 'DRAFT', to_status: 'DRAFT', changed_by: userName,
          reason: `สร้าง MO (${shopType === 'PRE_SHOP' ? 'Pre-shop' : 'Full shop'})${pre.length ? `: ${pre.flatMap(newMarkLog).join(' · ')}` : ''}` },
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
      subject: `MO ${mo.mo_code} created (${status}) · ${shopType === 'PRE_SHOP' ? 'Pre-shop drawing' : 'Full shop drawing'}${pre.length ? ` · ${pre.length} uploaded assemblies` : ''}`,
    })
    return this.findOne(mo.id)
  }

  // ── Edit DRAFT only ─────────────────────────────────────────────────────────
  async update(id: number, dto: UpdateMoDto, userId: number, userName = 'system') {
    const mo = await this.requireMo(id)
    if (mo.status !== 'DRAFT') {
      throw new ConflictException(`Only DRAFT MOs can be edited (current: ${mo.status})`)
    }
    if (mo.kind === 'PART') {
      throw new ConflictException(`MO ${id} is an MO Part — edit it with PATCH /mo/part/${id}`)
    }
    // The type is set at create and never changes (2026-10-09, user) — it is
    // in the MO code too (MO-F… / MO-P…).
    if (dto.shop_type && dto.shop_type !== mo.shop_type) throw new ConflictException('สร้าง MO แล้วเปลี่ยน MO type ไม่ได้')

    if (dto.assembly_lines) {
      // 1 zone = 1 MO: edited lines stay in the MO's zone.
      await this.resolveZone(dto.assembly_lines.map(l => l.bom_assembly_id), undefined, mo.zone_id ?? undefined)
      await this.assertQtyWithinRemaining(dto.assembly_lines, id)
    }
    if (dto.routing_template_id && dto.routing_template_id !== mo.routing_template_id) {
      const template = await this.prisma.routing_template.findUnique({
        where: { id: dto.routing_template_id },
      })
      if (!template) throw new NotFoundException(`Routing template ${dto.routing_template_id} not found`)
    }

    // Before-state for the edit log (2026-10-07: every MO edit says who changed what).
    const beforeLines = await this.prisma.mo_assembly_line.findMany({
      where: { mo_id: id }, orderBy: { line_seq: 'asc' },
      select: { bom_assembly_id: true, qty: true, bom_assembly: { select: { assembly_mark: true } } },
    })
    const afterMarks = dto.assembly_lines
      ? new Map((await this.prisma.bom_assembly.findMany({ where: { id: { in: dto.assembly_lines.map(l => l.bom_assembly_id) } }, select: { id: true, assembly_mark: true } })).map(a => [a.id, a.assembly_mark]))
      : null
    const routingCodes = dto.routing_template_id && dto.routing_template_id !== mo.routing_template_id
      ? new Map((await this.prisma.routing_template.findMany({ where: { id: { in: [mo.routing_template_id, dto.routing_template_id].filter((x): x is number => x != null) } }, select: { id: true, code: true } })).map(t => [t.id, t.code]))
      : null

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

      const changes: string[] = []
      if (routingCodes) changes.push(`Routing ${routingCodes.get(mo.routing_template_id!) ?? '—'} → ${routingCodes.get(dto.routing_template_id!) ?? dto.routing_template_id}`)
      const day = fmtBkk // Bangkok time — was UTC, 7 h off what the user typed
      if (dto.plan_start !== undefined && day(dto.plan_start || null) !== day(mo.plan_start)) changes.push(`เริ่ม (แผน) ${day(mo.plan_start)} → ${day(dto.plan_start || null)}`)
      if (dto.plan_finish !== undefined && day(dto.plan_finish || null) !== day(mo.plan_finish)) changes.push(`เสร็จ (แผน) ${day(mo.plan_finish)} → ${day(dto.plan_finish || null)}`)
      if (dto.assembly_lines && afterMarks) {
        const before = new Map(beforeLines.map(l => [l.bom_assembly_id, l]))
        const after = new Set(dto.assembly_lines.map(l => l.bom_assembly_id))
        for (const l of dto.assembly_lines) {
          const b = before.get(l.bom_assembly_id)
          if (!b) changes.push(`เพิ่ม ${afterMarks.get(l.bom_assembly_id) ?? l.bom_assembly_id} (${l.qty})`)
          else if (Number(b.qty) !== l.qty) changes.push(`${b.bom_assembly.assembly_mark} จำนวน ${Number(b.qty)} → ${l.qty}`)
        }
        for (const b of beforeLines) if (!after.has(b.bom_assembly_id)) changes.push(`ลบ ${b.bom_assembly.assembly_mark}`)
      }
      if (changes.length) {
        await tx.mo_status_history.create({
          data: { mo_id: id, from_status: mo.status, to_status: mo.status, changed_by: userName, reason: `แก้ไข MO: ${changes.join(' · ')}` },
        })
      }
    })

    return this.findOne(id)
  }

  // ── Change status (+ required reason → history) ─────────────────────────────
  /** Each operation × mark whose QC-passed sets (summed over that operation's
   *  live WOs) are still short of the mark's sets in the MO — operations in
   *  routing order, op 000 first on a pre-shop MO. Empty = ready to Complete
   *  (2026-10-09, user: Complete only once every mark passed QC in full on
   *  every operation). An operation with no WO yet counts as 0 passed. */
  async qcShortfalls(id: number): Promise<{ assembly_mark: string; operation: string; passed: number; need: number }[]> {
    const mo = await this.requireMo(id)
    if (mo.kind !== 'ASSEMBLY' || mo.routing_template_id == null) return []
    const opSelect = { id: true, sequence: true, op_code: true, name: true } as const
    const ops = [
      ...(mo.shop_type === 'PRE_SHOP'
        ? await this.prisma.mrp_routing_workcenter.findMany({ where: { template: { code: PRESHOP_TEMPLATE_CODE } }, orderBy: { sequence: 'asc' }, select: opSelect })
        : []),
      ...(await this.prisma.mrp_routing_workcenter.findMany({ where: { template_id: mo.routing_template_id }, orderBy: { sequence: 'asc' }, select: opSelect })),
    ]
    const lines = await this.prisma.mo_assembly_line.findMany({ where: { mo_id: id }, orderBy: { line_seq: 'asc' }, select: { bom_assembly_id: true, qty: true, bom_assembly: { select: { assembly_mark: true } } } })
    const marks = await this.prisma.work_order_mark.findMany({
      where: { removed_at: null, work_order: { mo_id: id, status: { not: 'CANCELLED' } } },
      select: { bom_assembly_id: true, qty_qc_passed: true, work_order: { select: { sequence: true } } },
    })
    // matched by operation sequence, not op id — an op re-created in the routing gets a new id (QA review F-002)
    const passed = new Map<string, number>()
    for (const m of marks) {
      const k = `${m.work_order.sequence}:${m.bom_assembly_id}`
      passed.set(k, (passed.get(k) ?? 0) + Number(m.qty_qc_passed ?? 0))
    }
    return ops.flatMap(op => lines.flatMap(l => {
      const got = passed.get(`${op.sequence}:${l.bom_assembly_id}`) ?? 0
      const need = Number(l.qty)
      return got >= need ? [] : [{ assembly_mark: l.bom_assembly.assembly_mark, operation: `${String(op.sequence).padStart(3, '0')} ${op.name}` /* as the Work Orders tab */, passed: got, need }]
    }))
  }

  async changeStatus(id: number, dto: ChangeStatusDto, userId: number, userName: string) {
    const mo = await this.requireMo(id)
    this.assertTransition(mo.status, dto.to_status)
    // Confirm and Start need no reason (2026-10-09, user); Cancel / Complete still do
    const reason = dto.reason?.trim() ?? ''
    if (!reason && dto.to_status !== 'CONFIRMED' && dto.to_status !== 'IN_PROGRESS') throw new BadRequestException('ต้องใส่เหตุผล')
    // An empty MO (a new PRE_SHOP, or one switched to FULL_SHOP) can't be
    // confirmed / started until Upload has given it assemblies, and it has a routing.
    if (mo.kind === 'ASSEMBLY' && (dto.to_status === 'CONFIRMED' || dto.to_status === 'IN_PROGRESS')) {
      if ((await this.prisma.mo_assembly_line.count({ where: { mo_id: id } })) === 0) {
        throw new ConflictException('ยังไม่มี assembly — กด Upload เพื่อเพิ่มข้อมูลก่อน')
      }
      if (mo.routing_template_id == null) throw new ConflictException('ยังไม่ได้เลือก routing — แก้ไข MO แล้วเลือก routing ก่อน')
    }
    // Complete waits until every mark is compared with the zone's latest BOM (2026-10-09, user)
    if (mo.kind === 'ASSEMBLY' && dto.to_status === 'DONE') {
      const cmp = await this.bomCompare(id)
      if (cmp.pending > 0) throw new ConflictException(`ยังเทียบกับ BOM ไม่ครบ ${cmp.pending} mark — กด "เทียบกับ BOM" ให้เสร็จก่อนปิดงาน`)
      // …and every mark passed QC in full on every operation (2026-10-09, user)
      const short = await this.qcShortfalls(id)
      if (short.length) {
        const list = short.slice(0, 5).map(x => `${x.assembly_mark} · ${x.operation} ${x.passed}/${x.need}`).join(', ')
        throw new ConflictException(`ยัง QC ผ่านไม่ครบ: ${list}${short.length > 5 ? ` และอีก ${short.length - 5} รายการ` : ''}`)
      }
    }
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
          reason,
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
  async updateActualDates(id: number, dto: UpdateMoActualDatesDto, userId: number, userName = 'system') {
    const mo = await this.requireMo(id)
    if (mo.status !== 'DONE') {
      throw new ConflictException('Actual dates can only be edited after the MO is DONE')
    }
    const actuals = parseActualDates(dto.actual_start, dto.actual_finish)
    const tracking = actualsTracking(mo, actuals)
    if (tracking.length > 0) {
      const what = (['actual_start', 'actual_finish'] as const).filter(f => tracking.some(t => t.field === f))
        .map(f => `${f === 'actual_start' ? 'เริ่ม' : 'เสร็จ'} ${fmtBkk(mo[f])} → ${fmtBkk(actuals[f])}`)
      await this.prisma.$transaction(async (tx) => {
        await tx.manufacturing_order.update({ where: { id }, data: { ...actuals, write_uid: userId } })
        // In the MO History too (2026-10-08) — the mail log isn't shown there.
        await tx.mo_status_history.create({ data: { mo_id: id, from_status: mo.status, to_status: mo.status, changed_by: userName, reason: `แก้วันที่จริง: ${what.join(' · ')}` } })
      })
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
  /** The live (not cancelled) assembly MO holding a zone — by zone_id, or for
   *  older MOs without one, through their lines' BOM dispatch. */
  /** Full shop needs a real BOM (2026-10-08): an uploaded BOM with active
   *  assemblies in the zone — pre-shop uploads and BIM placeholders don't count. */
  async zoneHasBom(zoneId: number) {
    return (await this.prisma.bom_assembly.count({ where: { status: 'ACTIVE', dispatch: { zone_id: zoneId, source: 'BOM_UPLOAD' } } })) > 0
  }

  async zoneMo(zoneId: number) {
    return this.prisma.manufacturing_order.findFirst({
      where: {
        kind: 'ASSEMBLY', status: { not: 'CANCELLED' },
        OR: [{ zone_id: zoneId }, { assembly_lines: { some: { bom_assembly: { dispatch: { zone_id: zoneId } } } } }],
      },
      select: { id: true, mo_code: true },
    })
  }

  // An MO's project/zone: the ones sent, else its BOM lines' — all lines in one zone.
  private async resolveZone(assemblyIds: number[], projectId?: number, zoneId?: number) {
    let project = projectId ?? null
    let zone = zoneId ?? null
    if (assemblyIds.length) {
      const rows = await this.prisma.bom_assembly.findMany({ where: { id: { in: assemblyIds } }, select: { id: true, dispatch: { select: { project_id: true, zone_id: true, source: true } } } })
      // pre-shop rows belong to their own MO — never picked as BOM lines (QA review F-005)
      if (rows.some(r => r.dispatch.source === 'PRE_SHOP')) throw new BadRequestException('A pre-shop assembly cannot be picked as a BOM line')
      const zones = new Set(rows.map(r => r.dispatch.zone_id))
      if (zones.size > 1 || (zone != null && rows.some(r => r.dispatch.zone_id !== zone))) {
        throw new BadRequestException('All assemblies of an MO must be in one zone (1 zone ได้ 1 MO)')
      }
      if (zone == null && rows.length) { zone = rows[0].dispatch.zone_id; project = project ?? rows[0].dispatch.project_id }
    }
    return { project_id: project, zone_id: zone }
  }

  // Pre-shop upload scope: zone in the project, sub-zone (optional) in the zone.
  private async assertZone(projectId: number, zoneId: number, subZoneId?: number | null) {
    const zone = await this.prisma.project_zone.findFirst({ where: { id: zoneId, project_id: projectId }, select: { id: true } })
    if (!zone) throw new BadRequestException(`Zone ${zoneId} is not in project ${projectId}`)
    if (subZoneId != null) {
      const sub = await this.prisma.sub_zone.findFirst({ where: { id: subZoneId, zone_id: zoneId }, select: { id: true } })
      if (!sub) throw new BadRequestException(`Sub-zone ${subZoneId} is not in zone ${zoneId}`)
    }
  }

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
