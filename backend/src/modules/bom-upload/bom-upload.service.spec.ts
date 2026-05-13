import * as fs from 'fs'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { BomUploadService, FileInput } from './bom-upload.service'
import type { XlsxParserService, ParsedBomFile } from './xlsx-parser.service'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any)
jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined)
jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined)

function makePrisma(overrides: Partial<ReturnType<typeof buildPrisma>> = {}) {
  return { ...buildPrisma(), ...overrides }
}

function buildPrisma() {
  let dispatchIdSeq = 1
  let rowIdSeq = 100

  const dispatch = { id: dispatchIdSeq++, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }

  return {
    $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(buildInnerPrisma(dispatch, rowIdSeq))),
    bom_dispatch: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([makeDispatchRow()]),
      findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
    },
    bom_doc_revision: {
      findMany: jest.fn().mockResolvedValue([makeRevisionRow()]),
    },
    bom_part: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  }
}

function buildInnerPrisma(baseDispatch: any, seq: number) {
  let id = seq
  return {
    bom_dispatch: {
      create: jest.fn().mockResolvedValue({ ...baseDispatch, id: id++ }),
      update: jest.fn(({ data }: any) => Promise.resolve({ ...baseDispatch, ...data })),
    },
    bom_doc_revision: { create: jest.fn().mockResolvedValue({ id: id++ }) },
    bom_assembly: {
      createManyAndReturn: jest.fn(({ data }: any) =>
        Promise.resolve((data as any[]).map((d: any) => ({ id: id++, ...d }))),
      ),
    },
    bom_part: {
      createManyAndReturn: jest.fn(({ data }: any) =>
        Promise.resolve((data as any[]).map((d: any) => ({ id: id++, ...d }))),
      ),
    },
    bom_assembly_part: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  }
}

function makeDispatchRow(overrides: any = {}) {
  return {
    id: 1, project_id: 1, zone_id: 2, sub_zone_id: null,
    status: 'complete', uploaded_at: new Date(),
    assembly_total: 2, part_total: 3,
    zone: { id: 2, code: 'Z1', label: 'Zone 1' },
    sub_zone: null,
    create_user: { id: 1, name: 'Admin' },
    doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }],
    ...overrides,
  }
}

function makeDetailRow() {
  return {
    ...makeDispatchRow(),
    doc_revisions: [
      { id: 10, dispatch_id: 1, doc_type: 'ASSEMBLY_LIST', original_filename: 'assembly_list.xlsx', create_date: new Date(), create_user: { id: 1, name: 'Admin' } },
    ],
    assemblies: [],
    _count: { assemblies: 2, parts: 3 },
  }
}

function makeRevisionRow() {
  return { id: 10, dispatch_id: 1, doc_type: 'ASSEMBLY_LIST', original_filename: 'assembly_list.xlsx', create_date: new Date(), create_user: { id: 1, name: 'Admin' } }
}

function makeStorage(root = '/tmp/storage') {
  return { storageRoot: jest.fn().mockReturnValue(root) }
}

function makeParser(parsed: Partial<ParsedBomFile> = {}): Pick<XlsxParserService, 'parse'> {
  return { parse: jest.fn().mockReturnValue({ ...defaultParsed(), ...parsed }) }
}

function defaultParsed(): ParsedBomFile {
  return {
    docType: 'ASSEMBLY_LIST',
    assemblies: [{ assembly_mark: 'WH-CO-001', name: 'Col A', qty: 1, weight_kg: 500, surface_area_m2: 5 }],
    parts: [],
    assemblyParts: [],
  }
}

function makeSvc(prismaOverrides: any = {}, parserResult: any = {}) {
  return new BomUploadService(
    makePrisma(prismaOverrides) as any,
    makeStorage() as any,
    makeParser(parserResult) as any,
  )
}

