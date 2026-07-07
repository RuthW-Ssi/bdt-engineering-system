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
  it('returns is_outdated: false when the snapshot dispatch is already the latest', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(snap), // latestDispatchForGroup — same dispatch
      },
      bom_assembly: { findFirst: jest.fn() },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result).toMatchObject({ is_outdated: false, delta_types: [], delta_details: null })
    expect(prisma.bom_assembly.findFirst).not.toHaveBeenCalled()
  })

  it('returns is_outdated: false when the snapshot dispatch row no longer exists', async () => {
    const wo = makeWo()
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(null), // snapshot row deleted
        findFirst: jest.fn(),
      },
      bom_assembly: { findFirst: jest.fn() },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result).toMatchObject({ is_outdated: false, delta_types: [], delta_details: null })
    expect(prisma.bom_dispatch.findFirst).not.toHaveBeenCalled()
  })

  it('classifies REMOVED when the assembly mark no longer exists in the latest dispatch', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latest = makeDispatch(20, new Date('2026-02-01'))
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(latest),
      },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null) }, // mark not found in latest
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
    const latest = makeDispatch(20, new Date('2026-02-01'))
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 5 } // qty 2 -> 5, spec unchanged
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(latest),
      },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
    }
    const svc = new WorkOrdersService(prisma as any)

    const result = await svc.bomVersionStatus(1)

    expect(result.is_outdated).toBe(true)
    expect(result.delta_types).toEqual(['QTY_CHANGED'])
    expect(result.delta_details).toEqual({ qty: { from: 2, to: 5 } })
  })

  it('classifies SPEC_CHANGED with delta_details.spec when only a dimension (length_mm) differs', async () => {
    const wo = makeWo()
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latest = makeDispatch(20, new Date('2026-02-01'))
    const latestAsm = { ...wo.bom_assembly, id: 200, length_mm: 1200 } // qty unchanged, length resized
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(latest),
      },
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
    const latest = makeDispatch(20, new Date('2026-02-01'))
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 3, width_mm: 250 }
    const prisma = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(latest),
      },
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
      bom_dispatch: { findUnique: jest.fn(), findFirst: jest.fn() },
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

