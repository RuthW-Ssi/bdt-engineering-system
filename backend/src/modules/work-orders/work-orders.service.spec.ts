import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common'
import { WorkOrdersService } from './work-orders.service'

// Scoped narrowly to bomVersionStatus()/specOf() (T-WO.04 · BOM Version Alert) —
// this is the only part of WorkOrdersService with any test coverage today.

function makeWo(overrides: Partial<{
  bom_dispatch_id_snapshot: number
  bom_assembly: Record<string, unknown>
}> = {}) {
  return {
    id: 1,
    bom_dispatch_id_snapshot: 10,
    bom_assembly: {
      id: 100,
      dispatch_id: 10, // always in sync with bom_dispatch_id_snapshot (see wo-auto-create.service.ts / acceptNewVersion)
      assembly_mark: 'WH-CO-001',
      qty: 2,
      weight_kg: 100,
      surface_area_m2: 5,
      length_mm: 1000,
      width_mm: 200,
      height_mm: 50,
      attributes: {},
    },
    ...overrides,
  }
}

function makeDispatch(id: number, uploaded_at: Date) {
  return { id, project_id: 1, zone_id: 1, sub_zone_id: null, uploaded_at }
}

describe('WorkOrdersService.bomVersionStatus', () => {
  // Task 6 (Sprint 20 WO BOM-Version Hold false-positive bugfix): compareAssemblyToLatest()
  // now finds "the latest" via a single direct `bom_assembly.findFirst({ status: 'ACTIVE',
  // assembly_mark, dispatch: { project_id, zone_id, sub_zone_id } })` query — not via a
  // dispatch-level "most recently uploaded dispatch in the group" lookup (the old, buggy
  // latestDispatchForGroup() mechanism, deleted in this task). bom_dispatch.findFirst is
  // no longer called anywhere in this flow.

  it('returns is_outdated: false when the currently ACTIVE row for the mark is the WO\'s own snapshotted row', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(snap) },
      // The mark-scoped ACTIVE lookup finds the WO's own row (id 100) — untouched.
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(wo.bom_assembly) },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result).toMatchObject({ is_outdated: false, delta_types: [], delta_details: null })
    expect(prisma.bom_assembly.findFirst).toHaveBeenCalledWith({
      where: {
        assembly_mark: 'WH-CO-001',
        status: 'ACTIVE',
        dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
      },
    })
  })

  // This is the direct regression test for the confirmed production bug: a Main-slot
  // WO's assembly ('WH-MA-001', dispatch 10) is genuinely untouched, but an unrelated
  // Acc-only upload (dispatch 30, mark 'WH-AC-001') is the group's most-recently-uploaded
  // dispatch. A dispatch-scoped "latest dispatch" lookup (the old, deleted
  // latestDispatchForGroup() mechanism) would search dispatch 30 for 'WH-MA-001', find
  // nothing, and wrongly classify REMOVED — auto-holding an untouched WO. The mark-scoped
  // ACTIVE lookup ignores which dispatch is "newest" entirely and correctly finds the WO's
  // own still-ACTIVE row regardless of what else was uploaded to the group afterwards.
  it('does NOT classify REMOVED when the newest dispatch in the group is an unrelated Acc-only upload that never touched this mark (Task 6 false-positive repro)', async () => {
    const wo = makeWo({ bom_assembly: { ...makeWo().bom_assembly, assembly_mark: 'WH-MA-001' } }) // Main-slot mark, dispatch 10
    const snap = makeDispatch(10, new Date('2026-01-01'))
    // Simulated group state: dispatch 10 (Main, older) still owns the only ACTIVE row for
    // 'WH-MA-001'; dispatch 30 (Acc, newer — the group's overall most-recent upload) only
    // touched a different mark, 'WH-AC-001'. A per-mark ACTIVE query must find the former
    // and never get confused by the latter simply being "more recent".
    const groupRows = [
      { ...wo.bom_assembly, id: 100, dispatch_id: 10, assembly_mark: 'WH-MA-001', status: 'ACTIVE' },
      {
        id: 300, dispatch_id: 30, assembly_mark: 'WH-AC-001', status: 'ACTIVE',
        qty: 1, weight_kg: 1, surface_area_m2: 1, length_mm: 1, width_mm: 1, height_mm: 1, attributes: {},
      },
    ]
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(snap) },
      bom_assembly: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: { assembly_mark: string; status: string } }) =>
          Promise.resolve(groupRows.find((r) => r.assembly_mark === where.assembly_mark && r.status === where.status) ?? null),
        ),
      },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(false)
    expect(result.delta_types).toEqual([])
  })

  it('returns is_outdated: false when the snapshot dispatch row no longer exists', async () => {
    const wo = makeWo()
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(null) }, // snapshot row deleted
      bom_assembly: { findFirst: jest.fn() },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result).toMatchObject({ is_outdated: false, delta_types: [], delta_details: null })
    expect(prisma.bom_assembly.findFirst).not.toHaveBeenCalled()
  })

  it('classifies REMOVED when no ACTIVE row for the mark exists anywhere in the group', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(snap) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null) }, // no ACTIVE row for this mark in the group
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(true)
    expect(result.delta_types).toEqual(['REMOVED'])
    expect(result.delta_details).toBeNull()
  })

  it('classifies QTY_CHANGED with delta_details.qty when only qty differs', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latestAsm = { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 5 } // qty 2 -> 5, spec unchanged
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(snap) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(true)
    expect(result.delta_types).toEqual(['QTY_CHANGED'])
    expect(result.delta_details).toEqual({ qty: { from: 2, to: 5 } })
    expect(result.latest_dispatch_id).toBe(20)
  })

  it('classifies SPEC_CHANGED with delta_details.spec when only a dimension (length_mm) differs', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latestAsm = { ...wo.bom_assembly, id: 200, dispatch_id: 20, length_mm: 1200 } // qty unchanged, length resized
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(snap) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(true)
    expect(result.delta_types).toEqual(['SPEC_CHANGED'])
    expect(result.delta_details).toEqual({
      spec: {
        from: { weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50, attributes: {} },
        to: { weight_kg: 100, surface_area_m2: 5, length_mm: 1200, width_mm: 200, height_mm: 50, attributes: {} },
      },
    })
  })

  it('classifies both QTY_CHANGED and SPEC_CHANGED when qty and a dimension both differ', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latestAsm = { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 3, width_mm: 250 }
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(snap) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(true)
    expect(result.delta_types).toEqual(['QTY_CHANGED', 'SPEC_CHANGED'])
    expect(result.delta_details).toMatchObject({
      qty: { from: 2, to: 3 },
      spec: { from: expect.objectContaining({ width_mm: 200 }), to: expect.objectContaining({ width_mm: 250 }) },
    })
  })

  it('throws NotFoundException when the work order does not exist', async () => {
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(null) },
      bom_dispatch: { findUnique: jest.fn() },
      bom_assembly: { findFirst: jest.fn() },
    }
    const svc = new WorkOrdersService(prisma as any)

    await expect(svc.bomVersionStatus(999)).rejects.toThrow(NotFoundException)
  })
})

