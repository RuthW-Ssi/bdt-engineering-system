import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ActivityCodeGenerator } from './activity-code.generator'
import { CreateActivityDto, LaborEntryDto } from './dto/create-activity.dto'
import { UpdateActivityDto } from './dto/update-activity.dto'
import { QueryActivityDto } from './dto/query-activity.dto'

const INCLUDE = {
  machine: { select: { id: true, code: true, name: true } },
  consumes: {
    include: {
      resource: { select: { id: true, code: true, name: true } },
    },
  },
  labors: {
    include: {
      labor_resource: { select: { id: true, code: true, name: true } },
    },
  },
  tools: {
    include: {
      resource: { select: { id: true, code: true, name: true } },
    },
  },
} as const

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGen: ActivityCodeGenerator,
  ) {}

  async findAll(query: QueryActivityDto) {
    const { q, machine_id, material_id } = query
    return this.prisma.activity.findMany({
      where: {
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
        ...(machine_id ? { machine_id } : {}),
        ...(material_id ? { consumes: { some: { resource_id: material_id } } } : {}),
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

  async create(dto: CreateActivityDto, userId: number) {
    await this.validateMachine(dto.machine_id)
    const consumeIds = await this.resolveConsumes(dto.consumes)
    const laborEntries = await this.resolveLabors(dto.labors)
    const toolIds = await this.resolveTools(dto.tools)

    return this.prisma.$transaction(async (tx) => {
      const activity_code = await this.codeGen.generate(tx)
      const created = await tx.activity.create({
        data: {
          activity_code,
          name: dto.name,
          machine_id: dto.machine_id,
          duration_min: dto.duration_min,
          create_uid: userId,
          write_uid: userId,
          consumes: {
            create: consumeIds.map((resource_id) => ({ resource_id })),
          },
          labors: {
            create: laborEntries.map(({ labor_resource_id, qty }) => ({ labor_resource_id, qty })),
          },
        },
        include: INCLUDE,
      })
      if (toolIds.length) {
        await tx.activity_tool.createMany({
          data: toolIds.map((resource_id) => ({ activity_id: created.id, resource_id })),
          skipDuplicates: true,
        })
      }
      return tx.activity.findUniqueOrThrow({ where: { id: created.id }, include: INCLUDE })
    })
  }

  async update(id: number, dto: UpdateActivityDto, userId: number) {
    await this.findOne(id)
    if (dto.machine_id !== undefined) await this.validateMachine(dto.machine_id)
    const consumeIds =
      dto.consumes !== undefined ? await this.resolveConsumes(dto.consumes) : undefined
    const laborEntries =
      dto.labors !== undefined ? await this.resolveLabors(dto.labors) : undefined
    const toolIds =
      dto.tools !== undefined ? await this.resolveTools(dto.tools) : undefined
    await this.prisma.activity.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.machine_id !== undefined ? { machine_id: dto.machine_id } : {}),
        ...(dto.duration_min !== undefined ? { duration_min: dto.duration_min } : {}),
        write_uid: userId,
        ...(consumeIds !== undefined
          ? {
              consumes: {
                deleteMany: {},
                create: consumeIds.map((resource_id) => ({ resource_id })),
              },
            }
          : {}),
        ...(laborEntries !== undefined
          ? {
              labors: {
                deleteMany: {},
                create: laborEntries.map(({ labor_resource_id, qty }) => ({ labor_resource_id, qty })),
              },
            }
          : {}),
      },
    })
    if (toolIds !== undefined) {
      await this.prisma.activity_tool.deleteMany({ where: { activity_id: id } })
      if (toolIds.length) {
        await this.prisma.activity_tool.createMany({
          data: toolIds.map((resource_id) => ({ activity_id: id, resource_id })),
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

  private async validateMachine(machine_id: number) {
    const machine = await this.prisma.equipment_resource.findUnique({ where: { id: machine_id } })
    if (!machine) throw new BadRequestException(`Machine ${machine_id} not found`)
  }

  private async resolveTools(ids: number[] | undefined): Promise<number[]> {
    if (!ids || ids.length === 0) return []
    const unique = [...new Set(ids)]
    const found = await this.prisma.equipment_resource.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    })
    if (found.length !== unique.length) {
      const missing = unique.filter((id) => !found.find((r) => r.id === id))
      throw new BadRequestException(`Tool resource ids not found: ${missing.join(', ')}`)
    }
    return unique
  }

  private async resolveConsumes(ids: number[] | undefined): Promise<number[]> {
    if (!ids || ids.length === 0) return []
    const unique = [...new Set(ids)]
    const found = await this.prisma.equipment_resource.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    })
    if (found.length !== unique.length) {
      const missing = unique.filter((id) => !found.find((r) => r.id === id))
      throw new BadRequestException(`Resource ids not found: ${missing.join(', ')}`)
    }
    return unique
  }

  private async resolveLabors(
    entries: LaborEntryDto[] | undefined,
  ): Promise<{ labor_resource_id: number; qty: number }[]> {
    if (!entries || entries.length === 0) return []
    const uniqueIds = [...new Set(entries.map((e) => e.id))]
    const found = await this.prisma.equipment_resource.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    })
    if (found.length !== uniqueIds.length) {
      const missing = uniqueIds.filter((id) => !found.find((r) => r.id === id))
      throw new BadRequestException(`Labor resource ids not found: ${missing.join(', ')}`)
    }
    return entries.map((e) => ({ labor_resource_id: e.id, qty: e.qty }))
  }
}