// Scoped to applyBomChangeHolds() (WO BOM-Version Hold, Sprint 20 T02) — the
// hold-trigger logic invoked post-commit from BomUploadService.upload().
//
// dispatchId 20 is always the just-uploaded dispatch (the "new" group head);
// dispatch 10 is a candidate WO's/line's pre-existing (now superseded) snapshot.
// Both share the same (project_id:1, zone_id:1, sub_zone_id:null) group, so
// bom_dispatch.findFirst (latestDispatchForGroup) always resolves to dispatch 20
// regardless of which call site (bomVersionStatus vs compareAssemblyToLatest)
// triggered the lookup.
describe('WorkOrdersService.applyBomChangeHolds', () => {
  function makePrisma(overrides: {
    candidates?: { id: number; status: string }[]
    woById?: Record<number, ReturnType<typeof makeWo>>
    latestAsm?: Record<number, unknown> // keyed by wo id, for bomVersionStatus's comparison
  } = {}) {
    const newDispatch = makeDispatch(20, new Date('2026-02-01'))
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const candidates = overrides.candidates ?? []
    const woById = overrides.woById ?? {}
    const latestAsm = overrides.latestAsm ?? {}

    const prisma: any = {
      bom_dispatch: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }: { where: { id: number } }) => {
          if (id === 20) return Promise.resolve(newDispatch)
          if (id === 10) return Promise.resolve(snap)
          return Promise.resolve(null)
        }),
        findFirst: jest.fn().mockResolvedValue(newDispatch), // latestDispatchForGroup → dispatch 20 is always latest
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
        findFirst: jest.fn().mockImplementation(({ where }: { where: { dispatch_id: number; assembly_mark: string } }) => {
          if (where.dispatch_id !== 20) return Promise.resolve(null)
          for (const wo of Object.values(woById)) {
            if (wo.bom_assembly.assembly_mark === where.assembly_mark && latestAsm[wo.id] !== undefined) {
              return Promise.resolve(latestAsm[wo.id])
            }
          }
          return Promise.resolve(null)
        }),
      },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb(prisma)),
    }
    return prisma
  }

  it('sets ON_HOLD + writes a HOLD event for a WO whose assembly was REMOVED in the new dispatch', async () => {
    const wo = makeWo() // bom_assembly.dispatch_id: 10, assembly_mark: 'WH-CO-001'
    const prisma = makePrisma({
      candidates: [{ id: 1, status: 'IN_PROGRESS' }],
      woById: { 1: wo },
      latestAsm: { 1: null }, // REMOVED — no matching mark in dispatch 20
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
      latestAsm: { 1: { ...wo.bom_assembly, id: 200, qty: 2 } },
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
      latestAsm: { 1: { ...wo.bom_assembly, id: 200, qty: 2 } },
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
      latestAsm: { 1: { ...wo.bom_assembly, id: 200, length_mm: 1200 } }, // qty unchanged, length resized
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

  // This is the bugfix regression test: is_outdated is true (a newer dispatch
  // exists for the group) but the matching assembly in the latest dispatch is
  // byte-identical (same qty/weight/dims) — a real, reachable case (e.g. a
  // re-upload that reintroduces an assembly with unchanged specs). delta_types
  // is genuinely empty, so this must NOT hold the WO. This already passed before
  // the isSignificantDelta refactor (the inline isRemoved/isSpecChanged/isQtyDecrease
  // computation was already correct here) — it exists to confirm the refactor
  // doesn't regress it.
  it('does NOT hold when is_outdated is true but delta_types is empty (byte-identical re-upload)', async () => {
    const wo = makeWo()
    const prisma = makePrisma({
      candidates: [{ id: 1, status: 'IN_PROGRESS' }],
      woById: { 1: wo },
      latestAsm: { 1: { ...wo.bom_assembly, id: 200 } }, // same qty/spec — only id/dispatch differ
    })
    const svc = new WorkOrdersService(prisma)

    const result = await svc.applyBomChangeHolds(20)

    expect(result.held_wo_ids).not.toContain(1)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
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
      latestAsm: { 1: null, 2: null, 3: null }, // REMOVED for all three — every candidate attempts a hold
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

  // latestAsm: null simulates REMOVED (no matching assembly_mark in the latest dispatch).
  function makePrisma(wo: ReturnType<typeof makeFullWo>, latestAsm: Record<string, unknown> | null) {
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const latest = makeDispatch(20, new Date('2026-02-01'))
    const prisma: any = {
      work_order: {
        findUnique: jest.fn().mockResolvedValue(wo),
        update: jest.fn(),
      },
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(snap),
        findFirst: jest.fn().mockResolvedValue(latest), // latestDispatchForGroup
      },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb(prisma)),
    }
    return prisma
  }

  it('throws 400 when resolving from ON_HOLD without a note', async () => {
    const wo = makeFullWo()
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 5 }
    const prisma = makePrisma(wo, latestAsm)
    const svc = new WorkOrdersService(prisma)

    await expect(svc.acceptNewVersion(1, 'tester', {} as any)).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
  })

  it('requires qty_reusable when qty_done exceeds the newly-adopted qty, throws 400 without it', async () => {
    const wo = makeFullWo({ qty_done: 5 })
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 3 } // newQty 3 < qty_done 5
    const prisma = makePrisma(wo, latestAsm)
    const svc = new WorkOrdersService(prisma)

    await expect(
      svc.acceptNewVersion(1, 'tester', { note: 'resolving hold' }),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('throws 400 when qty_reusable exceeds qty_done (server-side upper bound)', async () => {
    const wo = makeFullWo({ qty_done: 5 })
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 3 } // newQty 3 < qty_done 5 → qty_reusable required
    const prisma = makePrisma(wo, latestAsm)
    const svc = new WorkOrdersService(prisma)

    await expect(
      svc.acceptNewVersion(1, 'tester', { note: 'resolving hold', qty_reusable: 10 }), // 10 > qty_done 5
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('accepts, writes qty_reusable, restores pre_hold_status, clears it, and appends the note to the event', async () => {
    const wo = makeFullWo({ qty_done: 5, pre_hold_status: 'IN_PROGRESS' })
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 3 } // newQty 3 < qty_done 5 → qty_reusable required
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
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 5 } // qty increase, informational only
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

  it('still 409s on REMOVED regardless of note/qty_reusable (existing guard unchanged)', async () => {
    const wo = makeFullWo({ qty_done: 5 }) // would otherwise also require qty_reusable — REMOVED must win
    const prisma = makePrisma(wo, null) // REMOVED — no matching assembly_mark in latest dispatch

    const svc = new WorkOrdersService(prisma)

    await expect(
      svc.acceptNewVersion(1, 'tester', { note: 'doesnt matter', qty_reusable: 999 }),
    ).rejects.toThrow(ConflictException)
    await expect(
      svc.acceptNewVersion(1, 'tester', {} as any), // and with no note/qty_reusable at all
    ).rejects.toThrow(ConflictException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('accepting a non-ON_HOLD WO does not require a note (preserves existing behavior)', async () => {
    const wo = makeFullWo({ status: 'IN_PROGRESS', pre_hold_status: null, qty_done: null })
    const latestAsm = { ...wo.bom_assembly, id: 200, qty: 5 } // qty increase, informational only
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
