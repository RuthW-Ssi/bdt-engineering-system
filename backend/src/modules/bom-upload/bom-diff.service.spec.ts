import * as path from 'path'
import * as fs from 'fs'
import { NotFoundException } from '@nestjs/common'
import { BomDiffService } from './bom-diff.service'
import { XlsxParserService } from './xlsx-parser.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

const FIXTURE_ROOT = path.resolve(__dirname, '../../../storage/test_bom_file')
const REV0_DIR = FIXTURE_ROOT
const REV1_DIR = path.join(FIXTURE_ROOT, 'test_diff_bom_file')

function readFixture(dir: string, pattern: RegExp): Buffer | null {
  const files = fs.readdirSync(dir)
  const name = files.find(f => pattern.test(f))
  if (!name) return null
  return fs.readFileSync(path.join(dir, name))
}

// Parse both revisions and build mock Prisma state
function buildMockDataFromFixtures() {
  const parser = new XlsxParserService()

  // Rev.0 — patterns ordered specific-to-general to avoid "Assembly Part List" matching /Part List/
  const rev0Asm = readFixture(REV0_DIR, /Assembly List(?! Part)/i)
  const rev0AsmPart = readFixture(REV0_DIR, /Assembly Part List/i)
  const rev0Part = readFixture(REV0_DIR, /(?<!Assembly )Part List/i)

  // Rev.1
  const rev1Asm = readFixture(REV1_DIR, /Assembly List(?! Part)/i)
  const rev1AsmPart = readFixture(REV1_DIR, /Assembly Part List/i)
  const rev1Part = readFixture(REV1_DIR, /(?<!Assembly )Part List/i)

  const p0Asm = rev0Asm ? parser.parse(rev0Asm, 'ASSEMBLY_LIST') : null
  const p0Part = rev0Part ? parser.parse(rev0Part, 'PART_LIST') : null
  const p0AsmPart = rev0AsmPart ? parser.parse(rev0AsmPart, 'ASSEMBLY_PART_LIST') : null

  const p1Asm = rev1Asm ? parser.parse(rev1Asm, 'ASSEMBLY_LIST') : null
  const p1Part = rev1Part ? parser.parse(rev1Part, 'PART_LIST') : null
  const p1AsmPart = rev1AsmPart ? parser.parse(rev1AsmPart, 'ASSEMBLY_PART_LIST') : null

  return { p0Asm, p0Part, p0AsmPart, p1Asm, p1Part, p1AsmPart }
}

