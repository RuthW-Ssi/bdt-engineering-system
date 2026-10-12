import { PreshopService } from './preshop/preshop.service'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { ManufacturingOrderService } from './manufacturing-orders.service'

// Scoped to findOne()'s stale_assembly_warnings (WO BOM-Version Hold, Sprint 20 · Task 5).
//
// A DRAFT MO's assembly_line has no WO yet (WO auto-create only runs on confirm), so if the
// referenced bom_assembly drifted from a later dispatch revision of the same (project, zone,
// sub_zone) group, there is no WO to hold — the drift is surfaced directly on the MO instead.
// Once CONFIRMED, WOs exist and the WO-level ON_HOLD banner is the correct surface (design
// Q22), so stale_assembly_warnings must stay [] there even if the underlying line IS stale —
// this test file does not re-implement REMOVED/QTY_CHANGED/SPEC_CHANGED classification, it
// only asserts findOne() wires the shared WorkOrdersService.compareAssemblyToLatest() helper
// correctly and gates it on mo.status === 'DRAFT'.

function makeLine(overrides: Partial<{ id: number; bom_assembly: Record<string, unknown> }> = {}) {
  return {
    id: 1,
    line_seq: 0,
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
      dispatch: {
        id: 10,
        project_id: 1,
        zone_id: 1,
        sub_zone_id: null,
        project: { id: 1, project_code: 'P1', name: 'Project One' },
        zone: { id: 1, label: 'Zone A' },
        sub_zone: null,
      },
    },
    ...overrides,
  }
}

function makeMo(status: string, lines: ReturnType<typeof makeLine>[]) {
  return {
    id: 1,
    mo_code: 'MO-0001',
    status,
    primary_mark_prefix: { code: 'X01', name: 'Prefix X' },
    routing_template: { id: 1, code: 'RT-1', name: 'Routing 1', operations: [] },
    assembly_lines: lines,
  }
}

// Mirrors WorkOrdersService.isSignificantDelta() — a newer dispatch existing for
// the group (is_outdated: true) is not by itself grounds to warn; only a REMOVED,
// SPEC_CHANGED, or qty-decrease delta is "significant". Computed from delta_types
// so individual tests don't need to hard-code the expected significance.
function computeSignificant(cmp: { delta_types: string[]; delta_details: Record<string, unknown> | null }) {
  const isRemoved = cmp.delta_types.includes('REMOVED')
  const isSpecChanged = cmp.delta_types.includes('SPEC_CHANGED')
  const qtyDelta = cmp.delta_details?.qty as { from: number; to: number } | undefined
  const isQtyDecrease = cmp.delta_types.includes('QTY_CHANGED') && !!qtyDelta && qtyDelta.to < qtyDelta.from
  return isRemoved || isSpecChanged || isQtyDecrease
}

function makeService(mo: unknown, cmpResult: { is_outdated: boolean; delta_types: string[] }) {
  const prisma = {
    manufacturing_order: { findUnique: jest.fn().mockResolvedValue(mo) },
    activity_consume: { findMany: jest.fn().mockResolvedValue([]) },
  }
  const fullCmp = { ...cmpResult, delta_details: null, latest_dispatch_id: 20 }
  const workOrders = {
    compareAssemblyToLatest: jest.fn().mockResolvedValue(fullCmp),
    isSignificantDelta: jest.fn().mockImplementation((cmp: any) => computeSignificant(cmp)),
  }
  const svc = new ManufacturingOrderService(
    prisma as any, // prisma
    {} as any, // mail
    {} as any, // codeGen
    {} as any, // alloc
    {} as any, // woAutoCreate
    workOrders as any, // workOrders
  )
  return { svc, prisma, workOrders }
}

describe('ManufacturingOrderService.findOne — stale_assembly_warnings', () => {
  it('DRAFT MO with an assembly line whose mark was changed/removed in a later dispatch revision → 1 matching entry', async () => {
    const mo = makeMo('DRAFT', [makeLine()])
    const { svc, workOrders } = makeService(mo, { is_outdated: true, delta_types: ['REMOVED'] })

    const result = await svc.findOne(1)

    expect(workOrders.compareAssemblyToLatest).toHaveBeenCalledWith(
      mo.assembly_lines[0].bom_assembly,
      { project_id: 1, zone_id: 1, sub_zone_id: null },
    )
    expect((result as any).stale_assembly_warnings).toEqual([
      { mo_assembly_line_id: 1, assembly_mark: 'WH-CO-001', delta_types: ['REMOVED'] },
    ])
  })

  it('CONFIRMED MO with the identical stale setup → stale_assembly_warnings is [] (WO-level ON_HOLD handles it instead)', async () => {
    const mo = makeMo('CONFIRMED', [makeLine()])
    const { svc, workOrders } = makeService(mo, { is_outdated: true, delta_types: ['REMOVED'] })

    const result = await svc.findOne(1)

    expect((result as any).stale_assembly_warnings).toEqual([])
    expect(workOrders.compareAssemblyToLatest).not.toHaveBeenCalled()
  })

  it('DRAFT MO where nothing changed → []', async () => {
    const mo = makeMo('DRAFT', [makeLine()])
    const { svc, workOrders } = makeService(mo, { is_outdated: false, delta_types: [] })

    const result = await svc.findOne(1)

    expect(workOrders.compareAssemblyToLatest).toHaveBeenCalled()
    expect((result as any).stale_assembly_warnings).toEqual([])
  })

  // Bugfix regression test: is_outdated is true (a newer dispatch exists for the
  // group) but the matching assembly in the latest dispatch is byte-identical
  // (same qty/weight/dims) — a real, reachable case (e.g. a re-upload that
  // reintroduces an assembly with unchanged specs), confirmed via live manual
  // verification. delta_types is genuinely empty in that case, so no warning
  // should be shown — this previously false-positived because findOne() only
  // checked cmp.is_outdated with no significance filter.
  it('DRAFT MO with an assembly line that is_outdated: true but delta_types is empty (byte-identical re-upload) → no warning', async () => {
    const mo = makeMo('DRAFT', [makeLine()])
    const { svc, workOrders } = makeService(mo, { is_outdated: true, delta_types: [] })

    const result = await svc.findOne(1)

    expect(workOrders.isSignificantDelta).toHaveBeenCalled()
    expect((result as any).stale_assembly_warnings).toEqual([])
  })
})

// getConsumeSummaryByWorkOrder (2026-09-16, for the print packet's per-WO
// traveler "Consume" table) shares a private computeConsumeByWorkOrder
// helper with getConsumeSummary (MO-wide total) — these tests lock in that
// both the per-WO breakdown and the merged MO total come out correct.
//
// Reads work_order_consume directly (2026-09-22 fix) rather than
// recomputing from activity_consume formulas at read-time — the old
// recompute silently dropped any material with no formula to evaluate, so
// a WO whose only consumable had none (no_formula_id set) printed a
// completely empty Consume table even though the WO's own real record had
// it (user report: "consume ไม่แสดง" on a printed WO traveler). Reading the
// already-computed-at-creation qty_planned directly fixes this for free —
// nothing here needs to know or care whether a material had a formula.
describe('ManufacturingOrderService — Consume Summary (per-WO and MO-wide)', () => {
  function makeConsumeService() {
    const rows = [
      { work_order_id: 10, material_id: 1, qty_planned: 40, unit: 'kg', material: { default_code: 'MAT1', name: 'Welding Wire' } },
      { work_order_id: 20, material_id: 1, qty_planned: 20, unit: 'kg', material: { default_code: 'MAT1', name: 'Welding Wire' } },
      // No formula (upsert fix, 2026-09-22) — qty_planned defaults to 0, but
      // the row (and material name) must still surface, not disappear.
      { work_order_id: 20, material_id: 2, qty_planned: 0, unit: null, material: { default_code: 'MAT2', name: 'Welding Electrode' } },
    ]
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_code: 'MO-0001' }) },
      work_order_consume: { findMany: jest.fn().mockResolvedValue(rows) },
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    return { svc, prisma }
  }

  it('getConsumeSummaryByWorkOrder groups work_order_consume rows by work_order_id, no-formula rows included', async () => {
    const { svc } = makeConsumeService()

    const byWo = await svc.getConsumeSummaryByWorkOrder(1)

    expect(byWo.get(10)).toEqual([{ material_id: 1, code: 'MAT1', name: 'Welding Wire', qty: 40, unit: 'kg' }])
    expect(byWo.get(20)).toEqual([
      { material_id: 1, code: 'MAT1', name: 'Welding Wire', qty: 20, unit: 'kg' },
      { material_id: 2, code: 'MAT2', name: 'Welding Electrode', qty: 0, unit: null },
    ])
  })

  it('getConsumeSummary merges the same two WOs into one MO-wide total (40kg + 20kg = 60kg)', async () => {
    const { svc } = makeConsumeService()

    const summary = await svc.getConsumeSummary(1)

    expect(summary).toEqual(expect.arrayContaining([
      { material_id: 1, code: 'MAT1', name: 'Welding Wire', qty: 60, unit: 'kg' },
      { material_id: 2, code: 'MAT2', name: 'Welding Electrode', qty: 0, unit: null },
    ]))
  })

  it('a WO with no work_order_consume rows contributes nothing (empty consume, not a crash)', async () => {
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_code: 'MO-0001' }) },
      work_order_consume: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)

    const byWo = await svc.getConsumeSummaryByWorkOrder(1)

    expect(byWo.get(30)).toBeUndefined()
  })
})

// createWorkOrder()'s consume-override loop (2026-09-22 regression) — user
// hit "Internal server error" typing an actual qty for a no-formula material
// in the Consume picker (see previewMarksImpact's qty: null materials).
// recomputeConsume() (called inside createOrAddMarks(), mocked away here via
// woAutoCreate) only ever creates a work_order_consume row for materials
// with a positive COMPUTED qty — a no-formula material never gets one, so
// the old unconditional `.update()` 404'd (Prisma P2025) the moment a user
// entered an actual for it. Fixed to upsert.
describe('ManufacturingOrderService.createWorkOrder — consume override', () => {
  function makeService(overrides: { upsert?: jest.Mock } = {}) {
    const tx = {
      work_order_consume: { upsert: overrides.upsert ?? jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_code: 'MO-0001' }) },
      // No team_id in these DTOs — team lookup must resolve null (skips the
      // internal-team headcount cap check) rather than crash (2026-09-25).
      team: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    }
    const woAutoCreate = {
      createOrAddMarks: jest.fn().mockResolvedValue({ work_order_id: 900, wo_code: 'WO-00000900', created: true, marks_added: 1, marks_skipped: 0 }),
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, woAutoCreate as any, {} as any)
    return { svc, tx, woAutoCreate }
  }

  it('upserts (not just updates) a consume override for a material with no existing work_order_consume row', async () => {
    const { svc, tx } = makeService()
    const dto = { operation_id: 1, marks: [{ assembly_line_id: 1, qty: 1 }], consume: [{ material_id: 200, qty_actual: 30 }] } as any

    await svc.createWorkOrder(1, dto, 'tester', 1)

    expect(tx.work_order_consume.upsert).toHaveBeenCalledWith({
      where: { work_order_id_material_id: { work_order_id: 900, material_id: 200 } },
      create: expect.objectContaining({ work_order_id: 900, material_id: 200, qty_planned: 0, qty_actual: 30, unit: null, created_by: 'tester' }),
      update: { qty_actual: 30, updated_by: 'tester' },
    })
  })

  it('passes team_id and team_headcount through to createOrAddMarks', async () => {
    const { svc, woAutoCreate } = makeService()
    const dto = { operation_id: 1, marks: [{ assembly_line_id: 1, qty: 1 }], team_id: 7, team_headcount: 5 } as any

    await svc.createWorkOrder(1, dto, 'tester', 1)

    expect(woAutoCreate.createOrAddMarks).toHaveBeenCalledWith(
      expect.anything(), 1, 1, [{ assembly_line_id: 1, qty: 1 }], 'tester', undefined, undefined, undefined, 7, 5,
    )
  })
})

// Internal-team headcount cap (2026-09-25) — the frontend auto-fills and
// clamps team_headcount to the team's active-operator count for internal
// teams, but this is server-side enforcement of the same rule, not just UX.
// External teams have no operator roster to check against, so no cap.
describe('ManufacturingOrderService.createWorkOrder — internal team headcount cap', () => {
  function makeService(team: { team_type: string } | null, activeOperatorCount: number) {
    const tx = { work_order_consume: { upsert: jest.fn().mockResolvedValue({}) } }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_code: 'MO-0001', status: 'IN_PROGRESS' }) },
      team: { findUnique: jest.fn().mockResolvedValue(team) },
      operator: { count: jest.fn().mockResolvedValue(activeOperatorCount) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    }
    const woAutoCreate = {
      createOrAddMarks: jest.fn().mockResolvedValue({ work_order_id: 900, wo_code: 'WO-00000900', created: true, marks_added: 1, marks_skipped: 0 }),
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, woAutoCreate as any, {} as any)
    return { svc, prisma, woAutoCreate }
  }

  it('rejects a headcount above the internal team\'s active operator count', async () => {
    const { svc } = makeService({ team_type: 'internal' }, 3)
    const dto = { operation_id: 1, marks: [{ assembly_line_id: 1, qty: 1 }], team_id: 7, team_headcount: 4 } as any

    await expect(svc.createWorkOrder(1, dto, 'tester', 1)).rejects.toThrow(BadRequestException)
  })

  it('allows a headcount at or under the internal team\'s active operator count', async () => {
    const { svc, woAutoCreate } = makeService({ team_type: 'internal' }, 3)
    const dto = { operation_id: 1, marks: [{ assembly_line_id: 1, qty: 1 }], team_id: 7, team_headcount: 3 } as any

    await svc.createWorkOrder(1, dto, 'tester', 1)

    expect(woAutoCreate.createOrAddMarks).toHaveBeenCalled()
  })

  it('does not cap an external team, even above its (irrelevant) operator count', async () => {
    const { svc, prisma, woAutoCreate } = makeService({ team_type: 'external' }, 0)
    const dto = { operation_id: 1, marks: [{ assembly_line_id: 1, qty: 1 }], team_id: 7, team_headcount: 20 } as any

    await svc.createWorkOrder(1, dto, 'tester', 1)

    expect(prisma.operator.count).not.toHaveBeenCalled()
    expect(woAutoCreate.createOrAddMarks).toHaveBeenCalled()
  })
})

