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

function makeService(mo: unknown, cmpResult: { is_outdated: boolean; delta_types: string[] }) {
  const prisma = {
    manufacturing_order: { findUnique: jest.fn().mockResolvedValue(mo) },
    activity_consume: { findMany: jest.fn().mockResolvedValue([]) },
  }
  const workOrders = {
    compareAssemblyToLatest: jest
      .fn()
      .mockResolvedValue({ ...cmpResult, delta_details: null, latest_dispatch_id: 20 }),
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
})