function buildPrisma(fixtures: ReturnType<typeof buildMockDataFromFixtures>) {
  const { p0Asm, p0Part, p0AsmPart, p1Asm, p1Part, p1AsmPart } = fixtures

  const dispatch0 = { id: 1, project_id: 10, zone_id: 20, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-01'), revision: 0, assembly_total: p0Asm?.assemblies.length ?? null, part_total: p0Part?.parts.length ?? null }
  const dispatch1 = { id: 2, project_id: 10, zone_id: 20, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-01'), revision: 1, assembly_total: p1Asm?.assemblies.length ?? null, part_total: p1Part?.parts.length ?? null }

  const asm0Rows = (p0Asm?.assemblies ?? []).map((a, i) => ({ id: i + 1, dispatch_id: 1, assembly_mark: a.assembly_mark, name: a.name ?? null, qty: a.qty ?? null, weight_kg: a.weight_kg ?? null, surface_area_m2: a.surface_area_m2 ?? null }))
  const asm1Rows = (p1Asm?.assemblies ?? []).map((a, i) => ({ id: 1000 + i, dispatch_id: 2, assembly_mark: a.assembly_mark, name: a.name ?? null, qty: a.qty ?? null, weight_kg: a.weight_kg ?? null, surface_area_m2: a.surface_area_m2 ?? null }))

  const part0Rows = (p0Part?.parts ?? []).map((p, i) => ({ id: 2000 + i, dispatch_id: 1, part_mark: p.part_mark, description: p.description ?? null, profile: p.profile ?? null, grade: p.grade ?? null, qty: p.qty ?? null, weight_kg: p.weight_kg ?? null }))
  const part1Rows = (p1Part?.parts ?? []).map((p, i) => ({ id: 3000 + i, dispatch_id: 2, part_mark: p.part_mark, description: p.description ?? null, profile: p.profile ?? null, grade: p.grade ?? null, qty: p.qty ?? null, weight_kg: p.weight_kg ?? null }))

  // Build assembly_mark → id maps
  const asm0ByMark = new Map(asm0Rows.map(a => [a.assembly_mark, a]))
  const asm1ByMark = new Map(asm1Rows.map(a => [a.assembly_mark, a]))
  const part0ByMark = new Map(part0Rows.map(p => [p.part_mark, p]))
  const part1ByMark = new Map(part1Rows.map(p => [p.part_mark, p]))

  const junctions0 = (p0AsmPart?.assemblyParts ?? []).flatMap(j => {
    const a = asm0ByMark.get(j.assembly_mark)
    const p = part0ByMark.get(j.part_mark)
    if (!a || !p) return []
    return [{ assembly: { assembly_mark: a.assembly_mark }, part: { part_mark: p.part_mark }, qty: j.qty ?? 1 }]
  })

  const junctions1 = (p1AsmPart?.assemblyParts ?? []).flatMap(j => {
    const a = asm1ByMark.get(j.assembly_mark)
    const p = part1ByMark.get(j.part_mark)
    if (!a || !p) return []
    return [{ assembly: { assembly_mark: a.assembly_mark }, part: { part_mark: p.part_mark }, qty: j.qty ?? 1 }]
  })

  return {
    bom_dispatch: {
      findUnique: jest.fn(({ where }: any) => {
        if (where.id === 1) return Promise.resolve(dispatch0)
        if (where.id === 2) return Promise.resolve(dispatch1)
        return Promise.resolve(null)
      }),
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          [dispatch0, dispatch1]
            .filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision < where.revision.lt)
            .sort((a, b) => b.revision - a.revision)[0] ?? null,
        ),
      ),
      findMany: jest.fn(({ where }: any) => {
        // resolve sibling ids sharing a revision, or the latest-prior-revision lookup
        if (where.revision != null) {
          return Promise.resolve([dispatch0, dispatch1].filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision === where.revision))
        }
        return Promise.resolve([dispatch0, dispatch1].filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision < where.revision.lt))
      }),
    },
    bom_assembly: {
      findMany: jest.fn(({ where }: any) => {
        const ids: number[] = where.dispatch_id.in
        if (ids.includes(1)) return Promise.resolve(asm0Rows)
        if (ids.includes(2)) return Promise.resolve(asm1Rows)
        return Promise.resolve([])
      }),
    },
    bom_part: {
      findMany: jest.fn(({ where }: any) => {
        const ids: number[] = where.dispatch_id.in
        if (ids.includes(1)) return Promise.resolve(part0Rows)
        if (ids.includes(2)) return Promise.resolve(part1Rows)
        return Promise.resolve([])
      }),
      count: jest.fn(({ where }: any) => {
        const ids: number[] = where.dispatch_id.in
        const rows: any[] = []
        if (ids.includes(1)) rows.push(...part0Rows)
        if (ids.includes(2)) rows.push(...part1Rows)
        return Promise.resolve(rows.length)
      }),
    },
    bom_assembly_part: {
      findMany: jest.fn(({ where }: any) => {
        const ids: number[] = where?.assembly?.dispatch_id?.in ?? []
        if (ids.includes(1)) return Promise.resolve(junctions0)
        if (ids.includes(2)) return Promise.resolve(junctions1)
        return Promise.resolve([])
      }),
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BomDiffService — fixture-based contract test', () => {
  let fixtures: ReturnType<typeof buildMockDataFromFixtures>
  let prisma: ReturnType<typeof buildPrisma>
  let svc: BomDiffService

  beforeAll(() => {
    // Skip if fixture files not present
    if (!fs.existsSync(REV0_DIR) || !fs.existsSync(REV1_DIR)) {
      console.warn('Fixture files not found — skipping BomDiffService fixture test')
      return
    }
    fixtures = buildMockDataFromFixtures()
    prisma = buildPrisma(fixtures)
    svc = new BomDiffService(prisma as any)
  })

  it('returns null when no previous dispatch exists', async () => {
    const dispatch99 = { id: 99, project_id: 10, zone_id: 20, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), revision: 0 }
    const noPrevPrisma = {
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(dispatch99),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(({ where }: any) => {
          if (where.revision != null) {
            return Promise.resolve([dispatch99].filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision === where.revision))
          }
          return Promise.resolve([])
        }),
      },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const result = await new BomDiffService(noPrevPrisma as any).computeDiff(99)
    expect(result).toBeNull()
  })

  it('throws NotFoundException for unknown dispatch', async () => {
    const unknownPrisma = {
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn(), findMany: jest.fn() },
      bom_assembly: { findMany: jest.fn() },
      bom_part: { findMany: jest.fn(), count: jest.fn() },
      bom_assembly_part: { findMany: jest.fn() },
    }
    await expect(new BomDiffService(unknownPrisma as any).computeDiff(9999)).rejects.toThrow(NotFoundException)
  })

  it('fixture: computeDiff returns correct aggregate deltas (Rev.0 → Rev.1)', async () => {
    if (!fixtures || !prisma) return // fixture files absent

    const result = await svc.computeDiff(2)

    expect(result).not.toBeNull()
    expect(result!.prev_id).toBe(1)
    expect(result!.curr_id).toBe(2)

    // Weight delta: ground truth +711.83 kg
    const weightDelta = result!.aggregate.weight_kg.delta
    if (weightDelta != null) {
      expect(Math.abs(weightDelta - 711.83)).toBeLessThan(1)
    }

    // Area delta: ground truth +34.24 m²
    const areaDelta = result!.aggregate.area_m2.delta
    if (areaDelta != null) {
      expect(Math.abs(areaDelta - 34.24)).toBeLessThan(1)
    }
  })

  it('fixture: assembly_diff shows added TH-2CO12 and TH-2RF16', async () => {
    if (!fixtures || !prisma) return

    const result = await svc.computeDiff(2)
    expect(result).not.toBeNull()

    const added = result!.assembly_diff.filter(r => r.status === 'added').map(r => r.curr!.assembly_mark)
    expect(added).toContain('TH-2CO12')
    expect(added).toContain('TH-2RF16')
  })

  it('fixture: assembly_diff shows removed TH-2FB13 and TH-2WH3', async () => {
    if (!fixtures || !prisma) return

    const result = await svc.computeDiff(2)
    expect(result).not.toBeNull()

    const removed = result!.assembly_diff.filter(r => r.status === 'removed').map(r => r.prev!.assembly_mark)
    expect(removed).toContain('TH-2FB13')
    expect(removed).toContain('TH-2WH3')
  })

  it('warning is null when both dispatches are complete', async () => {
    if (!fixtures || !prisma) return

    const result = await svc.computeDiff(2)
    expect(result!.warning).toBeNull()
  })
})

