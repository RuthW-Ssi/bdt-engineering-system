import { ProductCodeGenerator, ProductKind } from './product-code.generator'

describe('ProductCodeGenerator', () => {
  let generator: ProductCodeGenerator
  let mockPrisma: any

  beforeEach(() => {
    let stdNextRun = 1
    let cusNextRun = 1

    mockPrisma = {
      $transaction: jest.fn(async (cb: any) => {
        const tx = {
          $queryRaw: jest.fn(async (strings: any, ...values: any[]) => {
            const kind = values[0] as ProductKind
            return [{ next_run: kind === 'STD' ? stdNextRun : cusNextRun }]
          }),
          $executeRaw: jest.fn(async (strings: any, ...values: any[]) => {
            const nextVal = values[0] as number
            const kind = values[1] as ProductKind
            if (kind === 'STD') stdNextRun = nextVal
            else cusNextRun = nextVal
          }),
        }
        return cb(tx)
      }),
    }

    generator = new ProductCodeGenerator(mockPrisma)
  })

  it('generates STD-00001 for first standard product', async () => {
    const code = await generator.generate('STD')
    expect(code).toBe('STD-00001')
  })

  it('generates CUS-00001 for first custom product', async () => {
    const code = await generator.generate('CUS')
    expect(code).toBe('CUS-00001')
  })

  it('pads to 5 digits', async () => {
    // Simulate next_run = 42
    mockPrisma.$transaction = jest.fn(async (cb: any) => {
      const tx = {
        $queryRaw: jest.fn(async () => [{ next_run: 42 }]),
        $executeRaw: jest.fn(),
      }
      return cb(tx)
    })
    generator = new ProductCodeGenerator(mockPrisma)

    const code = await generator.generate('STD')
    expect(code).toBe('STD-00042')
  })

  it('uses $transaction for concurrency safety', async () => {
    await generator.generate('STD')
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })
})