// 2026-09-25 — reverted the 2026-09-23 auto-start behavior: user asked for
// starting the MO to go back to manual-only (Start button), so creating a WO
// must never touch the MO's own status/actual_start, regardless of the MO's
// status at create time.
describe('ManufacturingOrderService.createWorkOrder — never auto-starts the MO', () => {
  function makeService(moStatus: string) {
    const tx = {
      work_order_consume: { upsert: jest.fn().mockResolvedValue({}) },
      manufacturing_order: { update: jest.fn().mockResolvedValue({}) },
      mo_status_history: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_code: 'MO-0001', status: moStatus }) },
      team: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    }
    const woAutoCreate = {
      createOrAddMarks: jest.fn().mockResolvedValue({ work_order_id: 900, wo_code: 'WO-00000900', created: true, marks_added: 1, marks_skipped: 0 }),
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, woAutoCreate as any, {} as any)
    return { svc, tx }
  }

  it.each(['CONFIRMED', 'IN_PROGRESS', 'DRAFT'])('%s MO: creating a WO leaves MO status/actual_start untouched — only the Start button does that', async (moStatus) => {
    const { svc, tx } = makeService(moStatus)
    const dto = { operation_id: 1, marks: [{ assembly_line_id: 1, qty: 1 }] } as any

    await svc.createWorkOrder(1, dto, 'tester', 42)

    expect(tx.manufacturing_order.update).not.toHaveBeenCalled()
    expect(tx.mo_status_history.create).not.toHaveBeenCalled()
  })
})

// 2026-10-01 — actual_start/actual_finish are user-typed at Complete, never
// system-stamped (replaces the 2026-09-23 Start / 2026-09-29 Complete stamps).
const ACTUALS = { actual_start: '2026-09-30T01:00:00.000Z', actual_finish: '2026-09-30T10:00:00.000Z' }

describe('ManufacturingOrderService.changeStatus — actual dates', () => {
  function makeService(fromStatus: string) {
    const tx = { manufacturing_order: { update: jest.fn().mockResolvedValue({}) }, mo_status_history: { create: jest.fn().mockResolvedValue({}) } }
    const prisma = {
      // changeStatus() ends with `return this.findOne(id)`, which needs a
      // full DETAIL_INCLUDE-shaped MO (routing_template.operations, etc.) —
      // reuse the same fixture shape the findOne() describe block above
      // already proved sufficient, rather than rediscovering every field.
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ ...makeMo(fromStatus, []), activity_consume: [] }) },
      activity_consume: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    }
    const mail = { log: jest.fn().mockResolvedValue({}) }
    const svc = new ManufacturingOrderService(prisma as any, mail as any, {} as any, {} as any, {} as any, {} as any)
    return { svc, tx, mail }
  }

  // Confirm needs no reason (2026-10-09, user: "ตอน confirm mo ไม่ต้องใส่เหตุผล"); other moves still do
  it('CONFIRMED → IN_PROGRESS (Start) without a reason too', async () => {
    const { svc, tx } = makeService('CONFIRMED')
    ;(svc as any).prisma.mo_assembly_line = { count: jest.fn().mockResolvedValue(1) }
    await svc.changeStatus(1, { to_status: 'IN_PROGRESS' } as any, 42, 'tester')
    expect(tx.mo_status_history.create.mock.calls[0][0].data).toMatchObject({ to_status: 'IN_PROGRESS', reason: '' })
  })

  it('DRAFT → CONFIRMED without a reason; Cancel still needs one', async () => {
    const { svc, tx } = makeService('DRAFT')
    ;(svc as any).prisma.mo_assembly_line = { count: jest.fn().mockResolvedValue(1) }
    await svc.changeStatus(1, { to_status: 'CONFIRMED' } as any, 42, 'tester')
    expect(tx.mo_status_history.create.mock.calls[0][0].data).toMatchObject({ from_status: 'DRAFT', to_status: 'CONFIRMED', reason: '' })
    await expect(makeService('DRAFT').svc.changeStatus(1, { to_status: 'CANCELLED' } as any, 42, 'tester')).rejects.toThrow('ต้องใส่เหตุผล')
  })

  it('CONFIRMED → IN_PROGRESS (Start button): status only, no actual_start', async () => {
    const { svc, tx } = makeService('CONFIRMED')

    await svc.changeStatus(1, { to_status: 'IN_PROGRESS', reason: 'Manual start' } as any, 42, 'tester')

    expect(tx.manufacturing_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'IN_PROGRESS', write_uid: 42 },
    })
  })

  it('IN_PROGRESS → DONE (Complete button): writes the user-typed dates and tracks them in the audit log', async () => {
    const { svc, tx, mail } = makeService('IN_PROGRESS')

    await svc.changeStatus(1, { to_status: 'DONE', reason: 'Manual complete', ...ACTUALS } as any, 42, 'tester')

    expect(tx.manufacturing_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        status: 'DONE',
        write_uid: 42,
        actual_start: new Date(ACTUALS.actual_start),
        actual_finish: new Date(ACTUALS.actual_finish),
      },
    })
    expect(mail.log).toHaveBeenCalledWith(expect.objectContaining({
      tracking: [
        { field: 'actual_start', old_value: null, new_value: ACTUALS.actual_start },
        { field: 'actual_finish', old_value: null, new_value: ACTUALS.actual_finish },
      ],
    }))
  })

  it.each([
    [{}, 'Actual Start and Actual Finish are required'],
    [{ ...ACTUALS, actual_finish: '2026-09-30T00:59:00.000Z' }, 'Actual Finish must not be before Actual Start'],
    [{ ...ACTUALS, actual_finish: new Date(Date.now() + 60 * 60 * 1000).toISOString() }, 'Actual Start and Actual Finish must not be in the future'],
  ])('IN_PROGRESS → DONE with bad dates %j → 400 "%s", nothing written', async (dates, message) => {
    const { svc, tx } = makeService('IN_PROGRESS')

    await expect(
      svc.changeStatus(1, { to_status: 'DONE', reason: 'Manual complete', ...dates } as any, 42, 'tester'),
    ).rejects.toThrow(new BadRequestException(message))
    expect(tx.manufacturing_order.update).not.toHaveBeenCalled()
  })

  it('actual dates sent with a non-DONE transition → 400', async () => {
    const { svc, tx } = makeService('CONFIRMED')

    await expect(
      svc.changeStatus(1, { to_status: 'IN_PROGRESS', reason: 'Manual start', actual_start: ACTUALS.actual_start } as any, 42, 'tester'),
    ).rejects.toThrow(new BadRequestException('Actual dates can only be set when completing the MO'))
    expect(tx.manufacturing_order.update).not.toHaveBeenCalled()
  })

  it('IN_PROGRESS → CANCELLED: records no finish date (cancelled is not finished)', async () => {
    const { svc, tx } = makeService('IN_PROGRESS')

    await svc.changeStatus(1, { to_status: 'CANCELLED', reason: 'Manual cancel' } as any, 42, 'tester')

    expect(tx.manufacturing_order.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ actual_finish: expect.anything() }),
    }))
  })

  // 2026-09-23 — user: "mo ต้องมี ปุ่ม complete แล้วก็ cancel ด้วย" (an
  // in-progress MO needs both Complete and Cancel, not Complete-only).
  it('IN_PROGRESS → CANCELLED (Cancel button): now allowed (previously only DONE was reachable from IN_PROGRESS), does not set actual_start', async () => {
    const { svc, tx } = makeService('IN_PROGRESS')

    await svc.changeStatus(1, { to_status: 'CANCELLED', reason: 'Order scrapped' } as any, 42, 'tester')

    expect(tx.manufacturing_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'CANCELLED', write_uid: 42 },
    })
  })

  it('DONE → CANCELLED: still rejected — cancel is only for DRAFT/CONFIRMED/IN_PROGRESS, not a completed MO', async () => {
    const { svc } = makeService('DONE')

    await expect(
      svc.changeStatus(1, { to_status: 'CANCELLED', reason: 'too late' } as any, 42, 'tester'),
    ).rejects.toThrow(ConflictException)
  })
})

describe('ManufacturingOrderService.updateActualDates', () => {
  function makeService(mo: Record<string, unknown> | null) {
    const prisma = {
      manufacturing_order: {
        findUnique: jest.fn().mockResolvedValue(mo && { ...makeMo(mo.status as string, []), activity_consume: [], ...mo }),
        update: jest.fn().mockResolvedValue({}),
      },
      activity_consume: { findMany: jest.fn().mockResolvedValue([]) },
      mo_status_history: { create: jest.fn() },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(prisma)),
    }
    const mail = { log: jest.fn().mockResolvedValue({}) }
    const svc = new ManufacturingOrderService(prisma as any, mail as any, {} as any, {} as any, {} as any, {} as any)
    return { svc, prisma, mail }
  }
  const OLD = { actual_start: new Date('2026-09-29T01:00:00.000Z'), actual_finish: new Date('2026-09-30T10:00:00.000Z') }

  it('404s when the MO does not exist', async () => {
    const { svc } = makeService(null)
    await expect(svc.updateActualDates(999, ACTUALS, 42)).rejects.toThrow(NotFoundException)
  })

  it('409s unless the MO is DONE', async () => {
    const { svc, prisma } = makeService({ status: 'IN_PROGRESS', ...OLD })
    await expect(svc.updateActualDates(1, ACTUALS, 42)).rejects.toThrow(
      new ConflictException('Actual dates can only be edited after the MO is DONE'),
    )
    expect(prisma.manufacturing_order.update).not.toHaveBeenCalled()
  })

  it('writes the new dates and logs an audit row tracking only the changed field', async () => {
    const { svc, prisma, mail } = makeService({ status: 'DONE', ...OLD })

    await svc.updateActualDates(1, ACTUALS, 42)

    expect(prisma.manufacturing_order.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { actual_start: new Date(ACTUALS.actual_start), actual_finish: new Date(ACTUALS.actual_finish), write_uid: 42 },
    })
    expect(mail.log).toHaveBeenCalledWith(expect.objectContaining({
      model: 'manufacturing_order',
      res_id: 1,
      author_id: 42,
      message_type: 'audit',
      tracking: [{ field: 'actual_start', old_value: '2026-09-29T01:00:00.000Z', new_value: ACTUALS.actual_start }],
    }))
  })

  it('400s on invalid dates (finish before start), nothing written', async () => {
    const { svc, prisma } = makeService({ status: 'DONE', ...OLD })
    await expect(
      svc.updateActualDates(1, { ...ACTUALS, actual_finish: '2026-09-30T00:00:00.000Z' }, 42),
    ).rejects.toThrow(new BadRequestException('Actual Finish must not be before Actual Start'))
    expect(prisma.manufacturing_order.update).not.toHaveBeenCalled()
  })
})
describe('ManufacturingOrderService — PART MO guards', () => {
  function svcWith(mo: unknown) {
    const prisma = { manufacturing_order: { findUnique: jest.fn().mockResolvedValue(mo) } }
    return new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)
  }
  it('refuses to create a WO on a PART MO', async () => {
    await expect(svcWith({ id: 1, status: 'CONFIRMED', kind: 'PART' }).createWorkOrder(1, { team_id: 1 } as any, 'tao', 1))
      .rejects.toThrow(new ConflictException('Work orders for MO Part are not supported yet'))
  })
  it('refuses to preview a WO on a PART MO', async () => {
    await expect(svcWith({ id: 1, status: 'CONFIRMED', kind: 'PART' }).previewWorkOrder(1, { operation_id: 1, marks: [] } as any))
      .rejects.toThrow(new ConflictException('Work orders for MO Part are not supported yet'))
  })
  it('refuses to edit a PART MO through the assembly edit route', async () => {
    await expect(svcWith({ id: 1, status: 'DRAFT', kind: 'PART' }).update(1, {} as any, 1))
      .rejects.toThrow(new ConflictException('MO 1 is an MO Part — edit it with PATCH /mo/part/1'))
  })
})

describe('ManufacturingOrderService.findAll — MO Part', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 1, mo_code: 'MO-1', status: 'DRAFT', kind: 'ASSEMBLY', plan_start: null, plan_finish: null, create_date: new Date(0),
    primary_mark_prefix: { code: 'CO' }, routing_template: { id: 1, code: 'RT', name: 'R', _count: { operations: 3 } },
    _count: { assembly_lines: 2, part_lines: 0 }, ...over,
  })
  function svcWith(rows: unknown[]) {
    const prisma = { manufacturing_order: { findMany: jest.fn().mockResolvedValue(rows) } }
    return { svc: new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any), prisma }
  }
  it('returns the zone of a PART MO', async () => {
    const { svc } = svcWith([row({ id: 3, kind: 'PART', zone: { id: 4, code: 'Z1', label: 'Zone 1' }, _count: { assembly_lines: 0, part_lines: 2 } })])
    const [r] = await svc.findAll({})
    expect(r.zone).toEqual({ id: 4, code: 'Z1', label: 'Zone 1' })
  })
  it('returns kind and part_line_count', async () => {
    const { svc } = svcWith([row({ id: 2, kind: 'PART', _count: { assembly_lines: 0, part_lines: 8 } })])
    const [r] = await svc.findAll({})
    expect(r).toMatchObject({ kind: 'PART', assembly_count: 0, part_line_count: 8 })
  })
  it('project filter also matches PART MOs by their own project_id', async () => {
    const { svc, prisma } = svcWith([])
    await svc.findAll({ project_id: 5 })
    expect(prisma.manufacturing_order.findMany.mock.calls[0][0].where.OR).toEqual([
      { assembly_lines: { some: { bom_assembly: { dispatch: { project_id: 5 } } } } },
      { project_id: 5 },
    ])
  })
})

