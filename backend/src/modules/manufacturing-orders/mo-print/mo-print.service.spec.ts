import { ConflictException, NotFoundException } from '@nestjs/common'
import { MoPrintService } from './mo-print.service'

function makeDispatch(overrides: Record<string, any> = {}) {
  return {
    zone_id: 23,
    sub_zone_id: null,
    source: 'BOM_UPLOAD',
    revision: 1,
    zone: { id: 23, label: 'BIF Zone 1', project: { id: 6, project_code: 'DBN', name: 'Smash golf driving range Bangna' } },
    sub_zone: null,
    ...overrides,
  }
}

// One work_order_mark row (the new junction table, 2026-09-17 multi-mark
// redesign) — a WO's findMany include pre-filters these to non-removed
// only, so every mark a test hands back here is assumed printable.
function makeMark(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    bom_assembly_id: 2868,
    bom_assembly: {
      id: 2868,
      assembly_mark: 'DBN-A1-CTR1',
      name: 'Column A1',
      weight_kg: 450,
      dispatch: makeDispatch(),
    },
    ...overrides,
  }
}

function makeWo(overrides: Record<string, any> = {}) {
  return {
    id: 1398,
    wo_code: 'WO-00000739',
    created_at: new Date('2026-09-20T00:00:00Z'),
    sequence: 10,
    status: 'NOT_STARTED',
    expected_duration_min: 45,
    setup_time_min: 10,
    mrp_workcenter: { id: 1, name: 'Cutting' },
    // Soft ref → mrp_routing_workcenter.id (the specific routing operation
    // this WO was created from — e.g. "SAW auto weld" — distinct from
    // mrp_workcenter, which is the physical resource/station, e.g.
    // "H-beam Fabrication"). Nullable: older/ad-hoc WOs predate this link.
    source_routing_op_id: 501,
    assigned_to: null,
    subcontractor: null,
    plan_start: null,
    plan_finish: null,
    // Pre-filtered by the findMany include to the ACTIVE schedule version.
    schedules: [],
    // One mark by default — a WO now spans a marks[] array (multi-mark
    // redesign), but most tests here only care about the single-mark case.
    marks: [makeMark()],
    ...overrides,
  }
}

function makeMoLine(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    mo_id: 85,
    bom_assembly_id: 2868,
    qty: 1,
    line_seq: 0,
    bom_assembly: {
      id: 2868,
      assembly_mark: 'DBN-A1-CTR1',
      name: 'Column A1',
      width_mm: 200,
      length_mm: 6000,
      height_mm: 300,
      weight_kg: 450,
      assembly_parts: [],
      dispatch: makeDispatch(),
    },
    ...overrides,
  }
}

function makePdfDrawing(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    file_key: 'drawings/dbn-a1-ctr1-rev1.pdf',
    file_name: 'DBN-A1-CTR1 - - Rev 1.pdf',
    version: 1,
    create_date: '2026-09-14T00:00:00Z',
    ...overrides,
  }
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    mo_status_history: { findMany: jest.fn().mockResolvedValue([]) },
    mo_print_log: { create: jest.fn() },
    manufacturing_order: {
      findUnique: jest.fn().mockResolvedValue({ id: 85, mo_code: 'MO-00014', plan_start: null, plan_finish: null, actual_start: null, actual_finish: null, status: 'CONFIRMED', primary_mark_prefix_code: 'CTR', revision: 0, routing_template_id: 17 }),
    },
    mo_assembly_line: {
      findMany: jest.fn().mockResolvedValue([makeMoLine()]),
    },
    work_order: {
      findMany: jest.fn().mockResolvedValue([makeWo()]),
    },
    activity: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    // Called two ways: getRoutingOps' template-snapshot lookup (where.template_id)
    // and its resolve-labels-for-existing-WOs lookup (where.id.in) — the
    // template op below shares makeWo()'s default sequence (10) + source_
    // routing_op_id (501) so it's recognized as "already has a WO" by
    // default and existing tests don't get a spurious extra routingOps row.
    mrp_routing_workcenter: {
      findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(
        where?.template_id != null
          ? [{ sequence: 10, op_code: 'OP-WELD-SAW', name: 'SAW auto weld', workcenter: { name: 'Cutting' } }]
          : [{ id: 501, op_code: 'OP-WELD-SAW', name: 'SAW auto weld' }],
      )),
    },
    ...overrides,
  }
}

