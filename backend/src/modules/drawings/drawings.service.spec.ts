import { NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { DrawingsService } from './drawings.service'
import { CreateDrawingDto } from './dto/create-drawing.dto'

function makePrisma(drawings: { id: number; file_key: string }[]) {
  return {
    drawing: {
      create: jest.fn((args: any) => Promise.resolve({ id: 999, ...args.data })),
      findMany: jest.fn(() => Promise.resolve(drawings)),
      findFirst: jest.fn(),
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(drawings.find(d => d.id === where.id) ?? null),
      ),
      delete: jest.fn(({ where }: any) =>
        Promise.resolve(drawings.find(d => d.id === where.id)),
      ),
    },
  }
}

function makeFileStorage() {
  return { delete: jest.fn().mockResolvedValue(undefined) }
}

function makeDrawingAps() {
  return { pushToAps: jest.fn().mockResolvedValue(undefined) }
}

describe('DrawingsService', () => {
  describe('remove', () => {
    it('deletes the underlying file before deleting the DB row', async () => {
      const drawings = [{ id: 1, file_key: 'drawings/0X220/Z1/v1/plan-A.pdf' }]
      const prisma = makePrisma(drawings)
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any, makeDrawingAps() as any)

      await svc.remove(1)

      expect(fileStorage.delete).toHaveBeenCalledWith('drawings/0X220/Z1/v1/plan-A.pdf')
      expect(prisma.drawing.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    })

    it('throws NotFoundException for a non-existent id and never touches the file or row', async () => {
      const prisma = makePrisma([])
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any, makeDrawingAps() as any)

      await expect(svc.remove(999)).rejects.toThrow(NotFoundException)
      expect(fileStorage.delete).not.toHaveBeenCalled()
      expect(prisma.drawing.delete).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    it('stamps uploaded_by_id from the passed-in user id and defaults sub_zone_id to null when omitted', async () => {
      const prisma = makePrisma([])
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any, makeDrawingAps() as any)

      await svc.create({ project_id: 42, zone_id: 7, version: 1, file_key: 'drawings/0X220/Z1/v1/x.dwg', file_name: 'x.dwg', mime_type: 'application/octet-stream' } as any, 9)

      expect(prisma.drawing.create).toHaveBeenCalledWith({
        data: {
          project_id: 42,
          zone_id: 7,
          sub_zone_id: null,
          version: 1,
          file_key: 'drawings/0X220/Z1/v1/x.dwg',
          file_name: 'x.dwg',
          mime_type: 'application/octet-stream',
          uploaded_by_id: 9,
        },
      })
    })

    it('persists sub_zone_id when provided', async () => {
      const prisma = makePrisma([])
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any, makeDrawingAps() as any)

      await svc.create({ project_id: 42, zone_id: 7, sub_zone_id: 3, version: 1, file_key: 'drawings/0X220/Z1/SZ1/v1/x.dwg', file_name: 'x.dwg', mime_type: 'application/octet-stream' }, 9)

      expect(prisma.drawing.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ zone_id: 7, sub_zone_id: 3 }),
      }))
    })

    it('fires the APS preview push (fire-and-forget) for a .dwg upload, with the created row\'s id/file_key/file_name', async () => {
      const prisma = makePrisma([])
      const drawingAps = makeDrawingAps()
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any, drawingAps as any)

      await svc.create({ project_id: 42, zone_id: 7, version: 1, file_key: 'drawings/0X220/Z1/v1/x.dwg', file_name: 'x.dwg', mime_type: 'application/octet-stream' } as any, 9)

      expect(drawingAps.pushToAps).toHaveBeenCalledWith(999, 'drawings/0X220/Z1/v1/x.dwg', 'x.dwg')
    })

    it('does NOT push to APS for a non-.dwg extension (defensive — the upload UI only ever offers .dwg)', async () => {
      const prisma = makePrisma([])
      const drawingAps = makeDrawingAps()
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any, drawingAps as any)

      await svc.create({ project_id: 42, zone_id: 7, version: 1, file_key: 'drawings/0X220/Z1/v1/x.pdf', file_name: 'x.pdf', mime_type: 'application/pdf' } as any, 9)

      expect(drawingAps.pushToAps).not.toHaveBeenCalled()
    })

    it('extension check is case-insensitive (.DWG also triggers the push)', async () => {
      const prisma = makePrisma([])
      const drawingAps = makeDrawingAps()
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any, drawingAps as any)

      await svc.create({ project_id: 42, zone_id: 7, version: 1, file_key: 'drawings/0X220/Z1/v1/X.DWG', file_name: 'X.DWG', mime_type: 'application/octet-stream' } as any, 9)

      expect(drawingAps.pushToAps).toHaveBeenCalled()
    })
  })

  describe('findByZone', () => {
    it('scopes strictly to zone_id + sub_zone_id (null sub_zone_id is its own bucket, not "any sub-zone")', async () => {
      const prisma = makePrisma([])
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any, makeDrawingAps() as any)

      await svc.findByZone(7, null)

      expect(prisma.drawing.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { zone_id: 7, sub_zone_id: null },
      }))
    })
  })

  describe('getLatestVersion', () => {
    it('returns null when the zone has no drawings yet', async () => {
      const prisma = { drawing: { findFirst: jest.fn().mockResolvedValue(null) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any, makeDrawingAps() as any)

      const result = await svc.getLatestVersion(7, null)

      expect(result).toEqual({ version: null })
      expect(prisma.drawing.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { zone_id: 7, sub_zone_id: null },
        orderBy: { version: 'desc' },
      }))
    })

    it('returns the highest version already used for that zone', async () => {
      const prisma = { drawing: { findFirst: jest.fn().mockResolvedValue({ version: 3 }) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any, makeDrawingAps() as any)

      const result = await svc.getLatestVersion(7, null)

      expect(result).toEqual({ version: 3 })
    })

    it('treats a sub-zone as a distinct version bucket from its parent zone', async () => {
      const prisma = { drawing: { findFirst: jest.fn().mockResolvedValue({ version: 1 }) } }
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any, makeDrawingAps() as any)

      await svc.getLatestVersion(7, 3)

      expect(prisma.drawing.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { zone_id: 7, sub_zone_id: 3 },
      }))
    })
  })
})

describe('CreateDrawingDto validation (file_key shape guard)', () => {
  const base = { project_id: 42, zone_id: 7, version: 1, file_name: 'x.pdf', mime_type: 'application/pdf' }

  it('rejects the old drawings/<project_code>/v<version>/<filename> shape — zone segment is now required', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: 'drawings/0X220/v1/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(true)
  })

  it('rejects a file_key that escapes the drawings/ prefix via traversal', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: '../../../etc/passwd' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(true)
  })

  it('accepts drawings/<project_code>/<zone_code>/v<n>/<name> (no sub-zone)', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: 'drawings/0X220/Z1/v1/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(false)
  })

  it('accepts drawings/<project_code>/<zone_code>/<subzone_code>/v<n>/<name>', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: 'drawings/0X220/Z1/SZ1/v1/plan-A.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(false)
  })
})
