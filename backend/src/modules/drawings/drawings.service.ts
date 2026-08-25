import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { FileStorageService } from '../file-storage/file-storage.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'

@Injectable()
export class DrawingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  create(dto: CreateDrawingDto, uploadedById: number) {
    return this.prisma.drawing.create({
      data: {
        project_id: dto.project_id,
        zone_id: dto.zone_id,
        sub_zone_id: dto.sub_zone_id ?? null,
        version: dto.version,
        file_key: dto.file_key,
        file_name: dto.file_name,
        mime_type: dto.mime_type,
        uploaded_by_id: uploadedById,
      },
    })
  }

  findByZone(zoneId: number, subZoneId: number | null) {
    return this.prisma.drawing.findMany({
      where: { zone_id: zoneId, sub_zone_id: subZoneId },
      orderBy: { create_date: 'desc' },
    })
  }

  // Sparse versioning (see schema comment on drawing.version) — "what's the
  // highest version tag used so far for this zone(+sub-zone)", not a count.
  // Scoped per zone(+sub-zone) since 2026-08-25's Zone rescope — mirrors
  // bom-upload.service.ts's getLatestRevision(projectId, zoneId, subZoneId).
  async getLatestVersion(zoneId: number, subZoneId: number | null) {
    const latest = await this.prisma.drawing.findFirst({
      where: { zone_id: zoneId, sub_zone_id: subZoneId },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    return { version: latest?.version ?? null }
  }

  async remove(id: number) {
    const drawing = await this.prisma.drawing.findUnique({ where: { id } })
    if (!drawing) throw new NotFoundException(`Drawing ${id} not found`)
    await this.fileStorage.delete(drawing.file_key)
    return this.prisma.drawing.delete({ where: { id } })
  }
}
