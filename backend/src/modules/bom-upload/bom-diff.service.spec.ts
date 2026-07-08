import * as path from 'path'
import * as fs from 'fs'
import { NotFoundException } from '@nestjs/common'
import { BomDiffService, EffectiveGroup } from './bom-diff.service'
import { XlsxParserService } from './xlsx-parser.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Mirrors BomDiffService's own slotAwareWhere() shape: either a sole-contributor
// `{ dispatch_id: X }` (no slot filter needed) or `{ OR: [{dispatch_id, OR:[{slot},{slot:null}]}, ...] }`.
// Rows with no `slot` set (undefined) behave like `slot: null` (pre-Task-1 /
// Combined-mode rows), matching Prisma's actual `slot IS NULL` semantics.
function matchesSlotAwareWhere(row: { dispatch_id: number; slot?: string | null }, where: any): boolean {
  if (where == null) return false
  if (where.OR == null) return row.dispatch_id === where.dispatch_id
  return (where.OR as any[]).some(clause => {
    if (row.dispatch_id !== clause.dispatch_id) return false
    if (clause.OR == null) return true
    return (clause.OR as any[]).some(sc =>
      sc.slot === null ? (row.slot ?? null) === null : row.slot === sc.slot,
    )
  })
}

function filterBySlotAwareWhere<T extends { dispatch_id: number; slot?: string | null }>(rows: T[], where: any): T[] {
  return rows.filter(r => matchesSlotAwareWhere(r, where))
}

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

// Generic bom_dispatch.findMany mock covering every shape BomDiffService now
// queries with: `id.in` (exact list), `id.lte`/`id.lt` (resolveEffectiveGroup's
// bound, combined with project/zone/sub_zone/status filtering), always
// returned id-descending to match the service's own orderBy.
function buildDispatchFindMany(dispatches: any[]) {
  return jest.fn(({ where }: any = {}) => {
    if (where?.id?.in) {
      return Promise.resolve(dispatches.filter(d => where.id.in.includes(d.id)))
    }
    let rows = dispatches.filter(d =>
      d.project_id === where.project_id && d.zone_id === where.zone_id && d.sub_zone_id === where.sub_zone_id,
    )
    if (where.status?.not) rows = rows.filter(d => d.status !== where.status.not)
    if (where.revision !== undefined) rows = rows.filter(d => d.revision === where.revision)
    if (where.id?.lte !== undefined) rows = rows.filter(d => d.id <= where.id.lte)
    if (where.id?.lt !== undefined) rows = rows.filter(d => d.id < where.id.lt)
    return Promise.resolve([...rows].sort((a, b) => b.id - a.id))
  })
}