// Scoped to WorkOrdersService.isSignificantDelta() — the shared significance filter
// extracted from applyBomChangeHolds()'s WO-hold loop (bugfix, WO BOM-Version Hold
// follow-up). A newer dispatch existing for the group (is_outdated: true) is NOT by
// itself grounds to hold a WO or warn on a DRAFT MO line — only a REMOVED,
// SPEC_CHANGED, or qty-decrease delta is "significant". A byte-identical re-upload
// (is_outdated: true, delta_types: []) must be treated as insignificant.
describe('WorkOrdersService.isSignificantDelta', () => {
  const svc = new WorkOrdersService({} as any)

  it('returns true for REMOVED', () => {
    expect(svc.isSignificantDelta({ delta_types: ['REMOVED'], delta_details: null })).toBe(true)
  })

  it('returns true for SPEC_CHANGED', () => {
    expect(svc.isSignificantDelta({ delta_types: ['SPEC_CHANGED'], delta_details: null })).toBe(true)
  })

  it('returns true for QTY_CHANGED when qty decreased', () => {
    expect(
      svc.isSignificantDelta({ delta_types: ['QTY_CHANGED'], delta_details: { qty: { from: 3, to: 2 } } }),
    ).toBe(true)
  })

  it('returns false for QTY_CHANGED when qty increased (informational only)', () => {
    expect(
      svc.isSignificantDelta({ delta_types: ['QTY_CHANGED'], delta_details: { qty: { from: 1, to: 2 } } }),
    ).toBe(false)
  })

  it('returns false when delta_types is empty (byte-identical re-upload)', () => {
    expect(svc.isSignificantDelta({ delta_types: [], delta_details: null })).toBe(false)
  })
})

