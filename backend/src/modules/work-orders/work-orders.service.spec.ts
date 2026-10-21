import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { WorkOrdersService, allowedActionsFrom } from './work-orders.service'
import { WorkOrderAutoCreateService } from './wo-auto-create.service'

// Multi-mark redesign (2026-09-17): a work_order now spans many marks via
// work_order_mark, so most of this file's fixtures build a WO's `marks[]`
// array instead of a single flat bom_assembly/qty_done/bom_dispatch_id_snapshot
// on the WO itself. WorkOrdersService's constructor also gained a second
// dependency (WorkOrderAutoCreateService, for recomputeDuration()) — every
// `new WorkOrdersService(prisma)` below passes a mock for it. The third
// (MailMessageService, edit-actuals audit, 2026-10-01) is `{} as any` except
// in the updateActuals tests.

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
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

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
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

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
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    const result = await svc.bomVersionStatus(1)

    expect(result[0]).toMatchObject({ is_outdated: true, delta_types: ['REMOVED'] })
  })

  it('throws NotFoundException when the WO does not exist', async () => {
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.bomVersionStatus(999)).rejects.toThrow(NotFoundException)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// isSignificantDelta — pure function, unaffected by the multi-mark redesign.
// ═══════════════════════════════════════════════════════════════════════════
// every value counts as a spec change (2026-10-09, user: "ต้องเปรียบเทียบกันทุกค่า")
describe('WorkOrdersService — a newer BOM row differing only in name', () => {
  it('is a SPEC_CHANGED like L / W / H / kg / area', () => {
    const svc = new WorkOrdersService({} as any, {} as any, {} as any)
    const row = { id: 1, dispatch_id: 10, assembly_mark: 'A', qty: 1, name: 'WEB', weight_kg: null, surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null, attributes: {} }
    expect((svc as any).classifyAssemblyDelta(row, { ...row, id: 2, dispatch_id: 11, name: 'BUILT-UP H' }).delta_types).toEqual(['SPEC_CHANGED'])
    expect((svc as any).classifyAssemblyDelta(row, { ...row, id: 2, dispatch_id: 11 }).delta_types).toEqual([])
  })
})

describe('WorkOrdersService.isSignificantDelta', () => {
  const svc = new WorkOrdersService({} as any, {} as any, {} as any)

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
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any, {} as any)

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
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any, {} as any)

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
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any, {} as any)

    const result = await svc.findAll({})

    expect(result.find((w: any) => w.id === 1)?.is_outdated).toBe(true)
  })

  it('does NOT flag when a different ACTIVE row exists but is byte-identical (re-upload, no meaningful change)', async () => {
    const row = makeRow()
    const activeAssemblies = [
      { id: 200, dispatch_id: 20, assembly_mark: 'WH-MA-001', qty: 2, weight_kg: 100, surface_area_m2: 5, length_mm: 1000, width_mm: 200, height_mm: 50, attributes: {}, dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } },
    ]
    const prisma = makePrisma([row], activeAssemblies)
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any, {} as any)

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
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any, {} as any)

    const result = await svc.findAll({})

    expect(result).toHaveLength(3)
    expect(prisma.bom_assembly.findMany).toHaveBeenCalledTimes(1)
  })

  it("returns an empty outdated set (and skips the query entirely) when findAll() returns no rows", async () => {
    const prisma = makePrisma([], [])
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any, {} as any)

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
    const svc = new WorkOrdersService(prisma as any, makeAutoCreate() as any, {} as any)

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
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue([]) },
      work_order_part: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), deleteMany: jest.fn() },
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
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
    const svc = new WorkOrdersService(prisma, autoCreate as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)

    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { bom_assembly_id: 200, bom_dispatch_id_snapshot: 20, qty_planned: 8, qty_qc_passed: undefined, qty_rework: undefined, qty_renew: undefined },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        work_order_id: 1,
        work_order_mark_id: 1,
        event_type: 'ACCEPT_VERSION',
        changes: [{ field: 'qty_planned', old: 5, new: 8 }], // 2026-10-05 audit
        recorded_by: 'tester',
      }),
    })
    expect(autoCreate.recomputeDuration).toHaveBeenCalledWith(prisma, 1)
    expect(result).toEqual({ id: 1 })
  })

  // QA F-2 (2026-10-14): a new Quantity that QC Passed no longer equals clears the mark's finish date.
  it('clears actual_finish (audited) when the new Quantity no longer equals QC Passed; keeps it when it still does', async () => {
    const FIN = new Date('2026-10-10T03:00:00.000Z')
    const raised = makeMark({ qty_done: 5, qty_qc_passed: 5, actual_finish: FIN } as any)
    const prisma = makePrisma(raised, { ...raised.bom_assembly, id: 200, dispatch_id: 20, qty: 8 })
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)
    await svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)
    expect(prisma.work_order_mark.update.mock.calls[0][0].data.actual_finish).toBeNull()
    expect(prisma.work_order_event.create.mock.calls[0][0].data.changes).toContainEqual({ field: 'actual_finish', old: FIN.toISOString(), new: null })

    const same = makeMark({ qty_done: 5, qty_qc_passed: 5, actual_finish: FIN } as any)
    const prisma2 = makePrisma(same, { ...same.bom_assembly, id: 200, dispatch_id: 20, qty: 5 })
    const svc2 = new WorkOrdersService(prisma2, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc2, 'findOne').mockResolvedValue({ id: 1 } as any)
    await svc2.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)
    expect(prisma2.work_order_mark.update.mock.calls[0][0].data).not.toHaveProperty('actual_finish')
  })

  it('requires a QC breakdown when qty_done already exceeds the newly-adopted qty', async () => {
    const mark = makeMark({ qty_done: 5 })
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 3 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('throws 400 when the QC breakdown sum exceeds qty_done (server-side upper bound)', async () => {
    const mark = makeMark({ qty_done: 5 })
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 3 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(
      svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100, qty_qc_passed: 10 } as any),
    ).rejects.toThrow(BadRequestException)
  })

  it('accepts + persists a QC breakdown when provided and within bound, appends note to the event', async () => {
    const mark = makeMark({ qty_done: 5 })
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 3 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100, qty_qc_passed: 1, qty_renew: 1, note: 'reused 2 offcuts' } as any)

    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { bom_assembly_id: 200, bom_dispatch_id_snapshot: 20, qty_planned: 3, qty_qc_passed: 1, qty_rework: 0, qty_renew: 1 },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        notes: expect.stringMatching(/reused 2 offcuts$/),
        changes: [
          { field: 'qty_planned', old: 5, new: 3 },
          { field: 'qty_qc_passed', old: null, new: 1 },
          { field: 'qty_renew', old: null, new: 1 },
        ],
      }),
    })
  })

  // Fix wave 2026-10-05: progress is saved before Done now, so QC fields can
  // already hold values. A provided breakdown REPLACES all three (blank = 0) —
  // keeping a saved Rework 2 next to a new QC 5 would leave QC sum > Done.
  it('a provided breakdown writes ALL THREE QC fields, blank = 0 (saved Done 5 / QC 3 / Rework 2 + {qty_qc_passed: 5} → 5/0/0)', async () => {
    const mark = makeMark({ qty_done: 5, qty_qc_passed: 3, qty_rework: 2 })
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 3 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100, qty_qc_passed: 5 } as any)

    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { bom_assembly_id: 200, bom_dispatch_id_snapshot: 20, qty_planned: 3, qty_qc_passed: 5, qty_rework: 0, qty_renew: 0 },
    })
    expect(prisma.work_order_event.create.mock.calls[0][0].data.changes).toEqual([
      { field: 'qty_planned', old: 5, new: 3 },
      { field: 'qty_qc_passed', old: 3, new: 5 },
      { field: 'qty_rework', old: 2, new: 0 },
    ])
  })

  it('does not require a note at all — the old ON_HOLD-gated requirement is gone', async () => {
    const mark = makeMark({ qty_done: null })
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 5 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).resolves.toEqual({ id: 1 })
    // Same qty (5 → 5), no QC breakdown → no qty changed → no `changes`.
    expect(prisma.work_order_event.create.mock.calls[0][0].data.changes).toBeUndefined()
  })

  it('409s on REMOVED (no ACTIVE row for the mark anywhere in the group), not the generic "already latest" guard', async () => {
    const mark = makeMark()
    const prisma = makePrisma(mark, null)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).rejects.toMatchObject({
      message: expect.stringContaining('remove the mark'),
    })
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('409s when the mark is already on the latest version', async () => {
    const mark = makeMark()
    const prisma = makePrisma(mark, mark.bom_assembly) // same row → is_outdated false
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).rejects.toThrow(ConflictException)
  })

  it('404s when the target mark is not found (wrong bom_assembly_id, or already removed)', async () => {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_id: 10 }) },
      work_order_mark: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 999 } as any)).rejects.toThrow(NotFoundException)
  })

  it('404s when the WO itself does not exist', async () => {
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.acceptNewVersion(1, 'tester', { bom_assembly_id: 100 } as any)).rejects.toThrow(NotFoundException)
  })

  it('apply_to_other_wos: re-points every other WO\'s matching mark in the same MO too', async () => {
    const mark = makeMark()
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 8 }
    const prisma = makePrisma(mark, latestAsm, { mo_id: 10 })
    const otherMark = { id: 2, work_order_id: 2, bom_assembly_id: 100, qty_planned: 5 }
    prisma.work_order_mark.findMany = jest.fn().mockResolvedValue([otherMark])
    const autoCreate = makeAutoCreate()
    const svc = new WorkOrdersService(prisma, autoCreate as any, {} as any)
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
      data: expect.objectContaining({ work_order_id: 2, work_order_mark_id: 2, event_type: 'ACCEPT_VERSION', changes: [{ field: 'qty_planned', old: 5, new: 8 }] }),
    })
    expect(autoCreate.recomputeDuration).toHaveBeenCalledWith(prisma, 2)
  })

  it('apply_to_other_wos absent/false: does not touch other WOs', async () => {
    const mark = makeMark()
    const latestAsm = { ...mark.bom_assembly, id: 200, dispatch_id: 20, qty: 8 }
    const prisma = makePrisma(mark, latestAsm)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
  // User-typed actuals (2026-10-01) — required on every Done.
  const ACTUALS = { actual_start: '2026-09-30T01:00:00.000Z', actual_finish: '2026-09-30T10:00:00.000Z', timeliness: 'ON_PLAN' }

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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }] } as any, 'tester')).rejects.toThrow(ConflictException)
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('400s when a non-removed mark is missing from the request', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }, { id: 2, bom_assembly_id: 200 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(
      svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }], ...ACTUALS } as any, 'tester'),
    ).rejects.toThrow(/Missing completion input/)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('400s when the request includes an unknown/removed mark', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(
      svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }, { bom_assembly_id: 999, qty_done: 1 }], ...ACTUALS } as any, 'tester'),
    ).rejects.toThrow(/Unknown or removed mark/)
  })

  it('writes qty_done + QC breakdown per mark, sets WO DONE, and writes ONE whole-WO DONE event', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }, { id: 2, bom_assembly_id: 200 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.done(
      1,
      {
        marks: [
          { bom_assembly_id: 100, qty_done: 5, qty_qc_passed: 4, qty_rework: 1 },
          { bom_assembly_id: 200, qty_done: 3 },
        ],
        notes: 'all done',
        ...ACTUALS,
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
      data: {
        status: 'DONE',
        actual_start: new Date(ACTUALS.actual_start),
        actual_finish: new Date(ACTUALS.actual_finish),
        timeliness: 'ON_PLAN',
        delay_note: null,
        pre_hold_status: null,
        updated_by: 'tester',
      },
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 1, event_type: 'DONE', notes: 'all done', recorded_by: 'tester' },
    })
    expect(result).toEqual({ id: 1 })
  })

  // Fix wave 2026-10-05: the legacy marks[] path is a qty writer too, so it
  // audits each mark it actually changes (same transaction) — Q27's single
  // audit trail. Only fields it writes count; null ↔ 0 is not a change.
  it('with marks: writes one PROGRESS_UPDATE per mark whose values changed, with only the written changes', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [
      { id: 1, bom_assembly_id: 100, qty_planned: 5, qty_not_started: 0, qty_in_progress: null, qty_done: 5, qty_qc_passed: 4, qty_rework: null, qty_renew: 1 } as any,
      { id: 2, bom_assembly_id: 200, qty_planned: 3, qty_not_started: 0, qty_in_progress: 0, qty_done: 3, qty_qc_passed: 3, qty_rework: 0, qty_renew: 0 } as any,
    ])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.done(
      1,
      {
        marks: [
          // mark 1: QC 4 → 5 and Rework null → 0 (not a change); Renew omitted → not written, not audited
          { bom_assembly_id: 100, qty_not_started: 0, qty_in_progress: 0, qty_done: 5, qty_qc_passed: 5, qty_rework: 0 },
          // mark 2: same values as saved → no event
          { bom_assembly_id: 200, qty_done: 3, qty_qc_passed: 3 },
        ],
        ...ACTUALS,
      } as any,
      'tester',
    )

    const progress = prisma.work_order_event.create.mock.calls.map((c: any) => c[0].data).filter((d: any) => d.event_type === 'PROGRESS_UPDATE')
    expect(progress).toEqual([
      { work_order_id: 1, work_order_mark_id: 1, event_type: 'PROGRESS_UPDATE', changes: [{ field: 'qty_qc_passed', old: 4, new: 5 }], recorded_by: 'tester' },
    ])
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 1, event_type: 'DONE', notes: null, recorded_by: 'tester' },
    })
  })

  it('writes qty_not_started/qty_in_progress per mark, same as the QC breakdown fields', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.done(1, { marks: [{ bom_assembly_id: 100, qty_not_started: 2, qty_in_progress: 3, qty_done: 5 }], ...ACTUALS } as any, 'tester')

    const call = prisma.work_order_mark.update.mock.calls[0][0]
    expect(Number(call.data.qty_not_started)).toBe(2)
    expect(Number(call.data.qty_in_progress)).toBe(3)
    expect(Number(call.data.qty_done)).toBe(5)
  })

  it('omits qty_not_started/qty_in_progress (undefined, not 0) when not sent', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }], ...ACTUALS } as any, 'tester')

    const call = prisma.work_order_mark.update.mock.calls[0][0]
    expect(call.data.qty_not_started).toBeUndefined()
    expect(call.data.qty_in_progress).toBeUndefined()
  })

  it('400s when Not Started + In Progress + Done exceeds the mark\'s planned qty', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 10 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(
      svc.done(1, { marks: [{ bom_assembly_id: 100, qty_not_started: 4, qty_in_progress: 4, qty_done: 4 }], ...ACTUALS } as any, 'tester'),
    ).rejects.toThrow(/exceeds planned qty/)
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('allows Not Started + In Progress + Done to exactly equal the planned qty', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 10 }])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.done(1, { marks: [{ bom_assembly_id: 100, qty_not_started: 3, qty_in_progress: 3, qty_done: 4 }], ...ACTUALS } as any, 'tester')
    expect(prisma.work_order_mark.update).toHaveBeenCalledTimes(1)
  })

  it('400s (nothing written) when actuals are missing, finish < start, or in the future', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const cases: [Record<string, unknown>, string][] = [
      [{ timeliness: 'ON_PLAN' }, 'Actual Start and Actual Finish are required'],
      [{ ...ACTUALS, actual_finish: '2026-09-30T00:59:00.000Z' }, 'Actual Finish must not be before Actual Start'],
      [{ ...ACTUALS, actual_finish: future }, 'Actual Start and Actual Finish must not be in the future'],
    ]
    for (const [actuals, message] of cases) {
      const prisma = makePrisma(makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }]))
      const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
      await expect(
        svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }], ...actuals } as any, 'tester'),
      ).rejects.toThrow(new BadRequestException(message))
      expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
      expect(prisma.work_order.update).not.toHaveBeenCalled()
    }
  })

  it('400s when DELAYED without a (non-blank) delay_note; stores the trimmed note when given', async () => {
    const prisma = makePrisma(makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }]))
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)
    const dto = { marks: [{ bom_assembly_id: 100, qty_done: 5 }], ...ACTUALS, timeliness: 'DELAYED' }

    await expect(svc.done(1, { ...dto, delay_note: '   ' } as any, 'tester')).rejects.toThrow(
      new BadRequestException('A delay reason is required when the work order is Delayed'),
    )
    expect(prisma.work_order.update).not.toHaveBeenCalled()

    await svc.done(1, { ...dto, delay_note: '  machine down  ' } as any, 'tester')
    expect(prisma.work_order.update.mock.calls[0][0].data).toMatchObject({ timeliness: 'DELAYED', delay_note: 'machine down' })
  })

  // Result must agree with the dates (user 2026-10-14): Actual Finish vs Plan Finish.
  it('400s when On Plan finishes after the plan, or Delayed finishes within it', async () => {
    const wo = { ...makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }]), plan_finish: new Date('2026-09-30T08:00:00.000Z') }
    const svc = new WorkOrdersService(makePrisma(wo as any), makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)
    const marks = [{ bom_assembly_id: 100, qty_done: 5 }]

    // ACTUALS finishes 10:00, two hours after the plan.
    await expect(svc.done(1, { marks, ...ACTUALS } as any, 'tester')).rejects.toThrow(
      new BadRequestException('Finished after the plan — choose Delayed'),
    )
    await expect(svc.done(1, { marks, ...ACTUALS, actual_finish: '2026-09-30T08:00:00.000Z', timeliness: 'DELAYED', delay_note: 'x' } as any, 'tester')).rejects.toThrow(
      new BadRequestException('Finished within the plan — choose On Plan'),
    )
    await expect(svc.done(1, { marks, ...ACTUALS, timeliness: 'DELAYED', delay_note: 'late steel' } as any, 'tester')).resolves.toEqual({ id: 1 })
  })

  it('ON_PLAN stores delay_note as null even when one is sent', async () => {
    const prisma = makePrisma(makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100 }]))
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.done(1, { marks: [{ bom_assembly_id: 100, qty_done: 5 }], ...ACTUALS, delay_note: 'ignored' } as any, 'tester')
    expect(prisma.work_order.update.mock.calls[0][0].data).toMatchObject({ timeliness: 'ON_PLAN', delay_note: null })
  })

  it('404s when the WO does not exist', async () => {
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.done(999, { marks: [] } as any, 'tester')).rejects.toThrow(NotFoundException)
  })

  it('without marks: validates the SAVED values and completes without touching marks', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 5, qty_not_started: 0, qty_in_progress: 0, qty_done: 5, qty_qc_passed: 5, qty_rework: 0, qty_renew: 0, actual_finish: new Date('2026-09-30T09:00:00.000Z') } as any])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)
    await svc.done(1, { ...ACTUALS } as any, 'tester')
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
    expect(prisma.work_order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DONE' }) }))
  })

  // QA F-2 (2026-10-14): every mark needs its finish date before the WO completes.
  it('without marks: 400s when a fully QC-passed mark has no Finish Date', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 5, qty_not_started: 0, qty_in_progress: 0, qty_done: 5, qty_qc_passed: 5, qty_rework: 0, qty_renew: 0, actual_finish: null } as any])
    const svc = new WorkOrdersService(makePrisma(wo), makeAutoCreate() as any, {} as any)
    await expect(svc.done(1, { ...ACTUALS } as any, 'tester')).rejects.toThrow(
      new BadRequestException('Every mark needs a Finish Date before completing: 100'),
    )
  })

  it('without marks: 400s when a saved mark is not fully QC-passed', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 5, qty_done: 5, qty_qc_passed: 3, qty_rework: 2 } as any])
    const svc = new WorkOrdersService(makePrisma(wo), makeAutoCreate() as any, {} as any)
    await expect(svc.done(1, { ...ACTUALS } as any, 'tester')).rejects.toThrow(/QC Passed = Quantity/)
  })

  // Spec §4: without marks, the SAVED values must also pass the sum rules —
  // each case below passes the QC gate (qc_passed = planned) on purpose, so
  // only the sum rule can stop it.
  it('without marks: 400s when a saved field exceeds Quantity (accept-version lowered planned below done)', async () => {
    // planned 10 → 5 via acceptNewVersion with qc 5 + rework 5; qty_done stayed 10
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 5, qty_not_started: 0, qty_in_progress: 0, qty_done: 10, qty_qc_passed: 5, qty_rework: 5, qty_renew: 0 } as any])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    await expect(svc.done(1, { ...ACTUALS } as any, 'tester')).rejects.toThrow(/cannot exceed Quantity for mark\(s\): 100/)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('without marks: 400s when saved Not Started + In Progress + Done exceeds Quantity', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 5, qty_not_started: 1, qty_in_progress: 0, qty_done: 5, qty_qc_passed: 5, qty_rework: 0, qty_renew: 0 } as any])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    await expect(svc.done(1, { ...ACTUALS } as any, 'tester')).rejects.toThrow(/Not Started \+ In Progress \+ Done exceeds Quantity for mark\(s\): 100/)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('without marks: 400s when saved QC Passed + Rework + Renew exceeds Done', async () => {
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 5, qty_not_started: 0, qty_in_progress: 0, qty_done: 5, qty_qc_passed: 5, qty_rework: 0, qty_renew: 1 } as any])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    await expect(svc.done(1, { ...ACTUALS } as any, 'tester')).rejects.toThrow(/QC Passed \+ Rework \+ Renew exceeds Done for mark\(s\): 100/)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('without marks: treats a null saved qty_done as 0, so QC Passed cannot stand on it', async () => {
    // acceptNewVersion skips its QC upper bound when qty_done is null
    const wo = makeWoWithMarks('IN_PROGRESS', [{ id: 1, bom_assembly_id: 100, qty_planned: 5, qty_not_started: null, qty_in_progress: null, qty_done: null, qty_qc_passed: 5, qty_rework: null, qty_renew: null } as any])
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    await expect(svc.done(1, { ...ACTUALS } as any, 'tester')).rejects.toThrow(/QC Passed \+ Rework \+ Renew exceeds Done for mark\(s\): 100/)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.cancel(1, { reason: 'x' } as any, 'tester')).rejects.toThrow(ConflictException)
  })

  it('allows cancel from ON_HOLD', async () => {
    const wo = makeWo({ status: 'ON_HOLD' })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.cancel(1, { reason: 'x' } as any, 'tester')).rejects.toThrow(BadRequestException)
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('400s when a mark_disposition entry\'s QC breakdown sum exceeds that mark\'s qty_done', async () => {
    const wo = makeWo({ marks: [{ id: 1, bom_assembly_id: 100, qty_done: 5, removed_at: null }] })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(
      svc.cancel(1, { reason: 'x', mark_disposition: [{ bom_assembly_id: 100, qty_qc_passed: 10 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
  })

  it('cancels with no-output marks — no mark_disposition required, single CANCEL event', async () => {
    const wo = makeWo()
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.cancel(1, { reason: 'x', mark_disposition: [{ bom_assembly_id: 100, qty_qc_passed: 2, qty_rework: 1 }] } as any, 'tester')

    // 1 QC-breakdown write (mark 1) + 2 budget-release writes (2026-09-25 —
    // cancel now releases every non-removed mark, mark 1 and mark 2 both).
    expect(prisma.work_order_mark.update).toHaveBeenCalledTimes(3)
    const [qcCall] = prisma.work_order_mark.update.mock.calls
    expect(qcCall[0].where).toEqual({ id: 1 })
    expect(Number(qcCall[0].data.qty_qc_passed)).toBe(2)
    expect(Number(qcCall[0].data.qty_rework)).toBe(1)
    expect(Number(qcCall[0].data.qty_renew)).toBe(0) // provided breakdown → blank = 0 (fix wave)
    const releaseCalls = prisma.work_order_mark.update.mock.calls.slice(1)
    expect(releaseCalls.map((c: any) => c[0].where)).toEqual(expect.arrayContaining([{ id: 1 }, { id: 2 }]))
    for (const [call] of releaseCalls) {
      expect(call.data.removed_at).toBeInstanceOf(Date)
      expect(call.data.removed_by).toBe('tester')
    }
    // 2026-10-05: the disposition is audited as a PROGRESS_UPDATE on the mark with output only.
    const progressEvents = prisma.work_order_event.create.mock.calls.map((c: any) => c[0].data).filter((d: any) => d.event_type === 'PROGRESS_UPDATE')
    expect(progressEvents).toEqual([
      {
        work_order_id: 1,
        work_order_mark_id: 1,
        event_type: 'PROGRESS_UPDATE',
        changes: [{ field: 'qty_qc_passed', old: null, new: 2 }, { field: 'qty_rework', old: null, new: 1 }],
        notes: 'Cancel disposition',
        recorded_by: 'tester',
      },
    ])
  })

  it('a provided breakdown writes ALL THREE QC fields, blank = 0 (saved Done 5 / QC 3 / Rework 2 + {qty_qc_passed: 5} → 5/0/0)', async () => {
    const wo = makeWo({ marks: [{ id: 1, bom_assembly_id: 100, qty_done: 5, qty_qc_passed: 3, qty_rework: 2, qty_renew: null, removed_at: null }] })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.cancel(1, { reason: 'x', mark_disposition: [{ bom_assembly_id: 100, qty_qc_passed: 5 }] } as any, 'tester')

    const [qcCall] = prisma.work_order_mark.update.mock.calls
    expect(qcCall[0].where).toEqual({ id: 1 })
    expect(Number(qcCall[0].data.qty_qc_passed)).toBe(5)
    expect(Number(qcCall[0].data.qty_rework)).toBe(0)
    expect(Number(qcCall[0].data.qty_renew)).toBe(0)
    const progress = prisma.work_order_event.create.mock.calls.map((c: any) => c[0].data).filter((d: any) => d.event_type === 'PROGRESS_UPDATE')
    expect(progress).toHaveLength(1)
    expect(progress[0].changes).toEqual([{ field: 'qty_qc_passed', old: 3, new: 5 }, { field: 'qty_rework', old: 2, new: 0 }])
  })

  it('writes no PROGRESS_UPDATE when the disposition matches the saved QC values', async () => {
    const wo = makeWo({ marks: [{ id: 1, bom_assembly_id: 100, qty_done: 5, qty_qc_passed: 2, qty_rework: 1, qty_renew: null, removed_at: null }] })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.cancel(1, { reason: 'x', mark_disposition: [{ bom_assembly_id: 100, qty_qc_passed: 2, qty_rework: 1 }] } as any, 'tester')

    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(1) // CANCEL only
  })

  it('releases a removed mark\'s budget once (not twice) and still releases the other non-removed mark', async () => {
    const wo = makeWo({
      marks: [
        { id: 1, bom_assembly_id: 100, qty_done: 5, removed_at: new Date() },
        { id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null },
      ],
    })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await expect(svc.cancel(1, { reason: 'x' } as any, 'tester')).resolves.toEqual({ id: 1 })

    // Only mark 2 releases (2026-09-25) — mark 1 was already removed earlier
    // (and its qty_done already accounted for then), so cancel must not
    // touch it a second time.
    expect(prisma.work_order_mark.update).toHaveBeenCalledTimes(1)
    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { removed_at: expect.any(Date), removed_by: 'tester', removed_reason: 'x' },
    })
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
                marks: w.marks.filter((m) => !m.removed_at).map((m) => ({ id: m.id, qty_done: m.qty_done })),
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.cancel(1, { reason: 'abandoning mark' } as any, 'tester')

    expect(prisma.work_order.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 }, data: expect.objectContaining({ status: 'CANCELLED' }) }))
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 2, event_type: 'CANCEL', notes: 'Cascade-cancelled: sibling of WO-00000001', recorded_by: 'tester' },
    })
    // Budget-release (2026-09-25): both the primary's own mark (id 1) and
    // the cascade-cancelled sibling's mark (id 2) must free their budget.
    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { removed_at: expect.any(Date), removed_by: 'tester', removed_reason: 'abandoning mark' },
    })
    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { removed_at: expect.any(Date), removed_by: 'tester', removed_reason: 'Cascade-cancelled: sibling of WO-00000001' },
    })
  })

  it('leaves a sibling with real output on the shared mark untouched (needs_disposition)', async () => {
    const assemblies = { 100: { assembly_mark: 'TC-CO1', dispatch: GROUP } }
    const primary: FakeWo = { id: 1, mo_id: 10, wo_code: 'WO-00000001', status: 'RELEASED', marks: [{ id: 1, work_order_id: 1, bom_assembly_id: 100, qty_done: null, removed_at: null }] }
    const sibling: FakeWo = { id: 2, mo_id: 10, wo_code: 'WO-00000002', status: 'PAUSED', marks: [{ id: 2, work_order_id: 2, bom_assembly_id: 100, qty_done: 4, removed_at: null }] }
    const prisma = makeFakePrisma(assemblies, [primary, sibling])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    const result = await svc.cancelSiblings(1)

    expect(result.to_cancel.map((s: any) => s.id)).toEqual([2])
    expect(result.needs_disposition.map((s: any) => s.id)).toEqual([3])
  })

  it('returns empty arrays when the WO has no non-removed marks', async () => {
    const wo = { id: 1, mo_id: 10, marks: [{ bom_assembly_id: 100, removed_at: new Date() }] }
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(wo) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    const result = await svc.cancelSiblings(1)

    expect(result).toEqual({ to_cancel: [], needs_disposition: [] })
  })

  it('404s when the WO does not exist', async () => {
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(null) } }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.removeMark(1, { bom_assembly_id: 999, reason: 'x' } as any, 'tester')).rejects.toThrow(NotFoundException)
  })

  it("400s attempting to remove the WO's last non-removed mark", async () => {
    const wo = makeWo({ marks: [{ id: 1, bom_assembly_id: 100, qty_done: null, removed_at: null }] })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.removeMark(1, { bom_assembly_id: 100, reason: 'x' } as any, 'tester')).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('409s on a terminal WO (DONE/CANCELLED)', async () => {
    const wo = makeWo({ status: 'DONE' })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await expect(
      svc.removeMark(1, { bom_assembly_id: 100, reason: 'x', qty_qc_passed: 0, qty_rework: 0, qty_renew: 0 } as any, 'tester'),
    ).resolves.toEqual({ id: 1 })
    // Fix wave 2026-10-05: null ↔ 0 is not a change, so writing 0s over blank
    // QC fields audits nothing (the MARK_REMOVED event carries no `changes`).
    const ev = prisma.work_order_event.create.mock.calls[0][0].data
    expect(ev).toMatchObject({ event_type: 'MARK_REMOVED', work_order_mark_id: 1 })
    expect(ev.changes).toBeUndefined()
  })

  it('a provided breakdown writes ALL THREE QC fields, blank = 0 (saved Done 5 / QC 3 / Rework 2 + {qty_qc_passed: 5} → 5/0/0)', async () => {
    const wo = makeWo({
      marks: [
        { id: 1, bom_assembly_id: 100, qty_done: 5, qty_qc_passed: 3, qty_rework: 2, qty_renew: null, removed_at: null },
        { id: 2, bom_assembly_id: 200, qty_done: null, removed_at: null },
      ],
    })
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.removeMark(1, { bom_assembly_id: 100, reason: 'x', qty_qc_passed: 5 } as any, 'tester')

    const data = prisma.work_order_mark.update.mock.calls[0][0].data
    expect(Number(data.qty_qc_passed)).toBe(5)
    expect(Number(data.qty_rework)).toBe(0)
    expect(Number(data.qty_renew)).toBe(0)
    expect(prisma.work_order_event.create.mock.calls[0][0].data.changes).toEqual([
      { field: 'qty_qc_passed', old: 3, new: 5 },
      { field: 'qty_rework', old: 2, new: 0 },
    ])
  })

  it('soft-removes the mark, writes MARK_REMOVED, and recomputes duration', async () => {
    const wo = makeWo()
    const prisma = makePrisma(wo)
    const autoCreate = makeAutoCreate()
    const svc = new WorkOrdersService(prisma, autoCreate as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    const result = await svc.removeMark(1, { bom_assembly_id: 100, reason: 'BOM removed this mark' } as any, 'tester')

    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ removed_by: 'tester', removed_reason: 'BOM removed this mark', removed_at: expect.any(Date) }),
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: { work_order_id: 1, work_order_mark_id: 1, event_type: 'MARK_REMOVED', notes: 'BOM removed this mark', recorded_by: 'tester' },
    })
    // No QC breakdown sent → QC fields untouched, no `changes` on the event.
    const data = prisma.work_order_mark.update.mock.calls[0][0].data
    expect([data.qty_qc_passed, data.qty_rework, data.qty_renew]).toEqual([undefined, undefined, undefined])
    expect(prisma.work_order_event.create.mock.calls[0][0].data.changes).toBeUndefined()
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
    const svc = new WorkOrdersService(prisma, autoCreate as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.transition(1, 'hold', { reason: 'x' }, 'tester')).rejects.toThrow(ConflictException)
  })

  it('hold: 409s when already ON_HOLD', async () => {
    const wo = { id: 1, status: 'ON_HOLD', pre_hold_status: 'IN_PROGRESS' }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.transition(1, 'hold', { reason: 'x' }, 'tester')).rejects.toThrow(ConflictException)
  })

  it('resume: from ON_HOLD restores pre_hold_status, clears it, and writes an UNHOLD event', async () => {
    const wo = { id: 1, status: 'ON_HOLD', pre_hold_status: 'IN_PROGRESS' }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.resume(1, {}, 'tester')).rejects.toThrow(ConflictException)
  })

  it('resume: 409s from ON_HOLD with no pre_hold_status recorded (defensive)', async () => {
    const wo = { id: 1, status: 'ON_HOLD', pre_hold_status: null }
    const prisma = makePrisma(wo)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(svc.resume(1, {}, 'tester')).rejects.toThrow(ConflictException)
  })

  it('allowedActionsFrom reports resume as available from ON_HOLD even though it is not in WO_ACTIONS', () => {
    expect(allowedActionsFrom('ON_HOLD' as any)).toContain('resume')
    expect(allowedActionsFrom('ON_HOLD' as any)).toContain('cancel')
  })
})

