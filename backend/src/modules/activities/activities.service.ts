import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ActivityCodeGenerator } from './activity-code.generator'
import { CreateActivityDto, LaborEntryDto, ConsumeEntryDto, ToolEntryDto } from './dto/create-activity.dto'
import { UpdateActivityDto } from './dto/update-activity.dto'
import { QueryActivityDto } from './dto/query-activity.dto'

const INCLUDE = {
  consumes: {
    include: {
      material: { select: { id: true, default_code: true, name: true } },
      formula:  { select: { id: true, name: true, expr: true, result_unit: true, variables: true } },
    },
  },
  skills: true,
  tools: {
    include: {
      resource: { select: { id: true, code: true, name: true } },
    },
  },
} as const

export interface RoutingFormulaParam {
  code: string
  description: string
  formula_expression: string
  inputs_required: string[]
  return_unit: string
  name: string
}

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: ActivityCodeGenerator,
  ) {}

  async findAll(query: QueryActivityDto) {
    const { q, material_id } = query
    return this.prisma.activity.findMany({
      where: {
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        ...(material_id ? { consumes: { some: { material_id } } } : {}),
      },
      orderBy: { activity_code: 'asc' },
      take: 500,
      include: INCLUDE,
    })
  }

  async findOne(id: number) {
    const row = await this.prisma.activity.findUnique({ where: { id }, include: INCLUDE })
    if (!row) throw new NotFoundException(`Activity ${id} not found`)
    return row
  }

  async listRoutingFormulaParams(): Promise<RoutingFormulaParam[]> {
    return this.prisma.$queryRaw<RoutingFormulaParam[]>`
      SELECT code, description, formula_expression, inputs_required, return_unit, name
      FROM routing_formula_param
      ORDER BY code
    `
  }

  async create(dto: CreateActivityDto, userId: number) {
    const consumeIds = await this.resolveConsumes(dto.consumes)
    const laborEntries = this.resolveLabors(dto.labors)
    const toolIds = await this.resolveTools(dto.tools)

    return this.prisma.$transaction(async (tx) => {
      const activity_code = await this.codeGen.generate(tx)
      const created = await tx.activity.create({
        data: {
          activity_code,
          name: dto.name,
          duration_min: dto.duration_min,
          per_minute:   dto.per_minute   ?? null,
          formula_code: dto.formula_code ?? null,
          ratio:        dto.ratio        ?? null,
          ratio_unit:   dto.ratio_unit   ?? null,
          per_time:     dto.per_time     ?? null,
          create_uid: userId,
          write_uid: userId,
          consumes: {
            create: consumeIds.map(({ material_id, formula_id }) => ({ material_id, formula_id: formula_id ?? null })),
          },
          skills: {
            create: laborEntries.map(({ skill, qty, level }) => ({ skill, qty, level: level ?? null })),
          },
        },
        include: INCLUDE,
      })
      if (toolIds.length) {
        await tx.activity_tool.createMany({
          data: toolIds.map(({ resource_id, qty }) => ({ activity_id: created.id, resource_id, qty })),
          skipDuplicates: true,
        })
      }
      return tx.activity.findUniqueOrThrow({ where: { id: created.id }, include: INCLUDE })
    })
  }

  async update(id: number, dto: UpdateActivityDto, userId: number) {
    await this.findOne(id)
    const consumeIds =
      dto.consumes !== undefined ? await this.resolveConsumes(dto.consumes) : undefined
    const laborEntries =
      dto.labors !== undefined ? this.resolveLabors(dto.labors) : undefined
    const toolIds =
      dto.tools !== undefined ? await this.resolveTools(dto.tools) : undefined
    await this.prisma.activity.update({
      where: { id },
      data: {
        ...(dto.name         !== undefined && { name:         dto.name }),
        ...(dto.duration_min !== undefined && { duration_min: dto.duration_min }),
        ...(dto.per_minute   !== undefined && { per_minute:   dto.per_minute }),
        ...(dto.formula_code !== undefined && { formula_code: dto.formula_code }),
        ...(dto.ratio        !== undefined && { ratio:        dto.ratio }),
        ...(dto.ratio_unit   !== undefined && { ratio_unit:   dto.ratio_unit }),
        ...(dto.per_time     !== undefined && { per_time:     dto.per_time }),
        write_uid: userId,
        ...(consumeIds !== undefined
          ? {
              consumes: {
                deleteMany: {},
                create: consumeIds.map(({ material_id, formula_id }) => ({ material_id, formula_id: formula_id ?? null })),
              },
            }
          : {}),
        ...(laborEntries !== undefined
          ? {
              skills: {
                deleteMany: {},
                create: laborEntries.map(({ skill, qty, level }) => ({ skill, qty, level: level ?? null })),
              },
            }
          : {}),
      },
    })
    if (toolIds !== undefined) {
      await this.prisma.activity_tool.deleteMany({ where: { activity_id: id } })
      if (toolIds.length) {
        await this.prisma.activity_tool.createMany({
          data: toolIds.map(({ resource_id, qty }) => ({ activity_id: id, resource_id, qty })),
          skipDuplicates: true,
        })
      }
    }
    return this.prisma.activity.findUniqueOrThrow({ where: { id }, include: INCLUDE })
  }

  async remove(id: number) {
    await this.findOne(id)
    await this.prisma.activity.delete({ where: { id } })
  }

  private async resolveTools(entries: ToolEntryDto[] | undefined): Promise<ToolEntryDto[]> {
    if (!entries || entries.length === 0) return []
    const uniqueIds = [...new Set(entries.map(e => e.resource_id))]
    const found = await this.prisma.equipment_resource.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    })
    if (found.length !== uniqueIds.length) {
      const missing = uniqueIds.filter((id) => !found.find((r) => r.id === id))
      throw new BadRequestException(`Tool resource ids not found: ${missing.join(', ')}`)
    }
    return entries
  }

  private async resolveConsumes(entries: ConsumeEntryDto[] | undefined): Promise<ConsumeEntryDto[]> {
    if (!entries || entries.length === 0) return []
    const uniqueIds = [...new Set(entries.map(e => e.material_id))]
    const found = await this.prisma.materials.findMany({
      where: { id: { in: uniqueIds }, type: 'consu', active: true },
      select: { id: true },
    })
    if (found.length !== uniqueIds.length) {
      const missing = uniqueIds.filter((id) => !found.find((r) => r.id === id))
      throw new BadRequestException(`Consumable material ids not found: ${missing.join(', ')}`)
    }
    return entries
  }

  private resolveLabors(
    entries: LaborEntryDto[] | undefined,
  ): { skill: string; qty: number; level?: string }[] {
    if (!entries || entries.length === 0) return []
    return entries.map((e) => ({ skill: e.skill, qty: e.qty, level: e.level ?? undefined }))
  }
}
