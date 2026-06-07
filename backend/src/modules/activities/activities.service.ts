import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ActivityCodeGenerator } from './activity-code.generator'
import { CreateActivityDto } from './dto/create-activity.dto'
import { UpdateActivityDto } from './dto/update-activity.dto'
import { QueryActivityDto } from './dto/query-activity.dto'

const INCLUDE = {
  machine: { select: { id: true, code: true, name: true } },
  consumes: {
    include: {
      material: { select: { id: true, default_code: true, name: true } },
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

  async create(dto: CreateActivityDto, userId: number) {
    // Validate outside transaction (read-only checks — no need to hold lock)
    await this.validateMachine(dto.machine_id)
    const consumeIds = await this.resolveConsumes(dto.consumes)

    return this.prisma.$transaction(async (tx) => {
      const activity_code = await this.codeGen.generate(tx)
      return tx.activity.create({
        data: {
          activity_code,
          name: dto.name,
          machine_id: dto.machine_id,
          duration_min: dto.duration_min,
          create_uid: userId,
          write_uid: userId,
          consumes: {
            create: consumeIds.map((material_id) => ({ material_id })),
          },
        },
        include: INCLUDE,
      })
    })
  }

  async update(id: number, dto: UpdateActivityDto, userId: number) {
    await this.findOne(id)
    if (dto.machine_id !== undefined) await this.validateMachine(dto.machine_id)
    const consumeIds =
      dto.consumes !== undefined ? await this.resolveConsumes(dto.consumes) : undefined
    return this.prisma.activity.update({
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
                create: consumeIds.map((material_id) => ({ material_id })),
              },
            }
          : {}),
      },
      include: INCLUDE,
    })
  }

  async remove(id: number) {
    await this.findOne(id)
    await this.prisma.activity.delete({ where: { id } })
  }

  private async validateMachine(machine_id: number) {
    const machine = await this.prisma.equipment_resource.findUnique({ where: { id: machine_id } })
    if (!machine) throw new BadRequestException(`Machine ${machine_id} not found`)
  }

  private async resolveConsumes(ids: number[] | undefined): Promise<number[]> {
    if (!ids || ids.length === 0) return []
    const unique = [...new Set(ids)]
    const found = await this.prisma.materials.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    })
    if (found.length !== unique.length) {
      const missing = unique.filter((id) => !found.find((m) => m.id === id))
      throw new BadRequestException(`Material ids not found: ${missing.join(', ')}`)
    }
    return unique
  }
}