// Scoped to findAll()'s is_outdated badge (T-WO.09 · Task 8, Sprint 20 WO BOM-Version
// Hold — 6th consumer of the bug class Tasks 1-7 fixed): computeOutdatedWoIds() replaces
// the old outdatedSnapshotDispatchIds() (dispatch-recency-per-group, blind to independent
// Main/Acc uploads) with a batched, mark-level lookup that reuses classifyAssemblyDelta()
// (the same pure comparator compareAssemblyToLatest() uses) + isSignificantDelta().
describe('WorkOrdersService.findAll — is_outdated badge (batched)', () => {
  function makeWoRow(overrides: Partial<{
    id: number
    wo_code: string
    status: string
    earliest_start_at: Date | null
    bom_assembly: Record<string, unknown>
  }> = {}) {
    return {
      id: 1,
      wo_code: 'WO-0001',
      status: 'NOT_STARTED',
      sequence: 1,
      manufacturing_order: {
        id: 1, mo_code: 'MO-0001', status: 'CONFIRMED',
        primary_mark_prefix_code: 'WH', primary_mark_prefix: { id: 1, code: 'WH' },
      },
      mrp_workcenter: { id: 1, code: 'WC1', name: 'Workcenter 1', machine: null },
      bom_assembly: {
        id: 100,
        dispatch_id: 10,
        assembly_mark: 'WH-MA-001',
        qty: 2,
        weight_kg: 100,
        surface_area_m2: 5,
        length_mm: 1000,
        width_mm: 200,
        height_mm: 50,
        attributes: {},
        dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
      },
      earliest_start_at: null,
      actual_start_at: null,
      actual_end_at: null,
      target_end_at: null,
      qty_done: null,
      qty_scrapped: null,
      assigned_to: null,
      bom_dispatch_id_snapshot: 10,
      ...overrides,
    }
  }

  // Simulates the currently-ACTIVE bom_assembly rows across the whole system. The mock
  // filters by the batched `where.OR` tuples exactly like a real mark+group query would,
  // so a test can assert the call count independent of how many WO rows are passed in.
  function makePrisma(rows: ReturnType<typeof makeWoRow>[], activeAssemblies: Record<string, any>[]) {
    const bomAssemblyFindMany = jest.fn().mockImplementation(({ where }: any) => {
      const matches = activeAssemblies.filter((a) =>
        (where.OR as any[]).some(
          (cond) =>
            a.assembly_mark === cond.assembly_mark &&
            a.dispatch.project_id === cond.dispatch.project_id &&
            a.dispatch.zone_id === cond.dispatch.zone_id &&
            a.dispatch.sub_zone_id === cond.dispatch.sub_zone_id,
        ),
      )
      return Promise.resolve(matches)
    })
    return {
      work_order: { findMany: jest.fn().mockResolvedValue(rows) },
      bom_assembly: { findMany: bomAssemblyFindMany },
    }
  }

  // Direct reproduction of the bug this task fixes (mirrors Task 6's WO-hold regression
  // test): a Main-slot WO's assembly ('WH-MA-001', dispatch 10) is genuinely untouched.
  // The old outdatedSnapshotDispatchIds() picked the single most-recently-uploaded
  // dispatch per (project, zone, sub_zone) group — an unrelated Acc-only upload (dispatch
  // 30, mark 'WH-AC-001') would become that "newest" dispatch and falsely flag every WO
  // snapshotted on dispatch 10, including this untouched Main-slot one. The batched
  // mark-level lookup ignores which dispatch is newest entirely.
  it('does NOT flag an untouched Main-slot WO as outdated after an unrelated Acc-only upload to the same group', async () => {
    const row = makeWoRow() // bom_assembly id 100, dispatch_id 10, mark 'WH-MA-001'
    const activeAssemblies = [
      // 'WH-MA-001' is still owned by the WO's own row — untouched.
      { id: 100, dispatch_id: 10, assembly_mark: 'WH-MA-001', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } },
      // Unrelated Acc-only upload — different mark, newer dispatch — must not affect the row above.
      { id: 300, dispatch_id: 30, assembly_mark: 'WH-AC-001', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } },
    ]
    const prisma = makePrisma([row], activeAssemblies)
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.findAll({})

    expect(result.find((w) => w.id === 1)?.is_outdated).toBe(false)
  })

  it('flags a WO as outdated when its mark genuinely changed (qty decreased on the currently-ACTIVE row)', async () => {
    const row = makeWoRow() // bom_assembly id 100, dispatch_id 10, mark 'WH-MA-001', qty 2
    const activeAssemblies = [
      // A different, newer row now owns 'WH-MA-001' with a decreased qty — significant.
      {
        id: 200, dispatch_id: 20, assembly_mark: 'WH-MA-001', qty: 1,
        weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50, attributes: {},
        dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
      },
    ]
    const prisma = makePrisma([row], activeAssemblies)
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.findAll({})

    expect(result.find((w) => w.id === 1)?.is_outdated).toBe(true)
  })

  it('flags a WO as outdated when its mark was genuinely removed (no ACTIVE row anywhere in the group)', async () => {
    const row = makeWoRow()
    const prisma = makePrisma([row], []) // no ACTIVE rows at all → REMOVED
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.findAll({})

    expect(result.find((w) => w.id === 1)?.is_outdated).toBe(true)
  })

  // Same false-positive class the whole plan guards against (mirrors MO's
  // stale_assembly_warnings guard): a re-upload can reintroduce a byte-identical
  // assembly under a new dispatch_id/id. is_outdated must NOT fire on that alone —
  // isSignificantDelta() must gate the batched path exactly like the single-WO path.
  it('does NOT flag a WO when a different ACTIVE row exists for the mark but it is byte-identical (re-upload, no meaningful change)', async () => {
    const row = makeWoRow() // qty 2, weight_kg 100, surface_area_m2 5, length/width/height 1000/200/50
    const activeAssemblies = [
      {
        id: 200, dispatch_id: 20, assembly_mark: 'WH-MA-001', qty: 2,
        weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50, attributes: {},
        dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
      },
    ]
    const prisma = makePrisma([row], activeAssemblies)
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.findAll({})

    expect(result.find((w) => w.id === 1)?.is_outdated).toBe(false)
  })

  // The core performance constraint: findAll() is unpaginated (dozens-to-hundreds of WOs
  // per real call), so the ACTIVE-row lookup must be ONE batched query regardless of how
  // many rows (or distinct groups) are present — never one query per row.
  it('issues exactly one batched bom_assembly query regardless of WO row count (no N+1)', async () => {
    const rows = [
      makeWoRow({ id: 1, bom_assembly: { ...makeWoRow().bom_assembly, id: 100, assembly_mark: 'WH-MA-001' } }),
      makeWoRow({ id: 2, bom_assembly: { ...makeWoRow().bom_assembly, id: 101, dispatch_id: 11, assembly_mark: 'WH-MA-002' } }),
      makeWoRow({ id: 3, bom_assembly: { ...makeWoRow().bom_assembly, id: 102, dispatch_id: 12, assembly_mark: 'WH-MA-003' } }),
      makeWoRow({ id: 4, bom_assembly: { ...makeWoRow().bom_assembly, id: 103, dispatch_id: 13, assembly_mark: 'WH-MA-004' } }),
      makeWoRow({ id: 5, bom_assembly: { ...makeWoRow().bom_assembly, id: 104, dispatch_id: 14, assembly_mark: 'WH-MA-005' } }),
    ]
    const activeAssemblies = rows.map((r) => ({
      ...(r.bom_assembly as Record<string, unknown>),
      dispatch: (r.bom_assembly as any).dispatch,
    }))
    const prisma = makePrisma(rows, activeAssemblies)
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.findAll({})

    expect(result).toHaveLength(5)
    expect(prisma.bom_assembly.findMany).toHaveBeenCalledTimes(1) // one batched call, not five
    result.forEach((w) => expect(w.is_outdated).toBe(false)) // each WO owns its own mark's ACTIVE row untouched
  })

  it('returns an empty outdated set (and skips the query entirely) when findAll() returns no rows', async () => {
    const prisma = makePrisma([], [])
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.findAll({})

    expect(result).toEqual([])
    expect(prisma.bom_assembly.findMany).not.toHaveBeenCalled()
  })
})

