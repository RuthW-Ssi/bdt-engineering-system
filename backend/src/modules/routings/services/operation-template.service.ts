import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { FormulaService } from './formula.service'

export interface ConsumableInput {
  resource_id: number
  qty?: number | null
  unit?: string | null
  formula_id?: number | null
}

export interface LaborInput {
  skill: string
  qty: number
  level?: string | null
}

export interface CreateOpTemplateActivityDto {
  name: string
  measure: string
  unit?: string
  per_minute?: number
  tool_ids?: { id: number; qty: number }[]
  consumables?: ConsumableInput[]
  skills?: LaborInput[]
  sequence?: number
  source_activity_id?: number | null
  snapshot_at?: string | null
}

export interface CreateOperationTemplateDto {
  op_code: string
  name: string
  op_type_id?: number
  workcenter_id?: number
  method?: string
  time_mode?: string
  duration_min?: number
  formula_expr?: string
  activities?: CreateOpTemplateActivityDto[]
}

export interface UpdateOperationTemplateDto {
  name?: string
  op_type_id?: number | null
  workcenter_id?: number | null
  method?: string | null
  time_mode?: string
  duration_min?: number | null
  formula_expr?: string | null
  activities?: CreateOpTemplateActivityDto[]
}

const RESOURCE_SELECT = { select: { id: true, code: true, name: true, type: true } } as const

const SOURCE_ACT_RATE_SELECT = { activity_code: true, write_date: true, ratio: true, ratio_unit: true, per_time: true, formula_code: true } as const

const FULL_INCLUDE = {
  workcenter: { select: { id: true, code: true, name: true } },
  op_type:    { select: { id: true, key: true, label: true, color: true } },
  activities: {
    orderBy: { sequence: 'asc' as const },
    include: {
      tools:           { include: { resource: RESOURCE_SELECT } },
      skills:          true,
      op_materials:    { include: { resource: { select: { id: true, code: true, name: true } }, formula: { select: { id: true, name: true, expr: true, result_unit: true, variables: true } } } },
      source_activity: { select: SOURCE_ACT_RATE_SELECT },
    },
  },
}

const OP_ACT_INCLUDE = {
  tools:           { include: { resource: RESOURCE_SELECT } },
  skills:          true,
  op_materials:    { include: { resource: { select: { id: true, code: true, name: true } }, formula: { select: { id: true, name: true, expr: true, result_unit: true, variables: true } } } },
  source_activity: { select: SOURCE_ACT_RATE_SELECT },
} as const

const FULL_INCLUDE_WITH_STALE = {
  ...FULL_INCLUDE,
  activities: {
    orderBy: { sequence: 'asc' as const },
    include: {
      tools:           { include: { resource: RESOURCE_SELECT } },
      source_activity: { select: { ...SOURCE_ACT_RATE_SELECT, consumes: { select: { material_id: true, material: { select: { id: true, default_code: true, name: true } }, formula: { select: { id: true, name: true, expr: true, result_unit: true } } } } } },
      skills:          true,
      op_materials:    { include: { resource: RESOURCE_SELECT, formula: { select: { id: true, name: true, expr: true, result_unit: true } } } },
    },
  },
}