describe('WorkOrdersService.transition — start seeds qty_not_started', () => {
  function makePrisma(wo: any, marks: { id: number; qty_planned: number; qty_not_started: number | null }[]) {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue(wo), update: jest.fn() },
      work_order_event: { create: jest.fn() },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(marks), update: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  it('sets qty_not_started = qty_planned on every non-removed mark when the WO starts — and no longer stamps actual_start (2026-10-01)', async () => {
    const wo = { id: 1, status: 'RELEASED' }
    const marks = [{ id: 10, qty_planned: 5, qty_not_started: null }, { id: 11, qty_planned: 2, qty_not_started: null }]
    const prisma = makePrisma(wo, marks)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'start', {}, 'tester')

    expect(prisma.work_order_mark.findMany).toHaveBeenCalledWith({
      where: { work_order_id: 1, removed_at: null },
      select: { id: true, qty_planned: true, qty_not_started: true },
    })
    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { qty_not_started: 5 } })
    expect(prisma.work_order_mark.update).toHaveBeenCalledWith({ where: { id: 11 }, data: { qty_not_started: 2 } })
    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'IN_PROGRESS', updated_by: 'tester' },
    })
    // 2026-10-05: the seed is audited — one PROGRESS_UPDATE per mark, on top of the START event.
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ work_order_id: 1, event_type: 'START', recorded_by: 'tester' }),
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ event_type: 'PROGRESS_UPDATE', work_order_mark_id: 10, changes: [{ field: 'qty_not_started', old: null, new: 5 }], notes: 'Start', recorded_by: 'tester' }),
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ event_type: 'PROGRESS_UPDATE', work_order_mark_id: 11, changes: [{ field: 'qty_not_started', old: null, new: 2 }], notes: 'Start', recorded_by: 'tester' }),
    })
    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(3)
  })

  it('writes no PROGRESS_UPDATE for a mark whose seed changes nothing', async () => {
    const prisma = makePrisma({ id: 1, status: 'RELEASED' }, [{ id: 10, qty_planned: 5, qty_not_started: 5 }])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'start', {}, 'tester')

    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(1) // START only
  })

  it('does not touch work_order_mark for other transitions (e.g. pause)', async () => {
    const wo = { id: 1, status: 'IN_PROGRESS' }
    const prisma = makePrisma(wo, [])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.transition(1, 'pause', { reason: 'break' }, 'tester')

    expect(prisma.work_order_mark.findMany).not.toHaveBeenCalled()
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })
})