// MO type replaces the mark prefix (2026-10-07). PRE_SHOP: marks from a Dispatch
// Note / pre-shop drawing become a PRE_SHOP BOM dispatch + MO lines; op 000
// "Build-up(Pre-Shop)" leads its operations.
describe('ManufacturingOrderService.create — MO type', () => {
  const PRE = [{ assembly_mark: 'BUH1-3', qty: 2, weight_kg: 3561.15, surface_area_m2: null, length_mm: 10550, parts: [] }]
  function make() {
    const tx = {
      manufacturing_order: { create: jest.fn().mockResolvedValue({ id: 41, mo_code: 'MO-26000041' }) },
      mo_assembly_line: { createMany: jest.fn() },
      mo_status_history: { create: jest.fn() },
    }
    const prisma = {
      routing_template: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      mark_prefix_master: { findUnique: jest.fn().mockResolvedValue({ code: 'CO' }) },
      project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
      sub_zone: { findFirst: jest.fn().mockResolvedValue({ id: 8 }) },
      manufacturing_order: { findFirst: jest.fn().mockResolvedValue(null) }, // zone has no MO yet
      bom_assembly: { count: jest.fn().mockResolvedValue(0) }, // zone has no real BOM yet
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const preshop = { createDispatch: jest.fn().mockResolvedValue(new Map([['BUH1-3', 700]])) }
    const svc = new ManufacturingOrderService(prisma as any, { log: jest.fn() } as any, { generate: jest.fn().mockResolvedValue('MO-26000041') } as any, {} as any, {} as any, {} as any, preshop as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 41 } as any)
    return { svc, tx, prisma, preshop }
  }

  it('PRE_SHOP: stores the upload as a PRE_SHOP dispatch and links its assemblies as MO lines, no prefix', async () => {
    const { svc, tx, prisma, preshop } = make()
    await svc.create({ shop_type: 'PRE_SHOP', routing_template_id: 7, project_id: 5, zone_id: 3, assembly_lines: [], preshop_assemblies: PRE } as any, 1, 'tao')
    expect(prisma.mark_prefix_master.findUnique).not.toHaveBeenCalled()
    expect(tx.manufacturing_order.create.mock.calls[0][0].data).toMatchObject({ shop_type: 'PRE_SHOP', primary_mark_prefix_code: null, project_id: 5, zone_id: 3, sub_zone_id: null })
    expect(preshop.createDispatch).toHaveBeenCalledWith(tx, { project_id: 5, zone_id: 3, sub_zone_id: null }, PRE, 1)
    expect(tx.mo_assembly_line.createMany.mock.calls[0][0].data.map((l: any) => [l.mo_id, l.bom_assembly_id, Number(l.qty)])).toEqual([[41, 700, 2]])
  })

  // the real BOM is there → no pre-shop (2026-10-09, user: "ถ้ามี bom แล้ว pre-shop type จะไม่สามารถกดได้")
  it('PRE_SHOP is refused in a zone that already has a real BOM', async () => {
    const { svc, prisma } = make()
    prisma.bom_assembly.count.mockResolvedValue(5)
    await expect(svc.create({ shop_type: 'PRE_SHOP', routing_template_id: 7, project_id: 5, zone_id: 3, assembly_lines: [] } as any, 1, 'tao')).rejects.toThrow('Zone นี้มี BOM แล้ว')
  })

  it('PRE_SHOP needs a project and zone for its upload', async () => {
    const { svc } = make()
    await expect(svc.create({ shop_type: 'PRE_SHOP', routing_template_id: 7, assembly_lines: [], preshop_assemblies: PRE } as any, 1, 'tao')).rejects.toThrow('project_id and zone_id')
  })

  it('needs at least one assembly, and FULL_SHOP takes no upload', async () => {
    const { svc } = make()
    await expect(svc.create({ routing_template_id: 7, assembly_lines: [] } as any, 1, 'tao')).rejects.toThrow('At least one assembly')
    await expect(svc.create({ shop_type: 'FULL_SHOP', routing_template_id: 7, project_id: 5, zone_id: 3, assembly_lines: [], preshop_assemblies: PRE } as any, 1, 'tao')).rejects.toThrow('PRE_SHOP')
  })
})

describe('ManufacturingOrderService.findOne — PRE_SHOP op 000', () => {
  it('puts op 000 from SYS-PRESHOP before the routing operations', async () => {
    const op000 = { id: 900, sequence: 0, op_code: 'OP-000', name: 'Build-up(Pre-Shop)', activities_snapshot: [] }
    const mo = { ...makeMo('CONFIRMED', []), shop_type: 'PRE_SHOP', routing_template: { id: 7, code: 'RT', name: 'R', operations: [{ id: 1, sequence: 10, op_code: 'CUT', activities_snapshot: [] }] } }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue(mo) },
      activity_consume: { findMany: jest.fn().mockResolvedValue([]) },
      mrp_routing_workcenter: { findMany: jest.fn().mockResolvedValue([op000]) },
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    const r: any = await svc.findOne(1)
    expect(r.routing_template.operations.map((o: any) => o.op_code)).toEqual(['OP-000', 'CUT'])
    expect(prisma.mrp_routing_workcenter.findMany.mock.calls[0][0].where).toEqual({ template: { code: 'SYS-PRESHOP' } })
  })
})

// Every MO edit is logged — who, what (2026-10-07, user: "ทุกการแก้ไขทั้ง mo wo
// ต้องบันทึกการแก้ไขไว้ด้วยว่าใครทำอะไรแก้อะไร"). Shown in the MO History tab.
// Edit (2026-10-08, user): only MO type, routing and plan change here —
// assemblies are added only through the MO page's Upload button.
describe('ManufacturingOrderService.update — MO type, routing, plan + edit log', () => {
  function make(shopType = 'PRE_SHOP', lineSource = 'PRE_SHOP') {
    const before = { id: 41, mo_code: 'MO-41', status: 'DRAFT', kind: 'ASSEMBLY', shop_type: shopType, project_id: 5, zone_id: 3, sub_zone_id: null,
      routing_template_id: 7, plan_start: null, plan_finish: null }
    const tx = {
      manufacturing_order: { update: jest.fn() },
      mo_assembly_line: { deleteMany: jest.fn(), createMany: jest.fn() },
      mo_status_history: { create: jest.fn() },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue(before) },
      mo_assembly_line: {
        findMany: jest.fn().mockResolvedValue([{ bom_assembly_id: 700, qty: '2', bom_assembly: { assembly_mark: 'BUH1-3' } }]),
        count: jest.fn().mockResolvedValue(lineSource === 'PRE_SHOP' ? 1 : 0),
      },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(5) },
      routing_template: { findUnique: jest.fn().mockResolvedValue({ id: 8, code: 'RT-0008' }), findMany: jest.fn().mockResolvedValue([{ id: 7, code: 'RT-0007' }, { id: 8, code: 'RT-0008' }]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const svc = new ManufacturingOrderService(prisma as any, { log: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 41 } as any)
    return { svc, tx, prisma }
  }

  // 2026-10-09, user: an MO's type is set at create and never changes.
  it('changes routing and logs it, by whom', async () => {
    const { svc, tx } = make('FULL_SHOP', 'BOM')
    await svc.update(41, { routing_template_id: 8 } as any, 1, 'tao')
    expect(tx.manufacturing_order.update.mock.calls[0][0].data).toMatchObject({ routing_template_id: 8 })
    expect(tx.mo_status_history.create.mock.calls[0][0].data).toEqual({
      mo_id: 41, from_status: 'DRAFT', to_status: 'DRAFT', changed_by: 'tao', reason: 'แก้ไข MO: Routing RT-0007 → RT-0008',
    })
  })

  it('refuses a type change', async () => {
    const { svc } = make('PRE_SHOP', 'NONE')
    await expect(svc.update(41, { shop_type: 'FULL_SHOP' } as any, 1, 'tao')).rejects.toThrow('เปลี่ยน MO type ไม่ได้')
    await expect(make('FULL_SHOP', 'BOM').svc.update(41, { shop_type: 'PRE_SHOP' } as any, 1, 'tao')).rejects.toThrow('เปลี่ยน MO type ไม่ได้')
  })

})

// Parts tab allocation counts other MOs by assembly mark + project/zone/sub-zone,
// same as the Assemblies tab (2026-10-07, user chose "ก."): two pre-shop MOs of
// one zone come from different uploads (different bom_assembly ids) but are the
// same physical marks.
describe('ManufacturingOrderService.getParts — cross-MO by mark + zone', () => {
  const DISPATCH = { project_id: 16, zone_id: 33, sub_zone_id: null }
  const asm = (id: number, partQty: number) => ({
    id, assembly_mark: 'BUH1-3', dispatch: DISPATCH,
    assembly_parts: [{ part_id: 900 + id, qty: partQty, part: { part_mark: 'C-f1', description: null, profile: 'PL25x400', grade: 'SM520', length_mm: 10550, weight_kg: 828.17 } }],
  })
  it('lists every allocating MO of the same mark+zone, using each MO\'s own parts', async () => {
    const own = [{ bom_assembly_id: 701, qty: '6', bom_assembly: asm(701, 2) }]
    const cross = [
      { qty: '6', mo: { mo_code: 'MO-26000013' }, bom_assembly: asm(701, 2) },
      { qty: '2', mo: { mo_code: 'MO-26000014' }, bom_assembly: asm(700, 2) },
    ]
    const findMany = jest.fn().mockResolvedValueOnce(own).mockResolvedValueOnce(cross)
    const prisma = { manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 36 }) }, mo_assembly_line: { findMany } }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    const [p] = await svc.getParts(36)
    expect(p).toMatchObject({ part_mark: 'C-f1', total_qty: 12, mo_breakdown: [{ mo_code: 'MO-26000013', qty: 12 }, { mo_code: 'MO-26000014', qty: 4 }] })
    expect(findMany.mock.calls[1][0].where.OR).toEqual([{ bom_assembly: { assembly_mark: 'BUH1-3', dispatch: DISPATCH } }])
  })
})

// One MO per zone (2026-10-07, user: "block ให้ 1 zone มี ได้ 1 mo"). Cancelled
// MOs don't count; older MOs without zone_id are found through their lines.
describe('ManufacturingOrderService — one MO per zone', () => {
  function make(existing: { id: number; mo_code: string } | null, lineZones: number[] = []) {
    const tx = { manufacturing_order: { create: jest.fn().mockResolvedValue({ id: 50, mo_code: 'MO-50' }) }, mo_assembly_line: { createMany: jest.fn() }, mo_status_history: { create: jest.fn() } }
    const prisma = {
      routing_template: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 33 }) },
      sub_zone: { findFirst: jest.fn() },
      manufacturing_order: { findFirst: jest.fn().mockResolvedValue(existing) },
      bom_assembly: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue(lineZones.map((z, i) => ({ id: 700 + i, dispatch: { project_id: 16, zone_id: z } }))) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const svc = new ManufacturingOrderService(prisma as any, { log: jest.fn() } as any, { generate: jest.fn().mockResolvedValue('MO-50') } as any, {} as any, {} as any, {} as any, { createDispatch: jest.fn().mockResolvedValue(new Map([['BUH1-3', 700]])) } as any)
    jest.spyOn(svc as any, 'assertQtyWithinRemaining').mockResolvedValue(undefined)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 50 } as any)
    return { svc, prisma, tx }
  }
  const PRE = [{ assembly_mark: 'BUH1-3', qty: 2, weight_kg: null, surface_area_m2: null, length_mm: null, parts: [] }]

  // QA review F-005 (2026-10-09): pre-shop rows belong to their own MO — never picked as BOM lines
  it('refuses picking a pre-shop row as an assembly line', async () => {
    const { svc, prisma } = make(null, [33])
    prisma.bom_assembly.findMany.mockResolvedValue([{ id: 700, dispatch: { project_id: 16, zone_id: 33, source: 'PRE_SHOP' } }])
    await expect(svc.create({ routing_template_id: 7, assembly_lines: [{ bom_assembly_id: 700, qty: 1 }] } as any, 1, 'tao')).rejects.toThrow('pre-shop')
  })

  it('409s when the zone already has a live MO', async () => {
    const { svc, prisma } = make({ id: 36, mo_code: 'MO-26000013' })
    await expect(svc.create({ shop_type: 'PRE_SHOP', routing_template_id: 7, project_id: 16, zone_id: 33, assembly_lines: [], preshop_assemblies: PRE } as any, 1, 'tao'))
      .rejects.toThrow('Zone นี้มี MO-26000013 อยู่แล้ว (1 zone ได้ 1 MO)')
    expect(prisma.manufacturing_order.findFirst.mock.calls[0][0].where).toEqual({
      kind: 'ASSEMBLY', status: { not: 'CANCELLED' },
      OR: [{ zone_id: 33 }, { assembly_lines: { some: { bom_assembly: { dispatch: { zone_id: 33 } } } } }],
    })
  })

  it('takes the zone from the picked BOM lines when none is sent, and saves it on the MO', async () => {
    const { svc, prisma, tx } = make(null, [33, 33])
    await svc.create({ routing_template_id: 7, assembly_lines: [{ bom_assembly_id: 700, qty: 1 }, { bom_assembly_id: 701, qty: 1 }] } as any, 1, 'tao')
    expect(prisma.manufacturing_order.findFirst.mock.calls[0][0].where.OR[0]).toEqual({ zone_id: 33 })
    expect(tx.manufacturing_order.create.mock.calls[0][0].data).toMatchObject({ project_id: 16, zone_id: 33 })
  })

  it('rejects picked assemblies from another zone', async () => {
    const { svc } = make(null, [33, 34])
    await expect(svc.create({ routing_template_id: 7, project_id: 16, zone_id: 33, assembly_lines: [{ bom_assembly_id: 700, qty: 1 }, { bom_assembly_id: 701, qty: 1 }] } as any, 1, 'tao'))
      .rejects.toThrow('All assemblies of an MO must be in one zone')
  })
})