// Scoped to applyBomChangeHolds() (WO BOM-Version Hold, Sprint 20 T02) — the
// hold-trigger logic invoked post-commit from BomUploadService.upload().
//
// dispatchId 20 is always the just-uploaded dispatch that triggered the check;
// dispatch 10 is a candidate WO's/line's pre-existing (now potentially superseded)
// snapshot. Task 6: bom_assembly.findFirst is now keyed by assembly_mark + status
// ('ACTIVE') — NOT by dispatch_id — so `activeByMark` below simulates "the row
// currently ACTIVE for this mark anywhere in the group", independent of which
// dispatch is newest. bom_dispatch.findFirst (the old latestDispatchForGroup()
// mechanism) is gone — no longer mocked here.
describe('WorkOrdersService.applyBomChangeHolds', () => {
  function makePrisma(overrides: {
    candidates?: { id: number; status: string }[]
    woById?: Record<number, ReturnType<typeof makeWo>>
    activeByMark?: Record<string, unknown | null> // keyed by assembly_mark
  } = {}) {
    const newDispatch = makeDispatch(20, new Date('2026-02-01'))
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const candidates = overrides.candidates ?? []
    const woById = overrides.woById ?? {}
    const activeByMark = overrides.activeByMark ?? {}

    const prisma: any = {
      bom_dispatch: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }: { where: { id: number } }) => {
          if (id === 20) return Promise.resolve(newDispatch)
          if (id === 10) return Promise.resolve(snap)
          return Promise.resolve(null)
        }),
      },
      work_order: {
        findMany: jest.fn().mockResolvedValue(candidates),
        findUnique: jest.fn().mockImplementation(({ where: { id } }: { where: { id: number } }) =>
          Promise.resolve(woById[id] ?? null),
        ),
        update: jest.fn(),
      },
      work_order_event: { create: jest.fn() },
      bom_assembly: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: { assembly_mark: string; status: string } }) =>
          Promise.resolve(
            Object.prototype.hasOwnProperty.call(activeByMark, where.assembly_mark)
              ? activeByMark[where.assembly_mark]
              : null,
          ),
        ),
      },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb(prisma)),
    }
    return prisma
  }

  it('sets ON_HOLD + writes a HOLD event for a WO whose assembly was REMOVED', async () => {
    const wo = makeWo() // bom_assembly.dispatch_id: 10, assembly_mark: 'WH-CO-001'
    const prisma = makePrisma({
      candidates: [{ id: 1, status: 'IN_PROGRESS' }],
      woById: { 1: wo },
      activeByMark: { 'WH-CO-001': null }, // REMOVED — no ACTIVE row for this mark anywhere in the group
    })
    const svc = new WorkOrdersService(prisma)

    const result = await svc.applyBomChangeHolds(20)

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'ON_HOLD', pre_hold_status: 'IN_PROGRESS' },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 1, event_type: 'HOLD' }),
    })
    expect(result.held_wo_ids).toEqual([1])
  })

  it('sets ON_HOLD when qty decreased (e.g. 3 → 2)', async () => {
    const wo = makeWo({ bom_assembly: { ...makeWo().bom_assembly, qty: 3 } })
    const prisma = makePrisma({
      candidates: [{ id: 1, status: 'RELEASED' }],
      woById: { 1: wo },
      activeByMark: { 'WH-CO-001': { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 2 } },
    })
    const svc = new WorkOrdersService(prisma)

    const result = await svc.applyBomChangeHolds(20)

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'ON_HOLD', pre_hold_status: 'RELEASED' },
    })
    expect(result.held_wo_ids).toEqual([1])
  })

  it('does NOT hold when qty increased (e.g. 1 → 2)', async () => {
    const wo = makeWo({ bom_assembly: { ...makeWo().bom_assembly, qty: 1 } })
    const prisma = makePrisma({
      candidates: [{ id: 1, status: 'IN_PROGRESS' }],
      woById: { 1: wo },
      activeByMark: { 'WH-CO-001': { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 2 } },
    })
    const svc = new WorkOrdersService(prisma)

    const result = await svc.applyBomChangeHolds(20)

    expect(result.held_wo_ids).not.toContain(1)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
  })

  it('sets ON_HOLD when SPEC_CHANGED (dimension differs)', async () => {
    const wo = makeWo()
    const prisma = makePrisma({
      candidates: [{ id: 1, status: 'IN_PROGRESS' }],
      woById: { 1: wo },
      activeByMark: { 'WH-CO-001': { ...wo.bom_assembly, id: 200, dispatch_id: 20, length_mm: 1200 } }, // qty unchanged, length resized
    })
    const svc = new WorkOrdersService(prisma)

    const result = await svc.applyBomChangeHolds(20)

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'ON_HOLD', pre_hold_status: 'IN_PROGRESS' },
    })
    expect(result.held_wo_ids).toEqual([1])
  })

  it('skips WOs already DONE or CANCELLED', async () => {
    const prisma = makePrisma({ candidates: [] }) // DB-level filter excludes them — assert the filter is applied
    const svc = new WorkOrdersService(prisma)

    const result = await svc.applyBomChangeHolds(20)

    expect(prisma.work_order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ['DONE', 'CANCELLED', 'ON_HOLD'] } }),
      }),
    )
    expect(prisma.work_order.update).not.toHaveBeenCalled()
    expect(result.held_wo_ids).toEqual([])
  })

  // This is the bugfix regression test: is_outdated is true (a different ACTIVE
  // row exists for this mark elsewhere in the group) but it is byte-identical
  // (same qty/weight/dims) — a real, reachable case (e.g. a re-upload that
  // reintroduces an assembly with unchanged specs). delta_types is genuinely
  // empty, so this must NOT hold the WO. This already passed before the
  // isSignificantDelta refactor (the inline isRemoved/isSpecChanged/isQtyDecrease
  // computation was already correct here) — it exists to confirm the refactor
  // doesn't regress it.
  it('does NOT hold when is_outdated is true but delta_types is empty (byte-identical re-upload)', async () => {
    const wo = makeWo()
    const prisma = makePrisma({
      candidates: [{ id: 1, status: 'IN_PROGRESS' }],
      woById: { 1: wo },
      activeByMark: { 'WH-CO-001': { ...wo.bom_assembly, id: 200, dispatch_id: 20 } }, // same qty/spec — only id/dispatch differ
    })
    const svc = new WorkOrdersService(prisma)

    const result = await svc.applyBomChangeHolds(20)

    expect(result.held_wo_ids).not.toContain(1)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
  })

  // Task 6: the confirmed production bug, reproduced end-to-end through the exact
  // entry point BomUploadService.upload() calls post-commit. dispatch 20 is an
  // Acc-only upload that only superseded 'WH-AC-002' (Acc slot). WO 1 (Main slot,
  // mark 'WH-MA-001') is a candidate purely because it's in the same (project,
  // zone, sub_zone) group — its own assembly is completely untouched by dispatch
  // 20. The old dispatch-scoped "latest dispatch" lookup would have searched
  // dispatch 20 for 'WH-MA-001', found nothing, classified REMOVED, and
  // auto-flipped WO 1 to ON_HOLD — the exact bug. WO 2 (Acc slot, mark
  // 'WH-AC-002') genuinely was superseded (qty decreased) and must still be held,
  // proving the fix doesn't over-correct into never holding anything.
  it('does NOT auto-hold an untouched Main-slot WO when an unrelated Acc-only upload triggers the group check (false-positive-hold regression)', async () => {
    const mainWo = {
      ...makeWo(),
      id: 1,
      bom_assembly: { ...makeWo().bom_assembly, id: 100, dispatch_id: 10, assembly_mark: 'WH-MA-001' },
    }
    const accWo = {
      ...makeWo(),
      id: 2,
      bom_assembly: { ...makeWo().bom_assembly, id: 150, dispatch_id: 15, assembly_mark: 'WH-AC-002', qty: 4 },
    }
    const prisma = makePrisma({
      candidates: [
        { id: 1, status: 'IN_PROGRESS' }, // Main — untouched
        { id: 2, status: 'RELEASED' }, // Acc — genuinely superseded
      ],
      woById: { 1: mainWo, 2: accWo },
      activeByMark: {
        // Main mark's ACTIVE row is still WO 1's own row — dispatch 20 never touched it.
        'WH-MA-001': mainWo.bom_assembly,
        // Acc mark's ACTIVE row moved to dispatch 20 with a decreased qty.
        'WH-AC-002': { ...accWo.bom_assembly, id: 250, dispatch_id: 20, qty: 2 },
      },
    })
    const svc = new WorkOrdersService(prisma)

    const result = await svc.applyBomChangeHolds(20)

    expect(result.held_wo_ids).toEqual([2])
    expect(result.held_wo_ids).not.toContain(1)
    expect(prisma.work_order.update).toHaveBeenCalledTimes(1)
    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { status: 'ON_HOLD', pre_hold_status: 'RELEASED' },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(1)
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 2, event_type: 'HOLD' }),
    })
  })

  it('returns held_wo_ids: [] when nothing in the group is affected', async () => {
    const prisma = makePrisma({ candidates: [] })
    const svc = new WorkOrdersService(prisma)

    const result = await svc.applyBomChangeHolds(20)

    expect(result).toEqual({ held_wo_ids: [] })
  })

  it('contains a per-WO hold failure — logs it and still holds the other candidates instead of aborting', async () => {
    // Three REMOVED candidates; WO 2's transaction (work_order.update) throws a
    // transient error. WO 1 and WO 3 must still end up held, and the method must
    // not throw — a failure mid-loop must not undo/abort the rest of the run.
    const wo1 = { ...makeWo(), id: 1, bom_assembly: { ...makeWo().bom_assembly, assembly_mark: 'WH-CO-001' } }
    const wo2 = { ...makeWo(), id: 2, bom_assembly: { ...makeWo().bom_assembly, assembly_mark: 'WH-CO-002' } }
    const wo3 = { ...makeWo(), id: 3, bom_assembly: { ...makeWo().bom_assembly, assembly_mark: 'WH-CO-003' } }
    const prisma = makePrisma({
      candidates: [
        { id: 1, status: 'IN_PROGRESS' },
        { id: 2, status: 'IN_PROGRESS' },
        { id: 3, status: 'IN_PROGRESS' },
      ],
      woById: { 1: wo1, 2: wo2, 3: wo3 },
      activeByMark: { 'WH-CO-001': null, 'WH-CO-002': null, 'WH-CO-003': null }, // REMOVED for all three — every candidate attempts a hold
    })
    prisma.work_order.update = jest.fn().mockImplementation(({ where: { id } }: { where: { id: number } }) => {
      if (id === 2) throw new Error('transient DB error')
      return Promise.resolve({ id })
    })
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined as any)

    const svc = new WorkOrdersService(prisma)
    const result = await svc.applyBomChangeHolds(20)

    expect(result.held_wo_ids).toEqual([1, 3])
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 1, event_type: 'HOLD' }),
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 3, event_type: 'HOLD' }),
    })
    expect(prisma.work_order_event.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 2 }),
    })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('WO 2'), expect.anything())
    errorSpy.mockRestore()
  })
})

