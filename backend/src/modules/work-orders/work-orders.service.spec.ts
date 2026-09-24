import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { WorkOrdersService, allowedActionsFrom } from './work-orders.service'

// Multi-mark redesign (2026-09-17): a work_order now spans many marks via
// work_order_mark, so most of this file's fixtures build a WO's `marks[]`
// array instead of a single flat bom_assembly/qty_done/bom_dispatch_id_snapshot
// on the WO itself. WorkOrdersService's constructor also gained a second
// dependency (WorkOrderAutoCreateService, for recomputeDuration()) — every
// `new WorkOrdersService(prisma)` below passes a mock for it.

function makeAutoCreate(overrides: Partial<{ recomputeDuration: jest.Mock; recomputeConsume: jest.Mock; recomputeParts: jest.Mock; computePartBudget: jest.Mock }> = {}) {
  return {
    recomputeDuration: jest.fn().mockResolvedValue({ expected_duration_min: 10, setup_time_min: 5 }),
    recomputeConsume: jest.fn().mockResolvedValue(undefined),
    recomputeParts: jest.fn().mockResolvedValue(undefined),
    // Generously permissive default (total=Infinity) so tests not concerned
    // with the 2026-09-18 budget cap don't need to mock it explicitly.
    computePartBudget: jest.fn().mockResolvedValue({ total: Infinity, committed: 0, remaining: Infinity }),
    ...overrides,
  }
}

function makeBomAssembly(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
}

function makeMark(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    work_order_id: 1,
    bom_assembly_id: 100,
    bom_dispatch_id_snapshot: 10,
    qty_planned: 5,
    qty_done: null,
    qty_qc_passed: null,
    qty_rework: null,
    qty_renew: null,
    removed_at: null,
    removed_by: null,
    removed_reason: null,
    bom_assembly: makeBomAssembly(),
    ...overrides,
  }
}

function makeDispatch(id: number, uploaded_at: Date) {
  return { id, project_id: 1, zone_id: 1, sub_zone_id: null, uploaded_at }
}

