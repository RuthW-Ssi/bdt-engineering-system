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
        version: dto.version,
        file_key: dto.file_key,
        file_name: dto.file_name,
        mime_type: dto.mime_type,
        uploaded_by_id: uploadedById,
      },
    })
  }

  findByProject(projectId: number) {
    return this.prisma.drawing.findMany({
      where: { project_id: projectId },
      orderBy: { create_date: 'desc' },
    })
  }

  // Sparse versioning (see schema comment on drawing.version) — this is just
  // "what's the highest version tag used so far for this project", not a
  // count of anything. Mirrors bim.service.ts's getLatestVersion() shape.
  async getLatestVersion(projectId: number) {
    const latest = await this.prisma.drawing.findFirst({
      where: { project_id: projectId },
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
