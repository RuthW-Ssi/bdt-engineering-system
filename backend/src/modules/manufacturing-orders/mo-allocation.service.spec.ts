import { MoAllocationService, ALLOCATING_STATUSES } from './mo-allocation.service'

// Regression coverage for the live bug (found via user manual testing after
// Task 8 shipped): Task 2's full-slot-replace upload path creates a
// brand-new bom_assembly row (new id) for EVERY mark on every re-upload,
// even marks whose content is completely unchanged — the old row flips to
// status='INACTIVE'. allocatedFor()/allocationMap()/etc. used to scope
// strictly on the literal bom_assembly_id FK on mo_assembly_line, so an
// existing MO/WO's allocation (still pointing at the old, now-INACTIVE row)
// went invisible against the new row — the MO creation picker then showed
// an already-allocated mark as "0 allocated, fully available", risking a
// duplicate MO/WO. Fix: resolve allocation by
// (assembly_mark, project_id, zone_id, sub_zone_id) instead of the raw FK.

type FakeDispatch = { project_id: number; zone_id: number; sub_zone_id: number | null }
type FakeAssembly = { id: number; assembly_mark: string; qty: number; status: string; dispatch: FakeDispatch; dispatch_id?: number }
type FakeMo = { id: number; status: string; mo_code: string }
type FakeLine = { id: number; mo_id: number; bom_assembly_id: number; qty: number }
type FakeRename = { id: number; kind: string; from_mark: string; to_mark: string; dispatch_id: number; project_id: number; zone_id: number; sub_zone_id: number | null }

function matchesDispatch(where: any, d: FakeDispatch): boolean {
  if (!where) return true
  if (where.project_id !== undefined && where.project_id !== d.project_id) return false
  if (where.zone_id !== undefined && where.zone_id !== d.zone_id) return false
  if (where.sub_zone_id !== undefined && where.sub_zone_id !== d.sub_zone_id) return false
  return true
}

function makeFakePrisma(assemblies: FakeAssembly[], mos: FakeMo[], lines: FakeLine[], renames: FakeRename[] = []) {
  function filterLines(where: any): FakeLine[] {
    return lines.filter((l) => {
      const mo = mos.find((m) => m.id === l.mo_id)
      if (!mo) return false
      if (where.mo?.status?.in && !where.mo.status.in.includes(mo.status)) return false
      if (where.mo_id?.not !== undefined && l.mo_id === where.mo_id.not) return false
      if (where.bom_assembly_id !== undefined && l.bom_assembly_id !== where.bom_assembly_id) return false
      if (where.bom_assembly) {
        const a = assemblies.find((x) => x.id === l.bom_assembly_id)
        if (!a) return false
        if (where.bom_assembly.OR) {
          const ok = where.bom_assembly.OR.some((c: any) => c.assembly_mark === a.assembly_mark
            && (c.dispatch_id?.gte == null || (a as any).dispatch_id >= c.dispatch_id.gte)
            && (c.dispatch_id?.lt == null || (a as any).dispatch_id < c.dispatch_id.lt))
          if (!ok) return false
        } else if (where.bom_assembly.assembly_mark !== undefined && a.assembly_mark !== where.bom_assembly.assembly_mark) return false
        else if (where.bom_assembly.dispatch_id) {
          const r = where.bom_assembly.dispatch_id
          if (r.gte != null && (a as any).dispatch_id < r.gte) return false
          if (r.lt != null && (a as any).dispatch_id >= r.lt) return false
        }
        if (!matchesDispatch(where.bom_assembly.dispatch, a.dispatch)) return false
      }
      return true
    })
  }

  function hydrate(l: FakeLine) {
    const a = assemblies.find((x) => x.id === l.bom_assembly_id)
    const mo = mos.find((m) => m.id === l.mo_id)
    return {
      ...l,
      mo: { mo_code: mo?.mo_code ?? '' },
      bom_assembly: a ? { assembly_mark: a.assembly_mark, dispatch_id: a.dispatch_id, dispatch: a.dispatch } : undefined,
    }
  }

  return {
    bom_assembly: {
      findUnique: jest.fn(({ where: { id } }: any) => {
        const a = assemblies.find((x) => x.id === id)
        if (!a) return Promise.resolve(null)
        return Promise.resolve({ assembly_mark: a.assembly_mark, qty: a.qty, dispatch_id: a.dispatch_id, dispatch: a.dispatch })
      }),
      findMany: jest.fn(({ where }: any) =>
        Promise.resolve(
          assemblies
            .filter((a) => a.status === where.status)
            .map((a) => ({ id: a.id, assembly_mark: a.assembly_mark, dispatch_id: a.dispatch_id, dispatch: a.dispatch })),
        ),
      ),
    },
    mo_assembly_line: {
      aggregate: jest.fn(({ where }: any) => {
        const matched = filterLines(where)
        const sum = matched.reduce((s, l) => s + l.qty, 0)
        return Promise.resolve({ _sum: { qty: matched.length ? sum : null } })
      }),
      findMany: jest.fn(({ where }: any) => Promise.resolve(filterLines(where).map(hydrate))),
    },
    bom_mark_rename: { findMany: jest.fn().mockResolvedValue(renames) },
  }
}