describe('ManufacturingOrderService.update — stays in its zone', () => {
  it('rejects edited lines from another zone', async () => {
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 41, status: 'DRAFT', kind: 'ASSEMBLY', shop_type: 'FULL_SHOP', zone_id: 33, routing_template_id: 7 }) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([{ id: 800, dispatch: { project_id: 16, zone_id: 34 } }]) },
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    jest.spyOn(svc as any, 'assertQtyWithinRemaining').mockResolvedValue(undefined)
    await expect(svc.update(41, { assembly_lines: [{ bom_assembly_id: 800, qty: 1 }] } as any, 1, 'tao')).rejects.toThrow('must be in one zone')
  })
})

// 2026-10-07 flow change (user): a PRE_SHOP MO is created EMPTY — project, zone,
// plan only, DRAFT — and gets its assemblies from a Dispatch Note / pre-shop
// drawing upload (or the BOM) on the MO page, any time before DONE. It can't be
// confirmed (so not started) until it has assemblies and a routing.
describe('PRE_SHOP MO — created empty, filled in later', () => {
  function makeCreate() {
    const tx = { manufacturing_order: { create: jest.fn().mockResolvedValue({ id: 60, mo_code: 'MO-60' }) }, mo_assembly_line: { createMany: jest.fn() }, mo_status_history: { create: jest.fn() } }
    const prisma = {
      routing_template: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      bom_assembly: { count: jest.fn().mockResolvedValue(0) }, // zone has no real BOM yet
      project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 33 }) },
      sub_zone: { findFirst: jest.fn() },
      manufacturing_order: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const svc = new ManufacturingOrderService(prisma as any, { log: jest.fn() } as any, { generate: jest.fn().mockResolvedValue('MO-60') } as any, {} as any, {} as any, {} as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 60 } as any)
    return { svc, tx, prisma }
  }

  // Routing is required for every MO, pre-shop too (2026-10-08, user: "ห้ามสร้าง
  // หรือแก้ไขถ้าไม่ได้เลือก routing").
  it('creates an empty DRAFT PRE_SHOP MO with project, zone, plan and routing', async () => {
    const { svc, tx } = makeCreate()
    await svc.create({ shop_type: 'PRE_SHOP', project_id: 16, zone_id: 33, routing_template_id: 7, plan_start: '2026-10-08T01:00:00.000Z', assembly_lines: [] } as any, 1, 'tao')
    expect(tx.manufacturing_order.create.mock.calls[0][0].data).toMatchObject({ shop_type: 'PRE_SHOP', status: 'DRAFT', project_id: 16, zone_id: 33, routing_template_id: 7 })
  })

  it('an MO created with uploaded assemblies logs each of them and every part', async () => {
    const { svc, tx } = makeCreate()
    ;(svc as any).preshop = { createDispatch: jest.fn().mockResolvedValue(new Map([['BUH9', 750]])) }
    const part = { part_mark: 'C-f1', profile: 'PL25x400', length_mm: 10550, grade: 'SM520', qty: 2, unit_weight_kg: 828.17 }
    await svc.create({ shop_type: 'PRE_SHOP', project_id: 16, zone_id: 33, routing_template_id: 7, assembly_lines: [],
      preshop_assemblies: [{ assembly_mark: 'BUH9', qty: 4, length_mm: 10550, weight_kg: 3561.15, surface_area_m2: null, parts: [part] }] } as any, 1, 'tao')
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe(
      'สร้าง MO (Pre-shop): เพิ่ม BUH9 (ชุด 4, L 10550, kg/ชุด 3561.15) · BUH9 part C-f1 PL25x400 SM520 L10550 ×2/ชุด 828.17 kg/ชิ้น')
  })

  it('no MO without a routing, pre-shop included', async () => {
    const { svc } = makeCreate()
    await expect(svc.create({ shop_type: 'PRE_SHOP', project_id: 16, zone_id: 33, assembly_lines: [] } as any, 1, 'tao')).rejects.toThrow('routing_template_id is required')
  })

  it('asks for a code of its type (MO-P… / MO-F…)', async () => {
    const { svc, prisma } = makeCreate()
    await svc.create({ shop_type: 'PRE_SHOP', project_id: 16, zone_id: 33, routing_template_id: 7, assembly_lines: [] } as any, 1, 'tao')
    expect((svc as any).codeGen.generate).toHaveBeenCalledWith(expect.anything(), 'PRE_SHOP')
    void prisma
  })

  it('every new MO gets a "created" line in its History, by whom', async () => {
    const { svc, tx } = makeCreate()
    await svc.create({ shop_type: 'PRE_SHOP', project_id: 16, zone_id: 33, routing_template_id: 7, assembly_lines: [] } as any, 1, 'tao')
    expect(tx.mo_status_history.create).toHaveBeenCalledWith({ data: { mo_id: 60, from_status: 'DRAFT', to_status: 'DRAFT', changed_by: 'tao', reason: 'สร้าง MO (Pre-shop)' } })
  })

  it('PRE_SHOP needs a project and zone; FULL_SHOP still needs a routing and assemblies', async () => {
    const { svc } = makeCreate()
    await expect(svc.create({ shop_type: 'PRE_SHOP', routing_template_id: 7, assembly_lines: [] } as any, 1, 'tao')).rejects.toThrow('project_id and zone_id')
    await expect(svc.create({ shop_type: 'FULL_SHOP', assembly_lines: [{ bom_assembly_id: 1, qty: 1 }] } as any, 1, 'tao')).rejects.toThrow('routing_template_id is required')
  })

  it('cannot be confirmed or started without assemblies and a routing', async () => {
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 60, mo_code: 'MO-60', status: 'DRAFT', kind: 'ASSEMBLY', shop_type: 'PRE_SHOP', routing_template_id: null }) },
      mo_assembly_line: { count: jest.fn().mockResolvedValue(0) },
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    await expect(svc.changeStatus(60, { to_status: 'CONFIRMED', reason: 'x' } as any, 1, 'tao'))
      .rejects.toThrow('ยังไม่มี assembly — กด Upload เพื่อเพิ่มข้อมูลก่อน')
    prisma.mo_assembly_line.count.mockResolvedValue(4)
    await expect(svc.changeStatus(60, { to_status: 'CONFIRMED', reason: 'x' } as any, 1, 'tao')).rejects.toThrow('ยังไม่ได้เลือก routing')
    // same for a Full shop MO left empty after a type change
    prisma.mo_assembly_line.count.mockResolvedValue(0)
    prisma.manufacturing_order.findUnique.mockResolvedValue({ id: 60, mo_code: 'MO-60', status: 'DRAFT', kind: 'ASSEMBLY', shop_type: 'FULL_SHOP', routing_template_id: 7 })
    await expect(svc.changeStatus(60, { to_status: 'CONFIRMED', reason: 'x' } as any, 1, 'tao')).rejects.toThrow('ยังไม่มี assembly')
  })
})

// 2026-10-08, user: every value an upload brings is shown old vs new and the
// user decides (or types their own). So for a mark the MO already has, the
// upload carries the FINAL state — sets, L, kg/set, parts — and the server
// applies it; the dry run returns the MO's current state to compare against.
describe('ManufacturingOrderService.mergePreshop', () => {
  type Part = { part_mark: string; profile: string; length_mm: number; grade: string; qty: number; unit_weight_kg: number }
  const P: Part[] = [{ part_mark: 'C-f1', profile: 'PL25x400', length_mm: 10550, grade: 'SM520', qty: 2, unit_weight_kg: 828.17 }]
  const AP = [{ id: 1, qty: '2', part_id: 900, _count: { work_order_parts: 0 }, part: { part_mark: 'C-f1', profile: 'PL25x400', length_mm: '10550', grade: 'SM520', weight_kg: '828.17' } }]
  const LINE = (id: number, asmId: number, mark: string, qty: number, parts: typeof AP = [], L: number | null = 10550) => ({
    id, bom_assembly_id: asmId, qty: String(qty), line_seq: id - 1,
    bom_assembly: { id: asmId, assembly_mark: mark, dispatch_id: 14, length_mm: L == null ? null : String(L), weight_kg: '3561.15', dispatch: { source: 'PRE_SHOP' }, assembly_parts: parts },
  })
  function make(status = 'IN_PROGRESS', planned: { bom_assembly_id: number; qty_planned: string; work_order: { source_routing_op_id: number } }[] = [], woMarks: unknown[] = []) {
    const mo = { id: 36, mo_code: 'MO-26000013', status, kind: 'ASSEMBLY', shop_type: 'PRE_SHOP', project_id: 16, zone_id: 33, sub_zone_id: null }
    const tx = {
      mo_assembly_line: { update: jest.fn(), createMany: jest.fn() },
      bom_assembly: { update: jest.fn() },
      bom_assembly_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.part_id ? [] : AP)) },
      bom_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn().mockResolvedValue({ id: 950 }), findFirst: jest.fn().mockResolvedValue(null) },
      mo_status_history: { create: jest.fn() },
      manufacturing_order: { update: jest.fn() },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(woMarks) },
      work_order_event: { create: jest.fn() },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue(mo) },
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([LINE(1, 700, 'BUH1-3', 2, AP), LINE(2, 701, 'BUH1A-12', 1, [])]) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(planned) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const preshop = { createDispatch: jest.fn().mockResolvedValue(new Map([['BUH9', 750]])), sizeChanges: new PreshopService().sizeChanges }
    const svc = new ManufacturingOrderService(prisma as any, { log: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any, preshop as any)
    jest.spyOn(svc as any, 'assertQtyWithinRemaining').mockResolvedValue(undefined)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 36 } as any)
    return { svc, tx, prisma, preshop }
  }
  const NONE = { name: null, width_mm: null, height_mm: null, surface_area_m2: null }
  const A = (mark: string, qty: number, parts: Part[] = P, L: number | null = 10550, kg: number | null = 3561.15) => ({ assembly_mark: mark, qty, weight_kg: kg, surface_area_m2: null, length_mm: L, parts })

  it('dry run: new marks, and for marks already in the MO their current values to compare with', async () => {
    const { svc, tx } = make('IN_PROGRESS', [{ bom_assembly_id: 700, qty_planned: '1', work_order: { source_routing_op_id: 5 } }])
    const r = await svc.mergePreshop(36, { source: 'PRESHOP_PDF', dry_run: true, preshop_assemblies: [A('BUH1-3', 3), A('BUH1A-12', 1, P, 9000), A('BUH9', 4)] }, 1, 'tao')
    expect(r.rows).toEqual([
      { assembly_mark: 'BUH1-3', status: 'same', existing: { qty: 2, ...NONE, length_mm: 10550, weight_kg: 3561.15, parts: P, wo_qty: 1, wo_parts: [] } },
      { assembly_mark: 'BUH1A-12', status: 'changed', existing: { qty: 1, ...NONE, length_mm: 10550, weight_kg: 3561.15, parts: [], wo_qty: 0, wo_parts: [] } },
      { assembly_mark: 'BUH9', status: 'new', existing: null },
    ])
    expect(tx.mo_assembly_line.update).not.toHaveBeenCalled()
  })

  // every value is compared, saved and logged (2026-10-09, user: "ต้องเปรียบเทียบกันทุกค่า")
  it('dry run: a different name / W / H / area makes the mark "changed"', async () => {
    const { svc } = make()
    for (const v of [{ name: 'WEB' }, { width_mm: 400 }, { height_mm: 1200 }, { surface_area_m2: 42.708 }]) {
      const r = await svc.mergePreshop(36, { source: 'DISPATCH_NOTE', dry_run: true, preshop_assemblies: [{ ...A('BUH1-3', 2, []), ...v }] }, 1, 'tao')
      expect(r.rows[0].status).toBe('changed')
    }
  })

  it('an existing mark takes the chosen name, W, H and area too — each logged old → new', async () => {
    const { svc, tx } = make()
    await svc.mergePreshop(36, { source: 'DISPATCH_NOTE', filename: 'DN.xls', preshop_assemblies: [{ ...A('BUH1-3', 2, P), name: 'WEB', width_mm: 400, height_mm: 1200, surface_area_m2: 42.708 }] }, 1, 'tao')
    const data = tx.bom_assembly.update.mock.calls[0][0].data
    expect([data.name, Number(data.width_mm), Number(data.height_mm), Number(data.surface_area_m2)]).toEqual(['WEB', 400, 1200, 42.708])
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe(
      'เพิ่มข้อมูลจาก Dispatch Note (DN.xls): BUH1-3 Name — → WEB · BUH1-3 W — → 400 · BUH1-3 H — → 1200 · BUH1-3 area/ชุด — → 42.708 · Rev.0 → Rev.1')
  })

  it('a new mark is logged with every value it brings', async () => {
    const { svc, tx } = make()
    await svc.mergePreshop(36, { source: 'DISPATCH_NOTE', filename: 'DN.xls', preshop_assemblies: [{ ...A('BUH9', 4), name: 'BUILT-UP H', width_mm: 400, height_mm: 1200, surface_area_m2: 42.708 }] }, 1, 'tao')
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toMatch(
      /^เพิ่มข้อมูลจาก Dispatch Note \(DN.xls\): เพิ่ม BUH9 \(ชุด 4, Name BUILT-UP H, L 10550, W 400, H 1200, kg\/ชุด 3561.15, area\/ชุด 42.708\) · /)
  })

  it('dry run works before any sets are typed (a pre-shop PDF has none)', async () => {
    const { svc } = make()
    const r = await svc.mergePreshop(36, { source: 'PRESHOP_PDF', dry_run: true, preshop_assemblies: [A('BUH1-3', 0), A('BUH9', 0)] }, 1, 'tao')
    expect(r.rows.map((x: any) => x.status)).toEqual(['same', 'new'])
  })

  it('an existing mark takes the final values the user chose — sets, L, kg, parts — logged old → new', async () => {
    const { svc, tx } = make()
    const NEWP: Part[] = [{ ...P[0], profile: 'PL28x400' }, { part_mark: 'C-wx58', profile: 'PL20x1150', length_mm: 10550, grade: 'SM520', qty: 1, unit_weight_kg: 1904.8 }]
    await svc.mergePreshop(36, { source: 'PRESHOP_PDF', filename: 'pre.pdf', preshop_assemblies: [A('BUH1-3', 5, NEWP, 10600, 3600)] }, 1, 'tao')
    expect(Number(tx.mo_assembly_line.update.mock.calls[0][0].data.qty)).toBe(5)
    expect(tx.bom_assembly.update.mock.calls[0][0].data).toMatchObject({ length_mm: expect.anything(), weight_kg: expect.anything() })
    expect(Number(tx.bom_assembly.update.mock.calls[0][0].data.qty)).toBe(5)
    // existing part total grows by 3 more sets × 2, then the spec change applies
    expect(Number(tx.bom_part.update.mock.calls[0][0].data.qty.increment)).toBe(6)
    expect(tx.bom_part.create.mock.calls[0][0].data).toMatchObject({ part_mark: 'C-wx58' })
    expect(Number(tx.bom_part.create.mock.calls[0][0].data.qty)).toBe(5) // 1 per set × 5 sets
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe(
      'เพิ่มข้อมูลจาก Pre-shop drawing (pre.pdf): BUH1-3 ชุด 2 → 5 · BUH1-3 L 10550 → 10600 · BUH1-3 kg/ชุด 3561.15 → 3600 · BUH1-3 C-f1 profile PL25x400 → PL28x400 · BUH1-3 เพิ่ม C-wx58 PL20x1150 SM520 L10550 ×1/ชุด 1904.8 kg/ชิ้น · Rev.0 → Rev.1')
  })

  it('a Dispatch Note and a drawing read together are logged as both', async () => {
    const { svc, tx } = make()
    await svc.mergePreshop(36, { source: 'DN_PDF', filename: 'DN.xls, pre.pdf', preshop_assemblies: [A('BUH9', 4)] }, 1, 'tao')
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe('เพิ่มข้อมูลจาก Dispatch Note + Pre-shop drawing (DN.xls, pre.pdf): เพิ่ม BUH9 (ชุด 4, L 10550, kg/ชุด 3561.15) · BUH9 part C-f1 PL25x400 SM520 L10550 ×2/ชุด 828.17 kg/ชิ้น · Rev.0 → Rev.1')
  })

  // Each upload says how it came in and what the file reader warned about, so a
  // bad file or a parser bug can be traced later (2026-10-08).
  it('logs the file-reading warnings with the upload', async () => {
    const { svc, tx } = make()
    await svc.mergePreshop(36, { source: 'PRESHOP_PDF', filename: 'a.pdf, b.pdf', notes: ['b.pdf: BUH9 already read from a.pdf — skipped'], preshop_assemblies: [A('BUH9', 4)] }, 1, 'tao')
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toContain(' · คำเตือนตอนอ่านไฟล์: b.pdf: BUH9 already read from a.pdf — skipped')
  })

  it('an existing mark left exactly as it was changes nothing and logs nothing', async () => {
    const { svc, tx } = make()
    await svc.mergePreshop(36, { source: 'PRESHOP_PDF', preshop_assemblies: [A('BUH1-3', 2)] }, 1, 'tao')
    expect(tx.mo_assembly_line.update).not.toHaveBeenCalled()
    expect(tx.mo_status_history.create).not.toHaveBeenCalled()
  })

  it('sets cannot go below what WOs already planned', async () => {
    const { svc } = make('IN_PROGRESS', [{ bom_assembly_id: 700, qty_planned: '2', work_order: { source_routing_op_id: 5 } }])
    await expect(svc.mergePreshop(36, { source: 'DISPATCH_NOTE', preshop_assemblies: [A('BUH1-3', 1)] }, 1, 'tao')).rejects.toThrow('BUH1-3: ออก WO ไปแล้ว 2 ชุด')
  })

  it('new marks are added; every mark needs complete parts and its sets', async () => {
    const { svc, preshop, tx } = make()
    await svc.mergePreshop(36, { source: 'DISPATCH_NOTE', preshop_assemblies: [A('BUH9', 4)] }, 1, 'tao')
    expect(preshop.createDispatch).toHaveBeenCalledWith(tx, { project_id: 16, zone_id: 33, sub_zone_id: null }, [A('BUH9', 4)], 1)
    await expect(svc.mergePreshop(36, { source: 'DISPATCH_NOTE', preshop_assemblies: [A('BUH10', 1, [])] }, 1, 'tao')).rejects.toThrow('BUH10: ยังไม่มี part')
    await expect(svc.mergePreshop(36, { source: 'DISPATCH_NOTE', preshop_assemblies: [A('BUH10', 1, [{ ...P[0], length_mm: 0 }])] }, 1, 'tao')).rejects.toThrow('BUH10 · C-f1: ยังไม่ใส่ L')
    await expect(svc.mergePreshop(36, { source: 'PRESHOP_PDF', preshop_assemblies: [A('BUH10', 0)] }, 1, 'tao')).rejects.toThrow('BUH10: ยังไม่ได้กรอกจำนวนชุด')
  })

  // 2026-10-08, user: a pre-shop MO gets real-BOM data only through the BOM
  // compare (bom-compare / bom-link), never as a plain upload.
  it('a pre-shop MO takes no BOM picks through upload', async () => {
    const { svc } = make()
    await expect(svc.mergePreshop(36, { source: 'BOM', assembly_lines: [{ bom_assembly_id: 3003, qty: 1 }] } as any, 1, 'tao')).rejects.toThrow('เทียบกับ BOM')
  })

  it('not on a DONE / CANCELLED MO; a Full shop MO takes only BOM picks', async () => {
    await expect(make('DONE').svc.mergePreshop(36, { source: 'DISPATCH_NOTE', preshop_assemblies: [A('X', 1)] }, 1, 'tao')).rejects.toThrow(ConflictException)
    const { svc, prisma } = make()
    prisma.manufacturing_order.findUnique.mockResolvedValue({ id: 36, mo_code: 'MO-36', status: 'DRAFT', kind: 'ASSEMBLY', shop_type: 'FULL_SHOP', project_id: 16, zone_id: 33, sub_zone_id: null })
    await expect(svc.mergePreshop(36, { source: 'DISPATCH_NOTE', preshop_assemblies: [A('X', 1)] }, 1, 'tao')).rejects.toThrow('Full shop')
    // security review M1 (2026-10-09): a Full shop MO takes no pre-shop rows, even sent with source BOM
    await expect(svc.mergePreshop(36, { source: 'BOM', preshop_assemblies: [A('X', 1)] }, 1, 'tao')).rejects.toThrow('Full shop')
  })
})

