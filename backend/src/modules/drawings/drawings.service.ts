import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { FileStorageService } from '../file-storage/file-storage.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'
import { currentRevRows } from './current-rev'

@Injectable()
export class DrawingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileStorage: FileStorageService,
  ) {}

  // .pdf-only as of 2026-09-15 — CreateDrawingDto rejects any other
  // extension. .dwg upload (and its Autodesk APS 2D-preview push) was
  // removed entirely: every upload was an unconditional billed Model
  // Derivative job with no dedup, and a pre-existing bug in the push path
  // itself burned real Flex-token budget confirming this cost was real. See
  // wiki/features/drawing.md's "DWG removed entirely" entry.
  //
  // create(): same zone/sub/mark/rev/file_name = re-upload of that sheet →
  // replace. Same key ⇒ the upload already overwrote the object, so only
  // delete the old object when its key differs (legacy v<n>/ keys).
  async create(dto: CreateDrawingDto, uploadedById: number) {
    const subZoneId = dto.sub_zone_id ?? null
    const same = await this.prisma.drawing.findMany({
      where: { zone_id: dto.zone_id, sub_zone_id: subZoneId, mark: dto.mark, rev: dto.rev, file_name: dto.file_name },
    })
    for (const old of same) {
      if (old.file_key !== dto.file_key) await this.fileStorage.delete(old.file_key)
      await this.prisma.drawing.delete({ where: { id: old.id } })
    }
    return this.prisma.drawing.create({
      data: {
        project_id: dto.project_id, zone_id: dto.zone_id, sub_zone_id: subZoneId,
        mark: dto.mark, rev: dto.rev,
        file_key: dto.file_key, file_name: dto.file_name, mime_type: dto.mime_type,
        uploaded_by_id: uploadedById,
      },
    })
  }

  async findByZone(zoneId: number, subZoneId: number | null, opts: { currentOnly?: boolean } = {}) {
    const rows = await this.prisma.drawing.findMany({
      where: { zone_id: zoneId, sub_zone_id: subZoneId },
      orderBy: [{ mark: 'asc' }, { rev: 'desc' }, { create_date: 'desc' }],
    })
    return opts.currentOnly ? currentRevRows(rows) : rows
  }

  // Marks available to draw against — distinct assembly_mark of the ACTIVE
  // BOM for this zone(+sub-zone). Backs the upload modal's mark picker.
  async bomMarks(zoneId: number, subZoneId: number | null): Promise<string[]> {
    const rows = await this.prisma.bom_assembly.findMany({
      where: { status: 'ACTIVE', dispatch: { zone_id: zoneId, ...(subZoneId != null && { sub_zone_id: subZoneId }) } },
      select: { assembly_mark: true },
      distinct: ['assembly_mark'],
    })
    return rows.map(r => r.assembly_mark)
  }

  async remove(id: number) {
    const drawing = await this.prisma.drawing.findUnique({ where: { id } })
    if (!drawing) throw new NotFoundException(`Drawing ${id} not found`)
    await this.fileStorage.delete(drawing.file_key)
    return this.prisma.drawing.delete({ where: { id } })
  }
}