// Scoped to acceptNewVersion() (WO BOM-Version Hold, Sprint 20 T03) — note required
// + conditional qty_reusable when resolving a WO out of ON_HOLD; existing REMOVED
// 409 guard and non-hold accept behavior must be unaffected.
describe('WorkOrdersService.acceptNewVersion', () => {
  function makeFullWo(overrides: Partial<{
    status: string
    qty_done: number | null
    qty_reusable: number | null
    pre_hold_status: string | null
    bom_assembly: Record<string, unknown>
    bom_dispatch_id_snapshot: number
  }> = {}) {
    return {
      id: 1,
      status: 'ON_HOLD',
      qty_done: null,
      qty_reusable: null,
      pre_hold_status: 'IN_PROGRESS',
      bom_dispatch_id_snapshot: 10,
      bom_assembly: {
        id: 100,
        dispatch_id: 10,
        assembly_mark: 'WH-CO-001',
        qty: 2,
        weight_kg: 100,
        surface_area_m2: 5,
        length_mm: 1000,
        width_mm: 200,
        height_mm: 50,
        attributes: {},
      },
      ...overrides,
    }
  }

  // latestAsm: null simulates REMOVED (no ACTIVE row for this mark anywhere in the
  // group). Task 6: bom_assembly.findFirst is now the sole lookup (no more
  // bom_dispatch.findFirst / latestDispatchForGroup) — fixtures set dispatch_id: 20
  // to represent "the dispatch that owns the currently ACTIVE row for this mark",
  // which is what latest_dispatch_id / bom_dispatch_id_snapshot get set to on accept.
  function makePrisma(wo: ReturnType<typeof makeFullWo>, latestAsm: Record<string, unknown> | null) {
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const prisma: any = {
      work_order: {
        findUnique: jest.fn().mockResolvedValue(wo),
        update: jest.fn(),
      },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(snap) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb(prisma)),
    }
    return prisma
  }

  it('throws 400 when resolving from ON_HOLD without a note', async () => {
    const wo = makeFullWo()
    const latestAsm = { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 5 }
    const prisma = makePrisma(wo, latestAsm)
    const svc = new WorkOrdersService(prisma)

    await expect(svc.acceptNewVersion(1, 'tester', {} as any)).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
  })

  it('requires qty_reusable when qty_done exceeds the newly-adopted qty, throws 400 without it', async () => {
    const wo = makeFullWo({ qty_done: 5 })
    const latestAsm = { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 3 } // newQty 3 < qty_done 5
    const prisma = makePrisma(wo, latestAsm)
    const svc = new WorkOrdersService(prisma)

    await expect(
      svc.acceptNewVersion(1, 'tester', { note: 'resolving hold' }),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('throws 400 when qty_reusable exceeds qty_done (server-side upper bound)', async () => {
    const wo = makeFullWo({ qty_done: 5 })
    const latestAsm = { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 3 } // newQty 3 < qty_done 5 → qty_reusable required
    const prisma = makePrisma(wo, latestAsm)
    const svc = new WorkOrdersService(prisma)

    await expect(
      svc.acceptNewVersion(1, 'tester', { note: 'resolving hold', qty_reusable: 10 }), // 10 > qty_done 5
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('accepts, writes qty_reusable, restores pre_hold_status, clears it, and appends the note to the event', async () => {
    const wo = makeFullWo({ qty_done: 5, pre_hold_status: 'IN_PROGRESS' })
    const latestAsm = { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 3 } // newQty 3 < qty_done 5 → qty_reusable required
    const prisma = makePrisma(wo, latestAsm)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.acceptNewVersion(1, 'tester', { note: 'reused 2 offcuts', qty_reusable: 2 })

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        bom_assembly_id: 200,
        bom_dispatch_id_snapshot: 20,
        updated_by: 'tester',
        status: 'IN_PROGRESS', // restored from pre_hold_status
        pre_hold_status: null, // cleared
        qty_reusable: 2,
      },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        work_order_id: 1,
        event_type: 'ACCEPT_VERSION',
        // Must both preserve the auto-generated delta-description prefix (append,
        // not replace) and append the user's note after it, in that order.
        notes: expect.stringMatching(/^Accepted BOM version.*reused 2 offcuts$/),
        recorded_by: 'tester',
      }),
    })
    expect(result).toEqual({ id: 1 })
  })

  it('resolves ON_HOLD with a note when qty_reusable is not required and is correctly omitted (succeeds, not 400)', async () => {
    const wo = makeFullWo({ qty_done: null, pre_hold_status: 'IN_PROGRESS' }) // qty_done null → qty_reusable never required
    const latestAsm = { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 5 } // qty increase, informational only
    const prisma = makePrisma(wo, latestAsm)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.acceptNewVersion(1, 'tester', { note: 'resolving hold, no reuse needed' })

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        bom_assembly_id: 200,
        bom_dispatch_id_snapshot: 20,
        updated_by: 'tester',
        status: 'IN_PROGRESS', // restored from pre_hold_status
        pre_hold_status: null, // cleared
        qty_reusable: undefined, // correctly omitted — qty_done was null, so never required
      },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        work_order_id: 1,
        event_type: 'ACCEPT_VERSION',
        notes: expect.stringMatching(/^Accepted BOM version.*resolving hold, no reuse needed$/),
        recorded_by: 'tester',
      }),
    })
    expect(result).toEqual({ id: 1 })
  })

  // Task 6: compareAssemblyToLatest()'s REMOVED branch falls back to
  // latest_dispatch_id: assembly.dispatch_id (there's no "latest dispatch for the
  // group" concept left once the lookup is mark-scoped), which equals
  // snapshot_dispatch_id — the same value the "already on latest version" guard
  // checks. Without checking REMOVED first, that guard would fire instead and mask
  // the more specific, correct error below. Assert on the actual response shape
  // (not just the exception type) to lock in the fix.
  it('still 409s on REMOVED regardless of note/qty_reusable, with the specific REMOVED message (not the generic "already latest" guard)', async () => {
    const wo = makeFullWo({ qty_done: 5 }) // would otherwise also require qty_reusable — REMOVED must win
    const prisma = makePrisma(wo, null) // REMOVED — no ACTIVE row for this mark anywhere in the group

    const svc = new WorkOrdersService(prisma)

    await expect(
      svc.acceptNewVersion(1, 'tester', { note: 'doesnt matter', qty_reusable: 999 }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('REMOVED'),
    })
    await expect(
      svc.acceptNewVersion(1, 'tester', {} as any), // and with no note/qty_reusable at all
    ).rejects.toThrow(ConflictException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('accepting a non-ON_HOLD WO does not require a note (preserves existing behavior)', async () => {
    const wo = makeFullWo({ status: 'IN_PROGRESS', pre_hold_status: null, qty_done: null })
    const latestAsm = { ...wo.bom_assembly, id: 200, dispatch_id: 20, qty: 5 } // qty increase, informational only
    const prisma = makePrisma(wo, latestAsm)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.acceptNewVersion(1, 'tester', {} as any)

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        bom_assembly_id: 200,
        bom_dispatch_id_snapshot: 20,
        updated_by: 'tester',
        status: 'IN_PROGRESS', // pre_hold_status null → current status kept unchanged
        pre_hold_status: null,
        qty_reusable: undefined,
      },
    })
    expect(result).toEqual({ id: 1 })
  })
})

