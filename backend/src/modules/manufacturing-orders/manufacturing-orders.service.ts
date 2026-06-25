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
import { CreateMoDto, MoAssemblyLineInputDto } from './dto/create-mo.dto'
import { UpdateMoDto } from './dto/update-mo.dto'
import { ChangeStatusDto } from './dto/change-status.dto'

/** P3 status state machine: allowed forward transitions. */
const ALLOWED_TRANSITIONS: Record<MoStatus, MoStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DONE'],
  DONE: [],
  CANCELLED: [],
}

const DETAIL_INCLUDE = {
  primary_mark_prefix: true,
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
          workcenter: { select: { id: true, code: true, name: true } },
          activities_snapshot: true,
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
      ...(opts.project_id
        ? {
            assembly_lines: {
              some: { bom_assembly: { dispatch: { project_id: opts.project_id } } },
            },
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
        _count: { select: { assembly_lines: true } },
      },
    })
    return rows.map((r) => ({
      id: r.id,
      mo_code: r.mo_code,
      status: r.status,
      due_date: r.due_date,
      mark_prefix: r.primary_mark_prefix,
      routing_template: { id: r.routing_template.id, code: r.routing_template.code, name: r.routing_template.name },
      assembly_count: r._count.assembly_lines,
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
    }

    // Enrich operation activities with machine/tool names and current skills from Activity Library
    type RawAct = {
      name: string; measure?: string | null; per_minute?: number | string | null
      source_activity_id?: number | null
      machine_id?: number | null; tool_ids?: { id: number; qty: number }[] | null
      labors?: { skill: string; qty: number; level?: string | null }[] | null
      consumables?: { resource_id: number; code: string; name: string }[] | null
    }
    const allResIds = new Set<number>()
    const activityIds = new Set<number>()
    const unlinkedNames = new Set<string>()
    for (const op of mo.routing_template.operations) {
      const acts = Array.isArray(op.activities_snapshot) ? (op.activities_snapshot as RawAct[]) : []
      for (const a of acts) {
        if (a.machine_id != null) allResIds.add(a.machine_id)
        for (const t of a.tool_ids ?? []) allResIds.add(t.id)
        if (a.source_activity_id != null) activityIds.add(a.source_activity_id)
        else if (a.name) unlinkedNames.add(a.name)
      }
    }
    const resMap = allResIds.size > 0
      ? new Map((await this.prisma.equipment_resource.findMany({
          where: { id: { in: [...allResIds] } },
          select: { id: true, code: true, name: true },
        })).map(r => [r.id, r]))
      : new Map<number, { id: number; code: string; name: string }>()

    const skillRows = activityIds.size > 0
      ? await this.prisma.activity_skill.findMany({
          where: { activity_id: { in: [...activityIds] } },
          select: { activity_id: true, skill: true, qty: true, level: true },
        })
      : []
    const skillMap = new Map<number, { skill: string; qty: number; level: string | null }[]>()
    for (const row of skillRows) {
      const list = skillMap.get(row.activity_id) ?? []
      list.push({ skill: row.skill, qty: row.qty, level: row.level })
      skillMap.set(row.activity_id, list)
    }

    // Name-match unlinked activities to Activity Library for skills
    const nameSkillMap = new Map<string, { skill: string; qty: number; level: string | null }[]>()
    if (unlinkedNames.size > 0) {
      const matched = await this.prisma.activity.findMany({
        where: { name: { in: [...unlinkedNames] } },
        select: { name: true, skills: { select: { skill: true, qty: true, level: true } } },
      })
      for (const m of matched) if (m.skills.length) nameSkillMap.set(m.name, m.skills)
    }

    const enrichedOperations = mo.routing_template.operations.map(op => {
      const acts = Array.isArray(op.activities_snapshot) ? (op.activities_snapshot as RawAct[]) : []
      return {
        ...op,
        activities: acts.map(a => ({
          name: a.name,
          measure: a.measure ?? null,
          per_minute: a.per_minute != null ? Number(a.per_minute) : null,
          machine: a.machine_id != null ? (resMap.get(a.machine_id) ?? null) : null,
          tools: (a.tool_ids ?? []).map(t => ({ ...(resMap.get(t.id) ?? { id: t.id, code: '', name: '' }), qty: t.qty })),
          labors: a.source_activity_id != null && skillMap.has(a.source_activity_id)
            ? skillMap.get(a.source_activity_id)!
            : (a.name && nameSkillMap.has(a.name) ? nameSkillMap.get(a.name)! : (a.labors ?? null)),
          consumables: a.consumables ?? null,
        })),
      }
    })

    return {
      ...mo,
      mark_prefix: mo.primary_mark_prefix, // alias so detail matches list shape (FE reads mo.mark_prefix)
      projects_involved: [...projectsMap.values()],
      zones_involved: [...zonesMap.values()],
      sub_zones_involved: [...subZonesMap.values()],
      routing_template: { ...mo.routing_template, operations: enrichedOperations },
    }
  }

  // ── Assemblies tab: lines + total + remaining + allocation breakdown ────────
  async getAssemblies(id: number) {
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
          due_date: dto.due_date ? new Date(dto.due_date) : null,
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
        // T-WO.03: auto-create execution-layer WOs on confirm (Save + Confirm path).
        await this.woAutoCreate.createForMo(tx, created.id, userName)
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
          ...(dto.due_date !== undefined
            ? { due_date: dto.due_date ? new Date(dto.due_date) : null }
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

    await this.prisma.$transaction(async (tx) => {
      await tx.manufacturing_order.update({
        where: { id },
        data: { status: dto.to_status, write_uid: userId },
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
      // T-WO.03: auto-create execution-layer WOs when an existing DRAFT is confirmed.
      if (dto.to_status === 'CONFIRMED') {
        await this.woAutoCreate.createForMo(tx, id, userName)
      }
    })

    await this.mail.log({
      model: 'manufacturing_order',
      res_id: id,
      author_id: userId,
      message_type: 'audit',
      subject: `MO ${mo.mo_code} status ${mo.status} → ${dto.to_status}`,
    })
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
