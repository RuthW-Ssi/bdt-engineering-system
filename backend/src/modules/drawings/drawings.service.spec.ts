import { BadRequestException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { DrawingsService } from './drawings.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'
import { toA3Landscape } from './a3-normalize'

// The helper's actual PDF transform (scale/centre/rotate) is exercised with
// real pdf-lib in a3-normalize.spec.ts — here only the service's ORCHESTRATION
// around it is under test (call order, error → delete + 400), so the helper
// itself is mocked.
jest.mock('./a3-normalize')
const mockToA3Landscape = toA3Landscape as jest.MockedFunction<typeof toA3Landscape>

// Defaults line up with every pre-existing create() test's literal file_key
// ('drawings/0X220/Z1/[SZ1/]<mark>/rev<rev>/<file_name>', project_id 42,
// zone_id 7, sub_zone_id 3) so the new file_key↔project/zone binding check
// (security review, 2026-10-20) passes for them without touching their
// bodies. `zone`/`subZone`/`projectCode` can be overridden per test to
// exercise the mismatch paths.
function makePrisma(opts: {
  drawings?: { id: number; file_key: string }[]
  same?: any[]
  zone?: { id: number; project_id: number; code: string } | null
  subZone?: { id: number; zone_id: number; code: string | null } | null
  projectCode?: string
} = {}) {
  const drawings = opts.drawings ?? []
  const same = opts.same ?? []
  const zone = opts.zone === undefined ? { id: 7, project_id: 42, code: 'Z1' } : opts.zone
  const subZone = opts.subZone === undefined ? { id: 3, zone_id: 7, code: 'SZ1' } : opts.subZone
  const projectCode = opts.projectCode ?? '0X220'
  return {
    drawing: {
      create: jest.fn((args: any) => Promise.resolve({ id: 999, ...args.data })),
      findMany: jest.fn(() => Promise.resolve(same)),
      findFirst: jest.fn(),
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(drawings.find(d => d.id === where.id) ?? null),
      ),
      delete: jest.fn(({ where }: any) =>
        Promise.resolve(
          drawings.find(d => d.id === where.id) ?? same.find((d: any) => d.id === where.id),
        ),
      ),
    },
    project_zone: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          zone && zone.id === where.id && zone.project_id === where.project_id
            ? { code: zone.code, project: { project_code: projectCode } }
            : null,
        ),
      ),
    },
    sub_zone: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          subZone && subZone.id === where.id && subZone.zone_id === where.zone_id
            ? { code: subZone.code }
            : null,
        ),
      ),
    },
  }
}

function makeFileStorage() {
  return {
    delete: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockResolvedValue(Buffer.from('original-bytes')),
    getMetadata: jest.fn().mockResolvedValue({ size: 1234, contentType: 'application/pdf' }),
    putObject: jest.fn().mockResolvedValue(undefined),
  }
}