// ═══════════════════════════════════════════════════════════════════════════
// bomVersionStatus — now per-mark (returns an array, one entry per non-removed
// mark on the WO), not one WO-level object.
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService.bomVersionStatus (per-mark)', () => {
  it('returns one entry per non-removed mark; is_outdated false when the ACTIVE row is its own', async () => {
    const mark = makeMark()
    const wo = { id: 1, marks: [mark] }
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(snap) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(mark.bom_assembly) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    const result = await svc.bomVersionStatus(1)

    expect(prisma.work_order.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      include: { marks: { where: { removed_at: null }, include: { bom_assembly: true } } },
    })
    expect(result).toEqual([
      expect.objectContaining({
        work_order_mark_id: 1,
        bom_assembly_id: 100,
        assembly_mark: 'WH-CO-001',
        is_outdated: false,
        delta_types: [],
      }),
    ])
  })

  it('returns multiple entries, independently classified, for a WO with 2 active marks', async () => {
    const markA = makeMark({ id: 1, bom_assembly_id: 100, bom_assembly: makeBomAssembly({ id: 100, assembly_mark: 'A' }) })
    const markB = makeMark({
      id: 2, bom_assembly_id: 200, bom_dispatch_id_snapshot: 11,
      bom_assembly: makeBomAssembly({ id: 200, dispatch_id: 11, assembly_mark: 'B' }),
    })
    const wo = { id: 1, marks: [markA, markB] }
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }: any) =>
          Promise.resolve(id === 10 ? makeDispatch(10, new Date('2026-01-01')) : makeDispatch(11, new Date('2026-01-02'))),
        ),
      },
      bom_assembly: {
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.assembly_mark === 'A' ? markA.bom_assembly : markB.bom_assembly),
        ),
      },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    const result = await svc.bomVersionStatus(1)

    expect(result).toHaveLength(2)
    expect(result.map((r: any) => r.bom_assembly_id)).toEqual([100, 200])
    expect(result.every((r: any) => r.is_outdated === false)).toBe(true)
  })

  it('classifies REMOVED when no ACTIVE row exists anywhere in the group for the mark', async () => {
    const mark = makeMark()
    const wo = { id: 1, marks: [mark] }
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(makeDispatch(10, new Date())) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    const result = await svc.bomVersionStatus(1)

    expect(result[0]).toMatchObject({ is_outdated: true, delta_types: ['REMOVED'] })
  })

  it('throws NotFoundException when the WO does not exist', async () => {
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.bomVersionStatus(999)).rejects.toThrow(NotFoundException)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isSignificantDelta — pure function, unaffected by the multi-mark redesign.
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService.isSignificantDelta', () => {
  const svc = new WorkOrdersService({} as any, {} as any)

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

// ═══════════════════════════════════════════════════════════════════════════
// findAll — is_outdated badge, now rolled up across ALL of a WO's non-removed
// marks (true if ANY one of them has a significant delta), still one batched
// bom_assembly query regardless of WO/mark count.
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService.findAll — is_outdated badge (batched, multi-mark)', () => {
  function markRow(overrides: Record<string, unknown> = {}) {
    return {
      bom_assembly: {
        id: 100, dispatch_id: 10, assembly_mark: 'WH-MA-001', qty: 2,
        weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50, attributes: {},
        dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
      },
      qty_planned: 5,
      qty_done: null,
      ...overrides,
    }
  }

  function makeRow(overrides: Partial<{ id: number; marks: any[] }> = {}) {
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
      marks: [markRow()],
      plan_start: null, actual_start: null, actual_finish: null, plan_finish: null, assigned_to: null,
      ...overrides,
    }
  }

  function makePrisma(rows: any[], activeAssemblies: Record<string, any>[]) {
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

  it('does NOT flag an untouched WO as outdated after an unrelated upload to the same group', async () => {
    const row = makeRow()
    const activeAssemblies = [
      { id: 100, dispatch_id: 10, assembly_mark: 'WH-MA-001', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } },
      { id: 300, dispatch_id: 30, assembly_mark: 'WH-AC-001', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } },
    ]
    const prisma = makePrisma([row], activeAssemblies)
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any)

    const result = await svc.findAll({})

    expect(result.find((w: any) => w.id === 1)?.is_outdated).toBe(false)
  })

  it('flags a WO as outdated when its (only) mark genuinely changed (qty decreased)', async () => {
    const row = makeRow()
    const activeAssemblies = [
      {
        id: 200, dispatch_id: 20, assembly_mark: 'WH-MA-001', qty: 1,
        weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50, attributes: {},
        dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
      },
    ]
    const prisma = makePrisma([row], activeAssemblies)
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any)

    const result = await svc.findAll({})

    expect(result.find((w: any) => w.id === 1)?.is_outdated).toBe(true)
  })

  it('a WO with 2 marks is flagged when only the SECOND mark is significantly outdated (removed)', async () => {
    const row = makeRow({
      marks: [
        markRow(),
        markRow({
          bom_assembly: {
            id: 101, dispatch_id: 10, assembly_mark: 'WH-MA-002', qty: 3,
            weight_kg: 1, surface_area_m2: 1, length_mm: 1, width_mm: 1, height_mm: 1, attributes: {},
            dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
          },
        }),
      ],
    })
    // Only mark 1 (WH-MA-001) has an ACTIVE row anywhere — mark 2 (WH-MA-002) is REMOVED.
    const activeAssemblies = [
      { id: 100, dispatch_id: 10, assembly_mark: 'WH-MA-001', qty: 2, weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50, attributes: {}, dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } },
    ]
    const prisma = makePrisma([row], activeAssemblies)
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any)

    const result = await svc.findAll({})

    expect(result.find((w: any) => w.id === 1)?.is_outdated).toBe(true)
  })

  it('does NOT flag when a different ACTIVE row exists but is byte-identical (re-upload, no meaningful change)', async () => {
    const row = makeRow()
    const activeAssemblies = [
      { id: 200, dispatch_id: 20, assembly_mark: 'WH-MA-001', qty: 2, weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50, attributes: {}, dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } },
    ]
    const prisma = makePrisma([row], activeAssemblies)
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any)

    const result = await svc.findAll({})

    expect(result.find((w: any) => w.id === 1)?.is_outdated).toBe(false)
  })

  it('issues exactly one batched bom_assembly query regardless of WO/mark count (no N+1)', async () => {
    const rows = [1, 2, 3].map((id) =>
      makeRow({
        id,
        marks: [
          markRow({
            bom_assembly: {
              id: 100 + id, dispatch_id: 10 + id, assembly_mark: `M-${id}`, qty: 1,
              weight_kg: 1, surface_area_m2: 1, length_mm: 1, width_mm: 1, height_mm: 1, attributes: {},
              dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null },
            },
          }),
        ],
      }),
    )
    const activeAssemblies = rows.map((r) => ({ ...r.marks[0].bom_assembly }))
    const prisma = makePrisma(rows, activeAssemblies)
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any)

    const result = await svc.findAll({})

    expect(result).toHaveLength(3)
    expect(prisma.bom_assembly.findMany).toHaveBeenCalledTimes(1)
  })

  it("returns an empty outdated set (and skips the query entirely) when findAll() returns no rows", async () => {
    const prisma = makePrisma([], [])
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any)

    const result = await svc.findAll({})

    expect(result).toEqual([])
    expect(prisma.bom_assembly.findMany).not.toHaveBeenCalled()
  })

  it('assembly_marks/mark_count/qty totals reflect the row\'s non-removed marks', async () => {
    const row = makeRow({
      marks: [
        markRow({ qty_planned: 5, qty_done: 2 }),
        markRow({
          bom_assembly: { id: 101, dispatch_id: 10, assembly_mark: 'B', qty: 1, weight_kg: 1, surface_area_m2: 1, length_mm: 1, width_mm: 1, height_mm: 1, attributes: {}, dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } },
          qty_planned: 3,
          qty_done: null,
        }),
      ],
    })
    const prisma = makePrisma([row], [])
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any)

    const result = await svc.findAll({})

    expect(result[0]).toMatchObject({
      assembly_marks: ['WH-MA-001', 'B'],
      mark_count: 2,
      qty_planned_total: 8,
      qty_done_total: 2,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// acceptNewVersion — now per-mark. `dto.bom_assembly_id` selects which
// work_order_mark to re-point; `note` is always optional now (no more
// ON_HOLD-gated requirement — there's no more auto-hold tying accept to a
// hold-resolution flow); QC-breakdown-required-when-exceeds-target
// (2026-09-23, was qty_reusable) is unconditional (same validation the old
// whole-WO version had, preserved).
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService.acceptNewVersion (per-mark)', () => {
  function makePrisma(mark: ReturnType<typeof makeMark>, latestAsm: Record<string, unknown> | null, woOverrides: Record<string, unknown> = {}) {
    const snap = makeDispatch(10, new Date('2026-01-01'))
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_id: 10, ...woOverrides }) },
      work_order_mark: {
        findFirst: jest.fn().mockResolvedValue(mark),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(snap) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(latestAsm) },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  it('re-points bom_assembly_id/bom_dispatch_id_snapshot/qty_planned on the target mark and recomputes duration', async () => {
    const mark = makeMark()
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 8 }
    const prisma = makePrisma(mark, latestAsm)
    const autoCreate = makeAutoCreate()
    const svc = new WorkOrdersService(prisma, autoCreate as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)

    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { bom_assembly_id: 200, bom_dispatch_id_snapshot: 20, qty_planned: 8, qty_qc_passed: undefined, qty_rework: undefined, qty_renew: undefined },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 1, work_order_mark_id: 1, event_type: 'ACCEPT_VERSION', recorded_by: 'tester' }),
    })
    expect(autoCreate.recomputeDuration).toHaveBeenCalledWith(prisma, 1)
    expect(result).toEqual({ id: 1 })
  })

  it('requires a QC breakdown when qty_done already exceeds the newly-adopted qty', async () => {
    const mark = makeMark({ qty_done: 5 })
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 3 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('throws 400 when the QC breakdown sum exceeds qty_done (server-side upper bound)', async () => {
    const mark = makeMark({ qty_done: 5 })
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 3 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100, qty_qc_passed: 10 } as any),
    ).rejects.toThrow(BadRequestException)
  })

  it('accepts + persists a QC breakdown when provided and within bound, appends note to the event', async () => {
    const mark = makeMark({ qty_done: 5 })
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 3 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100, qty_qc_passed: 1, qty_renew: 1, note: 'reused 2 offcuts' } as any)

    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { bom_assembly_id: 200, bom_dispatch_id_snapshot: 20, qty_planned: 3, qty_qc_passed: 1, qty_rework: undefined, qty_renew: 1 },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ notes: expect.stringMatching(/reused 2 offcuts$/) }),
    })
  })

  it('does not require a note at all — the old ON_HOLD-gated requirement is gone', async () => {
    const mark = makeMark({ qty_done: null })
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 5 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).resolves.toEqual({ id: 1 })
  })

  it('409s on REMOVED (no ACTIVE row for the mark anywhere in the group), not the generic "already latest" guard', async () => {
    const mark = makeMark()
    const prisma = makePrisma(mark, null)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).rejects.toMatchObject({
      message: expect.stringContaining('remove the mark'),
    })
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('409s when the mark is already on the latest version', async () => {
    const mark = makeMark()
    const prisma = makePrisma(mark, mark.bom_assembly) // same row → is_outdated false
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).rejects.toThrow(ConflictException)
  })

  it('404s when the target mark is not found (wrong bom_assembly_id, or already removed)', async () => {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_id: 10 }) },
      work_order_mark: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 999 } as any)).rejects.toThrow(NotFoundException)
  })

  it('404s when the WO itself does not exist', async () => {
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).rejects.toThrow(NotFoundException)
  })

  it('apply_to_other_wos: re-points every other WO\'s matching mark in the same MO too', async () => {
    const mark = makeMark()
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 8 }
    const prisma = makePrisma(mark, latestAsm, { mo_id: 10 })
    const otherMark = { id: 2, work_order_id: 2, bom_assembly_id: 100 }
    prisma.work_order_mark.findMany = jest.fn().mockResolvedValue([otherMark])
    const autoCreate = makeAutoCreate()
    const svc = new WorkOrdersService(prisma, autoCreate as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100, apply_to_other_wos: true } as any)

    expect(prisma.work_order_mark.findMany).toHaveBeenCalledWith({
      where: { bom_assembly_id: 100, removed_at: null, work_order_id: { not: 1 }, work_order: { mo_id: 10 } },
    })
    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { bom_assembly_id: 200, bom_dispatch_id_snapshot: 20, qty_planned: 8 },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 2, work_order_mark_id: 2, event_type: 'ACCEPT_VERSION' }),
    })
    expect(autoCreate.recomputeDuration).toHaveBeenCalledWith(prisma, 2)
  })

  it('apply_to_other_wos absent/false: does not touch other WOs', async () => {
    const mark = makeMark()
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 8 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)

    expect(prisma.work_order_mark.findMany).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// done — per-mark array; must cover every non-removed mark on the WO.
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService.done (per-mark array)', () => {
  // qty_planned defaults generously high so existing tests (which don't care
  // about the Not-Started/In-Progress/Done-vs-planned cap) aren't affected —
  // tests exercising that cap override it explicitly.
  function makeWoWithMarks(status: string, marks: { id: number; bom_assembly_id: number; qty_planned?: number }[]) {
    return { id: 1, status, wo_code: 'WO-00000001', marks: marks.map((m) => ({ qty_planned: 1000, ...m })) }
  }

  function makePrisma(wo: ReturnType<typeof makeWoWithMarks>) {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo), update: jest.fn() },
      work_order_mark: { update: jest.fn() },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  it('409s when the WO is not IN_PROGRESS/PAUSED', async () => {
    const wo = makeWoWithMarks('NOT_STARTED', [{ id: 1, bom_assembly_id: 100 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }] } as any, 'tester')).rejects.toThrow(ConflictException)
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('400s when a non-removed mark is missing from the request', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }, { id: 2, bom_assembly_id: 200 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('400s when the request includes an unknown/removed mark', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }, { bom_assembly_id: 999, qty_done: 1 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
  })

  it('writes qty_done + QC breakdown per mark, sets WO DONE, and writes ONE whole-WO DONE event', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }, { id: 2, bom_assembly_id: 200 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.done(
      1,
      {
        marks: [
          { bom_assembly_id: 100, qty_done: 5, qty_qc_passed: 4, qty_rework: 1 },
          { bom_assembly_id: 200, qty_done: 3 },
        ],
        notes: 'all done',
      } as any,
      'tester',
    )

    expect(prisma.work_order_mark.update).toHaveBeenCalledTimes(2)
    const calls = prisma.work_order_mark.update.mock.calls
    const mark1Call = calls.find((c: any) => c[0].where.id === 1)[0]
    const mark2Call = calls.find((c: any) => c[0].where.id === 2)[0]
    expect(Number(mark1Call.data.qty_done)).toBe(5)
    expect(Number(mark1Call.data.qty_qc_passed)).toBe(4)
    expect(Number(mark1Call.data.qty_rework)).toBe(1)
    expect(mark1Call.data.qty_renew).toBeUndefined()
    expect(Number(mark2Call.data.qty_done)).toBe(3)
    expect(mark2Call.data.qty_qc_passed).toBeUndefined()

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'DONE', actual_finish: expect.any(Date), pre_hold_status: null, updated_by: 'tester' },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 1, event_type: 'DONE', notes: 'all done', recorded_by: 'tester' },
    })
    expect(result).toEqual({ id: 1 })
  })

  it('writes qty_not_started/qty_in_progress per mark, same as the QC breakdown fields', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.done(1, { marks: [{ bom_assembly_id: 100, qty_not_started: 2, qty_in_progress: 3, qty_done: 5 }] } as any, 'tester')

    const call = prisma.work_order_mark.update.mock.calls[0][0]
    expect(Number(call.data.qty_not_started)).toBe(2)
    expect(Number(call.data.qty_in_progress)).toBe(3)
    expect(Number(call.data.qty_done)).toBe(5)
  })

  it('omits qty_not_started/qty_in_progress (undefined, not 0) when not sent', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }] } as any, 'tester')

    const call = prisma.work_order_mark.update.mock.calls[0][0]
    expect(call.data.qty_not_started).toBeUndefined()
    expect(call.data.qty_in_progress).toBeUndefined()
  })

  it('400s when Not Started + In Progress + Done exceeds the mark\'s planned qty', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 10 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.done(1, { marks: [{ bom_assembly_id: 100, qty_not_started: 4, qty_in_progress: 4, qty_done: 4 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('allows Not Started + In Progress + Done to exactly equal the planned qty', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 10 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.done(1, { marks: [{ bom_assembly_id: 100, qty_not_started: 3, qty_in_progress: 3, qty_done: 4 }] } as any, 'tester')
    expect(prisma.work_order_mark.update).toHaveBeenCalledTimes(1)
  })

  it('404s when the WO does not exist', async () => {
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.done(999, { marks: [] } as any, 'tester')).rejects.toThrow(NotFoundException)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// cancel — whole WO. Needs a reason + per-mark QC breakdown
// (mark_disposition[], 2026-09-23 — was mark_reusable[]) for every
// non-removed mark with qty_done > 0 — array, not a single scalar.
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService.cancel (whole WO, per-mark array)', () => {
  function makeWo(overrides: Partial<{ status: string; marks: any[] }> = {}) {
    return {
      id: 1,
      mo_id: 10,
      wo_code: 'WO-00000001',
      status: 'ON_HOLD',
      marks: [{ id: 1, bom_assembly_id: 100, qty_done: null, removed_at: null }],
      ...overrides,
    }
  }

  function makePrisma(wo: ReturnType<typeof makeWo>, siblings: any[] = []) {
    const prisma: any = {
      work_order: {
        findUnique: jest.fn().mockResolvedValue(wo),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue(siblings),
      },
      work_order_mark: { update: jest.fn() },
      bom_assembly: {
        findUnique: jest.fn().mockResolvedValue({ assembly_mark: 'TC-CO1', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } }),
      },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  it('409s from a terminal status (DONE)', async () => {
    const wo = makeWo({ status: 'DONE' })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.cancel(1, { reason: 'x' } as any, 'tester')).rejects.toThrow(ConflictException)
  })

  it('allows cancel from ON_HOLD', async () => {
    const wo = makeWo({ status: 'ON_HOLD' })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await expect(svc.cancel(1, { reason: 'BOM removed this assembly' } as any, 'tester')).resolves.toEqual({ id: 1 })
    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'CANCELLED', pre_hold_status: null, updated_by: 'tester' },
    })
  })

  it('400s when a mark with qty_done > 0 has no mark_disposition entry', async () => {
    const wo = makeWo({ marks: [{ id: 1, bom_assembly_id: 100, qty_done: 5, removed_at: null }] })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.cancel(1, { reason: 'x' } as any, 'tester')).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('400s when a mark_disposition entry\'s QC breakdown sum exceeds that mark\'s qty_done', async () => {
    const wo = makeWo({ marks: [{ id: 1, bom_assembly_id: 100, qty_done: 5, removed_at: null }] })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.cancel(1, { reason: 'x', mark_disposition: [{ bom_assembly_id: 100, qty_qc_passed: 10 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
  })

  it('cancels with no-output marks — no mark_disposition required, single CANCEL event', async () => {
    const wo = makeWo()
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.cancel(1, { reason: 'no longer needed' } as any, 'tester')

    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(1)
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 1, event_type: 'CANCEL', notes: 'no longer needed', recorded_by: 'tester' },
    })
    expect(result).toEqual({ id: 1 })
  })

  it('writes the QC breakdown onto only the mark(s) with output', async () => {
    const wo = makeWo({
      marks: [
        { id: 1, bom_assembly_id: 100, qty_done: 5, removed_at: null },
        { id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null },
      ],
    })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.cancel(1, { reason: 'x', mark_disposition: [{ bom_assembly_id: 100, qty_qc_passed: 2, qty_rework: 1 }] } as any, 'tester')

    expect(prisma.work_order_mark.update).toHaveBeenCalledTimes(1)
    const [[call]] = prisma.work_order_mark.update.mock.calls
    expect(call.where).toEqual({ id: 1 })
    expect(Number(call.data.qty_qc_passed)).toBe(2)
    expect(Number(call.data.qty_rework)).toBe(1)
    expect(call.data.qty_renew).toBeUndefined()
  })

  it('a removed mark with qty_done > 0 is excluded from the reusable requirement (already accounted for on removal)', async () => {
    const wo = makeWo({
      marks: [
        { id: 1, bom_assembly_id: 100, qty_done: 5, removed_at: new Date() },
        { id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null },
      ],
    })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await expect(svc.cancel(1, { reason: 'x' } as any, 'tester')).resolves.toEqual({ id: 1 })
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// cancel — cascades to sibling WOs of the same MO sharing >=1 mark, using an
// in-memory fake Prisma so the actual mark+group matching logic (not just a
// hard-coded where-clause assertion) is exercised.
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService.cancel — cascades to sibling WOs sharing a mark', () => {
  type FakeMark = { id: number; work_order_id: number; bom_assembly_id: number; qty_done: number | null; removed_at: Date | null }
  type FakeWo = { id: number; mo_id: number; wo_code: string; status: string; marks: FakeMark[] }
  const GROUP = { project_id: 1, zone_id: 1, sub_zone_id: null }

  function makeFakePrisma(assemblies: Record<number, { assembly_mark: string; dispatch: typeof GROUP }>, wos: FakeWo[]) {
    const woById = new Map(wos.map((w) => [w.id, w]))
    const markById = new Map(wos.flatMap((w) => w.marks.map((m) => [m.id, m] as const)))

    const prisma: any = {
      bom_assembly: { findUnique: jest.fn(({ where: { id } }: any) => Promise.resolve(assemblies[id] ?? null)) },
      work_order: {
        findUnique: jest.fn(({ where: { id } }: any) => Promise.resolve(woById.get(id) ?? null)),
        update: jest.fn(({ where: { id }, data }: any) => {
          Object.assign(woById.get(id)!, data)
        }),
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            wos
              .filter((w) => {
                if (where.id?.not !== undefined && w.id === where.id.not) return false
                if (w.mo_id !== where.mo_id) return false
                if (where.status?.not !== undefined && w.status === where.status.not) return false
                return w.marks.some((m) => {
                  if (m.removed_at) return false
                  const a = assemblies[m.bom_assembly_id]
                  if (!a) return false
                  return (where.marks.some.bom_assembly.OR as any[]).some(
                    (cond: any) =>
                      a.assembly_mark === cond.assembly_mark &&
                      a.dispatch.project_id === cond.dispatch.project_id &&
                      a.dispatch.zone_id === cond.dispatch.zone_id &&
                      a.dispatch.sub_zone_id === cond.dispatch.sub_zone_id,
                  )
                })
              })
              .map((w) => ({
                id: w.id,
                wo_code: w.wo_code,
                sequence: 1,
                status: w.status,
                source_routing_op_id: 1,
                marks: w.marks.filter((m) => !m.removed_at).map((m) => ({ qty_done: m.qty_done })),
              })),
          ),
        ),
      },
      work_order_mark: {
        update: jest.fn(({ where: { id }, data }: any) => {
          Object.assign(markById.get(id)!, data)
        }),
      },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  it('cascades cancel to a same-mark sibling WO with zero output', async () => {
    const assemblies = { 100: { assembly_mark: 'TC-CO1', dispatch: GROUP } }
    const primary: FakeWo = { id: 1, mo_id: 10, wo_code: 'WO-00000001', status: 'RELEASED', marks: [{ id: 1, work_order_id: 1, bom_assembly_id: 100, qty_done: null, removed_at: null }] }
    const sibling: FakeWo = { id: 2, mo_id: 10, wo_code: 'WO-00000002', status: 'NOT_STARTED', marks: [{ id: 2, work_order_id: 2, bom_assembly_id: 100, qty_done: null, removed_at: null }] }
    const prisma = makeFakePrisma(assemblies, [primary, sibling])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.cancel(1, { reason: 'abandoning mark' } as any, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 }, data: expect.objectContaining({ status: 'CANCELLED' }) }))
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 2, event_type: 'CANCEL', notes: 'Cascade-cancelled: sibling of WO-00000001', recorded_by: 'tester' },
    })
  })

  it('leaves a sibling with real output on the shared mark untouched (needs_disposition)', async () => {
    const assemblies = { 100: { assembly_mark: 'TC-CO1', dispatch: GROUP } }
    const primary: FakeWo = { id: 1, mo_id: 10, wo_code: 'WO-00000001', status: 'RELEASED', marks: [{ id: 1, work_order_id: 1, bom_assembly_id: 100, qty_done: null, removed_at: null }] }
    const sibling: FakeWo = { id: 2, mo_id: 10, wo_code: 'WO-00000002', status: 'PAUSED', marks: [{ id: 2, work_order_id: 2, bom_assembly_id: 100, qty_done: 4, removed_at: null }] }
    const prisma = makeFakePrisma(assemblies, [primary, sibling])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.cancel(1, { reason: 'abandoning mark' } as any, 'tester')

    expect(prisma.work_order.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 } }))
    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(1) // primary only
  })

  it('does not cascade into an unrelated sibling with no shared mark', async () => {
    const assemblies = { 100: { assembly_mark: 'TC-CO1', dispatch: GROUP }, 200: { assembly_mark: 'TC-CO2', dispatch: GROUP } }
    const primary: FakeWo = { id: 1, mo_id: 10, wo_code: 'WO-00000001', status: 'RELEASED', marks: [{ id: 1, work_order_id: 1, bom_assembly_id: 100, qty_done: null, removed_at: null }] }
    const unrelated: FakeWo = { id: 2, mo_id: 10, wo_code: 'WO-00000002', status: 'NOT_STARTED', marks: [{ id: 2, work_order_id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null }] }
    const prisma = makeFakePrisma(assemblies, [primary, unrelated])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.cancel(1, { reason: 'abandoning mark' } as any, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledTimes(1) // primary only
  })

  it('a sibling in a DIFFERENT (project, zone, sub_zone) group with the same mark text is not picked up', async () => {
    const assemblies = {
      100: { assembly_mark: 'TC-CO1', dispatch: GROUP },
      200: { assembly_mark: 'TC-CO1', dispatch: { project_id: 2, zone_id: 1, sub_zone_id: null } },
    }
    const primary: FakeWo = { id: 1, mo_id: 10, wo_code: 'WO-00000001', status: 'RELEASED', marks: [{ id: 1, work_order_id: 1, bom_assembly_id: 100, qty_done: null, removed_at: null }] }
    const wrongGroup: FakeWo = { id: 2, mo_id: 10, wo_code: 'WO-00000002', status: 'NOT_STARTED', marks: [{ id: 2, work_order_id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null }] }
    const prisma = makeFakePrisma(assemblies, [primary, wrongGroup])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.cancel(1, { reason: 'abandoning mark' } as any, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// cancelSiblings — GET preview endpoint sharing loadCancelSiblings() with cancel().
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService.cancelSiblings — preview endpoint', () => {
  it('returns the to_cancel / needs_disposition split', async () => {
    const wo = { id: 1, mo_id: 10, marks: [{ bom_assembly_id: 100, removed_at: null }] }
    const prisma: any = {
      work_order: {
        findUnique: jest.fn().mockResolvedValue(wo),
        findMany: jest.fn().mockResolvedValue([
          { id: 2, wo_code: 'WO-00000002', sequence: 2, status: 'NOT_STARTED', source_routing_op_id: 20, marks: [{ qty_done: null }] },
          { id: 3, wo_code: 'WO-00000003', sequence: 3, status: 'DONE', source_routing_op_id: 30, marks: [{ qty_done: 8 }] },
        ]),
      },
      bom_assembly: { findUnique: jest.fn().mockResolvedValue({ assembly_mark: 'TC-CO1', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } }) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    const result = await svc.cancelSiblings(1)

    expect(result.to_cancel.map((s: any) => s.id)).toEqual([2])
    expect(result.needs_disposition.map((s: any) => s.id)).toEqual([3])
  })

  it('returns empty arrays when the WO has no non-removed marks', async () => {
    const wo = { id: 1, mo_id: 10, marks: [{ bom_assembly_id: 100, removed_at: new Date() }] }
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(wo) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    const result = await svc.cancelSiblings(1)

    expect(result).toEqual({ to_cancel: [], needs_disposition: [] })
  })

  it('404s when the WO does not exist', async () => {
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.cancelSiblings(999)).rejects.toThrow(NotFoundException)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// removeMark — soft-remove ONE mark. Last-non-removed-mark protection, cascade
// to same-mark siblings with no output, and the cascade's own guard against
// stripping a sibling's LAST mark.
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService.removeMark', () => {
  function makeWo(overrides: Partial<{ status: string; marks: any[] }> = {}) {
    return {
      id: 1,
      mo_id: 10,
      wo_code: 'WO-00000001',
      status: 'RELEASED',
      marks: [
        { id: 1, bom_assembly_id: 100, qty_done: null, removed_at: null },
        { id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null },
      ],
      ...overrides,
    }
  }

  function makePrisma(
    wo: ReturnType<typeof makeWo>,
    cascadeSiblingWos: any[] = [],
    targetAssembly: any = { assembly_mark: 'A', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } },
  ) {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo), findMany: jest.fn().mockResolvedValue(cascadeSiblingWos) },
      work_order_mark: { update: jest.fn() },
      work_order_event: { create: jest.fn() },
      bom_assembly: { findUnique: jest.fn().mockResolvedValue(targetAssembly) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  it('404s when the target mark is not active on this WO', async () => {
    const wo = makeWo()
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.removeMark(1, { bom_assembly_id: 999, reason: 'x' } as any, 'tester')).rejects.toThrow(NotFoundException)
  })

  it("400s attempting to remove the WO's last non-removed mark", async () => {
    const wo = makeWo({ marks: [{ id: 1, bom_assembly_id: 100, qty_done: null, removed_at: null }] })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.removeMark(1, { bom_assembly_id: 100, reason: 'x' } as any, 'tester')).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('409s on a terminal WO (DONE/CANCELLED)', async () => {
    const wo = makeWo({ status: 'DONE' })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.removeMark(1, { bom_assembly_id: 100, reason: 'x' } as any, 'tester')).rejects.toThrow(ConflictException)
  })

  it('400s when the target mark has qty_done > 0 and no QC breakdown is given', async () => {
    const wo = makeWo({
      marks: [
        { id: 1, bom_assembly_id: 100, qty_done: 5, removed_at: null },
        { id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null },
      ],
    })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.removeMark(1, { bom_assembly_id: 100, reason: 'x' } as any, 'tester')).rejects.toThrow(BadRequestException)
  })

  it('400s when the QC breakdown sum exceeds the target mark\'s qty_done', async () => {
    const wo = makeWo({
      marks: [
        { id: 1, bom_assembly_id: 100, qty_done: 5, removed_at: null },
        { id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null },
      ],
    })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.removeMark(1, { bom_assembly_id: 100, reason: 'x', qty_qc_passed: 10 } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
  })

  it('accepts a deliberate all-zero QC breakdown (everything produced so far is worthless) — not treated as "missing"', async () => {
    const wo = makeWo({
      marks: [
        { id: 1, bom_assembly_id: 100, qty_done: 5, removed_at: null },
        { id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null },
      ],
    })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await expect(
      svc.removeMark(1, { bom_assembly_id: 100, reason: 'x', qty_qc_passed: 0, qty_rework: 0, qty_renew: 0 } as any, 'tester'),
    ).resolves.toEqual({ id: 1 })
  })

  it('soft-removes the mark, writes MARK_REMOVED, and recomputes duration', async () => {
    const wo = makeWo()
    const prisma = makePrisma(wo)
    const autoCreate = makeAutoCreate()
    const svc = new WorkOrdersService(prisma, autoCreate as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.removeMark(1, { bom_assembly_id: 100, reason: 'BOM removed this mark' } as any, 'tester')

    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ removed_by: 'tester', removed_reason: 'BOM removed this mark', removed_at: expect.any(Date) }),
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 1, work_order_mark_id: 1, event_type: 'MARK_REMOVED', notes: 'BOM removed this mark', recorded_by: 'tester' },
    })
    expect(autoCreate.recomputeDuration).toHaveBeenCalledWith(prisma, 1)
    expect(result).toEqual({ id: 1 })
  })

  it('cascades the same mark removal to a sibling WO with no output on it', async () => {
    const wo = makeWo()
    const siblingWos = [
      {
        id: 2,
        marks: [
          { id: 20, qty_done: null, bom_assembly: { assembly_mark: 'A', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } } },
          { id: 21, qty_done: null, bom_assembly: { assembly_mark: 'B', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } } },
        ],
      },
    ]
    const prisma = makePrisma(wo, siblingWos)
    const autoCreate = makeAutoCreate()
    const svc = new WorkOrdersService(prisma, autoCreate as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.removeMark(1, { bom_assembly_id: 100, reason: 'x' } as any, 'tester')

    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: expect.objectContaining({ removed_by: 'tester' }),
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 2, work_order_mark_id: 20, event_type: 'MARK_REMOVED' }),
    })
    expect(autoCreate.recomputeDuration).toHaveBeenCalledWith(prisma, 2)
  })

  it("does NOT cascade into a sibling's own last mark (would violate the last-mark invariant)", async () => {
    const wo = makeWo()
    const siblingWos = [
      { id: 2, marks: [{ id: 20, qty_done: null, bom_assembly: { assembly_mark: 'A', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } } }] }, // ONLY mark on sibling 2
    ]
    const prisma = makePrisma(wo, siblingWos)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.removeMark(1, { bom_assembly_id: 100, reason: 'x' } as any, 'tester')

    expect(prisma.work_order_mark.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 20 } }))
  })

  it('does NOT cascade into a sibling mark that already has output', async () => {
    const wo = makeWo()
    const siblingWos = [
      {
        id: 2,
        marks: [
          { id: 20, qty_done: 3, bom_assembly: { assembly_mark: 'A', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } } },
          { id: 21, qty_done: null, bom_assembly: { assembly_mark: 'B', dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } } },
        ],
      },
    ]
    const prisma = makePrisma(wo, siblingWos)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.removeMark(1, { bom_assembly_id: 100, reason: 'x' } as any, 'tester')

    expect(prisma.work_order_mark.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 20 } }))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Manual hold/resume (multi-mark redesign, 2026-09-17) — no more auto-hold.