describe('WorkOrdersService.transition — cancel', () => {
  function makeWo(overrides: Partial<{
    status: string
    qty_done: number | null
    pre_hold_status: string | null
  }> = {}) {
    return {
      id: 1,
      status: 'ON_HOLD',
      qty_done: null,
      pre_hold_status: 'IN_PROGRESS',
      ...overrides,
    }
  }

  function makePrisma(wo: ReturnType<typeof makeWo>) {
    const prisma: any = {
      work_order: {
        findUnique: jest.fn().mockResolvedValue(wo),
        update: jest.fn(),
        // Task 10 cascade-cancel: transition('cancel') always looks up siblings —
        // these pre-existing tests aren't exercising the cascade, so no siblings.
        findMany: jest.fn().mockResolvedValue([]),
      },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb(prisma)),
    }
    return prisma
  }

  it('allows cancel from ON_HOLD (added to WO_ACTIONS.cancel.from)', async () => {
    const wo = makeWo({ status: 'ON_HOLD', qty_done: null })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    // Previously ON_HOLD was not in cancel.from, so this would 409 (ConflictException).
    await expect(
      svc.transition(1, 'cancel', { reason: 'BOM removed this assembly' }, 'tester'),
    ).resolves.toEqual({ id: 1 })
    expect(prisma.work_order.update).toHaveBeenCalled()
  })

  it('throws 400 cancelling an ON_HOLD WO with qty_done > 0 and no qty_reusable', async () => {
    const wo = makeWo({ status: 'ON_HOLD', qty_done: 5 })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma)

    await expect(
      svc.transition(1, 'cancel', { reason: 'cutting the losses' }, 'tester'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
  })

  it('throws 400 cancelling with qty_reusable exceeding qty_done (server-side upper bound)', async () => {
    const wo = makeWo({ status: 'ON_HOLD', qty_done: 5 })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma)

    await expect(
      svc.transition(1, 'cancel', { reason: 'cutting the losses', qty_reusable: 10 }, 'tester'), // 10 > qty_done 5
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('cancels + persists qty_reusable when provided, and clears pre_hold_status', async () => {
    const wo = makeWo({ status: 'ON_HOLD', qty_done: 5, pre_hold_status: 'IN_PROGRESS' })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.transition(
      1,
      'cancel',
      { reason: 'BOM removed this assembly', qty_reusable: 3 },
      'tester',
    )

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        status: 'CANCELLED',
        updated_by: 'tester',
        qty_reusable: 3,
        pre_hold_status: null,
      }),
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        work_order_id: 1,
        event_type: 'CANCEL',
        notes: 'BOM removed this assembly',
        recorded_by: 'tester',
      }),
    })
    expect(result).toEqual({ id: 1 })
  })

  it('cancelling with qty_done null does not require qty_reusable (existing behavior unchanged)', async () => {
    const wo = makeWo({ status: 'RELEASED', qty_done: null, pre_hold_status: null })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.transition(1, 'cancel', { reason: 'no longer needed' }, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        status: 'CANCELLED',
        qty_reusable: undefined,
        pre_hold_status: null,
      }),
    })
    expect(result).toEqual({ id: 1 })
  })

  it('cancelling with qty_done == 0 does not require qty_reusable (existing behavior unchanged)', async () => {
    const wo = makeWo({ status: 'IN_PROGRESS', qty_done: 0, pre_hold_status: null })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.transition(1, 'cancel', { reason: 'no longer needed' }, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        status: 'CANCELLED',
        qty_reusable: undefined,
        pre_hold_status: null,
      }),
    })
    expect(result).toEqual({ id: 1 })
  })

  it('a non-cancel action (pause) is completely unaffected by the qty_done guard', async () => {
    // qty_done > 0 here would trip the guard if it were mistakenly not scoped to 'cancel'.
    const wo = makeWo({ status: 'IN_PROGRESS', qty_done: 5, pre_hold_status: null })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.transition(1, 'pause', { reason: 'lunch break' }, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'PAUSED', updated_by: 'tester' }, // no qty_reusable / pre_hold_status keys — pause is untouched
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        work_order_id: 1,
        event_type: 'PAUSE',
        notes: 'lunch break',
        recorded_by: 'tester',
      }),
    })
    expect(result).toEqual({ id: 1 })
  })
})

