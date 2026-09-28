import { MoCodeGenerator } from './mo-code.generator'

// 2026-09-28: MoCodeGenerator had no dedicated spec at all before this (QA-F-003)
// — codeGen was always fully mocked out in manufacturing-orders.service.spec.ts,
// so the real padStart/upsert/year-prefix logic went untested. Mirrors
// products/product-code.generator.spec.ts's mock shape, adapted for the
// single atomic `INSERT ... ON CONFLICT ... RETURNING` upsert (one $queryRaw
// call, no separate $executeRaw) this generator uses since the 2026-09-28
// year-prefix change.
describe('MoCodeGenerator', () => {
  let generator: MoCodeGenerator
  let mockPrisma: any

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-28T12:00:00Z'))
    mockPrisma = {
      $transaction: jest.fn(async (cb: any) => {
        const tx = { $queryRaw: jest.fn(async () => [{ allocated: 1 }]) }
        return cb(tx)
      }),
    }
    generator = new MoCodeGenerator(mockPrisma)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('generates MO-26000001 for the first MO of 2026', async () => {
    const code = await generator.generate()
    expect(code).toBe('MO-26000001')
  })

  it('pads the per-year counter to 6 digits', async () => {
    mockPrisma.$transaction = jest.fn(async (cb: any) => {
      const tx = { $queryRaw: jest.fn(async () => [{ allocated: 42 }]) }
      return cb(tx)
    })
    generator = new MoCodeGenerator(mockPrisma)

    const code = await generator.generate()
    expect(code).toBe('MO-26000042')
  })

  it('uses the current year, 2-digit, as the prefix', async () => {
    jest.setSystemTime(new Date('2027-01-15T00:00:00Z'))
    const code = await generator.generate()
    expect(code).toBe('MO-27000001')
  })

  it('uses $transaction for concurrency safety when no tx is passed in', async () => {
    await generator.generate()
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('runs on the given tx directly instead of opening a new transaction, when one is passed in', async () => {
    const tx = { $queryRaw: jest.fn(async () => [{ allocated: 1 }]) } as any
    const code = await generator.generate(tx)
    expect(code).toBe('MO-26000001')
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  })
})