describe('DrawingsService', () => {
  describe('remove', () => {
    it('deletes the underlying file before deleting the DB row', async () => {
      const drawings = [{ id: 1, file_key: 'drawings/0X220/Z1/B1/rev1/plan-A.pdf' }]
      const prisma = makePrisma({ drawings })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)

      await svc.remove(1)

      expect(fileStorage.delete).toHaveBeenCalledWith('drawings/0X220/Z1/B1/rev1/plan-A.pdf')
      expect(prisma.drawing.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    })

    it('throws NotFoundException for a non-existent id and never touches the file or row', async () => {
      const prisma = makePrisma({ drawings: [] })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)

      await expect(svc.remove(999)).rejects.toThrow(NotFoundException)
      expect(fileStorage.delete).not.toHaveBeenCalled()
      expect(prisma.drawing.delete).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    const UPLOAD_KEY = 'drawings/_incoming/0X220/11111111-1111-1111-1111-111111111111/x.pdf'
    const UPLOAD_KEY_SZ = 'drawings/_incoming/0X220/22222222-2222-2222-2222-222222222222/x.pdf'

    beforeEach(() => {
      mockToA3Landscape.mockReset().mockResolvedValue(Buffer.from('a3-normalised-bytes'))
    })

    // Fix round 1, finding 1 (2026-10-20): the client no longer supplies the
    // final storage key — it stages the upload at drawings/_incoming/
    // <project_code>/<uuid>/<file_name> (src/api/drawings.ts's uploadDrawing)
    // and the server builds the real key itself once the upload is proven
    // valid. What's left to check up front is the id cross-checks (zone
    // belongs to the claimed project, sub-zone belongs to the claimed zone)
    // plus the upload_key's project-code prefix — never a full-key exact
    // match, since there's no client-supplied final key to compare any more.
    describe('upload_key ownership + prefix (security)', () => {
      const dto = {
        project_id: 42,
        zone_id: 7,
        mark: 'B1',
        rev: 1,
        version: 1,
        upload_key: UPLOAD_KEY,
        file_name: 'x.pdf',
      }

      it('an upload_key under another project\'s prefix → 400, no storage call', async () => {
        const prisma = makePrisma({ same: [] }) // default zone 7∈project 42, code Z1, projectCode 0X220
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const err = await svc.create({ ...dto, upload_key: 'drawings/_incoming/OTHER-PROJECT/11111111-1111-1111-1111-111111111111/x.pdf' } as any, 9).catch(e => e)

        expect(err).toBeInstanceOf(BadRequestException)
        expect(err.message).toBe('file_key ไม่ตรงกับ project/zone/mark/rev')
        expect(fileStorage.getObject).not.toHaveBeenCalled()
        expect(fileStorage.putObject).not.toHaveBeenCalled()
        expect(fileStorage.delete).not.toHaveBeenCalled()
        expect(prisma.drawing.findMany).not.toHaveBeenCalled()
      })

      it('a zone that does not belong to dto.project_id → 400, no storage call', async () => {
        // The real zone 7 belongs to project 42 — a caller claiming project 99 gets no match.
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const err = await svc.create({ ...dto, project_id: 99 } as any, 9).catch(e => e)

        expect(err).toBeInstanceOf(BadRequestException)
        expect(err.message).toBe('file_key ไม่ตรงกับ project/zone/mark/rev')
        expect(fileStorage.getObject).not.toHaveBeenCalled()
        expect(prisma.drawing.findMany).not.toHaveBeenCalled()
      })

      it('a sub_zone_id that does not belong to dto.zone_id → 400, no storage call', async () => {
        // The real sub_zone 3 belongs to zone 999, not zone 7 — findFirst({ id: 3, zone_id: 7 }) matches nothing.
        const prisma = makePrisma({ same: [], subZone: { id: 3, zone_id: 999, code: 'SZ1' } })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const err = await svc.create({ ...dto, zone_id: 7, sub_zone_id: 3, upload_key: UPLOAD_KEY_SZ } as any, 9).catch(e => e)

        expect(err).toBeInstanceOf(BadRequestException)
        expect(fileStorage.getObject).not.toHaveBeenCalled()
      })

      it('an upload over 50 MB (server-side metadata) → 400, staging object deleted, bytes never read', async () => {
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        fileStorage.getMetadata.mockResolvedValue({ size: 50_000_001, contentType: 'application/pdf' })
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const err = await svc.create(dto as any, 9).catch(e => e)

        expect(err).toBeInstanceOf(BadRequestException)
        expect(err.message).toBe('ไฟล์ใหญ่เกิน 50 MB')
        expect(fileStorage.getObject).not.toHaveBeenCalled()
        expect(fileStorage.delete).toHaveBeenCalledWith(UPLOAD_KEY)
        expect(prisma.drawing.create).not.toHaveBeenCalled()
      })

      it('a missing staged object (no metadata) → 400 ไม่พบไฟล์ที่อัปโหลด', async () => {
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        fileStorage.getMetadata.mockResolvedValue(null)
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const err = await svc.create(dto as any, 9).catch(e => e)

        expect(err).toBeInstanceOf(BadRequestException)
        expect(err.message).toBe('ไม่พบไฟล์ที่อัปโหลด')
        expect(fileStorage.getObject).not.toHaveBeenCalled()
      })

      it('a correctly-bound upload_key proceeds: writes the final key and deletes the upload_key', async () => {
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const result = await svc.create(dto as any, 9)

        expect(fileStorage.getObject).toHaveBeenCalledWith(UPLOAD_KEY)
        expect(fileStorage.putObject).toHaveBeenCalledWith('drawings/0X220/Z1/B1/rev1/x.pdf', expect.any(Buffer), 'application/pdf')
        expect(fileStorage.delete).toHaveBeenCalledWith(UPLOAD_KEY)
        expect(prisma.drawing.create).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf' }),
        }))
        expect(result).toBeDefined()
      })

      it('the same check applies with a sub-zone in play: a correctly-bound sub-zone upload_key proceeds', async () => {
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        await svc.create({ ...dto, sub_zone_id: 3, upload_key: UPLOAD_KEY_SZ } as any, 9)

        expect(fileStorage.putObject).toHaveBeenCalledWith('drawings/0X220/Z1/SZ1/B1/rev1/x.pdf', expect.any(Buffer), 'application/pdf')
      })

      // Fix round 1, extra item: defense-in-depth — the DTO's own @Matches
      // guards (create-drawing.dto.ts) already reject these at the HTTP
      // boundary; these tests call the service directly (bypassing the DTO
      // pipeline with `as any`, as a future non-HTTP caller might) to prove
      // the service itself refuses to build/use a traversal key too.
      it('mark ".." (bypassing DTO validation) → 400 before any storage write, even though upload_key/zone/project are otherwise valid', async () => {
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const err = await svc.create({ ...dto, mark: '..' } as any, 9).catch(e => e)

        expect(err).toBeInstanceOf(BadRequestException)
        expect(fileStorage.getObject).not.toHaveBeenCalled()
        expect(fileStorage.putObject).not.toHaveBeenCalled()
        expect(prisma.drawing.findMany).not.toHaveBeenCalled()
      })

      // Note: the service-level guard (assertSafeFinalKey) checks for an
      // EXACT '.'/'..' path segment, same as the ruling's own snippet — a
      // "..pdf"-shaped name (not an exact ".." segment) is only rejected by
      // the DTO's own stricter "no leading dot" rule, covered above in
      // 'CreateDrawingDto validation (mark/file_name traversal guard)'; here
      // at the service layer a literal ".." file_name is the true bypass case.
      it('file_name ".." (bypassing DTO validation) → 400 before any storage write', async () => {
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const err = await svc.create({ ...dto, file_name: '..' } as any, 9).catch(e => e)

        expect(err).toBeInstanceOf(BadRequestException)
        expect(fileStorage.getObject).not.toHaveBeenCalled()
        expect(fileStorage.putObject).not.toHaveBeenCalled()
      })

      it('an upload_key containing a ".." path segment (bypassing DTO validation) → 400, no storage call', async () => {
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const err = await svc.create({ ...dto, upload_key: 'drawings/_incoming/0X220/../11111111-1111-1111-1111-111111111111/x.pdf' } as any, 9).catch(e => e)

        expect(err).toBeInstanceOf(BadRequestException)
        expect(fileStorage.getObject).not.toHaveBeenCalled()
      })
    })

    // Task 11: every upload is normalised to A3 landscape BEFORE the
    // same-sheet replace logic runs, so a bad PDF never deletes an existing
    // row. getObject(upload_key) → toA3Landscape → putObject(finalKey) →
    // delete(upload_key) must all happen before the same-sheet findMany
    // lookup / drawing.create.
    it('normalises the uploaded PDF to A3 before the same-sheet lookup and the DB write: getObject(upload_key) → toA3Landscape → putObject(finalKey) → delete(upload_key) → findMany → create', async () => {
      const same: any[] = []
      const prisma = makePrisma({ same })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)
      const order: string[] = []
      fileStorage.getObject.mockImplementation(() => { order.push('getObject'); return Promise.resolve(Buffer.from('orig')) })
      mockToA3Landscape.mockImplementation(() => { order.push('toA3Landscape'); return Promise.resolve(Buffer.from('a3')) })
      fileStorage.putObject.mockImplementation(() => { order.push('putObject'); return Promise.resolve(undefined) })
      fileStorage.delete.mockImplementation(() => { order.push('delete(upload_key)'); return Promise.resolve(undefined) })
      prisma.drawing.findMany.mockImplementation(() => { order.push('findMany'); return Promise.resolve(same) })
      prisma.drawing.create.mockImplementation((args: any) => { order.push('create'); return Promise.resolve({ id: 999, ...args.data }) })

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
          version: 1,
          upload_key: UPLOAD_KEY,
          file_name: 'x.pdf',
        } as any,
        9,
      )

      expect(fileStorage.getObject).toHaveBeenCalledWith(UPLOAD_KEY)
      expect(mockToA3Landscape).toHaveBeenCalledWith(Buffer.from('orig'))
      expect(fileStorage.putObject).toHaveBeenCalledWith('drawings/0X220/Z1/B1/rev1/x.pdf', Buffer.from('a3'), 'application/pdf')
      expect(fileStorage.delete).toHaveBeenCalledWith(UPLOAD_KEY)
      expect(order).toEqual(['getObject', 'toA3Landscape', 'putObject', 'delete(upload_key)', 'findMany', 'create'])
    })

    it('getObject(upload_key) missing (e.g. already consumed, or never uploaded) → 400 "ไม่พบไฟล์ที่อัปโหลด", no row written', async () => {
      const prisma = makePrisma({ same: [] })
      const fileStorage = makeFileStorage()
      fileStorage.getObject.mockRejectedValue(new Error('ENOENT'))
      const svc = new DrawingsService(prisma as any, fileStorage as any)

      const err = await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
          version: 1,
          upload_key: UPLOAD_KEY,
          file_name: 'x.pdf',
        } as any,
        9,
      ).catch(e => e)

      expect(err).toBeInstanceOf(BadRequestException)
      expect(err.message).toBe('ไม่พบไฟล์ที่อัปโหลด')
      expect(mockToA3Landscape).not.toHaveBeenCalled()
      expect(fileStorage.putObject).not.toHaveBeenCalled()
      expect(prisma.drawing.findMany).not.toHaveBeenCalled()
      expect(prisma.drawing.create).not.toHaveBeenCalled()
    })

    // THE motivating bug fix for finding 1: a bad PDF re-upload must not
    // touch an EXISTING same-name sheet's row or object — only the disposable
    // staging object is deleted.
    it('a bad/corrupt PDF, with an existing same-name sheet already on file: the existing row and object are untouched, only the upload_key is deleted, 400', async () => {
      const same = [{ id: 11, file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf' }] // the EXISTING sheet, same final key the new upload would get
      const prisma = makePrisma({ same })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)
      mockToA3Landscape.mockRejectedValue(new Error('invalid pdf'))

      const err = await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
          version: 1,
          upload_key: UPLOAD_KEY,
          file_name: 'x.pdf',
        } as any,
        9,
      ).catch(e => e)

      expect(err).toBeInstanceOf(BadRequestException)
      expect(err.message).toBe('ไฟล์ PDF เสียหรือเปิดไม่ได้')

      // Only the staging object was ever touched.
      expect(fileStorage.delete).toHaveBeenCalledTimes(1)
      expect(fileStorage.delete).toHaveBeenCalledWith(UPLOAD_KEY)
      expect(fileStorage.delete).not.toHaveBeenCalledWith('drawings/0X220/Z1/B1/rev1/x.pdf')
      expect(fileStorage.putObject).not.toHaveBeenCalled()
      // The existing row was never looked up, let alone deleted or replaced.
      expect(prisma.drawing.findMany).not.toHaveBeenCalled()
      expect(prisma.drawing.delete).not.toHaveBeenCalled()
      expect(prisma.drawing.create).not.toHaveBeenCalled()
    })

    it('stores mark/rev/version and stamps uploaded_by_id, defaulting sub_zone_id to null when omitted', async () => {
      const prisma = makePrisma({ same: [] })
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
          version: 3,
          upload_key: UPLOAD_KEY,
          file_name: 'x.pdf',
          mime_type: 'application/pdf',
        } as any,
        9,
      )

      expect(prisma.drawing.create).toHaveBeenCalledWith({
        data: {
          project_id: 42,
          zone_id: 7,
          sub_zone_id: null,
          mark: 'B1',
          rev: 1,
          version: 3,
          file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf',
          file_name: 'x.pdf',
          mime_type: 'application/pdf',
          uploaded_by_id: 9,
        },
      })
    })

    it('persists sub_zone_id when provided', async () => {
      const prisma = makePrisma({ same: [] })
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          sub_zone_id: 3,
          mark: 'B1',
          rev: 1,
          upload_key: UPLOAD_KEY_SZ,
          file_name: 'x.pdf',
          mime_type: 'application/pdf',
        } as any,
        9,
      )

      expect(prisma.drawing.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ zone_id: 7, sub_zone_id: 3 }),
      }))
    })

    it('looks up existing rows by zone/sub/mark/rev/file_name (same-sheet re-upload)', async () => {
      const prisma = makePrisma({ same: [] })
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          sub_zone_id: 3,
          mark: 'B1',
          rev: 1,
          upload_key: UPLOAD_KEY_SZ,
          file_name: 'x.pdf',
        } as any,
        9,
      )

      expect(prisma.drawing.findMany).toHaveBeenCalledWith({
        where: { zone_id: 7, sub_zone_id: 3, mark: 'B1', rev: 1, file_name: 'x.pdf' },
      })
    })

    it('replaces an existing same-sheet row: deletes the old DB row and calls fileStorage.delete when the key changed', async () => {
      const same = [{ id: 11, file_key: 'drawings/0X220/Z1/B1/v1/x.pdf' }] // legacy key shape, differs from the new finalKey
      const prisma = makePrisma({ same })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
          upload_key: UPLOAD_KEY,
          file_name: 'x.pdf',
        } as any,
        9,
      )

      expect(fileStorage.delete).toHaveBeenCalledWith('drawings/0X220/Z1/B1/v1/x.pdf')
      expect(prisma.drawing.delete).toHaveBeenCalledWith({ where: { id: 11 } })
    })

    it('does NOT call fileStorage.delete on the final key when the old row already has that same file_key (the server just wrote it)', async () => {
      const same = [{ id: 11, file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf' }] // same as the new finalKey
      const prisma = makePrisma({ same })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
          upload_key: UPLOAD_KEY,
          file_name: 'x.pdf',
        } as any,
        9,
      )

      expect(fileStorage.delete).not.toHaveBeenCalledWith('drawings/0X220/Z1/B1/rev1/x.pdf')
      expect(prisma.drawing.delete).toHaveBeenCalledWith({ where: { id: 11 } })
    })
  })

  describe('findByZone', () => {
    it('scopes strictly to zone_id + sub_zone_id (null sub_zone_id is its own bucket) ordered mark asc, rev desc, create_date desc, including the uploader name for a staff caller', async () => {
      const prisma = makePrisma()
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.findByZone(7, null)

      expect(prisma.drawing.findMany).toHaveBeenCalledWith({
        where: { zone_id: 7, sub_zone_id: null },
        orderBy: [{ mark: 'asc' }, { rev: 'desc' }, { create_date: 'desc' }],
        include: { uploaded_by: { select: { name: true } } },
      })
    })

    // Security review: staff names are internal — a customer caller
    // (currentOnly: true, the exact signal the controller derives from
    // isCustomerUser) must never receive the uploaded_by join at all, not
    // just have it stripped client-side. Mirrors documents.service.ts's
    // CUSTOMER_SELECT.
    it('omits the uploaded_by join entirely for a customer caller (currentOnly: true)', async () => {
      const prisma = { drawing: { findMany: jest.fn().mockResolvedValue([]) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.findByZone(7, null, { currentOnly: true })

      expect(prisma.drawing.findMany).toHaveBeenCalledWith({
        where: { zone_id: 7, sub_zone_id: null },
        orderBy: [{ mark: 'asc' }, { rev: 'desc' }, { create_date: 'desc' }],
      })
      expect(prisma.drawing.findMany.mock.calls[0][0].include).toBeUndefined()
    })

    it('returns every row unfiltered when currentOnly is omitted/false', async () => {
      const rows = [
        { id: 1, mark: 'A', rev: 0, file_name: 'a.pdf' },
        { id: 2, mark: 'A', rev: 1, file_name: 'a.pdf' },
      ]
      const prisma = { drawing: { findMany: jest.fn().mockResolvedValue(rows) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      const result = await svc.findByZone(7, null)

      expect(result).toEqual(rows)
    })

    it('returns only current-rev rows when currentOnly is true', async () => {
      const rows = [
        { id: 1, mark: 'A', rev: 0, file_name: 'a.pdf' },
        { id: 2, mark: 'A', rev: 1, file_name: 'a.pdf' },
        { id: 3, mark: 'B', rev: 2, file_name: 'b.pdf' },
      ]
      const prisma = { drawing: { findMany: jest.fn().mockResolvedValue(rows) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      const result = await svc.findByZone(7, null, { currentOnly: true })

      expect(result).toEqual([rows[1], rows[2]])
    })

    // Review focus #2/#5 (global-constraints.md): a legacy .dwg row at a
    // higher rev must not hide the still-current .pdf — current must be
    // computed among .pdf rows only.
    it('computes the current rev among .pdf rows only — a legacy .dwg at a higher rev must not hide the PDF', async () => {
      const rows = [
        { id: 1, mark: 'A', rev: 2, file_name: 'A - BEAM - Rev 2.dwg' },
        { id: 2, mark: 'A', rev: 1, file_name: 'A - BEAM - Rev 1.pdf' },
      ]
      const prisma = { drawing: { findMany: jest.fn().mockResolvedValue(rows) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      const result = await svc.findByZone(7, null, { currentOnly: true })

      expect(result).toEqual([rows[1]])
    })
  })

  describe('isCustomerUser', () => {
    it('returns true when the DB user_type is customer', async () => {
      const prisma = { res_users: { findUnique: jest.fn().mockResolvedValue({ user_type: 'customer' }) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await expect(svc.isCustomerUser(9)).resolves.toBe(true)
      expect(prisma.res_users.findUnique).toHaveBeenCalledWith({ where: { id: 9 }, select: { user_type: true } })
    })

    it('returns false for an employee user_type', async () => {
      const prisma = { res_users: { findUnique: jest.fn().mockResolvedValue({ user_type: 'employee' }) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await expect(svc.isCustomerUser(9)).resolves.toBe(false)
    })

    it('returns false when the user is not found', async () => {
      const prisma = { res_users: { findUnique: jest.fn().mockResolvedValue(null) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await expect(svc.isCustomerUser(9)).resolves.toBe(false)
    })
  })

  describe('bomMarks', () => {
    it('queries ACTIVE bom_assembly rows filtered to the dispatch zone and returns the distinct marks', async () => {
      const prisma = {
        bom_assembly: {
          findMany: jest.fn().mockResolvedValue([{ assembly_mark: 'A' }, { assembly_mark: 'B' }]),
        },
      }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      const result = await svc.bomMarks(7, null)

      expect(prisma.bom_assembly.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', dispatch: { zone_id: 7 } },
        select: { assembly_mark: true },
        distinct: ['assembly_mark'],
      })
      expect(result).toEqual(['A', 'B'])
    })

    it('adds sub_zone_id to the dispatch filter when a sub-zone is given', async () => {
      const prisma = { bom_assembly: { findMany: jest.fn().mockResolvedValue([]) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.bomMarks(7, 3)

      expect(prisma.bom_assembly.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', dispatch: { zone_id: 7, sub_zone_id: 3 } },
        select: { assembly_mark: true },
        distinct: ['assembly_mark'],
      })
    })
  })

  // Upload BATCH number (CreateDrawingDto.version) — reversed from the
  // earlier "drop version" plan; per-mark `rev` is unaffected, this is a
  // separate, zone(+sub-zone)-scoped counter restored exactly as it worked
  // pre-branch.
  describe('getLatestVersion', () => {
    it('returns the highest version among this zone(+sub-zone)\'s .pdf rows, ignoring NULL versions', async () => {
      const prisma = { drawing: { findFirst: jest.fn().mockResolvedValue({ version: 5 }) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      const result = await svc.getLatestVersion(7, null)

      expect(prisma.drawing.findFirst).toHaveBeenCalledWith({
        where: {
          zone_id: 7, sub_zone_id: null,
          file_name: { endsWith: '.pdf', mode: 'insensitive' },
          version: { not: null },
        },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      expect(result).toEqual({ version: 5 })
    })

    it('scopes to the given sub-zone', async () => {
      const prisma = { drawing: { findFirst: jest.fn().mockResolvedValue({ version: 2 }) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.getLatestVersion(7, 3)

      expect(prisma.drawing.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ zone_id: 7, sub_zone_id: 3 }) }),
      )
    })

    it('returns null when there is no .pdf row yet for this zone(+sub-zone)', async () => {
      const prisma = { drawing: { findFirst: jest.fn().mockResolvedValue(null) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      const result = await svc.getLatestVersion(7, null)

      expect(result).toEqual({ version: null })
    })
  })
})

describe('CreateDrawingDto validation (version — upload batch number)', () => {
  const base = { project_id: 42, zone_id: 7, mark: 'B1', rev: 1, file_name: 'x.pdf', upload_key: 'drawings/_incoming/0X220/11111111-1111-1111-1111-111111111111/x.pdf', mime_type: 'application/pdf' }

  it('accepts a positive integer version', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, version: 1 })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'version')).toBe(false)
  })

  it('rejects a missing version', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'version')).toBe(true)
  })

  it('rejects version 0 (must be >= 1)', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, version: 0 })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'version')).toBe(true)
  })

  it('rejects a non-integer version', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, version: 1.5 })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'version')).toBe(true)
  })
})