function makeFileInput(overrides: Partial<FileInput> = {}): FileInput {
  return {
    buffer: Buffer.from('fake-xlsx-content'),
    originalname: 'assembly_list.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1024,
    docType: 'ASSEMBLY_LIST',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BomUploadService.upload()', () => {
  it('calls $transaction and writes file to storage', async () => {
    const prisma = makePrisma()
    const storage = makeStorage()
    const parser = makeParser()
    const svc = new BomUploadService(prisma as any, storage as any, parser as any)

    await svc.upload([makeFileInput()], 1, 2, null, 99)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1)
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1)
  })

  it('status is "complete" when both assemblies and parts parsed', async () => {
    const innerPrisma = buildInnerPrisma({ id: 1, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }, 100)
    let capturedUpdateData: any
    innerPrisma.bom_dispatch.update = jest.fn(({ data }: any) => {
      capturedUpdateData = data
      return Promise.resolve({ id: 1, ...data })
    })

    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(innerPrisma)),
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(makeDetailRow()) },
      bom_doc_revision: { findMany: jest.fn() },
      bom_part: { findMany: jest.fn().mockResolvedValue([]) },
    }

    const parser = {
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] }
        return { docType, assemblies: [], parts: [{ part_mark: 'P1' }], assemblyParts: [] }
      }),
    }

    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any)
    await svc.upload(
      [makeFileInput({ docType: 'ASSEMBLY_LIST' }), makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' })],
      1, 2, null, 1,
    )

    expect(capturedUpdateData.status).toBe('complete')
  })

  it('status is "partial" when only assemblies uploaded', async () => {
    const innerPrisma = buildInnerPrisma({ id: 1, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }, 200)
    let capturedStatus: string | undefined
    innerPrisma.bom_dispatch.update = jest.fn(({ data }: any) => {
      capturedStatus = data.status
      return Promise.resolve({ id: 1, ...data })
    })

    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(innerPrisma)),
      bom_dispatch: { findUnique: jest.fn().mockResolvedValue(makeDetailRow()) },
      bom_doc_revision: { findMany: jest.fn() },
      bom_part: { findMany: jest.fn().mockResolvedValue([]) },
    }

    const parser = makeParser({ assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] })
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any)
    await svc.upload([makeFileInput()], 1, 2, null, 1)

    expect(capturedStatus).toBe('partial')
  })

  it('rolls back saved files when $transaction throws', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('DB down')),
    }
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any)

    await expect(svc.upload([makeFileInput()], 1, 2, null, 1)).rejects.toThrow('DB down')
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1)
  })

  it('throws BadRequestException when no files provided', async () => {
    const svc = makeSvc()
    await expect(svc.upload([], 1, 2, null, 1)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when file exceeds 50 MB', async () => {
    const svc = makeSvc()
    const big: FileInput = makeFileInput({ size: 51 * 1024 * 1024 })
    await expect(svc.upload([big], 1, 2, null, 1)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when duplicate doc_type provided', async () => {
    const svc = makeSvc()
    await expect(
      svc.upload(
        [makeFileInput({ docType: 'ASSEMBLY_LIST' }), makeFileInput({ docType: 'ASSEMBLY_LIST', originalname: 'assembly_list2.xlsx' })],
        1, 2, null, 1,
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('accepts file with matching .xlsx extension even if MIME is octet-stream', async () => {
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any)
    const f = makeFileInput({ mimetype: 'application/octet-stream', originalname: 'assembly_list.xlsx' })

    // Should NOT throw — extension override
    await expect(svc.upload([f], 1, 2, null, 1)).resolves.toBeDefined()
  })
})

describe('BomUploadService.list()', () => {
  it('returns paginated response with correct shape', async () => {
    const svc = makeSvc()
    const result = await svc.list({ page: 1, limit: 20 })

    expect(result).toMatchObject({ total: 1, page: 1, limit: 20, pages: 1 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toHaveProperty('id')
    expect(result.items[0]).toHaveProperty('zone')
    expect(result.items[0]).toHaveProperty('uploader')
  })

  it('calculates assembly_total and part_total from items', async () => {
    const base = makePrisma()
    const prisma = makePrisma({
      bom_dispatch: {
        ...base.bom_dispatch,
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          makeDispatchRow({ assembly_total: 3, part_total: 5 }),
          makeDispatchRow({ id: 2, assembly_total: 1, part_total: 2 }),
        ]),
      },
    })
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any)
    const result = await svc.list({ page: 1, limit: 20 })

    expect(result.assembly_total).toBe(4)
    expect(result.part_total).toBe(7)
  })

  it('defaults page=1, limit=20 when not provided', async () => {
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any)
    await svc.list({})

    expect(prisma.bom_dispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    )
  })
})

describe('BomUploadService.findOne()', () => {
  it('returns detail DTO with doc_revisions', async () => {
    const svc = makeSvc()
    const result = await svc.findOne(1)

    expect(result).toHaveProperty('id', 1)
    expect(result).toHaveProperty('doc_revisions')
    expect(result.doc_revisions).toHaveLength(1)
    expect(result.doc_revisions[0]).toHaveProperty('doc_type', 'ASSEMBLY_LIST')
    expect(result.doc_revisions[0]).toHaveProperty('uploader')
  })

  it('throws NotFoundException when dispatch not found', async () => {
    const prisma = makePrisma({
      bom_dispatch: { ...makePrisma().bom_dispatch, findUnique: jest.fn().mockResolvedValue(null) },
    })
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any)

    await expect(svc.findOne(999)).rejects.toThrow(NotFoundException)
  })
})

describe('BomUploadService.getRevisions()', () => {
  it('returns revision list', async () => {
    const svc = makeSvc()
    const result = await svc.getRevisions(1)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      doc_type: 'ASSEMBLY_LIST',
      filename: 'assembly_list.xlsx',
    })
    expect(result[0].uploader).toEqual({ id: 1, name: 'Admin' })
  })

  it('throws NotFoundException when dispatch not found', async () => {
    const prisma = makePrisma({
      bom_dispatch: {
        ...makePrisma().bom_dispatch,
        findUnique: jest.fn().mockResolvedValue(null),
      },
    })
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any)

    await expect(svc.getRevisions(999)).rejects.toThrow(NotFoundException)
  })
})