function makeDrawings(overrides: Record<string, any> = {}) {
  return {
    findByZone: jest.fn().mockResolvedValue([makePdfDrawing()]),
    ...overrides,
  }
}

function makeFileStorage(overrides: Record<string, any> = {}) {
  return {
    getDownloadUrl: jest.fn().mockResolvedValue('https://storage.example/signed-url'),
    getObject: jest.fn().mockResolvedValue(Buffer.from('')),
    ...overrides,
  }
}

function makeMoService(overrides: Record<string, any> = {}) {
  return {
    getConsumeSummaryByWorkOrder: jest.fn().mockResolvedValue(new Map([
      [1398, [{ material_id: 1, code: 'BIF81100052', name: 'ลวดเชื่อม SAW 2.4 mm', qty: 29.94, unit: 'kg' }]],
    ])),
    ...overrides,
  }
}

describe('MoPrintService.buildPlan', () => {
  it('returns the MO + one row per non-cancelled WO, matched to its latest PDF drawing', async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.mo.mo_code).toBe('MO-00014')
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]).toMatchObject({ workCenterName: 'Cutting' })
    expect(plan.rows[0].marks).toEqual([{
      assemblyMark: 'DBN-A1-CTR1', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'Column A1', qty: 1, weight_kg: 450,
      // version + upload date (2026-10-05, print option A) — stamped on the
      // drawing page and compared against the WO's own create_date.
      drawing: { file_key: 'drawings/dbn-a1-ctr1-rev1.pdf', file_name: 'DBN-A1-CTR1 - - Rev 1.pdf', version: 1, uploaded_at: new Date('2026-09-14T00:00:00Z') },
    }])
    expect(plan.rows[0].wo).toMatchObject({ expected_duration_min: 45, setup_time_min: 10, created_at: new Date('2026-09-20T00:00:00Z') })
  })

  it("carries the assembly's name + per-piece weight onto its mark row, and the WO's assignee onto the row itself (for the traveler's Assembly List / Production Time)", async () => {
    const prisma = makePrisma({
      work_order: { findMany: jest.fn().mockResolvedValue([makeWo({ assigned_to: 'somchai' })]) },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0].marks[0]).toMatchObject({ name: 'Column A1', weight_kg: 450 })
    expect(plan.rows[0]).toMatchObject({ assignedTo: 'somchai' })
  })

  it('defaults a mark row\'s name/weight_kg and the row\'s assignedTo to null when the source fields are empty', async () => {
    const prisma = makePrisma({
      work_order: {
        findMany: jest.fn().mockResolvedValue([makeWo({
          marks: [makeMark({ bom_assembly: { id: 2868, assembly_mark: 'DBN-A1-CTR1', name: null, weight_kg: null, dispatch: makeDispatch() } })],
        })]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0].marks[0]).toMatchObject({ name: null, weight_kg: null })
    expect(plan.rows[0]).toMatchObject({ assignedTo: null })
  })

  it("takes each row's plan window from its schedule rows in the ACTIVE schedule version only — earliest start, latest end", async () => {
    const prisma = makePrisma({
      work_order: {
        findMany: jest.fn().mockResolvedValue([makeWo({
          schedules: [
            { start_datetime: new Date('2026-09-17T03:00:00Z'), end_datetime: new Date('2026-09-17T05:00:00Z') },
            { start_datetime: new Date('2026-09-17T01:00:00Z'), end_datetime: new Date('2026-09-17T02:00:00Z') },
          ],
        })]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0].planStart).toEqual(new Date('2026-09-17T01:00:00Z'))
    expect(plan.rows[0].planEnd).toEqual(new Date('2026-09-17T05:00:00Z'))
    expect(prisma.work_order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        schedules: expect.objectContaining({ where: { prod_schedule_version: { is_active: true } } }),
      }),
    }))
  })

  it('leaves planStart/planEnd null for a WO with no schedule rows AND no plan_start/plan_finish of its own', async () => {
    const svc = new MoPrintService(makePrisma() as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0]).toMatchObject({ planStart: null, planEnd: null })
  })

  // 2026-09-22 fix — user: "เอา plan start plan finish มาใส่ใน pdf ด้วย".
  // A WO's own plan_start/plan_finish (set at Create WO time) used to be
  // ignored here entirely — only the separate production-scheduling
  // feature's rows populated this cell, so it printed blank for any WO
  // that had never been placed on an active schedule version even though
  // it had perfectly good plan dates of its own.
  it("falls back to the WO's own plan_start/plan_finish when it has no schedule rows", async () => {
    const prisma = makePrisma({
      work_order: {
        findMany: jest.fn().mockResolvedValue([makeWo({
          plan_start: new Date('2026-09-23T22:36:00Z'),
          plan_finish: new Date('2026-09-25T22:36:00Z'),
        })]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0].planStart).toEqual(new Date('2026-09-23T22:36:00Z'))
    expect(plan.rows[0].planEnd).toEqual(new Date('2026-09-25T22:36:00Z'))
  })

  it('prefers the active schedule window over plan_start/plan_finish when both exist', async () => {
    const prisma = makePrisma({
      work_order: {
        findMany: jest.fn().mockResolvedValue([makeWo({
          plan_start: new Date('2026-09-23T22:36:00Z'),
          plan_finish: new Date('2026-09-25T22:36:00Z'),
          schedules: [
            { start_datetime: new Date('2026-09-17T01:00:00Z'), end_datetime: new Date('2026-09-17T05:00:00Z') },
          ],
        })]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0].planStart).toEqual(new Date('2026-09-17T01:00:00Z'))
    expect(plan.rows[0].planEnd).toEqual(new Date('2026-09-17T05:00:00Z'))
  })

  it("prefers the WO's team (subcontractor) over the legacy assigned_to free-text when both exist", async () => {
    const prisma = makePrisma({
      work_order: {
        findMany: jest.fn().mockResolvedValue([makeWo({
          assigned_to: 'Some old free-text value',
          subcontractor: { name: 'Subcontractor Fabrication A (Beam)' },
        })]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0].assignedTo).toBe('Subcontractor Fabrication A (Beam)')
  })

  it("attaches each row's own share of consume (ManufacturingOrderService.getConsumeSummaryByWorkOrder), keyed by that WO's id", async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()
    const moService = makeMoService()
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, moService as any)

    const plan = await svc.buildPlan(85)

    expect(moService.getConsumeSummaryByWorkOrder).toHaveBeenCalledWith(85)
    expect(plan.rows[0].consume).toEqual([
      { material_id: 1, code: 'BIF81100052', name: 'ลวดเชื่อม SAW 2.4 mm', qty: 29.94, unit: 'kg' },
    ])
  })

  it("defaults a row's consume to [] when getConsumeSummaryByWorkOrder has no entry for that WO's id", async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()
    const moService = makeMoService({ getConsumeSummaryByWorkOrder: jest.fn().mockResolvedValue(new Map()) })
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, moService as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0].consume).toEqual([])
  })

  // Assembly Part List: one group per mo_assembly_line (line_seq order),
  // its bom_parts listed beneath — replaces the flat, MO-wide
  // part-aggregated list (ManufacturingOrderService.getParts) the packet
  // used to print (2026-09-16).
  it("groups each assembly line's parts under it — part qty = assembly-part qty × line qty, weight = part weight × that qty", async () => {
    const part = (id: number, part_mark: string, weight_kg: number | null) => ({
      id, part_mark, profile: 'PIPE113.5X2.4', grade: 'HSS550', weight_kg,
    })
    const prisma = makePrisma({
      mo_assembly_line: {
        findMany: jest.fn().mockResolvedValue([
          makeMoLine({
            line_seq: 0, bom_assembly_id: 2868, qty: 2,
            bom_assembly: {
              id: 2868, assembly_mark: 'DBN-B1-CTR1', name: 'COLUMN', weight_kg: 450, dispatch: makeDispatch(),
              assembly_parts: [
                { qty: 14, sequence: 1, part: part(1, 'DBN-B1-m65', 11.96) },
                { qty: 1, sequence: 2, part: part(2, 'DBN-B1-m66', null) },
              ],
            },
          }),
          makeMoLine({
            id: 2, line_seq: 1, bom_assembly_id: 2869, qty: 1,
            bom_assembly: { id: 2869, assembly_mark: 'DBN-B1-CTR2', name: null, weight_kg: null, dispatch: makeDispatch(), assembly_parts: [] },
          }),
        ]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.assemblyParts).toEqual([
      {
        assemblyMark: 'DBN-B1-CTR1', name: 'COLUMN', qty: 2,
        parts: [
          { part_mark: 'DBN-B1-m65', profile: 'PIPE113.5X2.4', grade: 'HSS550', qty: 28, weight_kg: expect.closeTo(334.88, 5) },
          { part_mark: 'DBN-B1-m66', profile: 'PIPE113.5X2.4', grade: 'HSS550', qty: 2, weight_kg: null },
        ],
      },
      // An assembly with no parts still gets its group, so the list reads
      // as complete.
      { assemblyMark: 'DBN-B1-CTR2', name: null, qty: 1, parts: [] },
    ])
  })

  it("loads each line's assembly_parts (with the part, in sequence order) in the same mo_assembly_line query", async () => {
    const prisma = makePrisma()
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    await svc.buildPlan(85)

    expect(prisma.mo_assembly_line.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        bom_assembly: {
          include: expect.objectContaining({
            assembly_parts: { include: { part: true }, orderBy: { sequence: 'asc' } },
          }),
        },
      },
    }))
  })

  it("builds the manifest's Mark list — one row per mo_assembly_line (not per WO/operation), with the assembly's dimensions/weight", async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.marks).toEqual([
      {
        seq: 1,
        assemblyMark: 'DBN-A1-CTR1',
        sourceLabel: 'BOM rev 1',
        renamedFrom: null,
        name: 'Column A1',
        width_mm: 200,
        length_mm: 6000,
        height_mm: 300,
        weight_kg: 450,
        qty: 1,
      },
    ])
  })

  // 2026-09-22: "เอา project zone ออกจาก assembly แล้วเอาไปไว้ตรง mo info
  // แทน" — dispatch project/zone moved off each Mark-list row (repeated
  // identically on every one, since an MO is scoped to one project+zone at
  // create time) onto plan.mo itself instead, derived from the first line.
  it("puts the dispatch project/zone on plan.mo instead, derived from the MO's first assembly line", async () => {
    const svc = new MoPrintService(makePrisma() as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.mo).toMatchObject({
      projectCode: 'DBN',
      projectName: 'Smash golf driving range Bangna',
      zoneLabel: 'BIF Zone 1',
      subZoneName: null,
    })
  })

  it('carries a sub-zone name through onto plan.mo when the first line has one', async () => {
    const prisma = makePrisma({
      mo_assembly_line: {
        findMany: jest.fn().mockResolvedValue([
          makeMoLine({ bom_assembly: { id: 2868, assembly_mark: 'DBN-A1-CTR1', name: 'Column A1', width_mm: 200, length_mm: 6000, height_mm: 300, weight_kg: 450, assembly_parts: [], dispatch: makeDispatch({ sub_zone_id: 9, sub_zone: { id: 9, name: 'North Bay' } }) } }),
        ]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.mo).toMatchObject({ zoneLabel: 'BIF Zone 1', subZoneName: 'North Bay' })
  })

  it('leaves plan.mo project/zone null for an MO with no assembly lines at all', async () => {
    const prisma = makePrisma({ mo_assembly_line: { findMany: jest.fn().mockResolvedValue([]) } })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.mo).toMatchObject({ projectCode: null, projectName: null, zoneLabel: null, subZoneName: null })
  })

  it('numbers Mark-list rows by their line_seq order, not insertion order, and carries a null dimension through as null', async () => {
    const prisma = makePrisma({
      mo_assembly_line: {
        findMany: jest.fn().mockResolvedValue([
          makeMoLine({ line_seq: 1, bom_assembly_id: 2869, qty: 2, bom_assembly: { id: 2869, assembly_mark: 'DBN-A1-CTR2', name: null, width_mm: null, length_mm: 3000, height_mm: 200, weight_kg: 100, assembly_parts: [], dispatch: makeDispatch() } }),
        ]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.marks[0]).toMatchObject({ seq: 1, assemblyMark: 'DBN-A1-CTR2', name: null, width_mm: null, qty: 2 })
  })

  // MO type / Rev / mark source ride inside the existing print cells (2026-10-09)
  it('tells the print where each mark comes from, which marks the current Rev renamed, and that pre-shop data remains', async () => {
    const prisma = makePrisma({
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 85, mo_code: 'MO-P2600023', status: 'CONFIRMED', shop_type: 'PRE_SHOP', revision: 3, routing_template_id: 17 }) },
      mo_status_history: { findMany: jest.fn().mockResolvedValue([
        { reason: 'เพิ่มข้อมูลจาก Dispatch Note: X1 ชุด 2 → 3 · Rev.1 → Rev.2' },
        { reason: 'เทียบกับ BOM จริง (rev 1): C1-BUH1-3 ชื่อ mark BUH1-3 → C1-BUH1-3 · C1-BUH1-3 ผูกกับ BOM จริง · Rev.2 → Rev.3' },
      ]) },
      mo_assembly_line: {
        findMany: jest.fn().mockResolvedValue([
          makeMoLine({ line_seq: 1, bom_assembly_id: 1, qty: 2, bom_assembly: { id: 1, assembly_mark: 'C1-BUH1-3', name: null, width_mm: null, length_mm: 6000, height_mm: null, weight_kg: 100, assembly_parts: [], dispatch: makeDispatch() } }),
          makeMoLine({ line_seq: 2, bom_assembly_id: 2, qty: 1, bom_assembly: { id: 2, assembly_mark: 'X1', name: null, width_mm: null, length_mm: 3000, height_mm: null, weight_kg: 50, assembly_parts: [], dispatch: makeDispatch({ source: 'PRE_SHOP', revision: 0 }) } }),
        ]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.mo).toMatchObject({ shop_type: 'PRE_SHOP', revision: 3, preshopRemaining: true })
    expect(plan.marks.map(m => [m.assemblyMark, m.sourceLabel, m.renamedFrom])).toEqual([['C1-BUH1-3', 'BOM rev 1', 'BUH1-3'], ['X1', 'Pre-shop', null]])
  })

  it("resolves each row's routing-operation label (op_code — name) from its source_routing_op_id snapshot, batched into one findMany", async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(prisma.mrp_routing_workcenter.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [501] } } }))
    expect(plan.rows[0].operationLabel).toBe('OP-WELD-SAW — SAW auto weld')
  })

  it("defaults a row's operationLabel to null when its WO has no source_routing_op_id (ad-hoc/legacy WO)", async () => {
    const prisma = makePrisma({
      work_order: { findMany: jest.fn().mockResolvedValue([makeWo({ source_routing_op_id: null })]) },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0].operationLabel).toBeNull()
  })

  it("computes each row's per-activity time breakdown via the shared computeActivityDuration, from the WO's op_attributes.activities snapshot", async () => {
    const wo = makeWo({
      op_attributes: {
        activities: [
          { name: 'Setup — Beam @ WC-HBEAM', source_activity_id: 501 },
          { name: 'H-beam assembly & SAW weld', source_activity_id: 502 },
          { name: 'Undocumented step', source_activity_id: null },
        ],
      },
      marks: [makeMark({
        bom_assembly: { id: 2868, assembly_mark: 'DBN-A1-CTR1', length_mm: 1000, surface_area_m2: 2, width_mm: 500, dispatch: makeDispatch() },
      })],
    })
    const activityFindMany = jest.fn().mockResolvedValue([
      { id: 501, formula_code: null, per_minute: null, duration_min: 15, kind: 'setup' },
      { id: 502, formula_code: 'weld_length_mm', per_minute: 100, duration_min: 0, kind: 'run' },
    ])
    const prisma = makePrisma({ work_order: { findMany: jest.fn().mockResolvedValue([wo]) }, activity: { findMany: activityFindMany } })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(activityFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [501, 502] } } }))
    expect(plan.rows[0].activities).toEqual([
      { name: 'Setup — Beam @ WC-HBEAM', kind: 'setup', minutes: 15, unresolved: false },
      { name: 'H-beam assembly & SAW weld', kind: 'run', minutes: 10, unresolved: false }, // 1000mm / 100 per_minute
      { name: 'Undocumented step', kind: 'run', minutes: 0, unresolved: true },
    ])
  })

  it('excludes CANCELLED work orders via the findMany where clause', async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    await svc.buildPlan(85)

    expect(prisma.work_order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ mo_id: 85, status: { not: 'CANCELLED' } }) }),
    )
  })

  // 2026-09-22: "ทำไม routing ในหน้าแรกไม่แสดง" — a selective print
  // (workOrderIds narrowing `rows` down to a subset) used to leave the
  // Routing checklist looking just as narrow, since it was derived FROM
  // `rows`. routingOps is now its own query, unfiltered by workOrderIds.
  it("computes routingOps from every non-cancelled WO, not narrowed by workOrderIds the way rows is", async () => {
    const prisma = makePrisma({
      work_order: {
        findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(
          where?.id
            ? [makeWo({ id: 1, wo_code: 'WO-1', sequence: 10 })]
            : [makeWo({ id: 1, wo_code: 'WO-1', sequence: 10 }), makeWo({ id: 2, wo_code: 'WO-2', sequence: 20 })],
        )),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85, [1])

    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0].wo.wo_code).toBe('WO-1')
    expect(plan.routingOps.map(op => op.sequence)).toEqual([10, 20])
  })

  // 2026-09-22 bug repro: a freshly CONFIRMED MO (MO-00011) has zero work
  // orders until "Create Work Order" is used — routingOps was querying
  // work_order alone, so a brand-new MO printed a completely blank Routing
  // checklist even though its routing template has planned operations.
  it("seeds routingOps from the routing template's own operations when the MO has zero work orders yet, with empty woCodes", async () => {
    const prisma = makePrisma({
      work_order: { findMany: jest.fn().mockResolvedValue([]) },
      mrp_routing_workcenter: {
        findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(
          where?.template_id != null
            ? [
                { sequence: 10, op_code: 'OP-FITUP', name: 'Fit-up members', workcenter: { name: 'Welding (manual)' } },
                { sequence: 20, op_code: 'OP-WELD-MAG', name: 'MIG/MAG welding', workcenter: { name: 'Welding (manual)' } },
              ]
            : [],
        )),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.routingOps).toEqual([
      { sequence: 10, operationLabel: 'OP-FITUP — Fit-up members', workCenterName: 'Welding (manual)', woCodes: [] },
      { sequence: 20, operationLabel: 'OP-WELD-MAG — MIG/MAG welding', workCenterName: 'Welding (manual)', woCodes: [] },
    ])
  })

  it('does not duplicate an operation that already has a WO with a second "planned only" row from the template', async () => {
    const plan = await new MoPrintService(makePrisma() as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any).buildPlan(85)

    // makePrisma()'s default template op (sequence 10) matches the default
    // WO's own sequence — must collapse to one row, not two.
    expect(plan.routingOps).toHaveLength(1)
    expect(plan.routingOps[0].woCodes).toEqual(['WO-00000739'])
  })

  it('skips the routingOps query entirely when includeManifest is false', async () => {
    const prisma = makePrisma()
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85, undefined, false)

    expect(plan.routingOps).toEqual([])
  })

  it('throws NotFoundException when the MO does not exist', async () => {
    const prisma = makePrisma({ manufacturing_order: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    await expect(svc.buildPlan(999)).rejects.toThrow(NotFoundException)
  })

  it('2026-09-21: does NOT throw when the MO has no non-cancelled work orders as long as the MO overview page is included (default) — "just the MO" is now a valid print', async () => {
    const prisma = makePrisma({ work_order: { findMany: jest.fn().mockResolvedValue([]) } })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows).toEqual([])
  })

  it('2026-09-21: throws ConflictException when there are no work orders AND the MO overview page was explicitly excluded — nothing left to print', async () => {
    const prisma = makePrisma({ work_order: { findMany: jest.fn().mockResolvedValue([]) } })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    await expect(svc.buildPlan(85, undefined, false)).rejects.toThrow(ConflictException)
  })

  // 2026-10-07 (user: "ในกรณีที่ไม่มี drawing ก็ print ได้"): used to block the
  // whole packet — a pre-shop MO has no shop drawing yet. A mark with no PDF
  // drawing still lists on its traveler; it just gets no drawing page.
  it('still prints when a mark has no PDF drawing — the mark keeps its row, drawing is null', async () => {
    const prisma = makePrisma({
      work_order: { findMany: jest.fn().mockResolvedValue([makeWo(), makeWo({ id: 1399, wo_code: 'WO-00000740', sequence: 20 })]) },
    })
    const drawings = makeDrawings({ findByZone: jest.fn().mockResolvedValue([]) })
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)
    expect(plan.rows.map(r => r.wo.wo_code)).toEqual(['WO-00000739', 'WO-00000740'])
    expect(plan.rows[0].marks).toEqual([expect.objectContaining({ assemblyMark: 'DBN-A1-CTR1', drawing: null })])
  })

  // 2026-10-05 (print option A): used to 409 — the zone's newest batch held
  // only another mark, so the old zone-latest rule found nothing.
  it("prints the mark's own newest drawing when the zone's latest upload batch skipped that mark", async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings({
      findByZone: jest.fn().mockResolvedValue([
        makePdfDrawing({ id: 1, version: 1 }),
        makePdfDrawing({ id: 2, version: 2, file_key: 'drawings/dbn-a1-str1.pdf', file_name: 'DBN-A1-STR1 - - Rev 1.pdf', create_date: '2026-10-02T00:00:00Z' }),
      ]),
    })
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0].marks[0].drawing).toMatchObject({ file_key: 'drawings/dbn-a1-ctr1-rev1.pdf', version: 1 })
  })

  it('fetches a zone\'s drawings only once even when multiple WOs share the same zone', async () => {
    const prisma = makePrisma({
      work_order: {
        findMany: jest.fn().mockResolvedValue([makeWo(), makeWo({ id: 1399, wo_code: 'WO-00000740', sequence: 20 })]),
      },
    })
    const drawings = makeDrawings()
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows).toHaveLength(2)
    expect(drawings.findByZone).toHaveBeenCalledTimes(1)
  })

  // Multi-mark redesign (2026-09-17): a WO is now per-operation and spans
  // marks[] (work_order_mark), not a single bom_assembly. One Assembly-List
  // row per non-removed mark, reusing the exact same per-assembly field
  // mapping for each. Drawing/Activities are a stopgap resolved once per WO
  // from its first mark only (deferred multi-mark print redesign).
  // 2026-09-21 correction: "ทุก assembly ต้องรวมอยู่ใน wo เดียวกัน" — a
  // multi-mark WO used to produce one row (one traveler page) PER mark;
  // now every mark on the WO collapses into ONE row's marks[] array, so it
  // prints as a single traveler page listing every mark together.
  it('produces ONE row for a multi-mark WO, with every mark listed in that row\'s marks[]', async () => {
    const secondAssembly = { id: 2869, assembly_mark: 'DBN-A1-CTR2', name: 'Column A2', weight_kg: 220, dispatch: makeDispatch() }
    const prisma = makePrisma({
      mo_assembly_line: {
        findMany: jest.fn().mockResolvedValue([
          makeMoLine({ bom_assembly_id: 2868, qty: 1 }),
          makeMoLine({ id: 2, line_seq: 1, bom_assembly_id: 2869, qty: 3 }),
        ]),
      },
      work_order: {
        findMany: jest.fn().mockResolvedValue([makeWo({
          marks: [makeMark(), makeMark({ id: 2, bom_assembly_id: 2869, bom_assembly: secondAssembly })],
        })]),
      },
    })
    // Each mark needs its own matching drawing now (2026-09-22) — the
    // default makeDrawings() only has one, for DBN-A1-CTR1.
    const drawings = makeDrawings({
      findByZone: jest.fn().mockResolvedValue([
        makePdfDrawing(),
        makePdfDrawing({ id: 2, file_key: 'drawings/dbn-a1-ctr2-rev1.pdf', file_name: 'DBN-A1-CTR2 - - Rev 1.pdf' }),
      ]),
    })
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0].marks).toEqual([
      { assemblyMark: 'DBN-A1-CTR1', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'Column A1', qty: 1, weight_kg: 450, drawing: expect.objectContaining({ file_key: 'drawings/dbn-a1-ctr1-rev1.pdf', file_name: 'DBN-A1-CTR1 - - Rev 1.pdf' }) },
      { assemblyMark: 'DBN-A1-CTR2', sourceLabel: 'BOM rev 1', renamedFrom: null, name: 'Column A2', qty: 3, weight_kg: 220, drawing: expect.objectContaining({ file_key: 'drawings/dbn-a1-ctr2-rev1.pdf', file_name: 'DBN-A1-CTR2 - - Rev 1.pdf' }) },
    ])
  })

  it('skips a WO with zero non-removed marks — produces no row for it, without throwing', async () => {
    const prisma = makePrisma({
      work_order: { findMany: jest.fn().mockResolvedValue([makeWo({ marks: [] })]) },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows).toEqual([])
  })
})

