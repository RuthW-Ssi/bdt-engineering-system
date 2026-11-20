import { BomMatchingService } from './bom-matching.service'

// matchAssemblies / matchParts = name-only STANDARD matching (2026-05-20,
// a621be5 + ad4da1f). Anything unmatched is left for autoCreateCustomProducts
// (assemblies only, tested below) — parts are never auto-created here.
function makeTx() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    bom_assembly: { update: jest.fn().mockResolvedValue({}) },
    bom_part: { update: jest.fn().mockResolvedValue({}) },
  }
}

describe('BomMatchingService — standard matching by name', () => {
  const svc = new BomMatchingService({} as any, {} as any)

  it('assembly: standard assembly with the same name (trim/case-insensitive) → MATCHED_STANDARD', async () => {
    const tx = makeTx()
    tx.$queryRaw.mockResolvedValueOnce([{ id: 20, name: ' column ' }])
    await svc.matchAssemblies(tx as any, [{ id: 2, assembly_mark: 'TH-2CO1', name: 'COLUMN' }], 5, 1)
    expect(tx.bom_assembly.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { product_id: 20, match_status: 'MATCHED_STANDARD', write_uid: 1 },
    })
  })

  it('assembly: no standard match → row left untouched for autoCreateCustomProducts', async () => {
    const tx = makeTx()
    await svc.matchAssemblies(tx as any, [{ id: 3, assembly_mark: 'NEW-ASM', name: 'UNKNOWN' }], 5, 1)
    expect(tx.bom_assembly.update).not.toHaveBeenCalled()
  })

  it('assembly: duplicate names in one upload are queried once and every row is stamped', async () => {
    const tx = makeTx()
    tx.$queryRaw.mockResolvedValueOnce([{ id: 20, name: 'COLUMN' }])
    await svc.matchAssemblies(tx as any, [
      { id: 7, assembly_mark: 'A-CO1', name: 'COLUMN' },
      { id: 8, assembly_mark: 'A-CO2', name: 'column' },
    ], 5, 1)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(tx.bom_assembly.update).toHaveBeenCalledTimes(2)
  })

  it('part: standard part whose name equals the part mark → MATCHED_STANDARD', async () => {
    const tx = makeTx()
    tx.$queryRaw.mockResolvedValueOnce([{ id: 30, name: 'PART-001' }])
    await svc.matchParts(tx as any, [{ id: 4, part_mark: ' part-001 ' }], 5, 1)
    expect(tx.bom_part.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { product_id: 30, match_status: 'MATCHED_STANDARD', write_uid: 1 },
    })
  })

  it('part: no standard match → untouched (no profile/grade fallback, no auto-create)', async () => {
    const tx = makeTx()
    await svc.matchParts(tx as any, [{ id: 6, part_mark: 'TH-2p1', profile: 'PL6x1500', grade: 'SS400' }], 5, 1)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(tx.bom_part.update).not.toHaveBeenCalled()
  })

  it('empty input → no query at all', async () => {
    const tx = makeTx()
    await svc.matchAssemblies(tx as any, [], 5, 1)
    await svc.matchParts(tx as any, [], 5, 1)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
})

describe('BomMatchingService — enforceStandardIntegrity', () => {
  const svc = new BomMatchingService({} as any, {} as any)

  it('un-matches standard assemblies that contain a non-standard part', async () => {
    const tx = makeTx()
    tx.$queryRaw.mockResolvedValueOnce([{ id: 11 }, { id: 12 }])
    await svc.enforceStandardIntegrity(tx as any, 9, 1)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.$executeRaw.mock.calls[0]).toContainEqual([11, 12])
  })

  it('does nothing when every standard assembly is clean', async () => {
    const tx = makeTx()
    await svc.enforceStandardIntegrity(tx as any, 9, 1)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })
})

