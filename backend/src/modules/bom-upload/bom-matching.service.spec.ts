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

  it('assembly: no match → MATCHED_CUSTOM (auto-created) with attributes', async () => {
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
      expect.objectContaining({ data: expect.objectContaining({ match_status: 'MATCHED_CUSTOM' }) }),
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

  it('part: no match → MATCHED_CUSTOM (auto-created) with profile/grade attributes', async () => {
    const tx = makeTx()
    tx.$queryRaw
      .mockResolvedValueOnce([])               // name miss
      .mockResolvedValueOnce([])               // standard index (no match)
      .mockResolvedValueOnce([{ next_run: 7 }]) // code seq
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

  it('part: no name match, profile+grade matches standard → MATCHED_STANDARD', async () => {
    const tx = makeTx()
    tx.$queryRaw
      .mockResolvedValueOnce([])   // name query miss
      .mockResolvedValueOnce([{ id: 50, variant_attributes: { profile: 'PL6x1500', grade: 'SS400' } }])  // standard index hit
    const rows = [{ id: 10, part_mark: 'TH-2p1', profile: 'PL6x1500', grade: 'SS400' }]
    await svc.matchParts(tx as any, rows, 5, 1)
    expect(tx.bom_part.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ product_id: 50, match_status: 'MATCHED_STANDARD' }) }),
    )
    expect(tx.products.create).not.toHaveBeenCalled()
  })

  it('part: profile matches but grade differs → auto-created', async () => {
    const tx = makeTx()
    tx.$queryRaw
      .mockResolvedValueOnce([])   // name miss
      .mockResolvedValueOnce([{ id: 50, variant_attributes: { profile: 'PL6x1500', grade: 'SS400' } }])  // index has SS400, row wants HY370
      .mockResolvedValueOnce([{ next_run: 8 }])  // code seq
    const rows = [{ id: 11, part_mark: 'TH-2p3', profile: 'PL6x1500', grade: 'HY370' }]
    await svc.matchParts(tx as any, rows, 5, 1)
    expect(tx.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ product_kind: 'part', product_type: 'custom' }) }),
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

