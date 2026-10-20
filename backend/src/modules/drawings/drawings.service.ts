import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { FileStorageService } from '../file-storage/file-storage.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'
import { currentRevRows, isPdf } from './current-rev'
import { toA3Landscape } from './a3-normalize'
import { buildExpectedFileKey } from './file-key'

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
  //
  // Task 11 (2026-10-20): every upload is normalised to one A3-landscape PDF
  // FIRST, before any of the same-sheet replace logic below runs — so a
  // corrupt/encrypted PDF throws and deletes the just-uploaded object without
  // ever touching an existing row.
  //
  // Security review (2026-10-20): dto.file_key is CLIENT-supplied (it names
  // the object the browser already wrote via a presigned URL) and the DTO's
  // regex only checks its shape — without this check any authenticated user
  // could point create() at an arbitrary existing object (another project's
  // drawing) by file_key alone. The expected key is rebuilt from validated
  // project/zone/sub-zone ownership and must match exactly, before ANY
  // storage call.
  async create(dto: CreateDrawingDto, uploadedById: number) {
    await this.assertFileKeyMatches(dto)

    const original = await this.fileStorage.getObject(dto.file_key)
    let a3: Buffer
    try {
      a3 = await toA3Landscape(original)
    } catch {
      await this.fileStorage.delete(dto.file_key)
      throw new BadRequestException('ไฟล์ PDF เสียหรือเปิดไม่ได้')
    }
    await this.fileStorage.putObject(dto.file_key, a3, 'application/pdf')

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
        mark: dto.mark, rev: dto.rev, version: dto.version,
        file_key: dto.file_key, file_name: dto.file_name, mime_type: dto.mime_type,
        uploaded_by_id: uploadedById,
      },
    })
  }

  // See the security-review comment on create() above. Rebuilds the key the
  // upload flow's own drawingKey() (src/api/drawings.ts) would have produced
  // from validated project/zone/sub-zone ownership, and requires an exact
  // match — never trusts dto.file_key's shape alone.
  private async assertFileKeyMatches(dto: CreateDrawingDto): Promise<void> {
    const mismatch = () => new BadRequestException('file_key ไม่ตรงกับ project/zone/mark/rev')

    const zone = await this.prisma.project_zone.findFirst({
      where: { id: dto.zone_id, project_id: dto.project_id },
      select: { code: true, project: { select: { project_code: true } } },
    })
    if (!zone) throw mismatch()

    let subZoneCode: string | null = null
    if (dto.sub_zone_id != null) {
      const subZone = await this.prisma.sub_zone.findFirst({
        where: { id: dto.sub_zone_id, zone_id: dto.zone_id },
        select: { code: true },
      })
      if (!subZone) throw mismatch()
      subZoneCode = subZone.code
    }

    const expected = buildExpectedFileKey(
      { projectCode: zone.project.project_code, zoneCode: zone.code, subZoneCode },
      dto.mark, dto.rev, dto.file_name,
    )
    if (dto.file_key !== expected) throw mismatch()
  }

  async findByZone(zoneId: number, subZoneId: number | null, opts: { currentOnly?: boolean } = {}) {
    // Staff names are internal — `currentOnly` is the controller's own
    // isCustomerUser signal, so a customer caller never gets the uploaded_by
    // join at all (not just a field the frontend happens to hide). Mirrors
    // documents.service.ts's CUSTOMER_SELECT (security review, 2026-10-20).
    const rows = await this.prisma.drawing.findMany({
      where: { zone_id: zoneId, sub_zone_id: subZoneId },
      orderBy: [{ mark: 'asc' }, { rev: 'desc' }, { create_date: 'desc' }],
      ...(opts.currentOnly ? {} : { include: { uploaded_by: { select: { name: true } } } }),
    })
    // Current must be computed among .pdf rows only — a legacy .dwg row at a
    // higher rev (pre 2026-09-15 .pdf-only restriction) must not hide the
    // mark's still-current .pdf.
    return opts.currentOnly ? currentRevRows(rows.filter(isPdf)) : rows
  }

  // Customer gate must use the same signal as CustomerScopeInterceptor (DB
  // res_users.user_type), not the JWT's `role` claim — `role` is a free-text
  // department/"admin" string, never "customer".
  async isCustomerUser(userId: number): Promise<boolean> {
    const user = await this.prisma.res_users.findUnique({ where: { id: userId }, select: { user_type: true } })
    return user?.user_type === 'customer'
  }

  // Upload BATCH number (see CreateDrawingDto.version) — "what's the highest
  // batch number used so far for this zone(+sub-zone)", not a count, and not
  // the drawing revision (`rev`). Scoped per zone(+sub-zone) since
  // 2026-08-25's Zone rescope — mirrors bom-upload.service.ts's
  // getLatestRevision(projectId, zoneId, subZoneId). Always scoped to .pdf
  // (matched on file_name — there's no stored type column) even though
  // upload is .pdf-only now — legacy .dwg rows from before the 2026-09-15
  // removal still exist with their own, separate version numbers, and must
  // never leak into the counter new .pdf uploads read from. `version: { not:
  // null }` is required, not cosmetic: Postgres sorts NULLs FIRST in a DESC
  // order by default, so without this filter a NULL-version row would always
  // win `orderBy: { version: 'desc' }` over any real number.
  async getLatestVersion(zoneId: number, subZoneId: number | null) {
    const latest = await this.prisma.drawing.findFirst({
      where: {
        zone_id: zoneId, sub_zone_id: subZoneId,
        file_name: { endsWith: '.pdf', mode: 'insensitive' },
        version: { not: null },
      },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    return { version: latest?.version ?? null }
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