// 2026-10-01 — actuals are user-typed; editable afterwards only once DONE, audit-logged.
describe('WorkOrdersService.updateActuals', () => {
  const OLD = { actual_start: new Date('2026-09-29T01:00:00.000Z'), actual_finish: new Date('2026-09-29T10:00:00.000Z'), timeliness: 'ON_PLAN', delay_note: null }
  const DTO = { actual_start: '2026-09-29T01:00:00.000Z', actual_finish: '2026-09-30T10:00:00.000Z', timeliness: 'DELAYED', delay_note: ' late steel ' }

  function makeService(wo: Record<string, unknown> | null) {
    const prisma: any = { work_order: { findUnique: jest.fn().mockResolvedValue(wo), update: jest.fn() }, work_order_event: { create: jest.fn() } }
    const mail = { log: jest.fn().mockResolvedValue({}) }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, mail as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)
    return { svc, prisma, mail }
  }

  it('404s when the WO does not exist', async () => {
    const { svc } = makeService(null)
    await expect(svc.updateActuals(999, DTO as any, 'tester', 42)).rejects.toThrow(NotFoundException)
  })

  it('409s unless the WO is DONE', async () => {
    const { svc, prisma } = makeService({ id: 1, wo_code: 'WO-1', status: 'IN_PROGRESS', ...OLD })
    await expect(svc.updateActuals(1, DTO as any, 'tester', 42)).rejects.toThrow(
      new ConflictException('Actual dates can only be edited after the work order is DONE'),
    )
    expect(prisma.work_order.update).not.toHaveBeenCalled()
  })

  it('writes the new actuals and logs an audit row tracking only the changed fields', async () => {
    const { svc, prisma, mail } = makeService({ id: 1, wo_code: 'WO-1', status: 'DONE', ...OLD })

    const result = await svc.updateActuals(1, DTO as any, 'tester', 42)

    expect(prisma.work_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        actual_start: new Date(DTO.actual_start),
        actual_finish: new Date(DTO.actual_finish),
        timeliness: 'DELAYED',
        delay_note: 'late steel',
        updated_by: 'tester',
      },
    })
    expect(mail.log).toHaveBeenCalledWith(expect.objectContaining({
      model: 'work_order',
      res_id: 1,
      author_id: 42,
      message_type: 'audit',
      tracking: [
        { field: 'actual_finish', old_value: '2026-09-29T10:00:00.000Z', new_value: '2026-09-30T10:00:00.000Z' },
        { field: 'timeliness', old_value: 'ON_PLAN', new_value: 'DELAYED' },
        { field: 'delay_note', old_value: null, new_value: 'late steel' },
      ],
    }))
    expect(result).toEqual({ id: 1 })
  })

  it('applies the same validation as Done: DELAYED needs a note, dates must be ordered', async () => {
    const { svc, prisma } = makeService({ id: 1, wo_code: 'WO-1', status: 'DONE', ...OLD })
    await expect(svc.updateActuals(1, { ...DTO, delay_note: '' } as any, 'tester', 42)).rejects.toThrow(
      new BadRequestException('A delay reason is required when the work order is Delayed'),
    )
    await expect(
      svc.updateActuals(1, { ...DTO, actual_finish: '2026-09-29T00:00:00.000Z' } as any, 'tester', 42),
    ).rejects.toThrow(new BadRequestException('Actual Finish must not be before Actual Start'))
    expect(prisma.work_order.update).not.toHaveBeenCalled()
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
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    }
    return prisma
  }

  it('updates qty_actual for each listed material, with no upper-bound check against qty_planned', async () => {
    const prisma = makePrisma([200, 300])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
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
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(
      svc.updateConsumeActuals(1, { consume: [{ material_id: 999, qty_actual: 5 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_consume.update).not.toHaveBeenCalled()
  })

  it('404s when the WO does not exist', async () => {
    const prisma = makePrisma()
    prisma.work_order.findUnique.mockResolvedValue(null)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

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
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    }
    return prisma
  }

  it('sets qty (pieces) for each listed part directly — no plan/actual distinction, just capped at the real total (2026-09-18) not an arbitrary bound — and derives weight_kg from it', async () => {
    const prisma = makePrisma([500, 600])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any) // default mock: budget total=Infinity
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
    const svc = new WorkOrdersService(prisma, autoCreate as any, {} as any)

    await expect(
      svc.updatePartActuals(1, { parts: [{ bom_assembly_part_id: 500, qty: 10 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_part.update).not.toHaveBeenCalled()
    expect(autoCreate.computePartBudget).toHaveBeenCalledWith(prisma, 10, 500, 1) // mo_id from the WO, excludes this WO's own id (1)
  })

  it("400s when a bom_assembly_part_id isn't already planned on this WO", async () => {
    const prisma = makePrisma([500])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(
      svc.updatePartActuals(1, { parts: [{ bom_assembly_part_id: 999, qty: 5 }] } as any, 'tester'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.work_order_part.update).not.toHaveBeenCalled()
  })

  it('404s when the WO does not exist', async () => {
    const prisma = makePrisma()
    prisma.work_order.findUnique.mockResolvedValue(null)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)

    await expect(
      svc.updatePartActuals(999, { parts: [{ bom_assembly_part_id: 500, qty: 5 }] } as any, 'tester'),
    ).rejects.toThrow(NotFoundException)
  })
})

describe('WorkOrdersService.updateMarkProgress (2026-10-05)', () => {
  const stored = { id: 7, work_order_id: 1, qty_planned: 10, removed_at: null, qty_not_started: 10, qty_in_progress: null, qty_done: null, qty_qc_passed: null, qty_rework: null, qty_renew: null }
  const EXPECTED = { qty_not_started: 10, qty_in_progress: null, qty_done: null, qty_qc_passed: null, qty_rework: null, qty_renew: null }
  const BODY = { qty_not_started: 2, qty_in_progress: 0, qty_done: 8, qty_qc_passed: 6, qty_rework: 1, qty_renew: 0, expected: EXPECTED }
  const SIX = ['qty_not_started', 'qty_in_progress', 'qty_done', 'qty_qc_passed', 'qty_rework', 'qty_renew'] as const

  // updateMany behaves like the DB's conditional UPDATE (fix wave 2026-10-05):
  // it matches the stored row only when every `where` key equals it (null-aware,
  // Decimal-vs-number by value) — so a `where` missing the expected values
  // would wrongly match and the stale tests would catch it.
  const toN = (v: unknown) => (v == null ? null : Number(v))
  const matches = (row: any, where: Record<string, unknown>) =>
    !!row && Object.entries(where).every(([k, v]) => (k === 'removed_at' ? row.removed_at === v : toN(row[k]) === toN(v)))

  function makePrisma(status = 'IN_PROGRESS', mark: any = stored) {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, status, marks: mark ? [mark] : [] }) },
      work_order_mark: {
        findUnique: jest.fn().mockResolvedValue(mark),
        update: jest.fn(),
        updateMany: jest.fn().mockImplementation(async ({ where }: any) => ({ count: matches(mark, where) ? 1 : 0 })),
      },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    }
    return prisma
  }
  function svcFor(prisma: any) {
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)
    return svc
  }
  const rejection = (p: Promise<unknown>) => p.then(() => { throw new Error('expected a rejection') }, (e) => e)

  it('saves the six totals with ONE conditional updateMany (expected values in `where`) and logs one PROGRESS_UPDATE with only the changed fields', async () => {
    const prisma = makePrisma()
    await svcFor(prisma).updateMarkProgress(1, 7, BODY as any, 'tao')
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
    expect(prisma.work_order_mark.updateMany).toHaveBeenCalledTimes(1)
    const { where, data } = prisma.work_order_mark.updateMany.mock.calls[0][0]
    expect(where).toEqual({ id: 7, work_order_id: 1, removed_at: null, ...EXPECTED })
    expect(Object.fromEntries(SIX.map((f) => [f, Number(data[f])]))).toEqual({
      qty_not_started: 2, qty_in_progress: 0, qty_done: 8, qty_qc_passed: 6, qty_rework: 1, qty_renew: 0,
    })
    const ev = prisma.work_order_event.create.mock.calls[0][0].data
    expect(ev).toMatchObject({ work_order_id: 1, work_order_mark_id: 7, event_type: 'PROGRESS_UPDATE', recorded_by: 'tao' })
    // null ↔ 0 (In Progress, Renew) is not a change — fix wave 2026-10-05.
    expect(ev.changes).toEqual([
      { field: 'qty_not_started', old: 10, new: 2 },
      { field: 'qty_done', old: null, new: 8 },
      { field: 'qty_qc_passed', old: null, new: 6 },
      { field: 'qty_rework', old: null, new: 1 },
    ])
  })

  it('accepts a PAUSED work order too', async () => {
    const prisma = makePrisma('PAUSED')
    await expect(svcFor(prisma).updateMarkProgress(1, 7, BODY as any, 'tao')).resolves.toEqual({ id: 1 })
    expect(prisma.work_order_mark.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.work_order_event.create).toHaveBeenCalledTimes(1)
  })

  it('writes nothing when the values are unchanged (no-op)', async () => {
    const same = { ...stored, qty_in_progress: 0, qty_done: 0, qty_qc_passed: 0, qty_rework: 0, qty_renew: 0 }
    const prisma = makePrisma('IN_PROGRESS', same)
    const body = { qty_not_started: 10, qty_in_progress: 0, qty_done: 0, qty_qc_passed: 0, qty_rework: 0, qty_renew: 0, expected: { qty_not_started: 10, qty_in_progress: 0, qty_done: 0, qty_qc_passed: 0, qty_rework: 0, qty_renew: 0 } }
    await svcFor(prisma).updateMarkProgress(1, 7, body as any, 'tao')
    expect(prisma.work_order_mark.updateMany).not.toHaveBeenCalled()
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
  })

  it('409s with code STALE_PROGRESS when the stored values differ from `expected`', async () => {
    const prisma = makePrisma('IN_PROGRESS', { ...stored, qty_done: 3 })
    const err = await rejection(svcFor(prisma).updateMarkProgress(1, 7, BODY as any, 'tao'))
    expect(err).toBeInstanceOf(ConflictException)
    expect(err.getResponse()).toEqual({ message: 'This mark was updated by someone else — latest values reloaded', code: 'STALE_PROGRESS' })
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
  })

  it('409s STALE_PROGRESS when the conditional update matches no row (someone saved between the read and the write)', async () => {
    const prisma = makePrisma() // the read inside the transaction still sees the expected values…
    prisma.work_order_mark.updateMany.mockResolvedValue({ count: 0 }) // …but the row changed before the UPDATE ran
    const err = await rejection(svcFor(prisma).updateMarkProgress(1, 7, BODY as any, 'tao'))
    expect(err).toBeInstanceOf(ConflictException)
    expect(err.getResponse()).toMatchObject({ code: 'STALE_PROGRESS' })
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
  })

  it('409s outside IN_PROGRESS/PAUSED', async () => {
    await expect(svcFor(makePrisma('DONE')).updateMarkProgress(1, 7, BODY as any, 'tao')).rejects.toThrow(ConflictException)
  })

  it('404s for a mark not on the WO or already removed', async () => {
    await expect(svcFor(makePrisma('IN_PROGRESS', null)).updateMarkProgress(1, 99, BODY as any, 'tao')).rejects.toThrow(NotFoundException)
    await expect(svcFor(makePrisma('IN_PROGRESS', { ...stored, removed_at: new Date() })).updateMarkProgress(1, 7, BODY as any, 'tao')).rejects.toThrow(NotFoundException)
  })

  // Per-mark finish date (user feedback 2026-10-14): typed once QC Passed =
  // Quantity, required then, never in the future, cleared when QC drops back.
  describe('actual_finish', () => {
    const FULL = { qty_not_started: 0, qty_in_progress: 0, qty_done: 10, qty_qc_passed: 10, qty_rework: 0, qty_renew: 0, expected: EXPECTED }
    const FINISH = '2026-10-14T03:30:00.000Z'

    it('400s when QC Passed = Quantity but no finish date is given', async () => {
      await expect(svcFor(makePrisma()).updateMarkProgress(1, 7, FULL as any, 'tao')).rejects.toThrow(
        new BadRequestException('Finish Date is required when QC Passed equals Quantity'),
      )
    })

    it('400s on a finish date in the future', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      await expect(svcFor(makePrisma()).updateMarkProgress(1, 7, { ...FULL, actual_finish: future } as any, 'tao')).rejects.toThrow(
        new BadRequestException('Finish Date must not be in the future'),
      )
    })

    it('saves the finish date and logs it as a change', async () => {
      const prisma = makePrisma()
      await svcFor(prisma).updateMarkProgress(1, 7, { ...FULL, actual_finish: FINISH } as any, 'tao')
      const { data } = prisma.work_order_mark.updateMany.mock.calls[0][0]
      expect(data.actual_finish).toEqual(new Date(FINISH))
      const ev = prisma.work_order_event.create.mock.calls[0][0].data
      expect(ev.changes).toContainEqual({ field: 'actual_finish', old: null, new: FINISH })
    })

    it('clears the finish date when QC Passed drops below Quantity', async () => {
      const prisma = makePrisma('IN_PROGRESS', { ...stored, actual_finish: new Date(FINISH) })
      await svcFor(prisma).updateMarkProgress(1, 7, { ...BODY, actual_finish: FINISH } as any, 'tao')
      const { data } = prisma.work_order_mark.updateMany.mock.calls[0][0]
      expect(data.actual_finish).toBeNull()
      const ev = prisma.work_order_event.create.mock.calls[0][0].data
      expect(ev.changes).toContainEqual({ field: 'actual_finish', old: FINISH, new: null })
    })
  })

  it('400s on a field above qty_planned (named by its UI label) or broken sum rules', async () => {
    const svc = svcFor(makePrisma())
    await expect(svc.updateMarkProgress(1, 7, { ...BODY, qty_done: 11, qty_qc_passed: 11 } as any, 'tao')).rejects.toThrow(
      new BadRequestException('Values cannot exceed Quantity (10): Done, QC Passed'),
    )
    await expect(svc.updateMarkProgress(1, 7, { ...BODY, qty_not_started: 5 } as any, 'tao')).rejects.toThrow(
      new BadRequestException('Not Started + In Progress + Done must equal Quantity (10)'),
    )
    // Pieces can't vanish either (user feedback 2026-10-14): 1 + 0 + 8 = 9 ≠ 10.
    await expect(svc.updateMarkProgress(1, 7, { ...BODY, qty_not_started: 1 } as any, 'tao')).rejects.toThrow(
      new BadRequestException('Not Started + In Progress + Done must equal Quantity (10)'),
    )
    await expect(svc.updateMarkProgress(1, 7, { ...BODY, qty_qc_passed: 8, qty_rework: 1 } as any, 'tao')).rejects.toThrow(/QC Passed \+ Rework \+ Renew/)
  })
})

