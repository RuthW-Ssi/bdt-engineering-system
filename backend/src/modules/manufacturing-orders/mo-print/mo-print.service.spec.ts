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
    bom_assembly_id: 2868,
    mrp_workcenter: { id: 1, name: 'Cutting' },
    bom_assembly: {
      id: 2868,
      assembly_mark: 'DBN-A1-CTR1',
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
      findMany: jest.fn().mockResolvedValue([{ bom_assembly_id: 2868, qty: 1 }]),
    },
    work_order: {
      findMany: jest.fn().mockResolvedValue([makeWo()]),
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

describe('MoPrintService.buildPlan', () => {
  it('returns the MO + one row per non-cancelled WO, matched to its latest PDF drawing', async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any)

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
  })

  it('excludes CANCELLED work orders via the findMany where clause', async () => {
    const prisma = makePrisma()
    const drawings = makeDrawings()
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any)

    await svc.buildPlan(85)

    expect(prisma.work_order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ mo_id: 85, status: { not: 'CANCELLED' } }) }),
    )
  })

  it('throws NotFoundException when the MO does not exist', async () => {
    const prisma = makePrisma({ manufacturing_order: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any)

    await expect(svc.buildPlan(999)).rejects.toThrow(NotFoundException)
  })

  it('throws ConflictException when the MO has no non-cancelled work orders', async () => {
    const prisma = makePrisma({ work_order: { findMany: jest.fn().mockResolvedValue([]) } })
    const svc = new MoPrintService(prisma as any, makeDrawings() as any, makeFileStorage() as any)

    await expect(svc.buildPlan(85)).rejects.toThrow(ConflictException)
  })

  it('blocks the whole packet — throws ConflictException naming the WO/mark — when any WO has no matching PDF drawing', async () => {
    const prisma = makePrisma({
      work_order: { findMany: jest.fn().mockResolvedValue([makeWo(), makeWo({ id: 1399, wo_code: 'WO-00000740', sequence: 20 })]) },
    })
    const drawings = makeDrawings({ findByZone: jest.fn().mockResolvedValue([]) })
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any)

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
    const svc = new MoPrintService(prisma as any, drawings as any, makeFileStorage() as any)

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
    drawingDoc.addPage([200, 200])
    const drawingBytes = Buffer.from(await drawingDoc.save())
    const fileStorage = makeFileStorage({ getObject: jest.fn().mockResolvedValue(drawingBytes) })
    const svc = new MoPrintService(prisma as any, drawings as any, fileStorage as any)

    const bytes = await svc.buildPdf(85)
    const merged = await PDFDocument.load(bytes)

    expect(fileStorage.getObject).toHaveBeenCalledWith('drawings/dbn-a1-ctr1-rev1.pdf')
    expect(fileStorage.getDownloadUrl).not.toHaveBeenCalled()
    // 1 manifest + 1 traveler + 1 drawing page
    expect(merged.getPageCount()).toBe(3)
  })

  it('throws a message naming the WO/drawing when reading a drawing fails', async () => {
    const fileStorage = makeFileStorage({ getObject: jest.fn().mockRejectedValue(new Error('ENOENT')) })
    const svc = new MoPrintService(makePrisma() as any, makeDrawings() as any, fileStorage as any)

    await expect(svc.buildPdf(85)).rejects.toMatchObject({
      message: expect.stringContaining('WO-00000739'),
    })
  })
})