// ── autoCreateCustomProducts: library linked by mark_prefix, not name ──────
// Bug found 2026-09-14 via production data audit (project 6, ROD zones): a
// custom product got mark_prefix="RB" (correctly parsed from assembly_mark
// "DBN-A5-RB1") but library_id linked to the "ROD" library (prefix "R") —
// because the OLD code matched library_id by the raw Tekla `name` field
// ("ROD"), a completely separate lookup from the mark_prefix parse. Same root
// mechanism as the CTR→COLUMN mismatch found earlier the same day. Since
// findMissingMarkPrefixes now guarantees (pre-transaction) that every prefix
// reaching this method already has an active Product Library entry, the only
// correct source for library_id is that same prefix — never the assembly's
// free-text name.
describe('autoCreateCustomProducts — library linked by prefix', () => {
  function makePrismaMock(overrides: Record<string, any> = {}) {
    return {
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'DBN-A5-RB1', name: 'ROD', weight_kg: null, surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      product_library: {
        findMany: jest.fn().mockResolvedValue([
          { id: 99, name: 'Round Bar', mark_prefix: 'RB' },
          { id: 1, name: 'ROD', mark_prefix: 'R' }, // decoy — matches the assembly's raw `name`, must NOT be picked
        ]),
      },
      project: { findUnique: jest.fn().mockResolvedValue({ project_code: 'DBN' }) },
      project_zone: { findUnique: jest.fn().mockResolvedValue({ code: 'A5' }) },
      products: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 500, product_code: 'CUS-00500' }),
      },
      ...overrides,
    }
  }
  function makeCodeGen() {
    return { generate: jest.fn().mockResolvedValue('CUS-00500') }
  }

  it('links the new custom product via the Product Library entry whose mark_prefix matches the parsed prefix, ignoring a same-named decoy library', async () => {
    const prisma = makePrismaMock()
    const svc = new BomMatchingService(prisma as any, makeCodeGen() as any)

    await svc.autoCreateCustomProducts(1, 5, 2, 1)

    expect(prisma.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mark_prefix: 'RB', library_id: 99 }) }),
    )
  })

  it('queries Product Library by mark_prefix, not by assembly name', async () => {
    const prisma = makePrismaMock()
    const svc = new BomMatchingService(prisma as any, makeCodeGen() as any)

    await svc.autoCreateCustomProducts(1, 5, 2, 1)

    const call = prisma.product_library.findMany.mock.calls[0][0]
    expect(call.where.mark_prefix).toEqual({ in: ['RB'] })
    expect(call.where.name).toBeUndefined()
  })

  // Unregistered prefix (2026-10-12: uploads are no longer gated by prefix) —
  // products.mark_prefix is an FK to mark_prefix_master, so it stays empty.
  it('creates the product with no prefix and no library when no Product Library entry owns the parsed prefix', async () => {
    const prisma = makePrismaMock({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'BUH1-3', name: 'WEB', weight_kg: null, surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      product_library: { findMany: jest.fn().mockResolvedValue([]) },
    })
    const svc = new BomMatchingService(prisma as any, makeCodeGen() as any)

    await svc.autoCreateCustomProducts(1, 5, 2, 1)

    expect(prisma.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ library_id: null, mark_prefix: null, mark_number: null }) }),
    )
  })

  it('finds an existing product with no prefix by its original mark', async () => {
    const prisma = makePrismaMock({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'BUH1-3', name: 'WEB', weight_kg: null, surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      product_library: { findMany: jest.fn().mockResolvedValue([]) },
    })
    const svc = new BomMatchingService(prisma as any, makeCodeGen() as any)

    await svc.autoCreateCustomProducts(1, 5, 2, 1)

    expect(prisma.products.findFirst.mock.calls[0][0].where).toEqual({
      product_type: 'custom', project_id: 5, erection_zone_id: 2, mark_prefix: null,
      attributes: { path: ['oMark'], equals: 'BUH1-3' },
    })
  })
})
