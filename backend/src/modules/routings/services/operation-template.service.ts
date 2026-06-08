import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { FormulaService } from './formula.service'

export interface ConsumableInput {
  resource_id: number
  qty?: number | null
  unit?: string | null
}

export interface CreateOpTemplateActivityDto {
  name: string
  measure: string
  unit?: string
  per_minute?: number
  machine_id?: number | null
  tool_ids?: number[]
  consumables?: ConsumableInput[]
  sequence?: number
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

const FULL_INCLUDE = {
  workcenter: { select: { id: true, code: true, name: true } },
  op_type:    { select: { id: true, key: true, label: true, color: true } },
  activities: {
    orderBy: { sequence: 'asc' as const },
    include: {
      tools:       { include: { resource: RESOURCE_SELECT } },
      consumables: { include: { resource: RESOURCE_SELECT } },
    },
  },
}

const OP_ACT_INCLUDE = {
  machine:      { select: { id: true, code: true, name: true, type: true } },
  tools:        { include: { resource: RESOURCE_SELECT } },
  consumables:  { include: { resource: RESOURCE_SELECT } },
  labors:       { include: { labor_resource: RESOURCE_SELECT } },
  op_materials: { include: { material: { select: { id: true, default_code: true, name: true } } } },
  source_activity: { select: { activity_code: true, write_date: true } },
} as const

const FULL_INCLUDE_WITH_STALE = {
  ...FULL_INCLUDE,
  activities: {
    orderBy: { sequence: 'asc' as const },
    include: {
      tools:           { include: { resource: RESOURCE_SELECT } },
      consumables:     { include: { resource: RESOURCE_SELECT } },
      source_activity: { select: { activity_code: true, write_date: true } },
      labors:          { include: { labor_resource: RESOURCE_SELECT } },
      op_materials:    { include: { material: { select: { id: true, default_code: true, name: true } } } },
    },
  },
} as const

@Injectable()
export class OperationTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly formula: FormulaService,
  ) {}

  findAll(search?: string) {
    return this.prisma.operation_template.findMany({
      where: search ? {
        OR: [
          { op_code: { contains: search, mode: 'insensitive' } },
          { name:    { contains: search, mode: 'insensitive' } },
        ],
      } : undefined,
      include: {
        workcenter: { select: { id: true, code: true, name: true } },
        op_type:    { select: { id: true, key: true, label: true, color: true } },
        _count: { select: { activities: true } },
      },
      orderBy: [{ status: 'asc' }, { op_code: 'asc' }],
    })
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
      activities: tpl.activities.map(act => ({
        ...act,
        source_activity_code: act.source_activity?.activity_code ?? null,
        is_stale:
          act.source_activity !== null && act.snapshot_at !== null
            ? act.source_activity.write_date > act.snapshot_at
            : false,
      })),
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
              name:       a.name,
              measure:    a.measure,
              unit:       a.unit       ?? null,
              per_minute: a.per_minute ?? null,
              machine_id: a.machine_id ?? null,
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
              name:       a.name,
              measure:    a.measure,
              unit:       a.unit       ?? null,
              per_minute: a.per_minute ?? null,
              machine_id: a.machine_id ?? null,
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
      include: { consumes: true, labors: true },
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
          machine_id:            src.machine_id,
          source_activity_id:    src.id,
          snapshot_at:           new Date(),
        },
      })
      if (src.labors.length) {
        await tx.op_act_labor.createMany({
          data: src.labors.map(l => ({
            op_act_id:         opAct.id,
            labor_resource_id: l.labor_resource_id,
            qty:               l.qty,
          })),
          skipDuplicates: true,
        })
      }
      if (src.consumes.length) {
        await tx.op_act_material.createMany({
          data: src.consumes.map(c => ({
            op_act_id:   opAct.id,
            material_id: c.material_id,
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
      include: { consumes: true, labors: true },
    })

    const updated = await this.prisma.$transaction(async tx => {
      await tx.operation_template_activity.update({
        where: { id: opActId },
        data: {
          name:        src.name,
          measure:     src.activity_code,
          per_minute:  src.duration_min,
          machine_id:  src.machine_id,
          snapshot_at: new Date(),
        },
      })
      await tx.op_act_labor.deleteMany({ where: { op_act_id: opActId } })
      await tx.op_act_material.deleteMany({ where: { op_act_id: opActId } })
      if (src.labors.length) {
        await tx.op_act_labor.createMany({
          data: src.labors.map(l => ({
            op_act_id: opActId, labor_resource_id: l.labor_resource_id, qty: l.qty,
          })),
          skipDuplicates: true,
        })
      }
      if (src.consumes.length) {
        await tx.op_act_material.createMany({
          data: src.consumes.map(c => ({ op_act_id: opActId, material_id: c.material_id })),
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
          data: a.tool_ids.map(rid => ({ activity_id: actId, resource_id: rid })),
          skipDuplicates: true,
        })
      }
      if (a.consumables?.length) {
        await tx.op_act_consumable.createMany({
          data: a.consumables.map(c => ({ activity_id: actId, resource_id: c.resource_id, qty: c.qty ?? null, unit: c.unit ?? null })),
          skipDuplicates: true,
        })
      }
    }
  }
}