// Every change is in History (2026-10-08): edits to a WO's actual dates,
// consume and part withdrawals become EDIT events with old → new.
describe('WorkOrdersService — edits are logged as EDIT events', () => {
  function make(wo: Record<string, unknown> = {}) {
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 7, wo_code: 'WO-7', mo_id: 3, status: 'DONE', actual_start: new Date('2026-10-01T01:00:00Z'), actual_finish: null, timeliness: 'ON_PLAN', delay_note: null, ...wo }), update: jest.fn() },
      work_order_consume: {
        findMany: jest.fn().mockResolvedValue([{ material_id: 11, qty_actual: '2', material: { default_code: 'WIRE-1' } }]),
        update: jest.fn(),
      },
      work_order_part: {
        findMany: jest.fn().mockResolvedValue([{ bom_assembly_part_id: 21, qty: '1', bom_assembly_part: { part: { part_mark: 'C-f1' } } }]),
        update: jest.fn(),
      },
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue([{ id: 21, part: { weight_kg: '10' } }]) },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn((x: any) => (Array.isArray(x) ? Promise.all(x) : x(prisma))),
    }
    const auto = { computePartBudget: jest.fn().mockResolvedValue({ total: 10, committed: 0 }) }
    const svc = new WorkOrdersService(prisma, auto as any, { log: jest.fn() } as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 7 } as any)
    return { svc, prisma }
  }

  it('actual dates', async () => {
    const { svc, prisma } = make()
    await svc.updateActuals(7, { actual_start: '2026-10-01T02:00:00.000Z', actual_finish: '2026-10-02T10:00:00.000Z', timeliness: 'ON_PLAN' } as any, 'tao', 1)
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({ data: { work_order_id: 7, event_type: 'EDIT', recorded_by: 'tao',
      notes: 'แก้วันที่จริง: เริ่ม 2026-10-01 08:00 → 2026-10-01 09:00 · เสร็จ — → 2026-10-02 17:00' } })
  })

  it('consume', async () => {
    const { svc, prisma } = make()
    await svc.updateConsumeActuals(7, { consume: [{ material_id: 11, qty_actual: 3.5 }] } as any, 'tao')
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({ data: { work_order_id: 7, event_type: 'EDIT', recorded_by: 'tao', notes: 'แก้ consume: WIRE-1 2 → 3.5' } })
  })

  it('part withdrawals', async () => {
    const { svc, prisma } = make()
    await svc.updatePartActuals(7, { parts: [{ bom_assembly_part_id: 21, qty: 4 }] } as any, 'tao')
    expect(prisma.work_order_event.create).toHaveBeenCalledWith({ data: { work_order_id: 7, event_type: 'EDIT', recorded_by: 'tao', notes: 'แก้ยอดเบิก part: C-f1 1 → 4' } })
  })

  it('nothing changed → nothing logged', async () => {
    const { svc, prisma } = make()
    await svc.updateConsumeActuals(7, { consume: [{ material_id: 11, qty_actual: 2 }] } as any, 'tao')
    expect(prisma.work_order_event.create).not.toHaveBeenCalled()
  })
})