describe('WorkOrdersService.transition — cancel cascades to sibling WOs (Task 10)', () => {
  // One BOM mark → many WOs (one per routing op), all sharing mo_id + bom_assembly_id.
  function makeWo(overrides: Partial<{
    status: string
    qty_done: number | null
    mo_id: number
    bom_assembly_id: number
    wo_code: string
  }> = {}) {
    return {
      id: 1,
      status: 'RELEASED',
      qty_done: null,
      mo_id: 10,
      bom_assembly_id: 100,
      wo_code: 'WO-00000001',
      pre_hold_status: null,
      ...overrides,
    }
  }

  function makePrisma(wo: ReturnType<typeof makeWo>, siblings: unknown[] = []) {
    const prisma: any = {
      work_order: {
        findUnique: jest.fn().mockResolvedValue(wo),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue(siblings),
      },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb(prisma)),
    }
    return prisma
  }

  it('1. cancelling a WO with zero siblings behaves exactly as before (no regression)', async () => {
    const wo = makeWo()
    const prisma = makePrisma(wo, [])
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.transition(1, 'cancel', { reason: 'no longer needed' }, 'tester')

    expect(prisma.work_order.findMany).toHaveBeenCalledWith({
      where: { mo_id: 10, bom_assembly_id: 100, id: { not: 1 }, status: { not: 'CANCELLED' } },
      select: { id: true, wo_code: true, sequence: true, status: true, qty_done: true, source_routing_op_id: true },
    })
    expect(prisma.work_order.update).toHaveBeenCalledTimes(1) // primary only
    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ status: 'CANCELLED' }),
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ id: 1 })
  })

  it('2. cascades cancel to to_cancel siblings (no output) — each gets status=CANCELLED + its own work_order_event', async () => {
    const wo = makeWo()
    const siblings = [
      { id: 2, wo_code: 'WO-00000002', sequence: 2, status: 'NOT_STARTED', qty_done: null, source_routing_op_id: 20 },
      { id: 3, wo_code: 'WO-00000003', sequence: 3, status: 'RELEASED', qty_done: 0, source_routing_op_id: 30 },
    ]
    const prisma = makePrisma(wo, siblings)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'cancel', { reason: 'abandoning mark' }, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledTimes(3) // primary + 2 siblings
    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { status: 'CANCELLED', pre_hold_status: null, updated_by: 'tester' },
    })
    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'CANCELLED', pre_hold_status: null, updated_by: 'tester' },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(3) // primary CANCEL + 2 cascade CANCELs
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 2, event_type: 'CANCEL', notes: 'Cascade-cancelled: sibling of WO-00000001', recorded_by: 'tester' },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 3, event_type: 'CANCEL', notes: 'Cascade-cancelled: sibling of WO-00000001', recorded_by: 'tester' },
    })
  })

  it('3. leaves a needs_disposition sibling (status=DONE) completely untouched', async () => {
    const wo = makeWo()
    const siblings = [
      { id: 2, wo_code: 'WO-00000002', sequence: 2, status: 'DONE', qty_done: 12, source_routing_op_id: 20 },
    ]
    const prisma = makePrisma(wo, siblings)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'cancel', { reason: 'abandoning mark' }, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledTimes(1) // primary only — DONE sibling never written
    expect(prisma.work_order.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 } }))
    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(1) // only the primary CANCEL event
  })

  it('4. leaves a needs_disposition sibling (PAUSED, qty_done > 0) untouched — has-output rule, not just is-DONE', async () => {
    const wo = makeWo()
    const siblings = [
      { id: 2, wo_code: 'WO-00000002', sequence: 2, status: 'PAUSED', qty_done: 4, source_routing_op_id: 20 },
    ]
    const prisma = makePrisma(wo, siblings)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'cancel', { reason: 'abandoning mark' }, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledTimes(1)
    expect(prisma.work_order.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 } }))
    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(1)
  })

  it('mixed to_cancel + needs_disposition siblings in one cancel — only to_cancel gets written', async () => {
    const wo = makeWo()
    const siblings = [
      { id: 2, wo_code: 'WO-00000002', sequence: 2, status: 'NOT_STARTED', qty_done: null, source_routing_op_id: 20 }, // to_cancel
      { id: 3, wo_code: 'WO-00000003', sequence: 3, status: 'DONE', qty_done: 8, source_routing_op_id: 30 }, // needs_disposition
    ]
    const prisma = makePrisma(wo, siblings)
    const svc = new WorkOrdersService(prisma)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'cancel', { reason: 'abandoning mark' }, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledTimes(2) // primary + WO 2 only
    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { status: 'CANCELLED', pre_hold_status: null, updated_by: 'tester' },
    })
    expect(prisma.work_order.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 3 } }))
  })
})