describe('ManufacturingOrderService.zoneHasBom', () => {
  it('counts only active assemblies of a real BOM upload in the zone', async () => {
    const prisma = { bom_assembly: { count: jest.fn().mockResolvedValue(3) } }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    await expect(svc.zoneHasBom(33)).resolves.toBe(true)
    expect(prisma.bom_assembly.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE', dispatch: { zone_id: 33, source: 'BOM_UPLOAD' } } })
    prisma.bom_assembly.count.mockResolvedValue(0)
    await expect(svc.zoneHasBom(33)).resolves.toBe(false)
  })
})

// Assemblies tab shows each assembly's parts (per set) — 2026-10-08, user:
// a pre-shop MO must show which parts each assembly uses.
describe('ManufacturingOrderService.getAssemblies — parts per set', () => {
  it('returns each line with its parts in sequence order', async () => {
    const line = {
      id: 1, line_seq: 0, bom_assembly_id: 700, qty: '2',
      bom_assembly: {
        assembly_mark: 'BUH1-3', name: null, qty: '2', dispatch: { project: { name: 'P' }, zone: { label: 'Z' }, sub_zone: null, source: 'BOM_UPLOAD', revision: 3 },
        assembly_parts: [{ qty: '2', part: { part_mark: 'C-f1', profile: 'PL25x400', grade: 'SM520', length_mm: '10550', weight_kg: '828.17' } }],
      },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 36, kind: 'ASSEMBLY' }) },
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([line]) },
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, { allocationBreakdown: jest.fn().mockResolvedValue([]) } as any, {} as any, {} as any)
    const [r] = await svc.getAssemblies(36)
    expect(r.parts).toEqual([{ part_mark: 'C-f1', profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty_per_set: 2, weight_kg: 828.17 }])
    expect(r.source_label).toBe('BOM rev 3')
    expect(prisma.mo_assembly_line.findMany.mock.calls[0][0].include.bom_assembly.include.assembly_parts).toEqual({ include: { part: true }, orderBy: { sequence: 'asc' } })
  })
})

// Pre-shop parts are editable on the MO (2026-10-08, user: "part ก็ต้องแก้ไขได้ด้วย").
// A part mark is one part across the MO's pre-shop data: its spec lives on
// bom_part (shared), its count per set on bom_assembly_part. A part already on
// a WO can't be removed (work_order_part cascades off bom_assembly_part).
describe('ManufacturingOrderService.updatePreshopParts', () => {
  const ROW = (id: number, partId: number, mark: string, qty: number, profile = 'PL25x400', wo = 0) => ({
    id, qty: String(qty), part_id: partId, _count: { work_order_parts: wo },
    part: { id: partId, part_mark: mark, profile, grade: 'SM520', length_mm: '10550', weight_kg: '828.17', qty: '10' },
  })
  const P = (part_mark: string, qty: number, profile = 'PL25x400') => ({ part_mark, profile, grade: 'SM520', length_mm: 10550, qty, unit_weight_kg: 828.17 })
  function make(rows = [ROW(1, 900, 'C-f1', 2), ROW(2, 901, 'C-wx58', 1)], status = 'IN_PROGRESS', source = 'PRE_SHOP', sharedWith: unknown[] = [], woMarks: unknown[] = []) {
    const tx = {
      bom_assembly_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.part_id ? sharedWith : rows)) },
      bom_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn().mockResolvedValue({ id: 950 }), findFirst: jest.fn().mockResolvedValue(null) },
      mo_status_history: { create: jest.fn() },
      manufacturing_order: { update: jest.fn() },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(woMarks) },
      work_order_event: { create: jest.fn() },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 36, mo_code: 'MO-36', status, kind: 'ASSEMBLY', shop_type: 'PRE_SHOP' }) },
      mo_assembly_line: { findFirst: jest.fn().mockResolvedValue({ id: 5, mo_id: 36, qty: '3', bom_assembly_id: 700, bom_assembly: { id: 700, assembly_mark: 'BUH1-3', dispatch_id: 14, dispatch: { source } } }) },
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue(rows) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const auto = { recomputeParts: jest.fn(), recomputeDuration: jest.fn() }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, auto as any, {} as any)
    jest.spyOn(svc, 'getAssemblies').mockResolvedValue([] as any)
    return { svc, tx, auto }
  }

  it('changes count per set, spec, adds and removes parts — BOM totals follow the sets — and logs it', async () => {
    const { svc, tx } = make()
    await svc.updatePreshopParts(36, 5, [P('C-f1', 3, 'PL28x400'), P('C-x9', 4)], 1, 'tao')
    expect(tx.bom_assembly_part.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { qty: expect.anything() } })
    expect(Number(tx.bom_assembly_part.update.mock.calls[0][0].data.qty)).toBe(3)
    // spec on the shared part + its total grows by (3-2) per set × 3 sets
    expect(tx.bom_part.update.mock.calls[0][0]).toMatchObject({ where: { id: 900 }, data: { profile: 'PL28x400' } })
    expect(Number(tx.bom_part.update.mock.calls[0][0].data.qty.increment)).toBe(3)
    expect(tx.bom_part.create.mock.calls[0][0].data).toMatchObject({ dispatch_id: 14, part_mark: 'C-x9', profile: 'PL25x400' })
    expect(Number(tx.bom_part.create.mock.calls[0][0].data.qty)).toBe(12)
    expect(tx.bom_assembly_part.create.mock.calls[0][0].data).toMatchObject({ assembly_id: 700, part_id: 950 })
    expect(tx.bom_assembly_part.delete).toHaveBeenCalledWith({ where: { id: 2 } })
    expect(tx.bom_part.delete).toHaveBeenCalledWith({ where: { id: 901 } }) // no other assembly uses it
    expect(tx.mo_status_history.create.mock.calls[0][0].data).toMatchObject({ mo_id: 36, changed_by: 'tao',
      reason: 'แก้ part BUH1-3: C-f1 ต่อชุด 2 → 3 · C-f1 profile PL25x400 → PL28x400 · เพิ่ม C-x9 PL25x400 SM520 L10550 ×4/ชุด 828.17 kg/ชิ้น · ลบ C-wx58 · Rev.0 → Rev.1' })
  })

  // A part mark is one part across the MO — changing its spec changes it in
  // every assembly using it, and History says so (2026-10-08).
  it('a spec change on a part other assemblies use names them in History', async () => {
    const { svc, tx } = make(undefined, 'IN_PROGRESS', 'PRE_SHOP', [{ assembly: { assembly_mark: 'BUH1A-12' } }])
    await svc.updatePreshopParts(36, 5, [P('C-f1', 2, 'PL28x400'), P('C-wx58', 1)], 1, 'tao')
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe('แก้ part BUH1-3: C-f1 profile PL25x400 → PL28x400 (มีผลกับ BUH1A-12 ด้วย) · Rev.0 → Rev.1')
  })

  // Parts follow into WOs already issued (2026-10-09, user: WOs follow the MO).
  it('re-syncs the parts and time of every open WO carrying the mark', async () => {
    const { svc, auto, tx } = make(undefined, 'IN_PROGRESS', 'PRE_SHOP', [], [{ work_order_id: 9 }, { work_order_id: 9 }, { work_order_id: 12 }])
    await svc.updatePreshopParts(36, 5, [P('C-f1', 2), P('C-wx58', 1), P('C-x9', 4)], 1, 'tao')
    expect(auto.recomputeParts.mock.calls.map((c: any) => c[2])).toEqual([9, 12])
    expect(tx.work_order_event.create.mock.calls.map((c: any) => [c[0].data.work_order_id, c[0].data.notes])).toEqual([
      [9, 'อัปเดตตามการแก้ที่ MO: BUH1-3 เพิ่ม C-x9 PL25x400 SM520 L10550 ×4/ชุด 828.17 kg/ชิ้น'],
      [12, 'อัปเดตตามการแก้ที่ MO: BUH1-3 เพิ่ม C-x9 PL25x400 SM520 L10550 ×4/ชุด 828.17 kg/ชิ้น'],
    ])
    expect(auto.recomputeDuration.mock.calls.map((c: any) => c[1])).toEqual([9, 12])
  })

  it('a part on a WO with no withdrawal entered can be removed', async () => {
    const { svc, tx } = make([ROW(1, 900, 'C-f1', 2), ROW(2, 901, 'C-wx58', 1, 'PL20x1150', 0)])
    await svc.updatePreshopParts(36, 5, [P('C-f1', 2)], 1, 'tao')
    expect(tx.bom_assembly_part.delete).toHaveBeenCalledWith({ where: { id: 2 } })
  })

  it('a part already on a WO cannot be removed', async () => {
    const { svc } = make([ROW(1, 900, 'C-f1', 2), ROW(2, 901, 'C-wx58', 1, 'PL20x1150', 2)])
    // only a part whose withdrawal someone already entered on a WO is locked (2026-10-09)
    await expect(svc.updatePreshopParts(36, 5, [P('C-f1', 2)], 1, 'tao')).rejects.toThrow('C-wx58 กรอกยอดเบิกใน WO แล้ว — เอาออกไม่ได้')
  })

  it('rejects bad rows, a BOM-sourced assembly and a closed MO', async () => {
    await expect(make().svc.updatePreshopParts(36, 5, [P('C-f1', 0)], 1, 'tao')).rejects.toThrow('C-f1: จำนวนต่อชุดต้องมากกว่า 0')
    await expect(make().svc.updatePreshopParts(36, 5, [], 1, 'tao')).rejects.toThrow('BUH1-3: ต้องมีอย่างน้อย 1 part')
    // a builder picks parts by size and weight — L and kg are required (2026-10-08)
    await expect(make().svc.updatePreshopParts(36, 5, [{ ...P('C-f1', 1), length_mm: 0, unit_weight_kg: 0 }], 1, 'tao')).rejects.toThrow('C-f1: ยังไม่ใส่ L · C-f1: ยังไม่ใส่ kg/ชิ้น')
    await expect(make().svc.updatePreshopParts(36, 5, [P('C-f1', 1), P('C-f1', 2)], 1, 'tao')).rejects.toThrow('part ซ้ำ: C-f1')
    await expect(make(undefined, 'IN_PROGRESS', 'BOM_UPLOAD').svc.updatePreshopParts(36, 5, [P('C-f1', 1)], 1, 'tao')).rejects.toThrow('มาจาก BOM')
    await expect(make(undefined, 'DONE').svc.updatePreshopParts(36, 5, [P('C-f1', 1)], 1, 'tao')).rejects.toThrow(ConflictException)
  })
})

