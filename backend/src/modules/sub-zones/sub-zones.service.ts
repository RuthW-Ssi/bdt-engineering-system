import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateSubZoneDto } from './dto/create-sub-zone.dto'
import { UpdateSubZoneDto } from './dto/update-sub-zone.dto'

@Injectable()
export class SubZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForZone(zoneId: number) {
    const zone = await this.prisma.project_zone.findUnique({ where: { id: zoneId } })
    if (!zone) throw new NotFoundException(`Zone #${zoneId} not found`)
    return this.prisma.sub_zone.findMany({
      where: { zone_id: zoneId, active: true },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    })
  }

  async create(zoneId: number, dto: CreateSubZoneDto, uid: number) {
    const zone = await this.prisma.project_zone.findUnique({ where: { id: zoneId } })
    if (!zone) throw new NotFoundException(`Zone #${zoneId} not found`)
    return this.prisma.sub_zone.create({
      data: { ...dto, zone_id: zoneId, create_uid: uid, write_uid: uid },
    })
  }

  async update(id: number, dto: UpdateSubZoneDto, uid: number) {
    await this.findOne(id)
    return this.prisma.sub_zone.update({
      where: { id },
      data: { ...dto, write_uid: uid },
    })
  }

  async remove(id: number, uid: number) {
    await this.findOne(id)
    await this.prisma.sub_zone.update({
      where: { id },
      data: { active: false, write_uid: uid },
    })
    return { ok: true }
  }

  private async findOne(id: number) {
    const sub = await this.prisma.sub_zone.findUnique({ where: { id } })
    if (!sub) throw new NotFoundException(`Sub-zone #${id} not found`)
    return sub
  }
}