describe('WorkOrdersService.cancelSiblings — preview endpoint (Task 10)', () => {
  function makePrisma(wo: { id: number; mo_id: number; bom_assembly_id: number }, siblings: unknown[]) {
    const prisma: any = {
      work_order: {
        findUnique: jest.fn().mockResolvedValue(wo),
        findMany: jest.fn().mockResolvedValue(siblings),
      },
    }
    return prisma
  }

  it('5. returns the correct to_cancel / needs_disposition split for a mixed scenario', async () => {
    const wo = { id: 1, mo_id: 10, bom_assembly_id: 100 }
    // Already-CANCELLED siblings are excluded at the DB layer (status: { not: 'CANCELLED' }
    // in the query) — the mock only returns what a real query would already have filtered.
    const siblings = [
      { id: 2, wo_code: 'WO-00000002', sequence: 2, status: 'NOT_STARTED', qty_done: null, source_routing_op_id: 20 },
      { id: 3, wo_code: 'WO-00000003', sequence: 3, status: 'RELEASED', qty_done: '0', source_routing_op_id: 30 },
      { id: 4, wo_code: 'WO-00000004', sequence: 4, status: 'DONE', qty_done: 8, source_routing_op_id: 40 },
      { id: 5, wo_code: 'WO-00000005', sequence: 5, status: 'PAUSED', qty_done: 3, source_routing_op_id: 50 },
    ]
    const prisma = makePrisma(wo, siblings)
    const svc = new WorkOrdersService(prisma)

    const result = await svc.cancelSiblings(1)

    expect(prisma.work_order.findMany).toHaveBeenCalledWith({
      where: { mo_id: 10, bom_assembly_id: 100, id: { not: 1 }, status: { not: 'CANCELLED' } },
      select: { id: true, wo_code: true, sequence: true, status: true, qty_done: true, source_routing_op_id: true },
    })
    expect(result.to_cancel.map((s: any) => s.id)).toEqual([2, 3])
    expect(result.needs_disposition.map((s: any) => s.id)).toEqual([4, 5])
  })

  it('returns empty arrays when the WO has no siblings', async () => {
    const wo = { id: 1, mo_id: 10, bom_assembly_id: 100 }
    const prisma = makePrisma(wo, [])
    const svc = new WorkOrdersService(prisma)

    const result = await svc.cancelSiblings(1)

    expect(result).toEqual({ to_cancel: [], needs_disposition: [] })
  })
})
