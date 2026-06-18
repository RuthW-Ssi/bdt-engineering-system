import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateZoneDto } from './dto/create-zone.dto'

@Injectable()
export class ProjectZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: number) {
    return this.prisma.project_zone.findMany({
      where: { project_id: projectId, active: true },
      orderBy: [{ erection_sequence: 'asc' }, { id: 'asc' }],
      include: { sub_zones: { where: { active: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }] } },
    })
  }

  async create(projectId: number, dto: CreateZoneDto) {
    return this.prisma.project_zone.create({
      data: {
        project_id: projectId,
        code: dto.code,
        label: dto.label,
        erection_sequence: dto.erection_sequence,
        target_erection_start: dto.target_erection_start ? new Date(dto.target_erection_start) : undefined,
        target_erection_end: dto.target_erection_end ? new Date(dto.target_erection_end) : undefined,
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
        ...(dto.erection_sequence !== undefined ? { erection_sequence: dto.erection_sequence } : {}),
        ...(dto.target_erection_start !== undefined ? { target_erection_start: dto.target_erection_start ? new Date(dto.target_erection_start) : null } : {}),
        ...(dto.target_erection_end !== undefined ? { target_erection_end: dto.target_erection_end ? new Date(dto.target_erection_end) : null } : {}),
        ...(dto.crane_assignment !== undefined ? { crane_assignment: dto.crane_assignment } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    })
  }
}