describe('ManufacturingOrderService.updateActualDates — in the MO History', () => {
  it('logs old → new in Bangkok time, by whom', async () => {
    const tx = { manufacturing_order: { update: jest.fn() }, mo_status_history: { create: jest.fn() } }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 36, mo_code: 'MO-36', status: 'DONE', kind: 'ASSEMBLY', actual_start: new Date('2026-10-01T01:00:00Z'), actual_finish: new Date('2026-10-03T10:00:00Z') }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const svc = new ManufacturingOrderService(prisma as any, { log: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 36 } as any)
    await svc.updateActualDates(36, { actual_start: '2026-10-01T01:00:00.000Z', actual_finish: '2026-10-04T10:00:00.000Z' } as any, 1, 'tao')
    expect(tx.mo_status_history.create).toHaveBeenCalledWith({ data: { mo_id: 36, from_status: 'DONE', to_status: 'DONE', changed_by: 'tao', reason: 'แก้วันที่จริง: เสร็จ 2026-10-03 17:00 → 2026-10-04 17:00' } })
  })
})

// Real BOM for a pre-shop MO (2026-10-08, user: "ยึดตามแบบเดิมเอามาเทียบให้ user
// ดูว่าอะไรเปลี่ยนบ้างและให้ user ตัดสินใจเองแก้ไขเองทั้งหมด"): the MO compares
// its marks with the zone's real BOM; the user picks every value; the MO's own
// pre-shop rows take the result and remember which BOM row they were checked
// against (attributes.bom_ref) so the prompt goes away until a new BOM revision.
describe('ManufacturingOrderService — compare with the real BOM', () => {
  type Part = { part_mark: string; profile: string; length_mm: number; grade: string; qty: number; unit_weight_kg: number }
  const P = (m: string, profile = 'PL25x400', L = 10550, q = 2): Part => ({ part_mark: m, profile, length_mm: L, grade: 'SM520', qty: q, unit_weight_kg: 828.17 })
  const AP = (ps: Part[], wo = 0) => ps.map((p, i) => ({ id: i + 1, qty: String(p.qty), part_id: 900 + i, _count: { work_order_parts: wo }, part: { part_mark: p.part_mark, profile: p.profile, length_mm: String(p.length_mm), grade: p.grade, weight_kg: String(p.unit_weight_kg) } }))
  const LINE = (id: number, asmId: number, mark: string, qty: number, parts: Part[], attributes: object = {}) => ({
    id, bom_assembly_id: asmId, qty: String(qty), line_seq: id - 1,
    bom_assembly: { id: asmId, assembly_mark: mark, dispatch_id: 14, length_mm: '10550', weight_kg: '3561.15', attributes, dispatch: { source: 'PRE_SHOP' }, assembly_parts: AP(parts) },
  })
  const BOM = (id: number, mark: string, qty: number, parts: Part[], L = 10550) => ({
    id, assembly_mark: mark, qty: String(qty), length_mm: String(L), weight_kg: '3561.15', assembly_parts: AP(parts),
  })
  function make(lines: unknown[], bom: unknown[], planned: unknown[] = [], woMarks: unknown[] = []) {
    const tx = {
      mo_assembly_line: { update: jest.fn(), createMany: jest.fn(), delete: jest.fn() },
      bom_assembly: { update: jest.fn() },
      // an assembly's own parts (applyParts) come from the line fixture; "who else uses this part" → none
      bom_assembly_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.part_id ? [] : ((lines as any[]).find(l => l.bom_assembly_id === where.assembly_id)?.bom_assembly.assembly_parts ?? []).map((r: any) => ({ ...r, part: { ...r.part, id: r.part_id } })))) },
      bom_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn().mockResolvedValue({ id: 950 }), findFirst: jest.fn().mockResolvedValue(null) },
      mo_status_history: { create: jest.fn() },
      manufacturing_order: { update: jest.fn() },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(woMarks) },
      work_order_event: { create: jest.fn() },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 46, mo_code: 'MO-23', status: 'DRAFT', kind: 'ASSEMBLY', shop_type: 'PRE_SHOP', project_id: 3, zone_id: 6, sub_zone_id: null }) },
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue(lines) },
      bom_dispatch: { findFirst: jest.fn().mockResolvedValue(bom.length ? { id: 28, revision: 1, uploaded_at: new Date('2026-10-08T10:57:00Z') } : null) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue(bom) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(planned) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const svc = new ManufacturingOrderService(prisma as any, { log: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any, new PreshopService())
    jest.spyOn(svc as any, 'assertQtyWithinRemaining').mockResolvedValue(undefined)
    jest.spyOn(svc, 'findOne').mockResolvedValue({ id: 46 } as any)
    return { svc, tx, prisma }
  }

  // QA review F-004: Rev bumps only when the printed data changes — a plain keep doesn't
  it('keeping the MO values bumps no Rev; taking a BOM value does', async () => {
    const keep = make([LINE(1, 701, 'BUH1-3', 2, [P('C-f1')])], [{ ...BOM(3002, 'BUH1-3', 6, [P('C-f1')]), width_mm: '400' }])
    await keep.svc.linkBom(46, { dispatch_id: 28, marks: [{ assembly_mark: 'BUH1-3', action: 'keep' }] } as any, 1, 'tao')
    expect(keep.tx.manufacturing_order.update).not.toHaveBeenCalled()
    expect(keep.tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe('เทียบกับ BOM จริง (rev 1): BUH1-3 เก็บค่าเดิม')
  })

  // every value is compared with the real BOM (2026-10-09, user: "ต้องเปรียบเทียบกันทุกค่า")
  it('a mark differing from the BOM only in name / W / H / area is "changed"', async () => {
    for (const v of [{ name: 'BUILT-UP H' }, { width_mm: '400' }, { height_mm: '1200' }, { surface_area_m2: '42.708' }]) {
      const { svc } = make([LINE(1, 701, 'BUH1-3', 2, [P('C-f1')])], [{ ...BOM(3002, 'BUH1-3', 6, [P('C-f1')]), ...v }])
      const r = await svc.bomCompare(46)
      expect(r.rows[0].status).toBe('changed')
    }
  })

  it('links to the real BOM row only when every value is the BOM\'s', async () => {
    const bomRow = { ...BOM(3002, 'BUH1-3', 6, [P('C-f1')]), name: 'BUILT-UP H', width_mm: '400' }
    const final = { qty: 2, name: 'BUILT-UP H', length_mm: 10550, width_mm: 400, height_mm: null, weight_kg: 3561.15, surface_area_m2: null, parts: [P('C-f1')] }
    const linked = make([LINE(1, 701, 'BUH1-3', 2, [P('C-f1')])], [bomRow])
    await linked.svc.linkBom(46, { dispatch_id: 28, marks: [{ assembly_mark: 'BUH1-3', action: 'apply', final }] } as any, 1, 'tao')
    expect(linked.tx.mo_assembly_line.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bom_assembly_id: 3002 }) }))

    const own = make([LINE(1, 701, 'BUH1-3', 2, [P('C-f1')])], [bomRow])
    await own.svc.linkBom(46, { dispatch_id: 28, marks: [{ assembly_mark: 'BUH1-3', action: 'apply', final: { ...final, width_mm: 450 } }] } as any, 1, 'tao')
    expect(own.tx.mo_assembly_line.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bom_assembly_id: 3002 }) }))
    const data = own.tx.bom_assembly.update.mock.calls[0][0].data
    expect([data.name, Number(data.width_mm)]).toEqual(['BUILT-UP H', 450])
    expect(own.tx.mo_status_history.create.mock.calls[0][0].data.reason).toContain('BUH1-3 Name — → BUILT-UP H · BUH1-3 W — → 450')
  })

  it('compares each MO mark with the BOM; lists marks only in the MO and only in the BOM', async () => {
    const { svc } = make(
      [LINE(1, 700, 'BUH1A-14', 5, [P('C-f2')]), LINE(2, 701, 'BUH1-3', 2, [P('C-f1', 'PL28x400')]), LINE(3, 702, 'BUH9', 1, [P('C-x1')])],
      [BOM(3001, 'BUH1A-14', 15, [P('C-f2')]), BOM(3002, 'BUH1-3', 6, [P('C-f1')]), BOM(3003, 'BUH1C-20', 4, [P('C-f40')])],
    )
    const r = await svc.bomCompare(46)
    expect(r.bom).toMatchObject({ dispatch_id: 28, revision: 1 })
    expect(r.rows.map((x: any) => [x.assembly_mark, x.status, x.reviewed, x.bom?.assembly_id ?? null])).toEqual([
      ['BUH1A-14', 'same', false, 3001], ['BUH1-3', 'changed', false, 3002], ['BUH9', 'not_in_bom', false, null],
    ])
    expect(r.rows[1].bom?.qty).toBe(6) // the zone's total — shown, not forced
    expect(r.bom_only.map((x: any) => [x.assembly_mark, x.assembly_id, x.qty])).toEqual([['BUH1C-20', 3003, 4]])
    expect(r.pending).toBe(3)
  })

  it('a mark already checked against this BOM row is not pending', async () => {
    const { svc } = make([LINE(1, 700, 'BUH1A-14', 5, [P('C-f2')], { bom_ref: { assembly_id: 3001 } })], [BOM(3001, 'BUH1A-14', 15, [P('C-f2')])])
    const r = await svc.bomCompare(46)
    expect([r.rows[0].reviewed, r.pending]).toEqual([true, 0])
  })

  it('applies what the user chose, keeps / removes / adds marks, and logs it all', async () => {
    const { svc, tx } = make(
      [LINE(1, 701, 'BUH1-3', 2, [P('C-f1', 'PL28x400')]), LINE(2, 702, 'BUH9', 1, [P('C-x1')]), LINE(3, 703, 'BUH7', 1, [P('C-y1')])],
      [BOM(3002, 'BUH1-3', 6, [P('C-f1')]), BOM(3003, 'BUH1C-20', 4, [P('C-f40')])],
    )
    await svc.linkBom(46, {
      dispatch_id: 28,
      marks: [
        { assembly_mark: 'BUH1-3', action: 'apply', final: { qty: 2, length_mm: 10550, weight_kg: 3561.15, parts: [P('C-f1')] } },
        { assembly_mark: 'BUH9', action: 'keep' },
        { assembly_mark: 'BUH7', action: 'remove' },
      ],
      add: [{ bom_assembly_id: 3003, qty: 2 }],
    } as any, 1, 'tao')
    // taken exactly as the BOM has it → linked to the real BOM row (2026-10-09)
    expect(tx.mo_assembly_line.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { bom_assembly_id: 3002, qty: expect.anything() } })
    expect(tx.bom_assembly.update).toHaveBeenCalledWith({ where: { id: 702 }, data: { attributes: { bom_ref: { assembly_id: null, dispatch_id: 28, revision: 1 } } } })
    expect(tx.mo_assembly_line.delete).toHaveBeenCalledWith({ where: { id: 3 } })
    expect(tx.mo_assembly_line.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ mo_id: 46, bom_assembly_id: 3003, line_seq: 3 })])
    expect(tx.mo_status_history.create.mock.calls[0][0].data).toMatchObject({ changed_by: 'tao', reason:
      'เทียบกับ BOM จริง (rev 1): BUH1-3 ผูกกับ BOM จริง · BUH1-3 C-f1 profile PL28x400 → PL25x400 · BUH9 เก็บค่าเดิม (ไม่มีใน BOM) · เอา BUH7 ออกจาก MO · เพิ่ม BUH1C-20 (ชุด 2) จาก BOM · BUH1C-20 part C-f40 PL25x400 SM520 L10550 ×2/ชุด 828.17 kg/ชิ้น' })
  })

  it('a mark on a WO cannot be removed; sets stay above what WOs planned', async () => {
    const lines = [LINE(1, 701, 'BUH1-3', 2, [P('C-f1')])]
    const planned = [{ bom_assembly_id: 701, qty_planned: '2', work_order: { source_routing_op_id: 5 } }]
    const { svc } = make(lines, [BOM(3002, 'BUH1-3', 6, [P('C-f1')])], planned)
    await expect(svc.linkBom(46, { dispatch_id: 28, marks: [{ assembly_mark: 'BUH1-3', action: 'remove' }] } as any, 1, 'tao')).rejects.toThrow('BUH1-3 มีใน WO แล้ว')
    await expect(svc.linkBom(46, { dispatch_id: 28, marks: [{ assembly_mark: 'BUH1-3', action: 'apply', final: { qty: 1, length_mm: 10550, weight_kg: 3561.15, parts: [P('C-f1')] } }] } as any, 1, 'tao')).rejects.toThrow('ออก WO ไปแล้ว 2 ชุด')
  })
})

