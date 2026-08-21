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

describe('DrawingsService', () => {
  describe('remove', () => {
    it('deletes the underlying file before deleting the DB row', async () => {
      const drawings = [{ id: 1, file_key: 'drawings/abc-plan.pdf' }]
      const prisma = makePrisma(drawings)
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)

      await svc.remove(1)

      expect(fileStorage.delete).toHaveBeenCalledWith('drawings/abc-plan.pdf')
      expect(prisma.drawing.delete).toHaveBeenCalledWith({ where: { id: 1 } })
    })

    it('throws NotFoundException for a non-existent id and never touches the file or row', async () => {
      const prisma = makePrisma([])
      const fileStorage = makeFileStorage()
      const svc = new DrawingsService(prisma as any, fileStorage as any)

      await expect(svc.remove(999)).rejects.toThrow(NotFoundException)
      expect(fileStorage.delete).not.toHaveBeenCalled()
      expect(prisma.drawing.delete).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    it('stamps uploaded_by_id from the passed-in user id, not the DTO', async () => {
      const prisma = makePrisma([])
      const svc = new DrawingsService(prisma as any, makeFileStorage() as any)

      await svc.create({ product_id: 42, file_key: 'drawings/x.pdf', file_name: 'x.pdf', mime_type: 'application/pdf' }, 7)

      expect(prisma.drawing.create).toHaveBeenCalledWith({
        data: {
          product_id: 42,
          file_key: 'drawings/x.pdf',
          file_name: 'x.pdf',
          mime_type: 'application/pdf',
          uploaded_by_id: 7,
        },
      })
    })
  })
})

describe('CreateDrawingDto validation (file_key path traversal guard)', () => {
  const base = { product_id: 42, file_name: 'x.pdf', mime_type: 'application/pdf' }

  it('rejects a file_key that escapes the drawings/ prefix via traversal', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: '../../../etc/passwd' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(true)
  })

  it('rejects a file_key with traversal segments after the drawings/ prefix', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: 'drawings/../../../etc/passwd' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(true)
  })

  it('accepts a legitimate drawings/<name> file_key', async () => {
    const dto = plainToInstance(CreateDrawingDto, { ...base, file_key: 'drawings/abc-plan.pdf' })
    const errors = await validate(dto)
    expect(errors.some(e => e.property === 'file_key')).toBe(false)
  })
})
