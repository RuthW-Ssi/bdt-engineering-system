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
