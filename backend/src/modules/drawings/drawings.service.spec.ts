import { NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { DrawingsService } from './drawings.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'

function makePrisma(opts: { drawings?: { id: number; file_key: string }[]; same?: any[] } = {}) {
  const drawings = opts.drawings ?? []
  const same = opts.same ?? []
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
  }
}

function makeFileStorage() {
  return { delete: jest.fn().mockResolvedValue(undefined) }
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
    it('stores mark/rev (no version) and stamps uploaded_by_id, defaulting sub_zone_id to null when omitted', async () => {
      const prisma = makePrisma({ same: [] })
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.create(
        {
          project_id: 42,
          zone_id: 7,
          mark: 'B1',
          rev: 1,
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
    it('scopes strictly to zone_id + sub_zone_id (null sub_zone_id is its own bucket) ordered mark asc, rev desc, create_date desc, including the uploader name', async () => {
      const prisma = makePrisma()
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.findByZone(7, null)

      expect(prisma.drawing.findMany).toHaveBeenCalledWith({
        where: { zone_id: 7, sub_zone_id: null },
        orderBy: [{ mark: 'asc' }, { rev: 'desc' }, { create_date: 'desc' }],
        include: { uploaded_by: { select: { name: true } } },
      })
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
})

describe('CreateDrawingDto validation (file_key shape guard)', () => {
  const base = { project_id: 42, zone_id: 7, mark: 'B1', rev: 1, file_name: 'x.pdf', mime_type: 'application/pdf' }

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
