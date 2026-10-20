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
    beforeEach(() => {
      mockToA3Landscape.mockReset().mockResolvedValue(Buffer.from('a3-normalised-bytes'))
    })

    // Security review, 2026-10-20: create() reads/overwrites/deletes the
    // object at a CLIENT-supplied dto.file_key — the DTO regex only checks
    // its shape, not that it actually belongs to this project/zone/mark/rev,
    // so an authenticated user could otherwise point it at another project's
    // drawing. The expected key is rebuilt server-side from validated
    // project/zone/sub-zone ownership and compared BEFORE any storage call.
    describe('file_key binding (security)', () => {
      const dto = {
        project_id: 42,
        zone_id: 7,
        mark: 'B1',
        rev: 1,
        version: 1,
        file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf',
        file_name: 'x.pdf',
      }

      it('a file_key that does not match the rebuilt project/zone/mark/rev key → 400, no storage call', async () => {
        const prisma = makePrisma({ same: [] }) // default zone 7∈project 42, code Z1 — matches everything except file_key below
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        await expect(
          svc.create({ ...dto, file_key: 'drawings/0X220/Z1/SOMEONE-ELSES-MARK/rev1/x.pdf' } as any, 9),
        ).rejects.toThrow(BadRequestException)
        await expect(
          svc.create({ ...dto, file_key: 'drawings/0X220/Z1/SOMEONE-ELSES-MARK/rev1/x.pdf' } as any, 9),
        ).rejects.toThrow('file_key ไม่ตรงกับ project/zone/mark/rev')

        expect(fileStorage.getObject).not.toHaveBeenCalled()
        expect(fileStorage.putObject).not.toHaveBeenCalled()
        expect(fileStorage.delete).not.toHaveBeenCalled()
        expect(prisma.drawing.findMany).not.toHaveBeenCalled()
        expect(prisma.drawing.create).not.toHaveBeenCalled()
      })

      it('a zone that does not belong to dto.project_id → 400, no storage call', async () => {
        // The real zone 7 belongs to project 42 — a caller claiming project 99 gets no match.
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        await expect(svc.create({ ...dto, project_id: 99 } as any, 9)).rejects.toThrow(BadRequestException)
        await expect(svc.create({ ...dto, project_id: 99 } as any, 9)).rejects.toThrow('file_key ไม่ตรงกับ project/zone/mark/rev')

        expect(fileStorage.getObject).not.toHaveBeenCalled()
        expect(prisma.drawing.findMany).not.toHaveBeenCalled()
      })

      it('a sub_zone_id that does not belong to dto.zone_id → 400, no storage call', async () => {
        // The real sub_zone 3 belongs to zone 999, not zone 7 — findFirst({ id: 3, zone_id: 7 }) matches nothing.
        const prisma = makePrisma({ same: [], subZone: { id: 3, zone_id: 999, code: 'SZ1' } })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        await expect(
          svc.create({ ...dto, zone_id: 7, sub_zone_id: 3, file_key: 'drawings/0X220/Z1/SZ1/B1/rev1/x.pdf' } as any, 9),
        ).rejects.toThrow(BadRequestException)
        expect(fileStorage.getObject).not.toHaveBeenCalled()
      })

      it('a correctly-bound file_key proceeds: getObject IS called and the row is created', async () => {
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        const result = await svc.create(dto as any, 9)

        expect(fileStorage.getObject).toHaveBeenCalledWith(dto.file_key)
        expect(prisma.drawing.create).toHaveBeenCalled()
        expect(result).toBeDefined()
      })

      it('the same check applies with a sub-zone in play: a correctly-bound sub-zone key proceeds', async () => {
        const prisma = makePrisma({ same: [] })
        const fileStorage = makeFileStorage()
        const svc = new DrawingsService(prisma as any, fileStorage as any)

        await expect(
          svc.create({ ...dto, sub_zone_id: 3, file_key: 'drawings/0X220/Z1/SZ1/B1/rev1/x.pdf' } as any, 9),
        ).resolves.toBeDefined()
      })
    })

    // Task 11: every upload is normalised to A3 landscape BEFORE the
    // same-sheet replace logic runs, so a bad PDF never deletes an existing
    // row. getObject → toA3Landscape → putObject (same key) must all happen
    // before drawing.create, and before the same-sheet findMany lookup.
    it('normalises the uploaded PDF to A3 before the same-sheet lookup and the DB write: getObject → toA3Landscape → putObject (same key) → create', async () => {
      const same: any[] = []
      const prisma = makePrisma({ same })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)
      const order: string[] = []
      fileStorage.getObject.mockImplementation(() => { order.push('getObject'); return Promise.resolve(Buffer.from('orig')) })
      mockToA3Landscape.mockImplementation(() => { order.push('toA3Landscape'); return Promise.resolve(Buffer.from('a3')) })
      fileStorage.putObject.mockImplementation(() => { order.push('putObject'); return Promise.resolve(undefined) })
      prisma.drawing.findMany.mockImplementation(() => { order.push('findMany'); return Promise.resolve(same) })
      prisma.drawing.create.mockImplementation((args: any) => { order.push('create'); return Promise.resolve({ id: 999, ...args.data }) })

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
          version: 1,
          file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf',
          file_name: 'x.pdf',
        } as any,
        9,
      )

      expect(fileStorage.getObject).toHaveBeenCalledWith('drawings/0X220/Z1/B1/rev1/x.pdf')
      expect(mockToA3Landscape).toHaveBeenCalledWith(Buffer.from('orig'))
      expect(fileStorage.putObject).toHaveBeenCalledWith('drawings/0X220/Z1/B1/rev1/x.pdf', Buffer.from('a3'), 'application/pdf')
      expect(order).toEqual(['getObject', 'toA3Landscape', 'putObject', 'findMany', 'create'])
    })

    it('on a bad/corrupt PDF: deletes the uploaded object, writes no row, and throws BadRequestException("ไฟล์ PDF เสียหรือเปิดไม่ได้")', async () => {
      const prisma = makePrisma({ same: [] })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)
      mockToA3Landscape.mockRejectedValue(new Error('invalid pdf'))

      await expect(
        svc.create(
          {
            project_id: 42,
            zone_id: 7,
            mark: 'B1',
            rev: 1,
            version: 1,
            file_key: 'drawings/0X220/Z1/B1/rev1/bad.pdf',
            file_name: 'bad.pdf',
          } as any,
          9,
        ),
      ).rejects.toThrow(BadRequestException)

      await expect(
        svc.create(
          {
            project_id: 42,
            zone_id: 7,
            mark: 'B1',
            rev: 1,
            version: 1,
            file_key: 'drawings/0X220/Z1/B1/rev1/bad.pdf',
            file_name: 'bad.pdf',
          } as any,
          9,
        ),
      ).rejects.toThrow('ไฟล์ PDF เสียหรือเปิดไม่ได้')

      expect(fileStorage.delete).toHaveBeenCalledWith('drawings/0X220/Z1/B1/rev1/bad.pdf')
      expect(fileStorage.putObject).not.toHaveBeenCalled()
      expect(prisma.drawing.findMany).not.toHaveBeenCalled()
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
          file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf',
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
          file_key: 'drawings/0X220/Z1/SZ1/B1/rev1/x.pdf',
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
          file_key: 'drawings/0X220/Z1/SZ1/B1/rev1/x.pdf',
          file_name: 'x.pdf',
        } as any,
        9,
      )

      expect(prisma.drawing.findMany).toHaveBeenCalledWith({
        where: { zone_id: 7, sub_zone_id: 3, mark: 'B1', rev: 1, file_name: 'x.pdf' },
      })
    })

    it('replaces an existing same-sheet row: deletes the old DB row and calls fileStorage.delete when the key changed', async () => {
      const same = [{ id: 11, file_key: 'drawings/0X220/Z1/B1/v1/x.pdf' }]
      const prisma = makePrisma({ same })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
          file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf',
          file_name: 'x.pdf',
        } as any,
        9,
      )

      expect(fileStorage.delete).toHaveBeenCalledWith('drawings/0X220/Z1/B1/v1/x.pdf')
      expect(prisma.drawing.delete).toHaveBeenCalledWith({ where: { id: 11 } })
    })

    it('does NOT call fileStorage.delete when the old row already has the same file_key (upload already overwrote the object)', async () => {
      const same = [{ id: 11, file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf' }]
      const prisma = makePrisma({ same })
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
          file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf',
          file_name: 'x.pdf',
        } as any,
        9,
      )

      expect(fileStorage.delete).not.toHaveBeenCalled()
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
  const base = { project_id: 42, zone_id: 7, mark: 'B1', rev: 1, file_name: 'x.pdf', file_key: 'drawings/0X220/Z1/B1/rev1/x.pdf', mime_type: 'application/pdf' }

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

describe('CreateDrawingDto validation (file_key shape guard)', () => {
  const base = { project_id: 42, zone_id: 7, mark: 'B1', rev: 1, version: 1, file_name: 'x.pdf', mime_type: 'application/pdf' }

  it('rejects a file_key that escapes the drawings/ prefix via traversal', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: '../../../etc/passwd' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(true)
  })

  it('rejects the old drawings/<project_code>/<zone_code>/v<n>/<filename> shape — rev<n> after a mark segment is now required, not v<n>', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: 'drawings/0X220/Z1/v1/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(true)
  })

  it('accepts drawings/<project_code>/<zone_code>/<mark>/rev<n>/<name> (no sub-zone)', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: 'drawings/0X220/Z1/B1/rev1/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(false)
  })

  it('accepts drawings/<project_code>/<zone_code>/<subzone_code>/<mark>/rev<n>/<name>', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: 'drawings/0X220/Z1/SZ1/B1/rev1/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(false)
  })
})

// .pdf-only as of 2026-09-15 (see drawings.service.ts's create() comment) —
// server-side enforcement, not just the upload modal's dropzone restriction,
// so a direct API call can't slip a .dwg (or anything else) past the UI.
describe('CreateDrawingDto validation (.pdf-only)', () => {
  const base = { project_id: 42, zone_id: 7, mark: 'B1', rev: 1, mime_type: 'application/pdf' }

  it('accepts a .pdf file_name', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_name: 'plan-A.pdf', file_key: 'drawings/0X220/Z1/B1/rev1/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(false)
  })

  it('is case-insensitive (.PDF also accepted)', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_name: 'plan-A.PDF', file_key: 'drawings/0X220/Z1/B1/rev1/plan-A.PDF' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(false)
  })

  it('rejects a .dwg file_name', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_name: 'plan-A.dwg', file_key: 'drawings/0X220/Z1/B1/rev1/plan-A.dwg' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(true)
  })

  it('rejects a file_name with no extension at all', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_name: 'plan-A', file_key: 'drawings/0X220/Z1/B1/rev1/plan-A' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_name')).toBe(true)
  })
})