@Injectable()
export class OperationTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formula: FormulaService,
  ) {}

  async findAll(search?: string, page = 1, limit = 20) {
    const where = search ? {
      OR: [
        { op_code: { contains: search, mode: 'insensitive' as const } },
        { name:    { contains: search, mode: 'insensitive' as const } },
      ],
    } : undefined
    const [data, total] = await Promise.all([
      this.prisma.operation_template.findMany({
        where,
        include: {
          workcenter: { select: { id: true, code: true, name: true } },
          op_type:    { select: { id: true, key: true, label: true, color: true } },
          _count: { select: { activities: true } },
        },
        orderBy: [{ status: 'asc' }, { op_code: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.operation_template.count({ where }),
    ])
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async findOne(id: number, staleCheck = false) {
    if (!staleCheck) {
      const tpl = await this.prisma.operation_template.findUnique({ where: { id }, include: FULL_INCLUDE })
      if (!tpl) throw new NotFoundException(`Operation template ${id} not found`)
      return tpl
    }
    const tpl = await this.prisma.operation_template.findUnique({ where: { id }, include: FULL_INCLUDE_WITH_STALE })
    if (!tpl) throw new NotFoundException(`Operation template ${id} not found`)
    return {
      ...tpl,
      activities: tpl.activities.map(act => {
        const srcConsumes: { material_id: number; material: { id: number; default_code: string; name: string } | null; formula: { id: number; name: string; expr: string; result_unit: string | null } | null }[] =
          (act.source_activity as any)?.consumes ?? []
        return {
          ...act,
          source_activity_code: act.source_activity?.activity_code ?? null,
          is_stale:
            act.source_activity !== null && act.snapshot_at !== null
              ? act.source_activity.write_date > act.snapshot_at
              : false,
          op_materials: act.op_materials.map(m => ({
            ...m,
            formula: m.formula ?? null,
          })),
          consumables: srcConsumes
            .filter(c => c.material != null)
            .map(c => ({
              resource: { id: c.material!.id, code: c.material!.default_code, name: c.material!.name, type: 'material' as const },
              qty: null,
              unit: null,
              formula_id: c.formula?.id ?? null,
              formula_name: c.formula?.name ?? null,
            })),
        }
      }),
    }
  }

  async create(dto: CreateOperationTemplateDto, userId: number) {
    const opCode = dto.op_code.toUpperCase().trim()
    if (!/^[A-Z][A-Z0-9-]{1,38}$/.test(opCode))
      throw new BadRequestException('op_code must be uppercase letters, numbers, and hyphens (e.g. OP-WELD-MAIN)')
    if (await this.prisma.operation_template.findUnique({ where: { op_code: opCode } }))
      throw new ConflictException(`Op code "${opCode}" already exists`)

    if (dto.formula_expr != null && dto.formula_expr.trim() !== '')
      this.formula.variables(dto.formula_expr)

    await this.assertWorkcenters([dto.workcenter_id])

    return this.prisma.$transaction(async tx => {
      const tpl = await tx.operation_template.create({
        data: {
          op_code: opCode,
          name: dto.name.trim(),
          op_type_id:    dto.op_type_id    ?? null,
          workcenter_id: dto.workcenter_id ?? null,
          method:       dto.method        ?? null,
          time_mode:    dto.time_mode     ?? 'formula',
          duration_min: dto.duration_min  ?? null,
          formula_expr: dto.formula_expr  ?? null,
          create_uid: userId,
          write_uid:  userId,
          activities: dto.activities?.length ? {
            create: dto.activities.map((a, i) => ({
              name:               a.name,
              measure:            a.measure,
              unit:               a.unit               ?? null,
              per_minute:         a.per_minute         ?? null,
              source_activity_id: a.source_activity_id ?? null,
              snapshot_at:        a.snapshot_at ? new Date(a.snapshot_at) : null,
              sequence: a.sequence ?? (i + 1) * 10,
            })),
          } : undefined,
        },
        include: { activities: { orderBy: { sequence: 'asc' as const }, select: { id: true } } },
      })

      if (dto.activities?.length) {
        await this._createJunctions(tx, tpl.activities.map(a => a.id), dto.activities)
      }

      return tx.operation_template.findUniqueOrThrow({ where: { id: tpl.id }, include: FULL_INCLUDE })
    })
  }

  async update(id: number, dto: UpdateOperationTemplateDto, userId: number) {
    await this.findOne(id)

    if (dto.formula_expr != null && dto.formula_expr.trim() !== '')
      this.formula.variables(dto.formula_expr)

    if (dto.workcenter_id != null) await this.assertWorkcenters([dto.workcenter_id])

    return this.prisma.$transaction(async tx => {
      if (dto.activities !== undefined) {
        // Cascade on op_act_tool/op_act_consumable handles junction cleanup
        await tx.operation_template_activity.deleteMany({ where: { operation_template_id: id } })

        if (dto.activities.length > 0) {
          const newActs = await tx.operation_template_activity.createManyAndReturn({
            data: dto.activities.map((a, i) => ({
              operation_template_id: id,
              name:               a.name,
              measure:            a.measure,
              unit:               a.unit               ?? null,
              per_minute:         a.per_minute         ?? null,
              source_activity_id: a.source_activity_id ?? null,
              snapshot_at:        a.snapshot_at ? new Date(a.snapshot_at) : null,
              sequence: a.sequence ?? (i + 1) * 10,
            })),
          })

          await this._createJunctions(tx, newActs.map(a => a.id), dto.activities)
        }
      }

      await tx.operation_template.update({
        where: { id },
        data: {
          ...(dto.name         !== undefined && { name:         dto.name?.trim() }),
          ...(dto.op_type_id   !== undefined && { op_type_id:   dto.op_type_id }),
          ...(dto.workcenter_id !== undefined && { workcenter_id: dto.workcenter_id }),
          ...(dto.method       !== undefined && { method:       dto.method }),
          ...(dto.time_mode    !== undefined && { time_mode:    dto.time_mode }),
          ...(dto.duration_min !== undefined && { duration_min: dto.duration_min }),
          ...(dto.formula_expr !== undefined && { formula_expr: dto.formula_expr }),
          write_uid:  userId,
          write_date: new Date(),
        },
      })

      return tx.operation_template.findUniqueOrThrow({ where: { id }, include: FULL_INCLUDE })
    })
  }

  async publish(id: number, userId: number) {
    const tpl = await this.findOne(id)
    const errs: string[] = []
    if (!tpl.op_code)       errs.push('op_code required')
    if (!tpl.name)          errs.push('name required')
    if (!tpl.workcenter_id) errs.push('workcenter required')
    if (!tpl.time_mode)     errs.push('time_mode required')
    if (tpl.time_mode === 'by_activities' && tpl.activities.length === 0)
      errs.push('at least 1 activity required for By Activities mode')
    if (errs.length) throw new BadRequestException(errs.join('; '))
    if (tpl.status === 'active') return tpl

    return this.prisma.operation_template.update({
      where: { id },
      data: { status: 'active', write_uid: userId, write_date: new Date() },
    })
  }

  async remove(id: number) {
    await this.findOne(id)
    return this.prisma.operation_template.delete({ where: { id } })
  }

  async addFromLibrary(templateId: number, activityId: number) {
    await this.prisma.operation_template.findUniqueOrThrow({ where: { id: templateId }, select: { id: true } })
      .catch(() => { throw new NotFoundException(`Operation template ${templateId} not found`) })

    const src = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: { consumes: true, skills: true, tools: true },
    })
    if (!src) throw new NotFoundException(`Activity ${activityId} not found`)

    const agg = await this.prisma.operation_template_activity.aggregate({
      where: { operation_template_id: templateId },
      _max: { sequence: true },
    })
    const nextSeq = (agg._max.sequence ?? 0) + 10

    const created = await this.prisma.$transaction(async tx => {
      const opAct = await tx.operation_template_activity.create({
        data: {
          operation_template_id: templateId,
          sequence:              nextSeq,
          name:                  src.name,
          measure:               src.activity_code,   // NOT NULL constraint — use activity_code
          per_minute:            src.duration_min,
          source_activity_id:    src.id,
          snapshot_at:           new Date(),
        },
      })
      if (src.skills.length) {
        await tx.op_act_skills.createMany({
          data: src.skills.map(l => ({
            op_act_id:         opAct.id,
            skill: l.skill,
            qty:               l.qty,
            level:             l.level ?? null,
          })),
          skipDuplicates: true,
        })
      }
      if (src.tools.length) {
        await tx.op_act_tool.createMany({
          data: src.tools.map(t => ({
            activity_id: opAct.id,
            resource_id: t.resource_id,
            qty: t.qty ?? 1,
          })),
          skipDuplicates: true,
        })
      }
      return tx.operation_template_activity.findUniqueOrThrow({
        where: { id: opAct.id },
        include: OP_ACT_INCLUDE,
      })
    })

    return { ...created, is_stale: false, source_activity_code: src.activity_code }
  }

  async updateFromLibrary(templateId: number, opActId: number) {
    const opAct = await this.prisma.operation_template_activity.findUnique({
      where: { id: opActId },
      select: { id: true, source_activity_id: true, operation_template_id: true },
    })
    if (!opAct || opAct.operation_template_id !== templateId)
      throw new NotFoundException(`Activity row ${opActId} not found on template ${templateId}`)
    if (!opAct.source_activity_id)
      throw new BadRequestException('Activity has no linked source — cannot update from library')

    const src = await this.prisma.activity.findUniqueOrThrow({
      where: { id: opAct.source_activity_id },
      include: { consumes: true, skills: true, tools: true },
    })

    const updated = await this.prisma.$transaction(async tx => {
      await tx.operation_template_activity.update({
        where: { id: opActId },
        data: {
          name:        src.name,
          measure:     src.activity_code,
          per_minute:  src.duration_min,
          snapshot_at: new Date(),
        },
      })
      await tx.op_act_tool.deleteMany({ where: { activity_id: opActId } })
      await tx.op_act_skills.deleteMany({ where: { op_act_id: opActId } })
      await tx.op_act_material.deleteMany({ where: { op_act_id: opActId } })
      if (src.tools.length) {
        await tx.op_act_tool.createMany({
          data: src.tools.map(t => ({ activity_id: opActId, resource_id: t.resource_id, qty: t.qty ?? 1 })),
          skipDuplicates: true,
        })
      }
      if (src.skills.length) {
        await tx.op_act_skills.createMany({
          data: src.skills.map(l => ({
            op_act_id: opActId, skill: l.skill, qty: l.qty,
          })),
          skipDuplicates: true,
        })
      }
      return tx.operation_template_activity.findUniqueOrThrow({
        where: { id: opActId },
        include: OP_ACT_INCLUDE,
      })
    })

    return { ...updated, is_stale: false, source_activity_code: src.activity_code }
  }

  private async assertWorkcenters(ids: (number | null | undefined)[]) {
    const validIds = ids.filter((id): id is number => id != null)
    for (const id of validIds) {
      const wc = await this.prisma.mrp_workcenter.findUnique({ where: { id }, select: { id: true } })
      if (!wc) throw new BadRequestException(`Workcenter id ${id} not found`)
    }
  }

  private async _createJunctions(
    tx: Prisma.TransactionClient,
    activityIds: number[],
    dtoActivities: CreateOpTemplateActivityDto[],
  ) {
    for (let i = 0; i < dtoActivities.length; i++) {
      const a = dtoActivities[i]
      const actId = activityIds[i]
      if (a.tool_ids?.length) {
        await tx.op_act_tool.createMany({
          data: a.tool_ids.map(t => ({ activity_id: actId, resource_id: t.id, qty: t.qty })),
          skipDuplicates: true,
        })
      }
      if (a.skills?.length) {
        await tx.op_act_skills.createMany({
          data: a.skills.map(l => ({ op_act_id: actId, skill: l.skill, qty: l.qty, level: l.level ?? null })),
          skipDuplicates: true,
        })
      }
      if (a.consumables?.length) {
        await tx.op_act_material.createMany({
          data: a.consumables.map(c => ({ op_act_id: actId, resource_id: c.resource_id, formula_id: c.formula_id ?? null })),
          skipDuplicates: true,
        })
      }
    }
  }
}