// resume() branches on current status: ON_HOLD → unhold (dynamic target from
// pre_hold_status); anything else → the pre-existing PAUSED → IN_PROGRESS path.
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService — manual hold/resume', () => {
  function makePrisma(wo: any) {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo), update: jest.fn() },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  it('hold: captures current status as pre_hold_status, sets ON_HOLD, writes a HOLD event', async () => {
    const wo = { id: 1, status: 'IN_PROGRESS', pre_hold_status: null }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'hold', { reason: 'machine breakdown' }, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'ON_HOLD', updated_by: 'tester', pre_hold_status: 'IN_PROGRESS' },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 1, event_type: 'HOLD', notes: 'machine breakdown', recorded_by: 'tester' },
    })
  })

  it('hold: 409s from a terminal status', async () => {
    const wo = { id: 1, status: 'DONE', pre_hold_status: null }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.transition(1, 'hold', { reason: 'x' }, 'tester')).rejects.toThrow(ConflictException)
  })

  it('hold: 409s when already ON_HOLD', async () => {
    const wo = { id: 1, status: 'ON_HOLD', pre_hold_status: 'IN_PROGRESS' }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.transition(1, 'hold', { reason: 'x' }, 'tester')).rejects.toThrow(ConflictException)
  })

  it('resume: from ON_HOLD restores pre_hold_status, clears it, and writes an UNHOLD event', async () => {
    const wo = { id: 1, status: 'ON_HOLD', pre_hold_status: 'IN_PROGRESS' }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.resume(1, {}, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'IN_PROGRESS', pre_hold_status: null, updated_by: 'tester' },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 1, event_type: 'UNHOLD', notes: null, recorded_by: 'tester' },
    })
  })

  it('resume: from PAUSED still runs the pre-existing RESUME → IN_PROGRESS path, unaffected', async () => {
    const wo = { id: 1, status: 'PAUSED', pre_hold_status: null }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.resume(1, { notes: 'back from break' }, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'IN_PROGRESS', updated_by: 'tester' },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 1, event_type: 'RESUME', notes: 'back from break', recorded_by: 'tester' },
    })
  })

  it('resume: 409s from a status where neither unhold nor resume-from-pause applies', async () => {
    const wo = { id: 1, status: 'NOT_STARTED', pre_hold_status: null }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.resume(1, {}, 'tester')).rejects.toThrow(ConflictException)
  })

  it('resume: 409s from ON_HOLD with no pre_hold_status recorded (defensive)', async () => {
    const wo = { id: 1, status: 'ON_HOLD', pre_hold_status: null }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(svc.resume(1, {}, 'tester')).rejects.toThrow(ConflictException)
  })

  it('allowedActionsFrom reports resume as available from ON_HOLD even though it is not in WO_ACTIONS', () => {
    expect(allowedActionsFrom('ON_HOLD' as any)).toContain('resume')
    expect(allowedActionsFrom('ON_HOLD' as any)).toContain('cancel')
  })
})

