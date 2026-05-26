import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { CreateEquipmentResourceDto } from '../dto/create-equipment-resource.dto'

@Injectable()
export class EquipmentResourceService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(type?: string) {
    return this.prisma.equipment_resource.findMany({
      where: { active: true, ...(type ? { type } : {}) },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    })
  }

  async findOne(id: number) {
    const eq = await this.prisma.equipment_resource.findUnique({ where: { id } })
    if (!eq) throw new NotFoundException(`Equipment resource ${id} not found`)
    return eq
  }

  async create(dto: CreateEquipmentResourceDto) {
    const code = dto.code.toUpperCase()
    const existing = await this.prisma.equipment_resource.findUnique({ where: { code } })
    if (existing) throw new ConflictException(`Equipment code "${code}" already exists`)

    return this.prisma.equipment_resource.create({
      data: { code, name: dto.name, type: dto.type, rate: dto.rate ?? null, rate_unit: dto.rate_unit ?? null },
    })
  }
}
