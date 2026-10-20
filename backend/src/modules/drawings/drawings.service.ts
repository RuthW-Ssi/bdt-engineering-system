import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { FileStorageService } from '../file-storage/file-storage.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'
import { currentRevRows, isPdf } from './current-rev'
import { toA3Landscape, MAX_DRAWING_BYTES, MAX_DRAWING_PAGES, TooManyPagesError } from './a3-normalize'
import { buildExpectedFileKey } from './file-key'

// Fix round 1, extra item (security review, 2026-10-20): a literal '.' or
// '..' PATH SEGMENT survives buildExpectedFileKey's sanitisation (which only
// replaces '/' and '\') and the upload_key's own prefix check (a plain
// substring check, blind to path semantics) — this is the second, structural
// layer of defense against it, independent of the DTO's own @Matches guards
// on mark/file_name (create-drawing.dto.ts), for any caller that reaches
// DrawingsService.create() without going through that DTO pipeline.
function hasTraversalSegment(key: string): boolean {
  return key.split('/').some(seg => seg === '.' || seg === '..')
}

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
  // Task 11 fix round 1, finding 1 (2026-10-20): dto.upload_key is a
  // disposable STAGING key (drawings/_incoming/<project_code>/<uuid>/<file>,
  // written by src/api/drawings.ts's uploadDrawing) — never the real storage
  // key any more. The old design had the client upload straight to the FINAL
  // per-mark/rev key; a bad PDF re-uploaded under the SAME key as an existing
  // sheet destroyed that sheet, because the presigned PUT had already
  // overwritten the object before this method's own validation ran. Now:
  // validate ownership + the upload_key's project prefix, pull the staged
  // bytes, normalise them, build the REAL key server-side only once that all
  // succeeds, and write the final object — an existing drawing's object is
  // never touched until the new bytes are proven valid.
  async create(dto: CreateDrawingDto, uploadedById: number) {
    const { projectCode, zoneCode, subZoneCode } = await this.assertUploadKeyOwnership(dto)

    // Built and checked BEFORE touching storage at all (fail fast on a bad
    // mark/file_name) — see assertSafeFinalKey below.
    const finalKey = buildExpectedFileKey({ projectCode, zoneCode, subZoneCode }, dto.mark, dto.rev, dto.file_name)
    this.assertSafeFinalKey(finalKey, { projectCode, zoneCode, subZoneCode })

    // Size is checked from metadata BEFORE the bytes are read into memory —
    // the client-side 50 MB limit is not a server guarantee (signed PUT has no
    // content-length-range).
    const meta = await this.fileStorage.getMetadata(dto.upload_key)
    if (!meta) throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด')
    if (meta.size > MAX_DRAWING_BYTES) {
      await this.fileStorage.delete(dto.upload_key)
      throw new BadRequestException('ไฟล์ใหญ่เกิน 50 MB')
    }

    let original: Buffer
    try {
      original = await this.fileStorage.getObject(dto.upload_key)
    } catch {
      throw new BadRequestException('ไม่พบไฟล์ที่อัปโหลด')
    }

    let a3: Buffer
    try {
      a3 = await toA3Landscape(original)
    } catch (e) {
      await this.fileStorage.delete(dto.upload_key)
      if (e instanceof TooManyPagesError) throw new BadRequestException(`ไฟล์มี ${e.pages} หน้า เกิน ${MAX_DRAWING_PAGES} หน้า`)
      throw new BadRequestException('ไฟล์ PDF เสียหรือเปิดไม่ได้')
    }

    await this.fileStorage.putObject(finalKey, a3, 'application/pdf')
    await this.fileStorage.delete(dto.upload_key)

    const subZoneId = dto.sub_zone_id ?? null
    const same = await this.prisma.drawing.findMany({
      where: { zone_id: dto.zone_id, sub_zone_id: subZoneId, mark: dto.mark, rev: dto.rev, file_name: dto.file_name },
    })
    for (const old of same) {
      if (old.file_key !== finalKey) await this.fileStorage.delete(old.file_key)
      await this.prisma.drawing.delete({ where: { id: old.id } })
    }
    return this.prisma.drawing.create({
      data: {
        project_id: dto.project_id, zone_id: dto.zone_id, sub_zone_id: subZoneId,
        mark: dto.mark, rev: dto.rev, version: dto.version,
        file_key: finalKey, file_name: dto.file_name, mime_type: dto.mime_type,
        uploaded_by_id: uploadedById,
      },
    })
  }

  // Security review (2026-10-20), redesigned per fix round 1 finding 1: the
  // id cross-checks are unchanged (zone must belong to the claimed project,
  // sub-zone must belong to the claimed zone) — what's gone is the old exact
  // full-key match, since the client no longer supplies the final key at
  // all. What's left to check against the client-supplied upload_key is just
  // that its project-code prefix matches the claimed project (drawings/
  // _incoming/<project_code>/...), so one tenant can't stage-upload into
  // another's prefix and then claim a mismatched project/zone for it. The
  // real zone/sub-zone codes are returned for create() to build the final
  // key itself.
  private async assertUploadKeyOwnership(dto: CreateDrawingDto): Promise<{ projectCode: string; zoneCode: string; subZoneCode: string | null }> {
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

    const projectCode = zone.project.project_code
    if (!dto.upload_key.startsWith(`drawings/_incoming/${projectCode}/`)) throw mismatch()
    if (hasTraversalSegment(dto.upload_key)) throw mismatch()

    return { projectCode, zoneCode: zone.code, subZoneCode }
  }

  // Fix round 1, extra item: the server-built finalKey is deterministic from
  // trusted (DB-sourced) projectCode/zoneCode/subZoneCode plus dto.mark/rev/
  // file_name — the only way it could ever contain a '.'/'..' segment or
  // escape the expected project/zone(+sub-zone) prefix is a bad mark or
  // file_name slipping through (e.g. a caller that bypasses the DTO's own
  // @Matches guards). Checked before any storage call.
  private assertSafeFinalKey(finalKey: string, scope: { projectCode: string; zoneCode: string; subZoneCode: string | null }): void {
    const expectedPrefix = scope.subZoneCode
      ? `drawings/${scope.projectCode}/${scope.zoneCode}/${scope.subZoneCode}/`
      : `drawings/${scope.projectCode}/${scope.zoneCode}/`
    if (!finalKey.startsWith(expectedPrefix) || hasTraversalSegment(finalKey)) {
      throw new BadRequestException('file_key ไม่ตรงกับ project/zone/mark/rev')
    }
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
