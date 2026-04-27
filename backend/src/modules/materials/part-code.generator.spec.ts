import { PartCodeGenerator } from './part-code.generator'
import { PrismaService } from '../../prisma/prisma.service'

describe('PartCodeGenerator', () => {
  let gen: PartCodeGenerator

  const mockPrisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  } as unknown as PrismaService

  beforeEach(() => {
    gen = new PartCodeGenerator(mockPrisma)
    jest.clearAllMocks()
  })

  it('pendingCode returns <prefix>-PEND', () => {
    expect(gen.pendingCode('HR000')).toBe('HR000-PEND')
  })

  it('isTemporary detects -PEND suffix', () => {
    expect(gen.isTemporary('HR000-PEND')).toBe(true)
    expect(gen.isTemporary('HR00000001')).toBe(false)
  })

  it('assignRunNumber returns 10-char code with padded run number', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ next_run: 1 }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      }
      return cb(tx)
    })
    const code = await gen.assignRunNumber('HR000')
    expect(code).toBe('HR00000001')
    expect(code).toHaveLength(10)
  })

  it('assignRunNumber pads run number to 5 digits', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ next_run: 42 }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      }
      return cb(tx)
    })
    const code = await gen.assignRunNumber('PL000')
    expect(code).toBe('PL00000042')
  })

  it('assignRunNumber throws if no seq row', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        $executeRaw: jest.fn(),
      }
      return cb(tx)
    })
    await expect(gen.assignRunNumber('XXXXX')).rejects.toThrow('No seq row')
  })
})
