import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString,
  MaxLength, Min, ValidateNested, ArrayMaxSize,
} from 'class-validator'
import { Type } from 'class-transformer'
import { PrismaService } from '../../../prisma/prisma.service'
import { FormulaService } from './formula.service'

export class LaborEntryDto {
  @IsInt() @Min(1) labor_resource_id: number
  @IsInt() @Min(1) qty: number
}

export class CreateOpTemplateActivityDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string
  @IsString() @IsNotEmpty() @MaxLength(40)  measure: string
  @IsOptional() @IsString() @MaxLength(20)  unit?: string
  @IsOptional() @IsNumber() @Min(0)         per_minute?: number
  @IsOptional() @IsInt()                    machine_id?: number | null
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) tool_ids?: number[]
  @IsOptional() @IsInt() @Min(0)            sequence?: number
  @IsOptional() @IsInt() @Min(1)            source_activity_id?: number | null
  @IsOptional() @IsString()                 snapshot_at?: string | null
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LaborEntryDto)
  labor_entries?: LaborEntryDto[]
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(1, { each: true })
  material_resource_ids?: number[]
}

export class CreateOperationTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(40)  op_code: string
  @IsString() @IsNotEmpty() @MaxLength(120) name: string
  @IsOptional() @IsInt() @Min(1)            op_type_id?: number
  @IsOptional() @IsInt() @Min(1)            workcenter_id?: number
  @IsOptional() @IsString() @MaxLength(60)  method?: string
  @IsOptional() @IsIn(['fixed', 'formula', 'by_activities']) time_mode?: string
  @IsOptional() @IsNumber() @Min(0)         duration_min?: number
  @IsOptional() @IsString() @MaxLength(500) formula_expr?: string
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CreateOpTemplateActivityDto)
  activities?: CreateOpTemplateActivityDto[]
}

export class UpdateOperationTemplateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string
  @IsOptional() @IsInt()                    op_type_id?: number | null
  @IsOptional() @IsInt()                    workcenter_id?: number | null
  @IsOptional() @IsString() @MaxLength(60)  method?: string | null
  @IsOptional() @IsIn(['fixed', 'formula', 'by_activities']) time_mode?: string
  @IsOptional() @IsNumber() @Min(0)         duration_min?: number | null
  @IsOptional() @IsString() @MaxLength(500) formula_expr?: string | null
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CreateOpTemplateActivityDto)
  activities?: CreateOpTemplateActivityDto[]
}

const RESOURCE_SELECT = { select: { id: true, code: true, name: true, type: true } } as const

const FULL_INCLUDE = {
  workcenter: { select: { id: true, code: true, name: true } },
  op_type:    { select: { id: true, key: true, label: true, color: true } },
  activities: {
    orderBy: { sequence: 'asc' as const },
    include: {
      machine:      RESOURCE_SELECT,
      tools:        { include: { resource: RESOURCE_SELECT } },
      labors:       { include: { labor_resource: RESOURCE_SELECT } },
      op_materials: { include: { resource: { select: { id: true, code: true, name: true } } } },
    },
  },
}

const SOURCE_ACTIVITY_SELECT = {
  select: {
    activity_code: true,
    write_date:    true,
  },
} as const

const OP_ACT_INCLUDE = {
  machine:         { select: { id: true, code: true, name: true, type: true } },
  tools:           { include: { resource: RESOURCE_SELECT } },
  labors:          { include: { labor_resource: RESOURCE_SELECT } },
  op_materials:    { include: { resource: { select: { id: true, code: true, name: true } } } },
  source_activity: SOURCE_ACTIVITY_SELECT,
} as const

const FULL_INCLUDE_WITH_STALE = {
  ...FULL_INCLUDE,
  activities: {
    orderBy: { sequence: 'asc' as const },
    include: {
      machine:         RESOURCE_SELECT,
      tools:           { include: { resource: RESOURCE_SELECT } },
      labors:          { include: { labor_resource: RESOURCE_SELECT } },
      op_materials:    { include: { resource: { select: { id: true, code: true, name: true } } } },
      source_activity: SOURCE_ACTIVITY_SELECT,
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

  async findOne(id: number, withStale = false) {
    if (!withStale) {
      const tpl = await this.prisma.operation_template.findUnique({ where: { id }, include: FULL_INCLUDE })
      if (!tpl) throw new NotFoundException(`Operation template ${id} not found`)
      return tpl
    }
    const tpl = await this.prisma.operation_template.findUnique({ where: { id }, include: FULL_INCLUDE_WITH_STALE })
    if (!tpl) throw new NotFoundException(`Operation template ${id} not found`)
    return {
      ...tpl,
      activities: tpl.activities.map(act => {
        const src = act.source_activity as any
        if (!src) return { ...act, source_activity_code: null, is_stale: false }
        const isStale = act.snapshot_at != null && src.write_date != null
          ? new Date(src.write_date) > new Date(act.snapshot_at)
          : false
        return { ...act, source_activity_code: src.activity_code, is_stale: isStale }
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
        await tx.operation_template_activity.deleteMany({ where: { operation_template_id: id } })

        if (dto.activities.length > 0) {
          const newActs = await tx.operation_template_activity.createManyAndReturn({
            data: dto.activities.map((a, i) => ({
              operation_template_id: id,
              name:               a.name,
              measure:            a.measure,
              unit:               a.unit               ?? null,
              per_minute:         a.per_minute         ?? null,
              machine_id:         a.machine_id         ?? null,
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

  async addFromLibrary(templateId: number, activityId: number, userId?: number) {
    await this.prisma.operation_template.findUniqueOrThrow({ where: { id: templateId }, select: { id: true } })
      .catch(() => { throw new NotFoundException(`Operation template ${templateId} not found`) })

    const src = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: { consumes: true, labors: true, tools: true },
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
          measure:               src.activity_code,
          per_minute:            src.duration_min,
          machine_id:            src.machine_id,
          source_activity_id:    src.id,
          snapshot_at:           new Date(),
          ...(userId != null && { write_uid: userId }),
        },
      })
      if (src.tools.length) {
        await tx.op_act_tool.createMany({
          data: src.tools.map(t => ({ activity_id: opAct.id, resource_id: t.resource_id })),
          skipDuplicates: true,
        })
      }
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
            resource_id: c.resource_id,
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

  async updateFromLibrary(templateId: number, opActId: number, userId?: number) {
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
      include: { consumes: true, labors: true, tools: true },
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
          ...(userId != null && { write_uid: userId }),
        },
      })
      await tx.op_act_tool.deleteMany({ where: { activity_id: opActId } })
      await tx.op_act_labor.deleteMany({ where: { op_act_id: opActId } })
      await tx.op_act_material.deleteMany({ where: { op_act_id: opActId } })
      if (src.tools.length) {
        await tx.op_act_tool.createMany({
          data: src.tools.map(t => ({ activity_id: opActId, resource_id: t.resource_id })),
          skipDuplicates: true,
        })
      }
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
          data: src.consumes.map(c => ({ op_act_id: opActId, resource_id: c.resource_id })),
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
      if (a.labor_entries?.length) {
        await tx.op_act_labor.createMany({
          data: a.labor_entries.map(l => ({ op_act_id: actId, labor_resource_id: l.labor_resource_id, qty: l.qty })),
          skipDuplicates: true,
        })
      }
      if (a.material_resource_ids?.length) {
        await tx.op_act_material.createMany({
          data: a.material_resource_ids.map(rid => ({ op_act_id: actId, resource_id: rid })),
          skipDuplicates: true,
        })
      }
    }
  }
}