describe('WorkOrdersService.transition — start seeds qty_not_started', () => {
  function makePrisma(wo: any, marks: { id: number; qty_planned: number }[]) {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo), update: jest.fn() },
      work_order_event: { create: jest.fn() },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(marks), update: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  it('sets qty_not_started = qty_planned on every non-removed mark when the WO starts', async () => {
    const wo = { id: 1, status: 'RELEASED' }
    const marks = [{ id: 10, qty_planned: 5 }, { id: 11, qty_planned: 2 }]
    const prisma = makePrisma(wo, marks)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'start', {}, 'tester')

    expect(prisma.work_order_mark.findMany).toHaveBeenCalledWith({
      where: { work_order_id: 1, removed_at: null },
      select: { id: true, qty_planned: true },
    })
    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { qty_not_started: 5 } })
    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({ where: { id: 11 }, data: { qty_not_started: 2 } })
    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'IN_PROGRESS', updated_by: 'tester', actual_start: expect.any(Date) },
    })
  })

  it('does not touch work_order_mark for other transitions (e.g. pause)', async () => {
    const wo = { id: 1, status: 'IN_PROGRESS' }
    const prisma = makePrisma(wo, [])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'pause', { reason: 'break' }, 'tester')

    expect(prisma.work_order_mark.findMany).not.toHaveBeenCalled()
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })
})