// Pre-shop data belongs to its own MO (2026-10-08, user saw "Newer BOM version
// available" on MO-26000016 because a cancelled MO's pre-shop upload of the
// same marks in the same zone was still ACTIVE). Only a real BOM upload is a
// newer version — for a pre-shop mark that's the link to the real BOM.
describe('WorkOrdersService.compareAssemblyToLatest — pre-shop rows', () => {
  const GROUP = { project_id: 16, zone_id: 33, sub_zone_id: null }
  const own = makeBomAssembly({ id: 2078, dispatch_id: 21, assembly_mark: 'BUH1-3' })
  function make(realBom: unknown) {
    const prisma: any = {
      bom_assembly: { findFirst: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.dispatch.source?.not === 'PRE_SHOP' ? realBom : makeBomAssembly({ id: 2050, dispatch_id: 14, assembly_mark: 'BUH1-3' }))) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue({ source: 'PRE_SHOP' }) },
    }
    return { svc: new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any), prisma }
  }

  it("another MO's pre-shop row of the same mark is not a newer version", async () => {
    const { svc } = make(null)
    await expect(svc.compareAssemblyToLatest(own as any, GROUP)).resolves.toMatchObject({ is_outdated: false })
  })

  // Real BOM vs pre-shop is compared and decided on the MO (2026-10-08, user:
  // the user sees every difference and decides) — never via a WO's
  // "Accept new version", which would bypass that.
  it('a real BOM row is not a WO-level alert for a pre-shop mark either', async () => {
    const { svc } = make(makeBomAssembly({ id: 3000, dispatch_id: 40, assembly_mark: 'BUH1-3', weight_kg: 9999 }))
    await expect(svc.compareAssemblyToLatest(own as any, GROUP)).resolves.toMatchObject({ is_outdated: false })
  })
})