describe('MoAllocationService', () => {
  describe('bug repro: allocation survives a slot re-upload for an unchanged mark', () => {
    // Old row (id=1) — now INACTIVE after a re-upload — has a real MO
    // allocation of qty=5 against it (MO status DRAFT).
    const oldRow: FakeAssembly = {
      id: 1,
      assembly_mark: 'TC-CO2',
      qty: 8,
      status: 'INACTIVE',
      dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
    }
    // New row (id=2) — same physical mark + group, different id, qty=10,
    // content-identical to the old row (this is what Task 2's re-upload
    // produces even for an untouched mark).
    const newRow: FakeAssembly = {
      id: 2,
      assembly_mark: 'TC-CO2',
      qty: 10,
      status: 'ACTIVE',
      dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
    }
    const mos: FakeMo[] = [{ id: 100, status: 'DRAFT', mo_code: 'MO-0001' }]
    const lines: FakeLine[] = [{ id: 1000, mo_id: 100, bom_assembly_id: 1, qty: 5 }]

    it('allocatedFor(newRowId) reports 5 (not 0)', async () => {
      const prisma = makeFakePrisma([oldRow, newRow], mos, lines)
      const svc = new MoAllocationService(prisma as any)

      await expect(svc.allocatedFor(2)).resolves.toBe(5)
    })

    it('remainingFor(newRowId) is 5 (10 total − 5 allocated), not 10', async () => {
      const prisma = makeFakePrisma([oldRow, newRow], mos, lines)
      const svc = new MoAllocationService(prisma as any)

      await expect(svc.remainingFor(2)).resolves.toBe(5)
    })

    it('allocationMap() keys by the NEW (ACTIVE) row id with the mark-group total', async () => {
      const prisma = makeFakePrisma([oldRow, newRow], mos, lines)
      const svc = new MoAllocationService(prisma as any)

      const map = await svc.allocationMap()

      expect(map.get(2)).toBe(5)
      expect(map.has(1)).toBe(false) // old INACTIVE row is never a caller-visible key
    })

    it('allocationBreakdownMap()/allocationBreakdown() surface the OLD MO entry when queried against the NEW row id', async () => {
      const prisma = makeFakePrisma([oldRow, newRow], mos, lines)
      const svc = new MoAllocationService(prisma as any)

      const breakdown = await svc.allocationBreakdown(2)
      expect(breakdown).toEqual([{ mo_code: 'MO-0001', qty: 5 }])

      const breakdownMap = await svc.allocationBreakdownMap()
      expect(breakdownMap.get(2)).toEqual([{ mo_code: 'MO-0001', qty: 5 }])
    })
  })

  describe('excludeMoId', () => {
    const row: FakeAssembly = {
      id: 2,
      assembly_mark: 'TC-CO2',
      qty: 10,
      status: 'ACTIVE',
      dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
    }
    const mos: FakeMo[] = [
      { id: 100, status: 'DRAFT', mo_code: 'MO-0001' },
      { id: 101, status: 'CONFIRMED', mo_code: 'MO-0002' },
    ]
    // Two different MOs allocating against the same mark+group.
    const lines: FakeLine[] = [
      { id: 1000, mo_id: 100, bom_assembly_id: 2, qty: 5 },
      { id: 1001, mo_id: 101, bom_assembly_id: 2, qty: 3 },
    ]

    it('excludes only the given MO, not other MOs on the same mark', async () => {
      const prisma = makeFakePrisma([row], mos, lines)
      const svc = new MoAllocationService(prisma as any)

      await expect(svc.allocatedFor(2, 100)).resolves.toBe(3) // excludes MO 100's 5, keeps MO 101's 3
      await expect(svc.allocatedFor(2, 101)).resolves.toBe(5) // excludes MO 101's 3, keeps MO 100's 5
      await expect(svc.allocatedFor(2)).resolves.toBe(8) // no exclusion — both count
    })
  })

  describe('cross-contamination guards', () => {
    it('different marks in the same project/zone do not leak into each other', async () => {
      const markA: FakeAssembly = { id: 1, assembly_mark: 'TC-CO2', qty: 10, status: 'ACTIVE', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } }
      const markB: FakeAssembly = { id: 2, assembly_mark: 'TC-CO3', qty: 10, status: 'ACTIVE', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } }
      const mos: FakeMo[] = [{ id: 100, status: 'DRAFT', mo_code: 'MO-A' }]
      const lines: FakeLine[] = [{ id: 1000, mo_id: 100, bom_assembly_id: 1, qty: 5 }] // only mark A allocated

      const prisma = makeFakePrisma([markA, markB], mos, lines)
      const svc = new MoAllocationService(prisma as any)

      await expect(svc.allocatedFor(1)).resolves.toBe(5)
      await expect(svc.allocatedFor(2)).resolves.toBe(0)

      const map = await svc.allocationMap()
      expect(map.get(1)).toBe(5)
      expect(map.has(2)).toBe(false)
    })

    it('same mark in a different project/zone/sub_zone group does not leak', async () => {
      const groupOne: FakeAssembly = { id: 1, assembly_mark: 'TC-CO2', qty: 10, status: 'ACTIVE', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } }
      const groupTwo: FakeAssembly = { id: 2, assembly_mark: 'TC-CO2', qty: 10, status: 'ACTIVE', dispatch: { project_id: 2, zone_id: 1, sub_zone_id: null } }
      const mos: FakeMo[] = [{ id: 100, status: 'DRAFT', mo_code: 'MO-A' }]
      const lines: FakeLine[] = [{ id: 1000, mo_id: 100, bom_assembly_id: 1, qty: 5 }] // only group 1 allocated

      const prisma = makeFakePrisma([groupOne, groupTwo], mos, lines)
      const svc = new MoAllocationService(prisma as any)

      await expect(svc.allocatedFor(1)).resolves.toBe(5)
      await expect(svc.allocatedFor(2)).resolves.toBe(0)

      const map = await svc.allocationMap()
      expect(map.get(1)).toBe(5)
      expect(map.has(2)).toBe(false)
    })

    it('sub_zone_id distinguishes groups too (null vs a real sub-zone)', async () => {
      const noSubZone: FakeAssembly = { id: 1, assembly_mark: 'TC-CO2', qty: 10, status: 'ACTIVE', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } }
      const withSubZone: FakeAssembly = { id: 2, assembly_mark: 'TC-CO2', qty: 10, status: 'ACTIVE', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: 9 } }
      const mos: FakeMo[] = [{ id: 100, status: 'DRAFT', mo_code: 'MO-A' }]
      const lines: FakeLine[] = [{ id: 1000, mo_id: 100, bom_assembly_id: 2, qty: 4 }] // only the sub-zoned row allocated

      const prisma = makeFakePrisma([noSubZone, withSubZone], mos, lines)
      const svc = new MoAllocationService(prisma as any)

      await expect(svc.allocatedFor(1)).resolves.toBe(0)
      await expect(svc.allocatedFor(2)).resolves.toBe(4)
    })
  })

  describe('allocatedFor/allocationBreakdown status scoping (unchanged behavior)', () => {
    it('only counts ALLOCATING_STATUSES MOs (CANCELLED excluded)', async () => {
      const row: FakeAssembly = { id: 1, assembly_mark: 'TC-CO2', qty: 10, status: 'ACTIVE', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } }
      const mos: FakeMo[] = [
        { id: 100, status: 'DRAFT', mo_code: 'MO-A' },
        { id: 101, status: 'CANCELLED', mo_code: 'MO-B' },
      ]
      const lines: FakeLine[] = [
        { id: 1000, mo_id: 100, bom_assembly_id: 1, qty: 5 },
        { id: 1001, mo_id: 101, bom_assembly_id: 1, qty: 3 },
      ]
      expect(ALLOCATING_STATUSES).not.toContain('CANCELLED')

      const prisma = makeFakePrisma([row], mos, lines)
      const svc = new MoAllocationService(prisma as any)

      await expect(svc.allocatedFor(1)).resolves.toBe(5)
      const breakdown = await svc.allocationBreakdown(1)
      expect(breakdown).toEqual([{ mo_code: 'MO-A', qty: 5 }])
    })
  })

  describe('unknown bom_assembly id', () => {
    it('allocatedFor/allocationBreakdown/remainingFor degrade gracefully for a non-existent id', async () => {
      const prisma = makeFakePrisma([], [], [])
      const svc = new MoAllocationService(prisma as any)

      await expect(svc.allocatedFor(999)).resolves.toBe(0)
      await expect(svc.allocationBreakdown(999)).resolves.toEqual([])
      await expect(svc.remainingFor(999)).resolves.toBe(0)
    })
  })

  describe('MoAllocationService — mark renamed in the BOM (2026-10-21)', () => {
    const d = { project_id: 1, zone_id: 1, sub_zone_id: null }
    const assemblies: any[] = [
      { id: 1, dispatch_id: 1, assembly_mark: 'A', qty: 5, status: 'INACTIVE', dispatch: d },
      { id: 2, dispatch_id: 2, assembly_mark: 'B', qty: 5, status: 'ACTIVE', dispatch: d },
      { id: 3, dispatch_id: 3, assembly_mark: 'A', qty: 4, status: 'ACTIVE', dispatch: d }, // a NEW piece reusing the old name
    ]
    const mos = [{ id: 10, status: 'CONFIRMED', mo_code: 'MO-1' }]
    const lines = [{ id: 100, mo_id: 10, bom_assembly_id: 1, qty: 3 }]
    const renames = [{ id: 7, kind: 'ASSEMBLY', from_mark: 'A', to_mark: 'B', dispatch_id: 2, project_id: 1, zone_id: 1, sub_zone_id: null }]

    it('B (renamed from A) keeps A\'s 3 allocated sets; the later new A does not get them', async () => {
      const svc = new MoAllocationService(makeFakePrisma(assemblies, mos, lines, renames) as any)
      expect(await svc.allocatedFor(2)).toBe(3)
      expect(await svc.allocatedFor(3)).toBe(0)
      const map = await svc.allocationMap()
      expect([map.get(2), map.get(3)]).toEqual([3, undefined])
      const tips = await svc.allocationBreakdownMap()
      expect(tips.get(2)).toEqual([{ mo_code: 'MO-1', qty: 3 }])
    })

    // fix round 1 (item 3): a SINGLE-row path (allocatedFor/allocationBreakdown)
    // queried with the OLD A's own id must resolve forward to the current piece
    // (B) first — so it counts B's own line too, and still never the new A's.
    it('allocatedFor/allocationBreakdown given the OLD A row id resolve forward to B — counting B\'s own line too, never the new A\'s', async () => {
      const linesWithB = [...lines, { id: 101, mo_id: 10, bom_assembly_id: 2, qty: 2 }, { id: 102, mo_id: 10, bom_assembly_id: 3, qty: 9 }]
      const svc = new MoAllocationService(makeFakePrisma(assemblies, mos, linesWithB, renames) as any)
      // queried by the stale/INACTIVE old A id (1) — must match querying by B's own id (2)
      expect(await svc.allocatedFor(1)).toBe(5) // old A's own 3 + B's own 2 — never the new A's 9
      expect(await svc.allocatedFor(1)).toBe(await svc.allocatedFor(2))
      const breakdown = await svc.allocationBreakdown(1)
      expect(breakdown.sort((a, b) => a.qty - b.qty)).toEqual([{ mo_code: 'MO-1', qty: 2 }, { mo_code: 'MO-1', qty: 3 }])
    })
  })
})