function buildPrisma(fixtures: ReturnType<typeof buildMockDataFromFixtures>) {
  const { p0Asm, p0Part, p0AsmPart, p1Asm, p1Part, p1AsmPart } = fixtures

  // Both fixture dispatches are plain combined uploads — no Main/Acc split.
  const dispatch0 = { id: 1, project_id: 10, zone_id: 20, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-01'), revision: 0, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }], assembly_total: p0Asm?.assemblies.length ?? null, part_total: p0Part?.parts.length ?? null }
  const dispatch1 = { id: 2, project_id: 10, zone_id: 20, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-01'), revision: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }], assembly_total: p1Asm?.assemblies.length ?? null, part_total: p1Part?.parts.length ?? null }

  const asm0Rows = (p0Asm?.assemblies ?? []).map((a, i) => ({ id: i + 1, dispatch_id: 1, assembly_mark: a.assembly_mark, name: a.name ?? null, qty: a.qty ?? null, weight_kg: a.weight_kg ?? null, surface_area_m2: a.surface_area_m2 ?? null }))
  const asm1Rows = (p1Asm?.assemblies ?? []).map((a, i) => ({ id: 1000 + i, dispatch_id: 2, assembly_mark: a.assembly_mark, name: a.name ?? null, qty: a.qty ?? null, weight_kg: a.weight_kg ?? null, surface_area_m2: a.surface_area_m2 ?? null }))

  const part0Rows = (p0Part?.parts ?? []).map((p, i) => ({ id: 2000 + i, dispatch_id: 1, part_mark: p.part_mark, description: p.description ?? null, profile: p.profile ?? null, grade: p.grade ?? null, qty: p.qty ?? null, weight_kg: p.weight_kg ?? null }))
  const part1Rows = (p1Part?.parts ?? []).map((p, i) => ({ id: 3000 + i, dispatch_id: 2, part_mark: p.part_mark, description: p.description ?? null, profile: p.profile ?? null, grade: p.grade ?? null, qty: p.qty ?? null, weight_kg: p.weight_kg ?? null }))

  // Build assembly_mark → id maps
  const asm0ByMark = new Map(asm0Rows.map(a => [a.assembly_mark, a]))
  const asm1ByMark = new Map(asm1Rows.map(a => [a.assembly_mark, a]))
  const part0ByMark = new Map(part0Rows.map(p => [p.part_mark, p]))
  const part1ByMark = new Map(part1Rows.map(p => [p.part_mark, p]))

  // Junction rows carry a synthetic `dispatch_id` (their assembly's) purely
  // so the mock can filter them the same way Prisma would filter on
  // `assembly: <slotAwareWhere>` — it isn't part of the real select/output.
  const junctions0 = (p0AsmPart?.assemblyParts ?? []).flatMap(j => {
    const a = asm0ByMark.get(j.assembly_mark)
    const p = part0ByMark.get(j.part_mark)
    if (!a || !p) return []
    return [{ dispatch_id: 1, assembly: { assembly_mark: a.assembly_mark }, part: { part_mark: p.part_mark }, qty: j.qty ?? 1 }]
  })

  const junctions1 = (p1AsmPart?.assemblyParts ?? []).flatMap(j => {
    const a = asm1ByMark.get(j.assembly_mark)
    const p = part1ByMark.get(j.part_mark)
    if (!a || !p) return []
    return [{ dispatch_id: 2, assembly: { assembly_mark: a.assembly_mark }, part: { part_mark: p.part_mark }, qty: j.qty ?? 1 }]
  })

  const allAsmRows = [...asm0Rows, ...asm1Rows]
  const allPartRows = [...part0Rows, ...part1Rows]
  const allJunctionRows = [...junctions0, ...junctions1]

  return {
    bom_dispatch: {
      findUnique: jest.fn(({ where }: any) => {
        if (where.id === 1) return Promise.resolve(dispatch0)
        if (where.id === 2) return Promise.resolve(dispatch1)
        return Promise.resolve(null)
      }),
      findMany: buildDispatchFindMany([dispatch0, dispatch1]),
    },
    bom_assembly: {
      findMany: jest.fn(({ where }: any) => Promise.resolve(filterBySlotAwareWhere(allAsmRows, where))),
    },
    bom_part: {
      findMany: jest.fn(({ where }: any) => Promise.resolve(filterBySlotAwareWhere(allPartRows, where))),
      count: jest.fn(({ where }: any) => Promise.resolve(filterBySlotAwareWhere(allPartRows, where).length)),
    },
    bom_assembly_part: {
      findMany: jest.fn(({ where }: any) => Promise.resolve(filterBySlotAwareWhere(allJunctionRows, where?.assembly))),
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
    const dispatch99 = { id: 99, project_id: 10, zone_id: 20, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), revision: 0, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }
    const noPrevPrisma = {
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(dispatch99),
        findMany: buildDispatchFindMany([dispatch99]),
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
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
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
    const prev = { id: 1, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-01'), revision: 0, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }], assembly_total: 2, part_total: 3 }
    const curr = { id: 2, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-01'), revision: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }], assembly_total: 2, part_total: 3 }

    return {
      bom_dispatch: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === 1 ? prev : curr)),
        findMany: buildDispatchFindMany([prev, curr]),
      },
      bom_assembly: {
        findMany: jest.fn(({ where }: any) => {
          // Both dispatches are plain combined (ASSEMBLY_LIST) uploads, so
          // resolveEffectiveGroup always resolves a sole contributor
          // (mainId === accId) here — where is `{ dispatch_id: X }`, no OR.
          const rows = [
            { dispatch_id: 1, assembly_mark: 'A1', name: 'Assembly 1', qty: 2, weight_kg: 100, surface_area_m2: 5 },
            { dispatch_id: 1, assembly_mark: 'A2', name: 'Assembly 2', qty: 1, weight_kg: 50, surface_area_m2: 3 },
            // curr: A1 changed weight, A2 removed, A3 added
            { dispatch_id: 2, assembly_mark: 'A1', name: 'Assembly 1', qty: 2, weight_kg: 120, surface_area_m2: 5 },
            { dispatch_id: 2, assembly_mark: 'A3', name: 'Assembly 3', qty: 1, weight_kg: 80, surface_area_m2: 4 },
          ]
          return Promise.resolve(filterBySlotAwareWhere(rows, where))
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

  it('classifies a dimension-only change (length_mm) as "changed", not "unchanged"', async () => {
    function makeDimensionChangePrisma() {
      const prev = { id: 1, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-01'), revision: 0, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }], assembly_total: 1, part_total: 0 }
      const curr = { id: 2, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-01'), revision: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }], assembly_total: 1, part_total: 0 }
      return {
        bom_dispatch: {
          findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === 1 ? prev : curr)),
          findMany: buildDispatchFindMany([prev, curr]),
        },
        bom_assembly: {
          findMany: jest.fn(({ where }: any) => {
            // Both plain combined uploads — sole-contributor `{ dispatch_id: X }` where.
            const rows = [
              { dispatch_id: 1, assembly_mark: 'A1', name: 'Assembly 1', qty: 1, weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50 },
              // curr: A1 — same name/qty/weight/area, only length_mm resized
              { dispatch_id: 2, assembly_mark: 'A1', name: 'Assembly 1', qty: 1, weight_kg: 100, surface_area_m2: 5, length_mm: 1200, width_mm: 200, height_mm: 50 },
            ]
            return Promise.resolve(filterBySlotAwareWhere(rows, where))
          }),
        },
        bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        bom_assembly_part: { findMany: jest.fn().mockResolvedValue([]) },
      }
    }

    const svc = new BomDiffService(makeDimensionChangePrisma() as any)
    const result = await svc.computeDiff(2)

    expect(result).not.toBeNull()
    const a1 = result!.assembly_diff.find(r => r.curr?.assembly_mark === 'A1')
    expect(a1!.status).toBe('changed')
    expect(a1!.prev!.length_mm).toBe(1000)
    expect(a1!.curr!.length_mm).toBe(1200)
  })
})

// ── Revision-group aggregation tests ──────────────────────────
//
// These cover the actual bug this design fixes: a Main-then-Acc-separately
// workflow across a revision boundary. Dispatch 1 (Main, rev1) and dispatch 2
// (Acc, rev1) together form "revision 1." Dispatch 3 (Acc-only, rev2) then
// advances the revision without re-touching Main — the fix must carry
// dispatch 1 (Main) forward as still-active and correctly classify it
// "unchanged" (not "removed"), while dispatch 2 → dispatch 3's real Acc
// content change is still diffed accurately.

describe('BomDiffService — revision-group aggregation', () => {
  function buildGroupedPrisma() {
    const dispatches = [
      { id: 1, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-01'), revision: 1, doc_revisions: [{ doc_type: 'MAIN_ASSEMBLY_LIST' }] },
      { id: 2, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-02'), revision: 1, doc_revisions: [{ doc_type: 'ACC_ASSEMBLY_LIST' }] },
      { id: 3, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-01'), revision: 2, doc_revisions: [{ doc_type: 'ACC_ASSEMBLY_LIST' }] },
    ]
    // Tagged with the same slot each dispatch's own doc_type implies (MAIN_*
    // → slot 'MAIN', ACC_* → slot 'ACC') — mirrors what the real upload write
    // path (Task 2) stamps, so slotAwareWhere's filtering is exercised for
    // real rather than trivially passing on an untagged fixture.
    const allAsmRows = [
      { dispatch_id: 1, slot: 'MAIN', assembly_mark: 'M1', name: 'Main 1', qty: 1, weight_kg: 80, surface_area_m2: 4 },
      { dispatch_id: 2, slot: 'ACC', assembly_mark: 'A1', name: 'Acc 1', qty: 1, weight_kg: 20, surface_area_m2: 1 },
      { dispatch_id: 3, slot: 'ACC', assembly_mark: 'A2', name: 'Acc 2', qty: 1, weight_kg: 25, surface_area_m2: 1.2 },
    ]
    return {
      bom_dispatch: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(dispatches.find(d => d.id === where.id) ?? null)),
        findMany: buildDispatchFindMany(dispatches),
      },
      bom_assembly: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(filterBySlotAwareWhere(allAsmRows, where))),
      },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue([]) },
    }
  }

  it('never treats a same-revision sibling as "previous" — Acc(2) viewed against Main(1), both revision 1, is null (nothing before revision 1)', async () => {
    const svc = new BomDiffService(buildGroupedPrisma() as any)
    const result = await svc.computeDiff(2) // dispatch 2 = Acc, revision 1 — Main(1)+Acc(2) together are the whole zone's first revision

    // This is the original bug this feature exists to fix: without the
    // same-revision group boundary, dispatch 1 (lower id, different slot)
    // would be mistaken for "previous" and produce a nonsense diff. Correct
    // behavior is null — there is nothing before revision 1.
    expect(result).toBeNull()
  })

  it('carries Main forward as unchanged when a later revision only re-uploads Acc — the exact bug this design fixes', async () => {
    const svc = new BomDiffService(buildGroupedPrisma() as any)
    const result = await svc.computeDiff(3) // dispatch 3 = Acc-only, revision 2 — Main not re-uploaded

    expect(result).not.toBeNull()
    const byMark = Object.fromEntries(result!.assembly_diff.map(r => [(r.curr ?? r.prev)!.assembly_mark, r.status]))

    // Main (M1) must NOT show as removed just because revision 2 didn't
    // re-touch it — it's still active, carried forward from revision 1.
    expect(byMark['M1']).toBe('unchanged')
    // The real Acc change (A1 → A2) is still diffed accurately.
    expect(byMark['A1']).toBe('removed')
    expect(byMark['A2']).toBe('added')
  })

  it('returns null when the dispatch is the first-ever revision for its zone/sub-zone (no earlier revision, sibling or not)', async () => {
    const soloPrisma = buildGroupedPrisma()
    const svc = new BomDiffService(soloPrisma as any)
    const result = await svc.computeDiff(1) // dispatch 1 = Main, revision 1, the very first upload
    expect(result).toBeNull()
  })

  // A single dispatch can carry BOTH MAIN_* and ACC_* doc_types at once —
  // the separate-mode upload UI allows submitting Main and Acc files
  // together in one call (e.g. via UpdateBomModal). This must supersede an
  // older, separately-uploaded Acc-only dispatch outright, not get unioned
  // alongside it (which would double-count the Acc content).
  it('a "both" dispatch (Main+Acc uploaded together) supersedes an older separate Acc dispatch without double-counting', async () => {
    const dispatches = [
      { id: 1, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-01'), revision: 1, doc_revisions: [{ doc_type: 'MAIN_ASSEMBLY_LIST' }] },
      { id: 2, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-01-02'), revision: 1, doc_revisions: [{ doc_type: 'ACC_ASSEMBLY_LIST' }] },
      { id: 3, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-01'), revision: 2, doc_revisions: [{ doc_type: 'ACC_ASSEMBLY_LIST' }] },
      // dispatch 4: both Main and Acc re-uploaded together, same content, same revision as dispatch 3
      { id: 4, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', uploaded_at: new Date('2025-02-02'), revision: 2, doc_revisions: [{ doc_type: 'MAIN_ASSEMBLY_LIST' }, { doc_type: 'ACC_ASSEMBLY_LIST' }] },
    ]
    // Slot-tagged the same way the real upload write path (Task 2) would:
    // MAIN_* content → slot 'MAIN', ACC_* content → slot 'ACC'.
    const allAsmRows = [
      { dispatch_id: 1, slot: 'MAIN', assembly_mark: 'M1', name: 'Main 1', qty: 1, weight_kg: 80, surface_area_m2: 4 },
      { dispatch_id: 2, slot: 'ACC', assembly_mark: 'A1', name: 'Acc 1', qty: 1, weight_kg: 20, surface_area_m2: 1 },
      { dispatch_id: 3, slot: 'ACC', assembly_mark: 'A2', name: 'Acc 2', qty: 1, weight_kg: 25, surface_area_m2: 1.2 },
      { dispatch_id: 4, slot: 'MAIN', assembly_mark: 'M1', name: 'Main 1', qty: 1, weight_kg: 80, surface_area_m2: 4 },
      { dispatch_id: 4, slot: 'ACC', assembly_mark: 'A2', name: 'Acc 2', qty: 1, weight_kg: 25, surface_area_m2: 1.2 },
    ]
    const prisma = {
      bom_dispatch: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(dispatches.find(d => d.id === where.id) ?? null)),
        findMany: buildDispatchFindMany(dispatches),
      },
      bom_assembly: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(filterBySlotAwareWhere(allAsmRows, where))),
      },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue([]) },
    }

    const svc = new BomDiffService(prisma as any)
    const result = await svc.computeDiff(4) // dispatch 4 = both Main+Acc, revision 2

    expect(result).not.toBeNull()
    const byMark = Object.fromEntries(result!.assembly_diff.map(r => [(r.curr ?? r.prev)!.assembly_mark, r.status]))

    // M1 is identical to revision 1's Main — unchanged. A1 (revision 1's
    // Acc) and A2 (revision 2's Acc) are genuinely different content across
    // the revision boundary — removed / added, exactly as if dispatch 4
    // were the sole current dispatch. The key assertion is exactly one A2
    // row (length 3, not 4): if dispatch 4 were wrongly classified as pure
    // "main" (matching MAIN_ first), dispatch 3's separate Acc-only data
    // would still be pulled in as a stale "current Acc" alongside dispatch
    // 4's own A2, producing a duplicate A2 row.
    expect(byMark['M1']).toBe('unchanged')
    expect(byMark['A1']).toBe('removed')
    expect(byMark['A2']).toBe('added')
    expect(result!.assembly_diff).toHaveLength(3) // M1 + A1(removed) + A2(added), no duplicate A2 row from double-counting
  })
})

// ── Slot-aware group loading (Task 3) ──────────────────────────
//
// resolveEffectiveGroup() correctly resolves which dispatch fills the Main
// role vs the Acc role, but a blind `dispatch_id: { in: ids } }` filter on
// top of that still pulls a reused "both"-slot dispatch's ENTIRE content —
// including the now-stale half a newer single-role upload superseded. These
// tests cover loadRevisionGroupData()'s slot-precise filtering directly.

describe('BomDiffService — slot-aware group loading', () => {
  function buildSlotPrisma(dispatches: any[], assemblyRows: any[]) {
    return {
      bom_dispatch: {
        findMany: buildDispatchFindMany(dispatches),
      },
      bom_assembly: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(filterBySlotAwareWhere(assemblyRows, where))),
      },
      bom_part: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      bom_assembly_part: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(filterBySlotAwareWhere([] as any[], where?.assembly))),
      },
    }
  }

  it('core reproduction: a newer Main-only upload (B) reused alongside an older "both" dispatch (A) for the Acc role excludes A\'s now-stale Main content', async () => {
    // Dispatch A (id 10): both Main (X, Y) and Acc (P, Q) uploaded together.
    // Dispatch B (id 20, newer): Main-only (Z) — supersedes A on the Main role.
    const dispatchA = { id: 10, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', doc_revisions: [{ doc_type: 'MAIN_ASSEMBLY_LIST' }, { doc_type: 'ACC_ASSEMBLY_LIST' }] }
    const dispatchB = { id: 20, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', doc_revisions: [{ doc_type: 'MAIN_ASSEMBLY_LIST' }] }
    const assemblyRows = [
      { dispatch_id: 10, slot: 'MAIN', assembly_mark: 'X' },
      { dispatch_id: 10, slot: 'MAIN', assembly_mark: 'Y' },
      { dispatch_id: 10, slot: 'ACC', assembly_mark: 'P' },
      { dispatch_id: 10, slot: 'ACC', assembly_mark: 'Q' },
      { dispatch_id: 20, slot: 'MAIN', assembly_mark: 'Z' },
    ]
    const prisma = buildSlotPrisma([dispatchA, dispatchB], assemblyRows)
    const svc = new BomDiffService(prisma as any)

    const group = await svc.resolveEffectiveGroup(1, 1, null, { lte: 20 })
    expect(group).toEqual({ mainId: 20, accId: 10 })

    const data = await (svc as any).loadRevisionGroupData(group)
    const marks = data.assemblies.map((a: any) => a.assembly_mark).sort()

    // X/Y are dispatch A's Main-slot marks — A is now superseded on the Main
    // role by B, so they must NOT appear. Z (B's own Main content) and P/Q
    // (A's Acc-slot content, untouched by B) must appear.
    expect(marks).toEqual(['P', 'Q', 'Z'])
  })

  it('mainId === accId (sole contributor — Combined snapshot or single dispatch satisfying both roles): all its rows included regardless of slot', async () => {
    const dispatchC = { id: 30, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }
    // Deliberately mixed/inconsistent slot tags — proves the sole-contributor
    // path bypasses slot filtering entirely rather than accidentally passing.
    const assemblyRows = [
      { dispatch_id: 30, slot: 'MAIN', assembly_mark: 'M' },
      { dispatch_id: 30, slot: 'ACC', assembly_mark: 'A' },
      { dispatch_id: 30, slot: null, assembly_mark: 'N' },
    ]
    const prisma = buildSlotPrisma([dispatchC], assemblyRows)
    const svc = new BomDiffService(prisma as any)

    const group = await svc.resolveEffectiveGroup(1, 1, null, { lte: 30 })
    expect(group).toEqual({ mainId: 30, accId: 30 })

    const data = await (svc as any).loadRevisionGroupData(group)
    const marks = data.assemblies.map((a: any) => a.assembly_mark).sort()
    expect(marks).toEqual(['A', 'M', 'N'])
  })

  it('one of mainId/accId is null (e.g. no Acc dispatch has ever existed): only the non-null side\'s rows appear, no crash', async () => {
    const dispatchB = { id: 20, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', doc_revisions: [{ doc_type: 'MAIN_ASSEMBLY_LIST' }] }
    const assemblyRows = [
      { dispatch_id: 20, slot: 'MAIN', assembly_mark: 'Z' },
    ]
    const prisma = buildSlotPrisma([dispatchB], assemblyRows)
    const svc = new BomDiffService(prisma as any)

    const group = await svc.resolveEffectiveGroup(1, 1, null, { lte: 20 })
    expect(group).toEqual({ mainId: 20, accId: null })

    const data = await (svc as any).loadRevisionGroupData(group)
    expect(data.assemblies.map((a: any) => a.assembly_mark)).toEqual(['Z'])
  })

  it('both mainId and accId null (previous state before any upload ever happened): empty result, no query issued', async () => {
    const prisma = buildSlotPrisma([], [])
    const svc = new BomDiffService(prisma as any)

    const data = await (svc as any).loadRevisionGroupData({ mainId: null, accId: null })
    expect(data).toEqual({ assemblies: [], parts: [], junctions: [] })
    expect(prisma.bom_assembly.findMany).not.toHaveBeenCalled()
    expect(prisma.bom_part.findMany).not.toHaveBeenCalled()
    expect(prisma.bom_assembly_part.findMany).not.toHaveBeenCalled()
  })

  it('computeDiff on the very first dispatch in a group still returns null (findPreviousRevisionGroup unchanged behavior)', async () => {
    const dispatchA = { id: 10, project_id: 1, zone_id: 1, sub_zone_id: null, status: 'complete', revision: 0, uploaded_at: new Date('2025-01-01'), doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }
    const prisma = {
      ...buildSlotPrisma([dispatchA], []),
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(dispatchA),
        findMany: buildDispatchFindMany([dispatchA]),
      },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    }
    const svc = new BomDiffService(prisma as any)
    const result = await svc.computeDiff(10)
    expect(result).toBeNull()
  })
})