// Full shop MO when its zone's BOM gets a new upload (2026-10-09, user: when a
// BOM comes in or changes version, MO and WO compare again). Its data IS the
// shared BOM, so per mark the user takes the new version or keeps the old one
// (sets still the user's); taking it re-points the MO line and its WOs.
describe('ManufacturingOrderService — Full shop MO vs a new BOM version', () => {
  type Part = { part_mark: string; profile: string; length_mm: number; grade: string; qty: number; unit_weight_kg: number }
  const P = (m: string, L = 10550, q = 2): Part => ({ part_mark: m, profile: 'PL25x400', length_mm: L, grade: 'SM520', qty: q, unit_weight_kg: 828.17 })
  const AP = (ps: Part[], base: number) => ps.map((p, i) => ({ id: base + i, qty: String(p.qty), part_id: base + 100 + i, _count: { work_order_parts: 0 }, part: { part_mark: p.part_mark, profile: p.profile, length_mm: String(p.length_mm), grade: p.grade, weight_kg: String(p.unit_weight_kg) } }))
  const LINE = (id: number, asmId: number, mark: string, qty: number, parts: Part[], L = 10550) => ({
    id, bom_assembly_id: asmId, qty: String(qty), line_seq: id - 1,
    bom_assembly: { id: asmId, assembly_mark: mark, dispatch_id: 20, length_mm: String(L), weight_kg: '3561.15', attributes: {}, dispatch: { source: 'BOM_UPLOAD' }, assembly_parts: AP(parts, asmId * 10) },
  })
  const BOM = (id: number, mark: string, qty: number, parts: Part[], L = 10550) => ({ id, assembly_mark: mark, qty: String(qty), length_mm: String(L), weight_kg: '3561.15', assembly_parts: AP(parts, id * 10) })
  function make(lines: any[], latest: any[], oldMarks: string[], woMarks: unknown[] = [], woParts: unknown[] = []) {
    const allParts = new Map<number, any[]>([...lines.map(l => [l.bom_assembly_id, l.bom_assembly.assembly_parts] as [number, any[]]), ...latest.map(b => [b.id, b.assembly_parts] as [number, any[]])])
    const tx = {
      mo_assembly_line: { update: jest.fn(), createMany: jest.fn(), delete: jest.fn() },
      bom_assembly: { update: jest.fn() },
      bom_assembly_part: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(allParts.get(where.assembly_id) ?? [])) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(woMarks), updateMany: jest.fn() },
      work_order_part: { findMany: jest.fn().mockResolvedValue(woParts), update: jest.fn(), delete: jest.fn() },
      work_order_event: { create: jest.fn() },
      mo_status_history: { create: jest.fn() },
      manufacturing_order: { update: jest.fn() },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 50, mo_code: 'MO-50', status: 'IN_PROGRESS', kind: 'ASSEMBLY', shop_type: 'FULL_SHOP', project_id: 3, zone_id: 5, sub_zone_id: null }) },
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue(lines) },
      bom_dispatch: { findFirst: jest.fn().mockResolvedValue({ id: 30, revision: 2, uploaded_at: new Date('2026-10-09T03:00:00Z') }) },
      bom_assembly: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.status === 'ACTIVE' ? latest : oldMarks.map(m => ({ assembly_mark: m })))) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const auto = { recomputeParts: jest.fn(), recomputeDuration: jest.fn() }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, auto as any, {} as any, new PreshopService())
    jest.spyOn(svc as any, 'assertQtyWithinRemaining').mockResolvedValue(undefined)
    return { svc, tx, auto }
  }

  it('lists marks on an older version; a mark already on the latest row is fine; only marks new in this upload are offered', async () => {
    const { svc } = make(
      [LINE(1, 500, 'A', 2, [P('a1')]), LINE(2, 501, 'B', 1, [P('b1')]), LINE(3, 502, 'C', 1, [P('c1')])],
      [BOM(600, 'A', 6, [P('a1', 10600)], 10600), { ...BOM(501, 'B', 3, [P('b1')]) }, BOM(602, 'D', 2, [P('d1')]), BOM(603, 'E', 2, [P('e1')])],
      ['A', 'B', 'C', 'E'],
    )
    const r = await svc.bomCompare(50)
    expect(r.rows.map((x: any) => [x.assembly_mark, x.kind, x.status, x.reviewed])).toEqual([
      ['A', 'bom', 'changed', false], ['B', 'bom', 'same', true], ['C', 'bom', 'not_in_bom', false],
    ])
    expect(r.bom_only.map((x: any) => x.assembly_mark)).toEqual(['D']) // E was already in the old version — the MO left it out on purpose
    expect(r.pending).toBe(2)
  })

  // bug 2026-10-09 (manual test): a mark already taken from THIS version made
  // the version count as "old", hiding every mark the version added
  it('a mark already on the version being compared does not hide that version\'s other marks', async () => {
    const onLatest = { ...LINE(2, 501, 'B', 1, [P('b1')]), bom_assembly: { ...LINE(2, 501, 'B', 1, [P('b1')]).bom_assembly, dispatch_id: 30 } }
    const { svc } = make([onLatest], [BOM(501, 'B', 3, [P('b1')]), BOM(602, 'D', 2, [P('d1')])], ['B', 'D'])
    const r = await svc.bomCompare(50)
    expect(r.bom_only.map((x: any) => x.assembly_mark)).toEqual(['D'])
  })

  it('taking the new version re-points the MO line and its WOs, carries WO parts over by part mark, logs every difference', async () => {
    const lines = [LINE(1, 500, 'A', 2, [P('a1'), P('a2')])]
    const latest = [BOM(600, 'A', 6, [P('a1', 10600), P('a3')], 10600)]
    const { svc, tx, auto } = make(lines, latest, ['A'], [{ id: 77, work_order_id: 9 }],
      [{ id: 1, bom_assembly_part_id: 5000, updated_by: null }, { id: 2, bom_assembly_part_id: 5001, updated_by: null }])
    await svc.linkBom(50, { dispatch_id: 30, marks: [{ assembly_mark: 'A', action: 'apply', final: { qty: 2, length_mm: 10600, weight_kg: 3561.15, parts: [] } }] } as any, 1, 'tao')
    expect(tx.mo_assembly_line.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { bom_assembly_id: 600, qty: expect.anything() } })
    expect(tx.work_order_mark.updateMany).toHaveBeenCalledWith({ where: { id: { in: [77] } }, data: { bom_assembly_id: 600, bom_dispatch_id_snapshot: 30 } })
    expect(tx.work_order_part.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { bom_assembly_part_id: 6000 } }) // a1 → a1
    expect(tx.work_order_part.delete).toHaveBeenCalledWith({ where: { id: 2 } }) // a2 gone, nothing entered
    expect(auto.recomputeParts).toHaveBeenCalledWith(tx, 50, 9, 'tao') // a3 added to the WO
    // the WO's own History says why it changed
    expect(tx.work_order_event.create).toHaveBeenCalledWith({ data: { work_order_id: 9, event_type: 'EDIT', recorded_by: 'tao',
      notes: 'A ย้ายไป BOM version ใหม่ (dispatch 30) ตามการเทียบที่ MO: A L 10550 → 10600 · A a1 L 10550 → 10600 · A ลบ a2 · A เพิ่ม a3 PL25x400 SM520 L10550 ×2/ชุด 828.17 kg/ชิ้น' } })
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe(
      'เทียบกับ BOM จริง (rev 2): A ใช้ BOM version ใหม่ · A L 10550 → 10600 · A a1 L 10550 → 10600 · A ลบ a2 · A เพิ่ม a3 PL25x400 SM520 L10550 ×2/ชุด 828.17 kg/ชิ้น · Rev.0 → Rev.1')
  })

  it('a WO part whose withdrawal was entered and is gone from the new version blocks the switch', async () => {
    const { svc } = make([LINE(1, 500, 'A', 2, [P('a1'), P('a2')])], [BOM(600, 'A', 6, [P('a1')])], ['A'], [{ id: 77, work_order_id: 9 }],
      [{ id: 2, bom_assembly_part_id: 5001, updated_by: 'somchai', work_order: { wo_code: 'WO-IN-26000009' } }])
    await expect(svc.linkBom(50, { dispatch_id: 30, marks: [{ assembly_mark: 'A', action: 'apply', final: { qty: 2, length_mm: 10550, weight_kg: 3561.15, parts: [] } }] } as any, 1, 'tao'))
      .rejects.toThrow('A: a2 ไม่มีใน BOM ใหม่ แต่ WO-IN-26000009 กรอกยอดเบิกแล้ว')
  })

  // security review M2 (2026-10-09): moving to a BOM row claims its sets — never more than it has left
  it('checks the new row has the sets left before moving the line onto it', async () => {
    const lines = [LINE(1, 500, 'A', 2, [P('a1')])]
    const { svc } = make(lines, [BOM(600, 'A', 6, [P('a1', 10600)], 10600)], ['A'])
    const spy = (svc as any).assertQtyWithinRemaining as jest.Mock
    spy.mockRejectedValueOnce(new Error('qty exceeds remaining'))
    await expect(svc.linkBom(50, { dispatch_id: 30, marks: [{ assembly_mark: 'A', action: 'apply', final: { qty: 5, length_mm: 10600, weight_kg: 3561.15, parts: [] } }] } as any, 1, 'tao')).rejects.toThrow('qty exceeds remaining')
    expect(spy).toHaveBeenCalledWith([{ bom_assembly_id: 600, qty: 5 }], 50)
  })
})

describe('ManufacturingOrderService — Full shop mark confirmed as matching the new version', () => {
  it('moves to the new row too, so the MO and its WOs sit on the latest BOM', async () => {
    const part = { id: 5000, qty: '1', part_id: 6000, _count: { work_order_parts: 0 }, part: { part_mark: 'b1', profile: 'PL12', length_mm: '240', grade: 'SS400', weight_kg: '2.24' } }
    const line = { id: 1, bom_assembly_id: 501, qty: '5', line_seq: 0, bom_assembly: { id: 501, assembly_mark: 'B', dispatch_id: 20, length_mm: '650', weight_kg: '104.44', attributes: {}, dispatch: { source: 'BOM_UPLOAD' }, assembly_parts: [part] } }
    const latest = { id: 601, assembly_mark: 'B', qty: '20', length_mm: '650', weight_kg: '104.44', assembly_parts: [part] }
    const tx = {
      mo_assembly_line: { update: jest.fn() }, bom_assembly: { update: jest.fn() },
      bom_assembly_part: { findMany: jest.fn().mockResolvedValue([part]) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      work_order_part: { findMany: jest.fn().mockResolvedValue([]) },
      mo_status_history: { create: jest.fn() },
      manufacturing_order: { update: jest.fn() },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 50, mo_code: 'MO-50', status: 'IN_PROGRESS', kind: 'ASSEMBLY', shop_type: 'FULL_SHOP', project_id: 3, zone_id: 5, sub_zone_id: null }) },
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([line]) },
      bom_dispatch: { findFirst: jest.fn().mockResolvedValue({ id: 30, revision: 2, uploaded_at: new Date() }) },
      bom_assembly: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.status === 'ACTIVE' ? [latest] : [{ assembly_mark: 'B' }])) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, { recomputeParts: jest.fn(), recomputeDuration: jest.fn() } as any, {} as any, new PreshopService())
    jest.spyOn(svc as any, 'assertQtyWithinRemaining').mockResolvedValue(undefined) // the new row has the sets left
    await svc.linkBom(50, { dispatch_id: 30, marks: [{ assembly_mark: 'B', action: 'keep' }] } as any, 1, 'tao')
    expect(tx.mo_assembly_line.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { bom_assembly_id: 601, qty: expect.anything() } })
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe('เทียบกับ BOM จริง (rev 2): B ตรงกับ BOM version ใหม่ · Rev.0 → Rev.1')
  })
})