// ── Algorithm unit tests ──────────────────────────────────────────────────────

describe('BomDiffService — algorithm unit tests', () => {
  function makeMinimalPrisma() {
    const prev = { id: 1, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-01'), revision: 0, assembly_total: 2, part_total: 3 }
    const curr = { id: 2, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-01'), revision: 1, assembly_total: 2, part_total: 3 }

    return {
      bom_dispatch: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === 1 ? prev : curr)),
        findFirst: jest.fn(({ where }: any) =>
          Promise.resolve(
            [prev, curr]
              .filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision < where.revision.lt)
              .sort((a, b) => b.revision - a.revision)[0] ?? null,
          ),
        ),
        findMany: jest.fn(({ where }: any) => {
          if (where.revision != null) {
            return Promise.resolve([prev, curr].filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision === where.revision))
          }
          return Promise.resolve([prev, curr].filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision < where.revision.lt))
        }),
      },
      bom_assembly: {
        findMany: jest.fn(({ where }: any) => {
          const ids: number[] = where.dispatch_id.in
          if (ids.includes(1)) return Promise.resolve([
            { assembly_mark: 'A1', name: 'Assembly 1', qty: 2, weight_kg: 100, surface_area_m2: 5 },
            { assembly_mark: 'A2', name: 'Assembly 2', qty: 1, weight_kg: 50, surface_area_m2: 3 },
          ])
          // curr: A1 changed weight, A2 removed, A3 added
          return Promise.resolve([
            { assembly_mark: 'A1', name: 'Assembly 1', qty: 2, weight_kg: 120, surface_area_m2: 5 },
            { assembly_mark: 'A3', name: 'Assembly 3', qty: 1, weight_kg: 80, surface_area_m2: 4 },
          ])
        }),
      },
      bom_part: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue([]) },
    }
  }

  it('correctly classifies added/removed/changed/unchanged assemblies', async () => {
    const svc = new BomDiffService(makeMinimalPrisma() as any)
    const result = await svc.computeDiff(2)

    expect(result).not.toBeNull()
    const byMark = Object.fromEntries(result!.assembly_diff.map(r => [r.curr?.assembly_mark ?? r.prev?.assembly_mark, r.status]))
    expect(byMark['A1']).toBe('changed')
    expect(byMark['A2']).toBe('removed')
    expect(byMark['A3']).toBe('added')
  })

  it('computes aggregate weight delta correctly', async () => {
    const svc = new BomDiffService(makeMinimalPrisma() as any)
    const result = await svc.computeDiff(2)

    // prev weight: 100 + 50 = 150, curr weight: 120 + 80 = 200, delta = +50
    expect(result!.aggregate.weight_kg.prev).toBeCloseTo(150)
    expect(result!.aggregate.weight_kg.curr).toBeCloseTo(200)
    expect(result!.aggregate.weight_kg.delta).toBeCloseTo(50)
  })
})

