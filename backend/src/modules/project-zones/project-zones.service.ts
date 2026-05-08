import {
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateZoneDto } from './dto/create-zone.dto'
import { ReorderZonesDto } from './dto/reorder-zones.dto'

@Injectable()
export class ProjectZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: number) {
    return this.prisma.project_zone.findMany({
      where: { project_id: projectId, active: true },
      orderBy: { erection_sequence: 'asc' },
      include: { sub_zones: { where: { active: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }] } },
    })
  }

  async create(projectId: number, dto: CreateZoneDto) {
    return this.prisma.project_zone.create({
      data: {
        project_id: projectId,
        code: dto.code,
        label: dto.label,
        zone_type: dto.zone_type,
        erection_sequence: dto.erection_sequence,
        crane_assignment: dto.crane_assignment,
        notes: dto.notes,
      },
    })
  }

  async update(projectId: number, zoneId: number, dto: Partial<CreateZoneDto>) {
    const zone = await this.prisma.project_zone.findFirst({
      where: { id: zoneId, project_id: projectId },
    })
    if (!zone) throw new NotFoundException(`Zone ${zoneId} not found in project ${projectId}`)

    return this.prisma.project_zone.update({
      where: { id: zoneId },
      data: {
        ...(dto.label ? { label: dto.label } : {}),
        ...(dto.zone_type ? { zone_type: dto.zone_type } : {}),
        ...(dto.erection_sequence !== undefined ? { erection_sequence: dto.erection_sequence } : {}),
        ...(dto.crane_assignment !== undefined ? { crane_assignment: dto.crane_assignment } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    })
  }

  async reorder(projectId: number, dto: ReorderZonesDto) {
    return this.prisma.$transaction(
      dto.sequence.map((zoneId, idx) =>
        this.prisma.project_zone.updateMany({
          where: { id: zoneId, project_id: projectId },
          data: { erection_sequence: idx + 1 },
        }),
      ),
    )
  }
}