// ── findMissingMarkPrefixes ───────────────────────────────────────────────
// Pre-transaction guard for upload(): any assembly mark whose prefix isn't
// already registered in Product Library must reject the whole upload instead
// of silently creating an orphan mark_prefix_master row (see
// autoCreateCustomProducts' removed blind upsert — this replaces it).
// Constructed directly (no NestJS TestingModule) since findMissingMarkPrefixes
// only touches the `tx` argument, not the injected prisma/codeGen.
describe('findMissingMarkPrefixes', () => {
  function makeSvc() {
    return new BomMatchingService({} as any, {} as any)
  }

  it('returns [] without querying when the assembly list is empty', async () => {
    const svc = makeSvc()
    const tx = { $queryRaw: jest.fn(), product_library: { findMany: jest.fn() } }
    const result = await svc.findMissingMarkPrefixes(tx as any, [])
    expect(result).toEqual([])
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('skips assemblies that match a standard product by name (no prefix needed)', async () => {
    const svc = makeSvc()
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ name: 'COLUMN' }]), // standard match
      product_library: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const result = await svc.findMissingMarkPrefixes(tx as any, [{ assembly_mark: 'TH-2CO1', name: 'COLUMN' }])
    expect(result).toEqual([])
    expect(tx.product_library.findMany).not.toHaveBeenCalled()
  })

  it('returns [] when the custom-path prefix is already registered in Product Library', async () => {
    const svc = makeSvc()
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]), // no standard match
      product_library: { findMany: jest.fn().mockResolvedValue([{ mark_prefix: 'CO' }]) },
    }
    const result = await svc.findMissingMarkPrefixes(tx as any, [{ assembly_mark: 'TH-2CO1', name: 'COLUMN' }])
    expect(result).toEqual([])
  })

  it('returns the prefix when no standard match and no Product Library entry owns it', async () => {
    const svc = makeSvc()
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product_library: { findMany: jest.fn().mockResolvedValue([{ mark_prefix: 'CO' }]) },
    }
    const result = await svc.findMissingMarkPrefixes(tx as any, [{ assembly_mark: 'DBN-B1-CTR8', name: 'COLUMN' }])
    expect(result).toEqual(['CTR'])
  })

  it('dedupes and sorts multiple missing prefixes', async () => {
    const svc = makeSvc()
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      product_library: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const assemblies = [
      { assembly_mark: 'DBN-B1-CTR8', name: 'X' },
      { assembly_mark: 'DBN-B1-CTR9', name: 'X' },
      { assembly_mark: 'DBN-B1-BR1', name: 'Y' },
    ]
    const result = await svc.findMissingMarkPrefixes(tx as any, assemblies)
    expect(result).toEqual(['BR', 'CTR'])
  })

  // QA-01 (BLOCK, 2026-09-14): enforceStandardIntegrity demotes a
  // MATCHED_STANDARD assembly back to unmatched, post-commit, if ANY of its
  // parts (in THIS upload) isn't itself MATCHED_STANDARD — INNER JOIN on
  // bom_assembly_part/bom_part, so an assembly with zero listed parts is
  // never demoted. A standard-name match alone is therefore not proof this
  // assembly stays exempt from the prefix check; must mirror that demotion
  // decision pre-transaction using the same-upload parts + junction rows.

  it('does NOT skip a standard-matched assembly that would be demoted (a listed part is not standard-matched)', async () => {
    const svc = makeSvc()
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ name: 'COLUMN' }]) // assembly standard match
        .mockResolvedValueOnce([]),                  // part standard match — none
      product_library: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const assemblies = [{ assembly_mark: 'DBN-B1-CTR8', name: 'COLUMN' }]
    const parts = [{ part_mark: 'P1' }]
    const assemblyParts = [{ assembly_mark: 'DBN-B1-CTR8', part_mark: 'P1' }]
    const result = await svc.findMissingMarkPrefixes(tx as any, assemblies, parts, assemblyParts)
    expect(result).toEqual(['CTR'])
  })

  it('skips a standard-matched assembly whose listed parts are ALL standard-matched (never demoted)', async () => {
    const svc = makeSvc()
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ name: 'COLUMN' }]) // assembly standard match
        .mockResolvedValueOnce([{ name: 'P1' }]),    // part standard match — matched
      product_library: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const assemblies = [{ assembly_mark: 'TH-2CO1', name: 'COLUMN' }]
    const parts = [{ part_mark: 'P1' }]
    const assemblyParts = [{ assembly_mark: 'TH-2CO1', part_mark: 'P1' }]
    const result = await svc.findMissingMarkPrefixes(tx as any, assemblies, parts, assemblyParts)
    expect(result).toEqual([])
    expect(tx.product_library.findMany).not.toHaveBeenCalled()
  })

  it('skips a standard-matched assembly with no parts listed in the junction, even when other assemblies have parts (INNER JOIN semantics — never demoted)', async () => {
    const svc = makeSvc()
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ name: 'COLUMN' }]) // assembly standard match
        .mockResolvedValueOnce([{ name: 'P1' }]),    // part standard match
      product_library: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const assemblies = [{ assembly_mark: 'TH-2CO1', name: 'COLUMN' }]
    const parts = [{ part_mark: 'P1' }]
    const assemblyParts = [{ assembly_mark: 'OTHER-MARK', part_mark: 'P1' }] // no junction row for TH-2CO1
    const result = await svc.findMissingMarkPrefixes(tx as any, assemblies, parts, assemblyParts)
    expect(result).toEqual([])
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

  it('leaves library_id null when no Product Library entry owns the parsed prefix', async () => {
    const prisma = makePrismaMock({
      product_library: { findMany: jest.fn().mockResolvedValue([]) },
    })
    const svc = new BomMatchingService(prisma as any, makeCodeGen() as any)

    await svc.autoCreateCustomProducts(1, 5, 2, 1)

    expect(prisma.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ library_id: null }) }),
    )
  })
})