describe('MoPrintService.buildPdf', () => {
  it("reads each row's drawing bytes via FileStorageService.getObject (never getDownloadUrl — that's browser-facing and 401s on a server-to-server call against the local driver) and returns a merged PDF", async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()

    const { PDFDocument } = await import('pdf-lib')
    const drawingDoc = await PDFDocument.create()
    // A page with zero draw calls has no /Contents stream at all, which the
    // print builder's Shop Drawing Preview (doc.embedPage()) rejects.
    drawingDoc.addPage([200, 200]).drawLine({ start: { x: 0, y: 0 }, end: { x: 200, y: 200 } })
    const drawingBytes = Buffer.from(await drawingDoc.save())
    const fileStorage = makeFileStorage({ getObject: jest.fn().mockResolvedValue(drawingBytes) })
    const svc = new MoPrintService(prisma as any, drawings as any, fileStorage as any, makeMoService() as any)

    const bytes = await svc.buildPdf(85, undefined, true, 'en', 'tao')
    const merged = await PDFDocument.load(bytes)
    expect(prisma.mo_print_log.create).toHaveBeenCalledWith({ data: { mo_id: 85, revision: 0, wo_ids: [1398], include_manifest: true, printed_by: 'tao' } })

    expect(fileStorage.getObject).toHaveBeenCalledWith('drawings/dbn-a1-ctr1-rev1.pdf')
    expect(fileStorage.getDownloadUrl).not.toHaveBeenCalled()
    // MO page + Assembly Part List page (one assembly) + traveler + drawing.
    expect(merged.getPageCount()).toBe(4)
  })

  // Print log (2026-10-09): which Rev went on paper, so the MO page can warn about old paper.
  it('logs the Rev, WOs and who printed once the packet is built, and puts the Rev in the QR link', async () => {
    const prisma = makePrisma({
      manufacturing_order: { findUnique: jest.fn().mockResolvedValue({ id: 85, mo_code: 'MO-P2600023', status: 'CONFIRMED', revision: 3, routing_template_id: 17 }) },
      mo_print_log: { create: jest.fn() },
    })
    const fileStorage = makeFileStorage({ getObject: jest.fn().mockRejectedValue(new Error('ENOENT')) })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, fileStorage as any, makeMoService() as any)
    const plan = await svc.buildPlan(85)
    expect(plan.rows[0].woUrl).toMatch(/\/order\/wo\/1398\?rev=3$/)

    await expect(svc.buildPdf(85, undefined, true, 'en', 'tao')).rejects.toThrow()
    expect(prisma.mo_print_log.create).not.toHaveBeenCalled() // nothing printed, nothing logged
  })

  it('throws a message naming the WO/drawing when reading a drawing fails', async () => {
    const fileStorage = makeFileStorage({ getObject: jest.fn().mockRejectedValue(new Error('ENOENT')) })
    const svc = new MoPrintService(makePrisma() as any, makeDrawings() as any, fileStorage as any, makeMoService() as any)

    await expect(svc.buildPdf(85)).rejects.toMatchObject({
      message: expect.stringContaining('WO-00000739'),
    })
  })
})