// 2026-10-09, user: "เทียบและปรับให้เสร็จ" — an MO can't be completed while
// marks still wait to be compared with the zone's BOM.
describe('ManufacturingOrderService.changeStatus — Complete waits for the BOM compare', () => {
  it('refuses DONE while marks are pending, allows it once none are', async () => {
    const prisma = { manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 46, mo_code: 'MO-P2600023', status: 'IN_PROGRESS', kind: 'ASSEMBLY', shop_type: 'PRE_SHOP' }) } }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    jest.spyOn(svc, 'bomCompare').mockResolvedValue({ bom: { dispatch_id: 28, revision: 1 }, rows: [], bom_only: [], pending: 2 } as any)
    await expect(svc.changeStatus(46, { to_status: 'DONE', reason: 'x', actual_start: '2026-10-01T01:00:00.000Z', actual_finish: '2026-10-02T01:00:00.000Z' } as any, 1, 'tao'))
      .rejects.toThrow('ยังเทียบกับ BOM ไม่ครบ 2 mark')
  })
})

// MO version (2026-10-09): Rev +1 when printed assembly / part data changes
// after Confirm; History says so in the same entry.
describe('ManufacturingOrderService — MO revision', () => {
  type Part = { part_mark: string; profile: string; length_mm: number; grade: string; qty: number; unit_weight_kg: number }
  const P = (m: string, q = 2): Part => ({ part_mark: m, profile: 'PL25x400', length_mm: 10550, grade: 'SM520', qty: q, unit_weight_kg: 828.17 })
  function make(status: string, revision = 2) {
    const row = { id: 1, qty: '2', part_id: 900, _count: { work_order_parts: 0 }, part: { id: 900, part_mark: 'C-f1', profile: 'PL25x400', grade: 'SM520', length_mm: '10550', weight_kg: '828.17', qty: '4' } }
    const tx = {
      bom_assembly_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.part_id ? [] : [row])) },
      bom_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn().mockResolvedValue({ id: 950 }), findFirst: jest.fn().mockResolvedValue(null) },
      mo_status_history: { create: jest.fn() },
      manufacturing_order: { update: jest.fn() },
      work_order_mark: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 36, mo_code: 'MO-P2600023', status, kind: 'ASSEMBLY', shop_type: 'PRE_SHOP', revision }) },
      mo_assembly_line: { findFirst: jest.fn().mockResolvedValue({ id: 5, mo_id: 36, qty: '2', bom_assembly_id: 700, bom_assembly: { id: 700, assembly_mark: 'BUH1-3', dispatch_id: 14, dispatch: { source: 'PRE_SHOP' } } }) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, { recomputeParts: jest.fn(), recomputeDuration: jest.fn() } as any, {} as any)
    jest.spyOn(svc, 'getAssemblies').mockResolvedValue([] as any)
    return { svc, tx }
  }

  it('a part change on a confirmed MO bumps the Rev and logs it', async () => {
    const { svc, tx } = make('IN_PROGRESS', 2)
    await svc.updatePreshopParts(36, 5, [P('C-f1', 3)], 1, 'tao')
    expect(tx.manufacturing_order.update).toHaveBeenCalledWith({ where: { id: 36 }, data: { revision: { increment: 1 } } })
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe('แก้ part BUH1-3: C-f1 ต่อชุด 2 → 3 · Rev.2 → Rev.3')
  })

  it('a DRAFT MO keeps Rev.0 — nothing is printed for work yet', async () => {
    const { svc, tx } = make('DRAFT', 0)
    await svc.updatePreshopParts(36, 5, [P('C-f1', 3)], 1, 'tao')
    expect(tx.manufacturing_order.update).not.toHaveBeenCalled()
  })
})

// Renamed in the real BOM (2026-10-09): pair the MO mark with its BOM mark
// (suggested, confirmed by the user), parts by a confirmed part map; taking
// the BOM as is links the MO line to the real BOM row under the BOM's names.
describe('ManufacturingOrderService — marks renamed in the real BOM', () => {
  type Part = { part_mark: string; profile: string; length_mm: number; grade: string; qty: number; unit_weight_kg: number }
  const P = (m: string, profile = 'PL25x400', L = 10550, q = 2): Part => ({ part_mark: m, profile, length_mm: L, grade: 'SM520', qty: q, unit_weight_kg: 828.17 })
  const AP = (ps: Part[], base: number) => ps.map((p, i) => ({ id: base + i, qty: String(p.qty), part_id: base + 100 + i, _count: { work_order_parts: 0 }, part: { id: base + 100 + i, part_mark: p.part_mark, profile: p.profile, length_mm: String(p.length_mm), grade: p.grade, weight_kg: String(p.unit_weight_kg) } }))
  const preParts = [P('C-f1'), P('C-wx58', 'PL20x1150', 10550, 1)]
  const bomParts = [P('P100'), P('P101', 'PL20x1150', 10550, 1)]
  const line = { id: 1, bom_assembly_id: 700, qty: '2', line_seq: 0, bom_assembly: { id: 700, assembly_mark: 'BUH1-3', dispatch_id: 14, length_mm: '10550', weight_kg: '3561.15', attributes: {}, dispatch: { source: 'PRE_SHOP' }, assembly_parts: AP(preParts, 7000) } }
  const bomRows = [
    { id: 3002, assembly_mark: 'C1-BUH1-3', qty: '6', length_mm: '10550', weight_kg: '3561.15', assembly_parts: AP(bomParts, 30020) },
    { id: 3009, assembly_mark: 'BUH99', qty: '2', length_mm: '6000', weight_kg: '900', assembly_parts: AP([P('Z1', 'PL6', 80, 1)], 30090) },
  ]
  function make(woMarks: unknown[] = [], woParts: unknown[] = []) {
    const parts = new Map<number, any[]>([[700, line.bom_assembly.assembly_parts], [3002, bomRows[0].assembly_parts]])
    const tx = {
      mo_assembly_line: { update: jest.fn() }, bom_assembly: { update: jest.fn() },
      bom_assembly_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.part_id ? [] : parts.get(where.assembly_id) ?? [])) },
      bom_part: { update: jest.fn(), delete: jest.fn(), create: jest.fn().mockResolvedValue({ id: 950 }), findFirst: jest.fn().mockResolvedValue(null) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(woMarks), updateMany: jest.fn() },
      work_order_part: { findMany: jest.fn().mockResolvedValue(woParts), update: jest.fn(), delete: jest.fn() },
      work_order_event: { create: jest.fn() },
      manufacturing_order: { update: jest.fn() },
      mo_status_history: { create: jest.fn() },
    }
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 46, mo_code: 'MO-P2600023', status: 'IN_PROGRESS', kind: 'ASSEMBLY', shop_type: 'PRE_SHOP', project_id: 3, zone_id: 6, sub_zone_id: null, revision: 1 }) },
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue([line]) },
      bom_dispatch: { findFirst: jest.fn().mockResolvedValue({ id: 28, revision: 1, uploaded_at: new Date() }) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue(bomRows) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    }
    const auto = { recomputeParts: jest.fn(), recomputeDuration: jest.fn() }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, auto as any, {} as any, new PreshopService())
    jest.spyOn(svc as any, 'assertQtyWithinRemaining').mockResolvedValue(undefined)
    return { svc, tx }
  }

  it('suggests the renamed BOM mark with its part pairs', async () => {
    const r = await make().svc.bomCompare(46)
    const row = r.rows[0] as any
    expect(row.status).toBe('not_in_bom')
    expect(row.candidates.map((c: any) => [c.assembly_mark, c.score])).toEqual([['C1-BUH1-3', 100]])
    expect(row.candidates[0].part_pairs).toEqual([{ from: 'C-f1', to: 'P100', how: 'spec' }, { from: 'C-wx58', to: 'P101', how: 'spec' }])
  })

  it('taking the BOM as is links the line to the real BOM row under the BOM names; WO parts follow the part map', async () => {
    const { svc, tx } = make([{ id: 77, work_order_id: 9 }], [{ id: 1, bom_assembly_part_id: 7000, updated_by: 'somchai' }, { id: 2, bom_assembly_part_id: 7001, updated_by: null }])
    await svc.linkBom(46, { dispatch_id: 28, marks: [{ assembly_mark: 'BUH1-3', action: 'apply', pair_with: 3002,
      part_map: [{ from: 'C-f1', to: 'P100' }, { from: 'C-wx58', to: 'P101' }],
      final: { qty: 2, length_mm: 10550, weight_kg: 3561.15, parts: bomParts } }] } as any, 1, 'tao')
    expect(tx.mo_assembly_line.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { bom_assembly_id: 3002, qty: expect.anything() } })
    expect(tx.work_order_part.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { bom_assembly_part_id: 30020 } })
    expect(tx.work_order_part.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { bom_assembly_part_id: 30021 } })
    expect(tx.mo_status_history.create.mock.calls[0][0].data.reason).toBe(
      'เทียบกับ BOM จริง (rev 1): C1-BUH1-3 ชื่อ mark BUH1-3 → C1-BUH1-3 · C1-BUH1-3 ผูกกับ BOM จริง · C1-BUH1-3 C-f1 ชื่อ C-f1 → P100 · C1-BUH1-3 C-wx58 ชื่อ C-wx58 → P101 · Rev.1 → Rev.2')
  })

  it('choosing some own values keeps the MO data but takes the BOM names', async () => {
    const { svc, tx } = make()
    await svc.linkBom(46, { dispatch_id: 28, marks: [{ assembly_mark: 'BUH1-3', action: 'apply', pair_with: 3002,
      part_map: [{ from: 'C-f1', to: 'P100' }, { from: 'C-wx58', to: 'P101' }],
      final: { qty: 2, length_mm: 10600, weight_kg: 3561.15, parts: bomParts } }] } as any, 1, 'tao')
    expect(tx.mo_assembly_line.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ bom_assembly_id: 3002 }) }))
    expect(tx.bom_assembly.update).toHaveBeenCalledWith({ where: { id: 700 }, data: { assembly_mark: 'C1-BUH1-3' } })
    expect(tx.bom_part.update).toHaveBeenCalledWith({ where: { id: 7100 }, data: { part_mark: 'P100' } })
    expect(tx.bom_part.update).toHaveBeenCalledWith({ where: { id: 7101 }, data: { part_mark: 'P101' } })
  })
})

// Complete only when every mark passed QC for its full sets in every
// operation of the MO (2026-10-09, user) — the button shows why not, the API refuses.
describe('ManufacturingOrderService — Complete waits for QC on every operation', () => {
  const OPS = [{ id: 900, sequence: 0, op_code: 'OP-000', name: 'Build-up(Pre-Shop)' }, { id: 101, sequence: 10, op_code: 'OP-FITUP-01', name: 'Fit-Up' }, { id: 102, sequence: 20, op_code: 'OP-WELD-01', name: 'WELDING' }]
  const LINES = [{ bom_assembly_id: 1, qty: '2', bom_assembly: { assembly_mark: 'BUH1-3' } }, { bom_assembly_id: 2, qty: '1', bom_assembly: { assembly_mark: 'BUH1A-12' } }]
  const SEQ: Record<number, number> = { 900: 0, 101: 10, 102: 20 }
  const M = (asm: number, op: number, passed: string | null) => ({ bom_assembly_id: asm, qty_qc_passed: passed, work_order: { source_routing_op_id: op, sequence: SEQ[op] ?? -1 } })
  function make(marks: unknown[], shop = 'PRE_SHOP') {
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 51, mo_code: 'MO-P2600028', status: 'IN_PROGRESS', kind: 'ASSEMBLY', shop_type: shop, routing_template_id: 17 }) },
      mrp_routing_workcenter: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.template?.code ? [OPS[0]] : OPS.slice(1))) },
      mo_assembly_line: { findMany: jest.fn().mockResolvedValue(LINES) },
      work_order_mark: { findMany: jest.fn().mockResolvedValue(marks) },
    }
    const svc = new ManufacturingOrderService(prisma as any, { log: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any, new PreshopService())
    return { svc, prisma }
  }
  const ALL = [M(1, 900, '2'), M(1, 101, '2'), M(1, 102, '1'), M(1, 102, '1'), M(2, 900, '1'), M(2, 101, '1'), M(2, 102, '1')]

  it('nothing short when every mark passed QC in full on every operation (several WOs of one operation add up)', async () => {
    expect(await make(ALL).svc.qcShortfalls(51)).toEqual([])
  })

  it('lists each operation × mark still short, an operation with no WO included, in routing order', async () => {
    const r = await make([M(1, 900, '2'), M(1, 101, '2'), M(1, 102, '1'), M(2, 900, '1'), M(2, 101, null)]).svc.qcShortfalls(51)
    expect(r).toEqual([
      { assembly_mark: 'BUH1A-12', operation: '010 Fit-Up', passed: 0, need: 1 },
      { assembly_mark: 'BUH1-3', operation: '020 WELDING', passed: 1, need: 2 },
      { assembly_mark: 'BUH1A-12', operation: '020 WELDING', passed: 0, need: 1 },
    ])
  })

  // QA review F-002 (2026-10-09): an op re-created in the routing gets a new id — WOs still count by its sequence
  it('matches WOs to operations by sequence, so a re-created operation still counts', async () => {
    const reCreated = ALL.map(m => (m.work_order.source_routing_op_id === 102 ? { ...m, work_order: { source_routing_op_id: 555, sequence: 20 } } : m))
    expect(await make(reCreated).svc.qcShortfalls(51)).toEqual([])
  })

  it('a Full shop MO has no operation 000', async () => {
    const { svc } = make(ALL.filter(m => m.work_order.source_routing_op_id !== 900), 'FULL_SHOP')
    expect(await svc.qcShortfalls(51)).toEqual([])
  })

  it('Complete is refused while anything is short', async () => {
    const { svc } = make([M(1, 900, '2')])
    jest.spyOn(svc, 'bomCompare').mockResolvedValue({ pending: 0 } as any)
    await expect(svc.changeStatus(51, { to_status: 'DONE', reason: 'done', actual_start: '2026-10-09T01:00:00Z', actual_finish: '2026-10-09T05:00:00Z' } as any, 1, 'tao'))
      .rejects.toThrow('ยัง QC ผ่านไม่ครบ: BUH1A-12 · 000 Build-up(Pre-Shop) 0/1, BUH1-3 · 010 Fit-Up 0/2, BUH1A-12 · 010 Fit-Up 0/1, BUH1-3 · 020 WELDING 0/2, BUH1A-12 · 020 WELDING 0/1')
  })
})