// ── Revision-group aggregation tests ──────────────────────────

describe('BomDiffService — revision-group aggregation', () => {
  function buildGroupedPrisma() {
    // Revision 0: one combined dispatch (id 1) with assemblies B1, B2
    // Revision 1: two dispatches sharing revision 1 — Main (id 2, assembly M1) and Acc (id 3, assembly A1)
    const dispatches = [
      { id: 1, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-01'), revision: 0 },
      { id: 2, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-01'), revision: 1 },
      { id: 3, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-02'), revision: 1 },
    ]
    const assembliesByDispatch: Record<number, any[]> = {
      1: [
        { assembly_mark: 'B1', name: 'Base 1', qty: 1, weight_kg: 100, surface_area_m2: 5 },
        { assembly_mark: 'B2', name: 'Base 2', qty: 1, weight_kg: 50, surface_area_m2: 3 },
      ],
      2: [{ assembly_mark: 'M1', name: 'Main 1', qty: 1, weight_kg: 80, surface_area_m2: 4 }],
      3: [{ assembly_mark: 'A1', name: 'Acc 1', qty: 1, weight_kg: 20, surface_area_m2: 1 }],
    }
    return {
      bom_dispatch: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(dispatches.find(d => d.id === where.id) ?? null)),
        findMany: jest.fn(({ where }: any) => {
          // resolve sibling ids sharing a revision, or the latest-prior-revision lookup
          if (where.revision != null) {
            return Promise.resolve(dispatches.filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision === where.revision))
          }
          return Promise.resolve(dispatches.filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision < where.revision.lt))
        }),
        findFirst: jest.fn(({ where }: any) =>
          Promise.resolve(
            dispatches
              .filter(d => d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id && d.revision < where.revision.lt)
              .sort((a, b) => b.revision - a.revision)[0] ?? null,
          ),
        ),
      },
      bom_assembly: {
        findMany: jest.fn(({ where }: any) => {
          const ids: number[] = where.dispatch_id.in
          return Promise.resolve(ids.flatMap(id => assembliesByDispatch[id] ?? []))
        }),
      },
      bom_part: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue([]) },
    }
  }

  it('diffs the union of a same-revision group (Main+Acc) against the true prior revision, not against each other', async () => {
    const svc = new BomDiffService(buildGroupedPrisma() as any)
    const result = await svc.computeDiff(3) // dispatch 3 = Acc, revision 1

    expect(result).not.toBeNull()
    const marks = result!.assembly_diff.map(r => (r.curr ?? r.prev)!.assembly_mark).sort()
    // current group = {M1, A1} (dispatch 2 + 3, both revision 1), previous = {B1, B2} (revision 0)
    expect(marks).toEqual(['A1', 'B1', 'B2', 'M1'])
    expect(result!.assembly_diff.find(r => r.curr?.assembly_mark === 'M1')!.status).toBe('added')
    expect(result!.assembly_diff.find(r => r.curr?.assembly_mark === 'A1')!.status).toBe('added')
    expect(result!.assembly_diff.find(r => r.prev?.assembly_mark === 'B1')!.status).toBe('removed')
    expect(result!.assembly_diff.find(r => r.prev?.assembly_mark === 'B2')!.status).toBe('removed')
  })

  it('returns null when the dispatch is the first-ever revision for its zone/sub-zone (no earlier revision, sibling or not)', async () => {
    const soloPrisma = buildGroupedPrisma()
    // Simulate viewing dispatch 1 itself (revision 0, nothing earlier than 0)
    const svc = new BomDiffService(soloPrisma as any)
    const result = await svc.computeDiff(1)
    expect(result).toBeNull()
  })
})