// Fix round 1, finding 1: the DTO field is now upload_key (a disposable
// staging key), not the final per-mark/rev storage key — see
// drawings.service.ts's create() comment.
describe('CreateDrawingDto validation (upload_key shape guard)', () => {
  const base = { project_id: 42, zone_id: 7, mark: 'B1', rev: 1, version: 1, file_name: 'x.pdf', mime_type: 'application/pdf' }

  it('rejects an upload_key that escapes the drawings/_incoming/ prefix via traversal', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, upload_key: '../../../etc/passwd' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'upload_key')).toBe(true)
  })

  it('rejects the old final-key shape (drawings/<project_code>/<zone_code>/.../rev<n>/<name>) — upload_key must be a staging key, not the final one', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, upload_key: 'drawings/0X220/Z1/B1/rev1/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'upload_key')).toBe(true)
  })

  it('rejects a malformed (non-UUID-shaped) staging id', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, upload_key: 'drawings/_incoming/0X220/not-a-uuid/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'upload_key')).toBe(true)
  })

  it('accepts drawings/_incoming/<project_code>/<uuid>/<name>', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, upload_key: 'drawings/_incoming/0X220/550e8400-e29b-41d4-a716-446655440000/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'upload_key')).toBe(false)
  })
})

// .pdf-only as of 2026-09-15 (see drawings.service.ts's create() comment) —
// server-side enforcement, not just the upload modal's dropzone restriction,
// so a direct API call can't slip a .dwg (or anything else) past the UI.
describe('CreateDrawingDto validation (.pdf-only)', () => {
  const base = { project_id: 42, zone_id: 7, mark: 'B1', rev: 1, mime_type: 'application/pdf' }

  it('accepts a .pdf file_name', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_name: 'plan-A.pdf', upload_key: 'drawings/_incoming/0X220/11111111-1111-1111-1111-111111111111/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(false)
  })

  it('is case-insensitive (.PDF also accepted)', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_name: 'plan-A.PDF', upload_key: 'drawings/_incoming/0X220/11111111-1111-1111-1111-111111111111/plan-A.PDF' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(false)
  })

  it('rejects a .dwg file_name', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_name: 'plan-A.dwg', upload_key: 'drawings/_incoming/0X220/11111111-1111-1111-1111-111111111111/plan-A.dwg' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(true)
  })

  it('rejects a file_name with no extension at all', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_name: 'plan-A', upload_key: 'drawings/_incoming/0X220/11111111-1111-1111-1111-111111111111/plan-A' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(true)
  })
})