describe('WorkOrdersService — mark renamed in the BOM (2026-10-21)', () => {
  const renamesOf = (...rows: any[]) => ({ renamesFor: jest.fn().mockResolvedValue(rows), markUsed: jest.fn(), activeMarksFor: jest.fn().mockResolvedValue(new Set()) })
  const ASM_RENAME = { id: 7, kind: 'ASSEMBLY', from_mark: 'WH-CO-001', to_mark: '3WH-CO-001', dispatch_id: 20 }
  const PART_RENAME = { id: 8, kind: 'PART', from_mark: 'C-x', to_mark: '3C-x', dispatch_id: 20 }

  function makeAcceptPrisma(mark: ReturnType<typeof makeMark>, woParts: any[]) {
    const renamed = { ...mark.bom_assembly, id: 200, dispatch_id: 20, assembly_mark: '3WH-CO-001' }
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_id: 10 }) },
      work_order_mark: { findFirst: jest.fn().mockResolvedValue(mark), update: jest.fn(), findMany: jest.fn().mockResolvedValue([{ bom_assembly_id: 200, qty_planned: 5 }]) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(makeDispatch(10, new Date('2026-01-01'))) },
      bom_assembly: { findFirst: jest.fn(({ where }: any) => Promise.resolve(where.id === 200 || where.assembly_mark === '3WH-CO-001' ? renamed : null)) },
      bom_assembly_part: { findMany: jest.fn(({ where }: any) => Promise.resolve(where.assembly_id === 100
        ? [{ id: 11, qty: 2, part: { part_mark: 'C-f1', weight_kg: 2.5 } }, { id: 12, qty: 1, part: { part_mark: 'C-x', weight_kg: 1 } }]
        : [{ id: 21, qty: 2, part: { part_mark: 'C-f1', weight_kg: 2.5 } }, { id: 22, qty: 1, part: { part_mark: '3C-x', weight_kg: 1 } }])) },
      work_order_part: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(woParts.filter(w => (where.bom_assembly_part_id?.in ?? woParts.map(x => x.bom_assembly_part_id)).includes(w.bom_assembly_part_id)))),
        update: jest.fn(({ where, data }: any) => { Object.assign(woParts.find(w => w.id === where.id), data); return Promise.resolve() }),
        deleteMany: jest.fn(({ where }: any) => { for (const id of where.id.in) woParts.splice(woParts.findIndex(w => w.id === id), 1); return Promise.resolve() }),
        create: jest.fn(({ data }: any) => { woParts.push({ id: 900 + woParts.length, ...data }); return Promise.resolve() }),
      },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  it('bomVersionStatus: no ACTIVE row under the old name but a confirmed pair → RENAMED, pointing at the new row', async () => {
    const mark = makeMark()
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, marks: [mark] }) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(makeDispatch(10, new Date())) },
      bom_assembly: { findFirst: jest.fn(({ where }: any) => Promise.resolve(where.assembly_mark === '3WH-CO-001' ? { ...mark.bom_assembly, id: 200, dispatch_id: 20, assembly_mark: '3WH-CO-001' } : null)) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any, renamesOf(ASM_RENAME) as any)
    const [s] = await svc.bomVersionStatus(1)
    expect(s).toMatchObject({ is_outdated: true, delta_types: ['RENAMED'], latest_dispatch_id: 20, latest_assembly_id: 200,
      delta_details: { renamed: { from: 'WH-CO-001', to: '3WH-CO-001', rename_ids: [7] } } })
    expect(svc.isSignificantDelta(s)).toBe(true)
  })

  // Review Focus 2
  it('accept on RENAMED re-points the mark AND its withdrawals (incl. a renamed part) before parts are recomputed; pairs marked used', async () => {
    const mark = makeMark()
    const woParts = [{ id: 501, work_order_id: 1, bom_assembly_part_id: 11, updated_by: 'tao', qty: 4, weight_kg: 10 }, { id: 502, work_order_id: 1, bom_assembly_part_id: 12, updated_by: 'tao', qty: 1, weight_kg: 1 }]
    const prisma = makeAcceptPrisma(mark, woParts)
    const autoCreate = makeAutoCreate()
    const alias = renamesOf(ASM_RENAME, PART_RENAME)
    const svc = new WorkOrdersService(prisma, autoCreate as any, {} as any, alias as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100 } as any)

    expect(prisma.work_order_mark.update.mock.calls[0][0].data).toMatchObject({ bom_assembly_id: 200, bom_dispatch_id_snapshot: 20 })
    expect(prisma.work_order_part.update.mock.calls.map((c: any) => c[0])).toEqual([
      { where: { id: 501 }, data: { bom_assembly_part_id: 21 } },
      { where: { id: 502 }, data: { bom_assembly_part_id: 22 } },
    ])
    expect(prisma.work_order_part.update.mock.invocationCallOrder[1]).toBeLessThan(autoCreate.recomputeParts.mock.invocationCallOrder[0])
    expect(alias.markUsed).toHaveBeenCalledWith(prisma, expect.arrayContaining([7, 8]))
    expect(prisma.work_order_event.create.mock.calls[0][0].data.notes).toContain('ชื่อ mark WH-CO-001 → 3WH-CO-001')
    expect(prisma.work_order_event.create.mock.calls[0][0].data.notes).toContain('C-x → 3C-x')
  })

  // final review: same part rule as MO switch — when the chain's very end isn't
  // in the accepted version, fall back to the FURTHEST hop that is
  it('part chain whose end is not in the new version → the furthest hop present (not stuck)', async () => {
    const mark = makeMark()
    const woParts = [{ id: 502, work_order_id: 1, bom_assembly_part_id: 12, updated_by: 'tao', qty: 1, weight_kg: 1 }]
    const prisma = makeAcceptPrisma(mark, woParts)
    prisma.bom_assembly_part.findMany = jest.fn(({ where }: any) => Promise.resolve(where.assembly_id === 100
      ? [{ id: 12, qty: 1, part: { part_mark: 'C-x', weight_kg: 1 } }]
      : [{ id: 22, qty: 1, part: { part_mark: 'C-y', weight_kg: 1 } }]))
    const alias = renamesOf(ASM_RENAME, { id: 30, kind: 'PART', from_mark: 'C-x', to_mark: 'C-y', dispatch_id: 15 }, { id: 31, kind: 'PART', from_mark: 'C-y', to_mark: 'C-z', dispatch_id: 18 })
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any, alias as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100 } as any)

    expect(prisma.work_order_part.update).toHaveBeenCalledWith({ where: { id: 502 }, data: { bom_assembly_part_id: 22 } })
    expect(alias.markUsed).toHaveBeenCalledWith(prisma, [7, 30])
  })

  // final review: History standard — the rename is a field-level change too
  it('accept on RENAMED records assembly_mark old → new in the event changes', async () => {
    const mark = makeMark()
    const prisma = makeAcceptPrisma(mark, [])
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any, renamesOf(ASM_RENAME) as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100 } as any)

    expect(prisma.work_order_event.create.mock.calls[0][0].data.changes).toEqual(expect.arrayContaining([{ field: 'assembly_mark', old: 'WH-CO-001', new: '3WH-CO-001' }]))
  })

  it('the accept bug (no rename): with the real recomputeParts there is exactly one row per part, withdrawal kept', async () => {
    const mark = makeMark()
    const woParts: any[] = [{ id: 501, work_order_id: 1, bom_assembly_part_id: 11, updated_by: 'tao', qty: 4, weight_kg: 10 }]
    const prisma = makeAcceptPrisma(mark, woParts)
    prisma.bom_assembly.findFirst = jest.fn(({ where }: any) => Promise.resolve(where.assembly_mark === 'WH-CO-001' || where.id === 200 ? { ...mark.bom_assembly, id: 200, dispatch_id: 20 } : null))
    prisma.bom_assembly_part.findMany = jest.fn(({ where }: any) => Promise.resolve(where.assembly_id === 100
      ? [{ id: 11, qty: 2, part: { part_mark: 'C-f1', weight_kg: 2.5 } }]
      : [{ id: 21, qty: 2, part: { part_mark: 'C-f1', weight_kg: 2.5 } }]))
    const real = new WorkOrderAutoCreateService()
    jest.spyOn(real, 'computePartBudget').mockResolvedValue({ total: Infinity, committed: 0, remaining: Infinity } as any)
    const autoCreate = { ...makeAutoCreate(), recomputeParts: real.recomputeParts.bind(real) }
    const svc = new WorkOrdersService(prisma, autoCreate as any, {} as any, renamesOf() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100 } as any)

    expect(woParts).toEqual([expect.objectContaining({ id: 501, bom_assembly_part_id: 21, qty: 4, weight_kg: 10 })])
  })

  it('a part with a withdrawal and no target refuses in plain Thai; nothing is written', async () => {
    const mark = makeMark()
    const woParts = [{ id: 502, work_order_id: 1, bom_assembly_part_id: 12, updated_by: 'tao' }]
    const prisma = makeAcceptPrisma(mark, woParts)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any, renamesOf(ASM_RENAME) as any)
    await expect(svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100 } as any)).rejects.toThrow('C-x ไม่มีใน BOM ใหม่ แต่มียอดเบิกใน WO แล้ว — แก้ยอดเบิกใน WO ก่อน')
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  it('formerMarks: every older name of each mark, nearest first', async () => {
    const svc = new WorkOrdersService({} as any, makeAutoCreate() as any, {} as any,
      renamesOf({ id: 1, kind: 'ASSEMBLY', from_mark: 'A', to_mark: 'B', dispatch_id: 2 }, { id: 2, kind: 'ASSEMBLY', from_mark: 'B', to_mark: 'C', dispatch_id: 3 }) as any)
    const map = await svc.formerMarks([{ id: 30, assembly_mark: 'C', dispatch_id: 3, dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } }])
    expect(map.get(30)).toEqual(['B', 'A'])
  })

  // final review: a former name that is ACTIVE in the scope again is another
  // piece reusing it — the WO Visual tab must not fall back to its Drawing
  it('formerMarks: skips a former name that is an ACTIVE mark in the scope now', async () => {
    const alias = { ...renamesOf({ id: 1, kind: 'ASSEMBLY', from_mark: 'A', to_mark: 'B', dispatch_id: 2 }, { id: 2, kind: 'ASSEMBLY', from_mark: 'B', to_mark: 'C', dispatch_id: 3 }),
      activeMarksFor: jest.fn().mockResolvedValue(new Set(['C', 'A'])) }
    const svc = new WorkOrdersService({} as any, makeAutoCreate() as any, {} as any, alias as any)
    const map = await svc.formerMarks([{ id: 30, assembly_mark: 'C', dispatch_id: 3, dispatch: { project_id: 1, zone_id: 1, sub_zone_id: null } }])
    expect(map.get(30)).toEqual(['B'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Fix round 1 (2026-10-21 reviewer pass): name-reuse order, part chain bound,
// drop safety, sibling-WO refusal/history, collision handling.
// ═══════════════════════════════════════════════════════════════════════════
describe('WorkOrdersService — mark renamed in the BOM, fix round 1', () => {
  const renamesOf = (...rows: any[]) => ({ renamesFor: jest.fn().mockResolvedValue(rows), markUsed: jest.fn(), activeMarksFor: jest.fn().mockResolvedValue(new Set()) })
  const ASM_RENAME = { id: 7, kind: 'ASSEMBLY', from_mark: 'WH-CO-001', to_mark: '3WH-CO-001', dispatch_id: 20 }
  const PART_RENAME = { id: 8, kind: 'PART', from_mark: 'C-x', to_mark: '3C-x', dispatch_id: 20 }

  function makeAcceptPrisma(mark: ReturnType<typeof makeMark>, woParts: any[]) {
    const renamed = { ...mark.bom_assembly, id: 200, dispatch_id: 20, assembly_mark: '3WH-CO-001' }
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_id: 10 }) },
      work_order_mark: { findFirst: jest.fn().mockResolvedValue(mark), update: jest.fn(), findMany: jest.fn().mockResolvedValue([{ bom_assembly_id: 200, qty_planned: 5 }]) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(makeDispatch(10, new Date('2026-01-01'))) },
      bom_assembly: { findFirst: jest.fn(({ where }: any) => Promise.resolve(where.id === 200 || where.assembly_mark === '3WH-CO-001' ? renamed : null)) },
      bom_assembly_part: { findMany: jest.fn(({ where }: any) => Promise.resolve(where.assembly_id === 100
        ? [{ id: 11, qty: 2, part: { part_mark: 'C-f1', weight_kg: 2.5 } }, { id: 12, qty: 1, part: { part_mark: 'C-x', weight_kg: 1 } }]
        : [{ id: 21, qty: 2, part: { part_mark: 'C-f1', weight_kg: 2.5 } }, { id: 22, qty: 1, part: { part_mark: '3C-x', weight_kg: 1 } }])) },
      work_order_part: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(woParts.filter(w => (where.bom_assembly_part_id?.in ?? woParts.map(x => x.bom_assembly_part_id)).includes(w.bom_assembly_part_id)))),
        update: jest.fn(({ where, data }: any) => { Object.assign(woParts.find(w => w.id === where.id), data); return Promise.resolve() }),
        deleteMany: jest.fn(({ where }: any) => { for (const id of where.id.in) woParts.splice(woParts.findIndex(w => w.id === id), 1); return Promise.resolve() }),
        create: jest.fn(({ data }: any) => { woParts.push({ id: 900 + woParts.length, ...data }); return Promise.resolve() }),
      },
      work_order_event: { create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    }
    return prisma
  }

  // Item 1 — controller ruling: the spec's name-reuse rule beats an own-name-first lookup.
  it("name reuse: a forward pair from this row's own dispatch wins over a same-named ACTIVE row that reused the name later", async () => {
    const mark = makeMark({ bom_assembly: makeBomAssembly({ id: 100, dispatch_id: 10, assembly_mark: 'A' }) })
    const prisma: any = {
      work_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, marks: [mark] }) },
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(makeDispatch(10, new Date())) },
      bom_assembly: { findFirst: jest.fn(({ where }: any) => Promise.resolve(
        where.assembly_mark === 'B' ? { ...mark.bom_assembly, id: 200, dispatch_id: 20, assembly_mark: 'B' }
        : where.assembly_mark === 'A' ? { ...mark.bom_assembly, id: 300, dispatch_id: 30, assembly_mark: 'A', weight_kg: 999 } // unrelated new A — must never be picked
        : null,
      )) },
    }
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any,
      renamesOf({ id: 9, kind: 'ASSEMBLY', from_mark: 'A', to_mark: 'B', dispatch_id: 20 }) as any)

    const [s] = await svc.bomVersionStatus(1)

    expect(s).toMatchObject({ is_outdated: true, delta_types: ['RENAMED'], latest_assembly_id: 200,
      delta_details: { renamed: { from: 'A', to: 'B', rename_ids: [9] } } })
  })

  // Item 2 — a part pair confirmed for a LATER version than the one being accepted
  // into must not be chased; the chain stops at the bound.
  it('part chain bound: a pair beyond the accepted version is ignored', async () => {
    const mark = makeMark()
    const woParts = [{ id: 501, work_order_id: 1, bom_assembly_part_id: 12, updated_by: 'tao', qty: 1, weight_kg: 1 }]
    const prisma = makeAcceptPrisma(mark, woParts)
    prisma.bom_assembly.findFirst = jest.fn(({ where }: any) => Promise.resolve(where.assembly_mark === 'WH-CO-001' || where.id === 200 ? { ...mark.bom_assembly, id: 200, dispatch_id: 20 } : null))
    prisma.bom_assembly_part.findMany = jest.fn(({ where }: any) => Promise.resolve(where.assembly_id === 100
      ? [{ id: 12, qty: 1, part: { part_mark: 'C-x', weight_kg: 1 } }]
      : [{ id: 22, qty: 1, part: { part_mark: '3C-x', weight_kg: 1 } }]))
    const alias = renamesOf(
      { id: 8, kind: 'PART', from_mark: 'C-x', to_mark: '3C-x', dispatch_id: 20 },
      { id: 15, kind: 'PART', from_mark: '3C-x', to_mark: '33C-x', dispatch_id: 30 }, // beyond latestAsm.dispatch_id=20 — ignored
    )
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any, alias as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100 } as any)

    expect(prisma.work_order_part.update).toHaveBeenCalledWith({ where: { id: 501 }, data: { bom_assembly_part_id: 22 } })
  })

  // Item 3 — the drop deleteMany is scoped to updated_by: null (defense in depth).
  it('drops an untouched part no longer in the new version — deleteMany is scoped to updated_by: null', async () => {
    const mark = makeMark()
    const woParts = [{ id: 503, work_order_id: 1, bom_assembly_part_id: 13, updated_by: null, qty: 2, weight_kg: 5 }]
    const prisma = makeAcceptPrisma(mark, woParts)
    prisma.bom_assembly.findFirst = jest.fn(({ where }: any) => Promise.resolve(where.assembly_mark === 'WH-CO-001' || where.id === 200 ? { ...mark.bom_assembly, id: 200, dispatch_id: 20 } : null))
    prisma.bom_assembly_part.findMany = jest.fn(({ where }: any) => Promise.resolve(where.assembly_id === 100
      ? [{ id: 13, qty: 1, part: { part_mark: 'C-gone', weight_kg: 1 } }]
      : [{ id: 21, qty: 2, part: { part_mark: 'C-f1', weight_kg: 2.5 } }]))
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any, renamesOf() as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100 } as any)

    expect(prisma.work_order_part.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [503] }, updated_by: null } })
  })

  // Items 4 + 6 — a sibling WO's stuck row names that WO's code, like the MO switch does.
  it("a sibling WO's stuck withdrawal names that WO's code (like MO switch)", async () => {
    const mark = makeMark()
    const woParts = [{ id: 601, work_order_id: 2, bom_assembly_part_id: 12, updated_by: 'boss', qty: 3, weight_kg: 3 }]
    const prisma = makeAcceptPrisma(mark, woParts)
    prisma.work_order_mark.findMany = jest.fn().mockResolvedValue([{ id: 55, work_order_id: 2, bom_assembly_id: 100, qty_planned: 5 }])
    prisma.work_order_part.findMany = jest.fn(({ where }: any) =>
      Promise.resolve(woParts.filter(w => where.bom_assembly_part_id.in.includes(w.bom_assembly_part_id))
        .map(w => ({ ...w, work_order: { wo_code: 'WO-0099' } }))))
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any, renamesOf(ASM_RENAME) as any)

    await expect(svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100, apply_to_other_wos: true } as any))
      .rejects.toThrow('WH-CO-001: C-x ไม่มีใน BOM ใหม่ แต่มียอดเบิกใน WO-0099 แล้ว — แก้ยอดเบิกใน WO ก่อน')
    expect(prisma.work_order_mark.update).not.toHaveBeenCalled()
  })

  // Items 5 + 6 — apply_to_other_wos moves a sibling's withdrawals too, and the
  // sibling's OWN ACCEPT_VERSION event records the delta types, the renamed mark,
  // and its own part moves — not just "applied from WO N".
  it("apply_to_other_wos moves a sibling WO's withdrawals too, and records them in its own history", async () => {
    const mark = makeMark()
    const woParts = [
      { id: 501, work_order_id: 1, bom_assembly_part_id: 12, updated_by: 'tao', qty: 1, weight_kg: 1 },
      { id: 601, work_order_id: 2, bom_assembly_part_id: 12, updated_by: 'boss', qty: 3, weight_kg: 3 },
    ]
    const prisma = makeAcceptPrisma(mark, woParts)
    prisma.work_order_mark.findMany = jest.fn().mockResolvedValue([{ id: 55, work_order_id: 2, bom_assembly_id: 100, qty_planned: 5 }])
    const alias = renamesOf(ASM_RENAME, PART_RENAME)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any, alias as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100, apply_to_other_wos: true } as any)

    expect(prisma.work_order_part.update.mock.calls.map((c: any) => c[0])).toEqual(
      expect.arrayContaining([{ where: { id: 601 }, data: { bom_assembly_part_id: 22 } }]),
    )
    const siblingEvent = prisma.work_order_event.create.mock.calls.find((c: any) => c[0].data.work_order_id === 2)
    expect(siblingEvent[0].data.notes).toContain('RENAMED')
    expect(siblingEvent[0].data.notes).toContain('ชื่อ mark WH-CO-001 → 3WH-CO-001')
    expect(siblingEvent[0].data.notes).toContain('C-x → 3C-x')
  })

  // Item 6 — collision: a WO already holding a row on the TARGET part must not
  // get a second row moved onto it (unique key); the stale old row is dropped.
  it('a WO already holding a row on the new part: the old row is dropped, not moved onto it (collision)', async () => {
    const mark = makeMark()
    const woParts: any[] = [
      { id: 501, work_order_id: 1, bom_assembly_part_id: 12, updated_by: null, qty: 1, weight_kg: 1 },
      { id: 777, work_order_id: 1, bom_assembly_part_id: 22, updated_by: 'tao', qty: 9, weight_kg: 9 },
    ]
    const prisma = makeAcceptPrisma(mark, woParts)
    const alias = renamesOf(ASM_RENAME, PART_RENAME)
    const svc = new WorkOrdersService(prisma, makeAutoCreate() as any, {} as any, alias as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 1 } as any)

    await svc.acceptNewVersion(1, 'tao', { bom_assembly_id: 100 } as any)

    expect(prisma.work_order_part.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 777 } }))
    expect(prisma.work_order_part.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [501] }, updated_by: null } })
  })
})
