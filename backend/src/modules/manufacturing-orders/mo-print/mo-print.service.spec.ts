import { ConflictException, NotFoundException } from '@nestjs/common'
import { MoPrintService } from './mo-print.service'

function makeDispatch(overrides: Record<string, any> = {}) {
  return {
    zone_id: 23,
    sub_zone_id: null,
    zone: { id: 23, label: 'BIF Zone 1', project: { id: 6, project_code: 'DBN', name: 'Smash golf driving range Bangna' } },
    sub_zone: null,
    ...overrides,
  }
}

function makeWo(overrides: Record<string, any> = {}) {
  return {
    id: 1398,
    wo_code: 'WO-00000739',
    sequence: 10,
    status: 'NOT_STARTED',
    expected_duration_min: 45,
    setup_time_min: 10,
    bom_assembly_id: 2868,
    mrp_workcenter: { id: 1, name: 'Cutting' },
    // Soft ref → mrp_routing_workcenter.id (the specific routing operation
    // this WO was created from — e.g. "SAW auto weld" — distinct from
    // mrp_workcenter, which is the physical resource/station, e.g.
    // "H-beam Fabrication"). Nullable: older/ad-hoc WOs predate this link.
    source_routing_op_id: 501,
    assigned_to: null,
    // Pre-filtered by the findMany include to the ACTIVE schedule version.
    schedules: [],
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
    manufacturing_order: {
      findUnique: jest.fn().mockResolvedValue({ id: 85, mo_code: 'MO-00014', due_date: null, status: 'CONFIRMED', primary_mark_prefix_code: 'CTR' }),
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
    mrp_routing_workcenter: {
      findMany: jest.fn().mockResolvedValue([{ id: 501, op_code: 'OP-WELD-SAW', name: 'SAW auto weld' }]),
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
    expect(plan.rows[0]).toMatchObject({
      assemblyMark: 'DBN-A1-CTR1',
      workCenterName: 'Cutting',
      qty: 1,
      zoneLabel: 'BIF Zone 1',
      projectName: 'Smash golf driving range Bangna',
    })
    expect(plan.rows[0].drawing.file_key).toBe('drawings/dbn-a1-ctr1-rev1.pdf')
    expect(plan.rows[0].wo).toMatchObject({ expected_duration_min: 45, setup_time_min: 10 })
  })

  it("carries the assembly's name + per-piece weight and the WO's assignee onto each row (for the traveler's Assembly List / Production Time)", async () => {
    const prisma = makePrisma({
      work_order: { findMany: jest.fn().mockResolvedValue([makeWo({ assigned_to: 'somchai' })]) },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0]).toMatchObject({ assemblyName: 'Column A1', assemblyWeightKg: 450, assignedTo: 'somchai' })
  })

  it('defaults assemblyName/assemblyWeightKg/assignedTo to null when the source fields are empty', async () => {
    const prisma = makePrisma({
      work_order: {
        findMany: jest.fn().mockResolvedValue([makeWo({
          bom_assembly: { id: 2868, assembly_mark: 'DBN-A1-CTR1', name: null, weight_kg: null, dispatch: makeDispatch() },
        })]),
      },
    })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0]).toMatchObject({ assemblyName: null, assemblyWeightKg: null, assignedTo: null })
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

  it('leaves planStart/planEnd null for a WO with no schedule rows in the active version', async () => {
    const svc = new MoPrintService(makePrisma() as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.rows[0]).toMatchObject({ planStart: null, planEnd: null })
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

  it("builds the manifest's Mark list — one row per mo_assembly_line (not per WO/operation), with the assembly's dimensions/weight and dispatch project/zone", async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    const plan = await svc.buildPlan(85)

    expect(plan.marks).toEqual([
      {
        seq: 1,
        assemblyMark: 'DBN-A1-CTR1',
        name: 'Column A1',
        projectCode: 'DBN',
        projectName: 'Smash golf driving range Bangna',
        zoneLabel: 'BIF Zone 1',
        subZoneName: null,
        width_mm: 200,
        length_mm: 6000,
        height_mm: 300,
        weight_kg: 450,
        qty: 1,
      },
    ])
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
      bom_assembly: { id: 2868, assembly_mark: 'DBN-A1-CTR1', length_mm: 1000, surface_area_m2: 2, width_mm: 500, dispatch: makeDispatch() },
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

  it('throws NotFoundException when the MO does not exist', async () => {
    const prisma = makePrisma({ manufacturing_order: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    await expect(svc.buildPlan(999)).rejects.toThrow(NotFoundException)
  })

  it('throws ConflictException when the MO has no non-cancelled work orders', async () => {
    const prisma = makePrisma({ work_order: { findMany: jest.fn().mockResolvedValue([]) } })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any, makeMoService() as any)

    await expect(svc.buildPlan(85)).rejects.toThrow(ConflictException)
  })

  it('blocks the whole packet — throws ConflictException naming the WO/mark — when any WO has no matching PDF drawing', async () => {
    const prisma = makePrisma({
      work_order: { findMany: jest.fn().mockResolvedValue([makeWo(), makeWo({ id: 1399, wo_code: 'WO-00000740', sequence: 20 })]) },
    })
    const drawings = makeDrawings({ findByZone: jest.fn().mockResolvedValue([]) })
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any, makeMoService() as any)

    await expect(svc.buildPlan(85)).rejects.toMatchObject({
      message: expect.stringContaining('WO-00000739'),
    })
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

    const bytes = await svc.buildPdf(85)
    const merged = await PDFDocument.load(bytes)

    expect(fileStorage.getObject).toHaveBeenCalledWith('drawings/dbn-a1-ctr1-rev1.pdf')
    expect(fileStorage.getDownloadUrl).not.toHaveBeenCalled()
    // MO page + Assembly Part List page (one assembly) + traveler + drawing.
    expect(merged.getPageCount()).toBe(4)
  })

  it('throws a message naming the WO/drawing when reading a drawing fails', async () => {
    const fileStorage = makeFileStorage({ getObject: jest.fn().mockRejectedValue(new Error('ENOENT')) })
    const svc = new MoPrintService(makePrisma() as any, makeDrawings() as any, fileStorage as any, makeMoService() as any)

    await expect(svc.buildPdf(85)).rejects.toMatchObject({
      message: expect.stringContaining('WO-00000739'),
    })
  })
})