// Fix round 1, extra item (security review, controller ruling): sanitising
// only '/' and '\' in mark/file_name (buildExpectedFileKey, file-key.ts)
// doesn't stop a literal '.' or '..' PATH SEGMENT — those contain neither
// character, so they survive sanitisation unchanged and the resulting key
// (e.g. mark='..' with no sub-zone → drawings/<project>/<zone>/../rev1/<file>)
// path-resolves up a directory on any consumer that normalises paths (the
// local file-storage driver's path.join does exactly this).
describe('CreateDrawingDto validation (mark/file_name traversal guard)', () => {
  const base = { project_id: 42, zone_id: 7, rev: 1, version: 1, mime_type: 'application/pdf', upload_key: 'drawings/_incoming/0X220/11111111-1111-1111-1111-111111111111/x.pdf' }

  it('rejects mark "."', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, mark: '.', file_name: 'x.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'mark')).toBe(true)
  })

  it('rejects mark ".."', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, mark: '..', file_name: 'x.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'mark')).toBe(true)
  })

  it('still accepts an ordinary mark', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, mark: '2BUH1A-1', file_name: 'x.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'mark')).toBe(false)
  })

  it('rejects a "..pdf"-style file_name (starts with a dot)', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, mark: 'B1', file_name: '..pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(true)
  })

  it('still accepts an ordinary file_name', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, mark: 'B1', file_name: 'plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(false)
  })
})
