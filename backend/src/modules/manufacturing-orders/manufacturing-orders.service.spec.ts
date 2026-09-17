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
// traveler "Consume" table) shares its formula-evaluation loop with the
// pre-existing getConsumeSummary (MO-wide total) via a private
// computeConsumeByWorkOrder helper — these tests lock in that both the
// per-WO breakdown and the merged MO total come out correct from the same
// underlying computation, across two WOs on different assemblies that both
// consume the same material.
describe('ManufacturingOrderService — Consume Summary (per-WO and MO-wide)', () => {
  function makeConsumeService() {
    const wos = [
      {
        id: 10,
        op_attributes: { activities: [{ source_activity_id: 501 }] },
        bom_assembly: { length_mm: 2000, surface_area_m2: null, weight_kg: null },
      },
      {
        id: 20,
        op_attributes: { activities: [{ source_activity_id: 502 }] },
        bom_assembly: { length_mm: 1000, surface_area_m2: null, weight_kg: null },
      },
    ]
    const consumeRows = [
      {
        activity_id: 501,
        material: { id: 1, default_code: 'MAT1', name: 'Welding Wire' },
        formula: { id: 1, name: 'f1', expr: 'length * 10', result_unit: 'kg' },
      },
      {
        activity_id: 502,
        material: { id: 1, default_code: 'MAT1', name: 'Welding Wire' },
        formula: { id: 2, name: 'f2', expr: 'length * 5', result_unit: 'kg' },
      },
    ]
    const prisma = {
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 1, mo_code: 'MO-0001' }) },
      work_order: { findMany: jest.fn().mockResolvedValue(wos) },
      activity_consume: { findMany: jest.fn().mockResolvedValue(consumeRows) },
    }
    const svc = new ManufacturingOrderService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any)
    return { svc, prisma }
  }

  it('getConsumeSummaryByWorkOrder scopes each WO to its own assembly dimensions (WO 10: length=2m → 20kg; WO 20: length=1m → 5kg)', async () => {
    const { svc } = makeConsumeService()

    const byWo = await svc.getConsumeSummaryByWorkOrder(1)

    expect(byWo.get(10)).toEqual([{ material_id: 1, code: 'MAT1', name: 'Welding Wire', qty: 20, unit: 'kg' }])
    expect(byWo.get(20)).toEqual([{ material_id: 1, code: 'MAT1', name: 'Welding Wire', qty: 5, unit: 'kg' }])
  })

  it('getConsumeSummary merges the same two WOs into one MO-wide total (20kg + 5kg = 25kg)', async () => {
    const { svc } = makeConsumeService()

    const summary = await svc.getConsumeSummary(1)

    expect(summary).toEqual([{ material_id: 1, code: 'MAT1', name: 'Welding Wire', qty: 25, unit: 'kg' }])
  })
})