describe('WorkOrdersService.updateConsumeActuals', () => {
  function makePrisma(existingMaterialIds: number[] = [200]) {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
      work_order_consume: {
        findMany: jest.fn().mockResolvedValue(existingMaterialIds.map((material_id) => ({ material_id }))),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    }
    return prisma
  }

  it('updates qty_actual for each listed material, with no upper-bound check against qty_planned', async () => {
    const prisma = makePrisma([200, 300])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.updateConsumeActuals(1, { consume: [{ material_id: 200, qty_actual: 999 }] } as any, 'tester')

    expect(prisma.work_order_consume.update).toHaveBeenCalledWith({
      where: { work_order_id_material_id: { work_order_id: 1, material_id: 200 } },
      data: expect.objectContaining({ updated_by: 'tester' }),
    })
    expect(Number(prisma.work_order_consume.update.mock.calls[0][0].data.qty_actual)).toBe(999)
  })

  it("400s when a material_id isn't already planned (has no work_order_consume row) on this WO", async () => {
    const prisma = makePrisma([200]) // only 200 is planned
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.updateConsumeActuals(1, { consume: [{ material_id: 999, qty_actual: 5 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_consume.update).not.toHaveBeenCalled()
  })

  it('404s when the WO does not exist', async () => {
    const prisma = makePrisma()
    prisma.work_order.findUnique.mockResolvedValue(null)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.updateConsumeActuals(999, { consume: [{ material_id: 200, qty_actual: 5 }] } as any, 'tester'),
    ).rejects.toThrow(NotFoundException)
  })
})

describe('WorkOrdersService.updatePartActuals', () => {
  // unit weight is 1kg/pc for every part here so weight_kg == qty numerically
  // — keeps assertions readable while still exercising the real derivation
  // (qty × per-piece weight_kg), not just a passthrough.
  function makePrisma(existingPartIds: number[] = [500]) {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_id: 10 }) },
      work_order_part: {
        findMany: jest.fn().mockResolvedValue(existingPartIds.map((bom_assembly_part_id) => ({ bom_assembly_part_id }))),
        update: jest.fn().mockResolvedValue({}),
      },
      bom_assembly_part: {
        findMany: jest.fn().mockResolvedValue(existingPartIds.map((id) => ({ id, part: { weight_kg: 1 } }))),
      },
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    }
    return prisma
  }

  it('sets qty (pieces) for each listed part directly — no plan/actual distinction, just capped at the real total (2026-09-18) not an arbitrary bound — and derives weight_kg from it', async () => {
    const prisma = makePrisma([500, 600])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any) // default mock: budget total=Infinity
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.updatePartActuals(1, { parts: [{ bom_assembly_part_id: 500, qty: 999 }] } as any, 'tester')

    expect(prisma.work_order_part.update).toHaveBeenCalledWith({
      where: { work_order_id_bom_assembly_part_id: { work_order_id: 1, bom_assembly_part_id: 500 } },
      data: expect.objectContaining({ updated_by: 'tester' }),
    })
    const data = prisma.work_order_part.update.mock.calls[0][0].data
    expect(Number(data.qty)).toBe(999)
    expect(Number(data.weight_kg)).toBe(999) // 999 pcs × 1kg/pc unit weight
  })

  it('2026-09-18: 400s when qty would exceed the remaining budget, and checks the budget scoped to this WO\'s own mo_id excluding itself', async () => {
    const prisma = makePrisma([500])
    const autoCreate = makeAutoCreate({ computePartBudget: jest.fn().mockResolvedValue({ total: 60, committed: 55, remaining: 5 }) })
    const svc = new WorkOrdersService(prisma, autoCreate as any)

    await expect(
      svc.updatePartActuals(1, { parts: [{ bom_assembly_part_id: 500, qty: 10 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_part.update).not.toHaveBeenCalled()
    expect(autoCreate.computePartBudget).toHaveBeenCalledWith(prisma, 10, 500, 1) // mo_id from the WO, excludes this WO's own id (1)
  })

  it("400s when a bom_assembly_part_id isn't already planned on this WO", async () => {
    const prisma = makePrisma([500])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.updatePartActuals(1, { parts: [{ bom_assembly_part_id: 999, qty: 5 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_part.update).not.toHaveBeenCalled()
  })

  it('404s when the WO does not exist', async () => {
    const prisma = makePrisma()
    prisma.work_order.findUnique.mockResolvedValue(null)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any)

    await expect(
      svc.updatePartActuals(999, { parts: [{ bom_assembly_part_id: 500, qty: 5 }] } as any, 'tester'),
    ).rejects.toThrow(NotFoundException)
  })
})
