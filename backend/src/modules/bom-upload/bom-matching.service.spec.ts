import { Test } from '@nestjs/testing'
import { BomMatchingService } from './bom-matching.service'
import { PrismaService } from '../../prisma/prisma.service'

function makeTx(overrides: Record<string, any> = {}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ next_run: 1 }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    products: {
      create: jest.fn().mockResolvedValue({ id: 99, product_code: 'CUS-00001' }),
    },
    product_category: {
      findFirst: jest.fn().mockResolvedValue({ id: 1 }),
    },
    bom_assembly: {
      update: jest.fn().mockResolvedValue({}),
    },
    bom_part: {
      update: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  }
}

describe('BomMatchingService', () => {
  let svc: BomMatchingService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BomMatchingService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile()
    svc = module.get(BomMatchingService)
  })

  // ── Assembly matching ──────────────────────────────────────────
  // matchAssemblies does Promise.all([customQuery, standardQuery])
  // $queryRaw call order: [0]=custom (by mark), [1]=standard (by name)

  it('assembly: custom product exists (by assembly_mark) → MATCHED_CUSTOM', async () => {
    const tx = makeTx()
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 10, name: 'TH-2CO1' }])  // custom query hit
      .mockResolvedValueOnce([{ id: 20, name: 'COLUMN' }])    // standard query (ignored)
    const rows = [{ id: 1, assembly_mark: 'TH-2CO1', name: 'COLUMN' }]
    await svc.matchAssemblies(tx as any, rows, 5, 1)
    expect(tx.bom_assembly.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ product_id: 10, match_status: 'MATCHED_CUSTOM' }) }),
    )
  })

  it('assembly: no custom match, standard product exists (by assembly name) → MATCHED_STANDARD', async () => {
    const tx = makeTx()
    tx.$queryRaw
      .mockResolvedValueOnce([])                               // custom query miss
      .mockResolvedValueOnce([{ id: 20, name: 'COLUMN' }])    // standard query hit by name
    const rows = [{ id: 2, assembly_mark: 'TH-2CO1', name: 'COLUMN' }]
    await svc.matchAssemblies(tx as any, rows, 5, 1)
    expect(tx.bom_assembly.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ product_id: 20, match_status: 'MATCHED_STANDARD' }) }),
    )
  })

  it('assembly: no match → AUTO_CREATED with attributes', async () => {
    const tx = makeTx()
    tx.$queryRaw
      .mockResolvedValueOnce([])               // custom miss
      .mockResolvedValueOnce([])               // standard miss
      .mockResolvedValueOnce([{ next_run: 5 }]) // code seq
    const rows = [{ id: 3, assembly_mark: 'NEW-ASM', name: 'UNKNOWN', weight_kg: 120.5 }]
    await svc.matchAssemblies(tx as any, rows, 5, 1)
    expect(tx.products.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          product_type: 'custom',
          product_kind: 'assembly',
          project_id: 5,
          attributes: expect.objectContaining({ source: 'auto_created_from_bom', weight_kg: 120.5 }),
        }),
      }),
    )
    expect(tx.bom_assembly.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ match_status: 'AUTO_CREATED' }) }),
    )
  })

  // ── Part matching ──────────────────────────────────────────────

  it('part: STANDARD found → MATCHED_STANDARD (checked before custom)', async () => {
    const tx = makeTx()
    tx.$queryRaw.mockResolvedValueOnce([
      { id: 30, name: 'PART-001', product_type: 'standard', project_id: null },
      { id: 31, name: 'PART-001', product_type: 'custom', project_id: 5 },
    ])
    const rows = [{ id: 4, part_mark: 'PART-001' }]
    await svc.matchParts(tx as any, rows, 5, 1)
    expect(tx.bom_part.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ product_id: 30, match_status: 'MATCHED_STANDARD' }) }),
    )
  })

  it('part: no standard, custom found → MATCHED_CUSTOM', async () => {
    const tx = makeTx()
    tx.$queryRaw.mockResolvedValueOnce([{ id: 40, name: 'CUSTOM-PART', product_type: 'custom', project_id: 5 }])
    const rows = [{ id: 5, part_mark: 'CUSTOM-PART' }]
    await svc.matchParts(tx as any, rows, 5, 1)
    expect(tx.bom_part.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ product_id: 40, match_status: 'MATCHED_CUSTOM' }) }),
    )
  })

  it('part: no match → AUTO_CREATED with profile/grade attributes', async () => {
    const tx = makeTx()
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ next_run: 7 }])
    const rows = [{ id: 6, part_mark: 'MYSTERY-PART', profile: 'PL6x950', grade: 'HY370', weight_kg: 45.2 }]
    await svc.matchParts(tx as any, rows, 5, 1)
    expect(tx.products.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          product_kind: 'part',
          product_type: 'custom',
          attributes: expect.objectContaining({ source: 'auto_created_from_bom', profile: 'PL6x950', grade: 'HY370' }),
        }),
      }),
    )
  })

  // ── Edge cases ─────────────────────────────────────────────────

  it('duplicate assembly marks in same upload → product created once, reused on all rows', async () => {
    const tx = makeTx()
    tx.$queryRaw
      .mockResolvedValueOnce([])               // custom miss
      .mockResolvedValueOnce([])               // standard miss
      .mockResolvedValueOnce([{ next_run: 10 }]) // code seq (only called once)
    const rows = [
      { id: 7, assembly_mark: 'DUPE-ASM', name: 'UNKNOWN' },
      { id: 8, assembly_mark: 'dupe-asm', name: 'UNKNOWN' },  // same mark, different case
    ]
    await svc.matchAssemblies(tx as any, rows, 5, 1)
    expect(tx.products.create).toHaveBeenCalledTimes(1)
    expect(tx.bom_assembly.update).toHaveBeenCalledTimes(2)
  })
})
