import { BadRequestException, ConflictException, NotFoundException, Logger } from '@nestjs/common'
import { BomUploadService, FileInput, NcFileInput, findMismatchedJunctions, requiresNcFile } from './bom-upload.service'
import { BomDiffService } from './bom-diff.service'
import * as XLSX from 'xlsx'
import type { XlsxParserService, ParsedBomFile } from './xlsx-parser.service'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// `upload()`'s pre-transaction key-building step reads project/zone/sub-zone
// codes for the new GCS-shaped storage key — every prisma mock in this file
// that reaches that code path needs these, matching the zone_id=2/
// sub_zone_id=null the fixtures below use everywhere.
function zoneMocks() {
  return {
    project_zone: {
      findUnique: jest.fn().mockResolvedValue({ code: 'Z1', project_id: 1, project: { project_code: 'TEST' } }),
    },
    sub_zone: {
      findUnique: jest.fn().mockResolvedValue({ code: 'SZ1', zone_id: 2 }),
    },
  }
}

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
      findMany: jest.fn((args: any = {}) => {
        // findOne()'s revision-map lookup: where.id.in + select.revision
        if (args?.where?.id?.in && args?.select?.revision) {
          return Promise.resolve([{ id: 1, revision: 1 }])
        }
        // BomDiffService.resolveEffectiveGroup: where.id has lte/lt, doc_revisions selected
        if (args?.where?.id?.lte !== undefined || args?.where?.id?.lt !== undefined) {
          return Promise.resolve([makeDispatchRow()])
        }
        return Promise.resolve([makeDispatchRow()])
      }),
      findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    bom_doc_revision: {
      findMany: jest.fn().mockResolvedValue([makeRevisionRow()]),
    },
    bom_assembly: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    bom_part: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
    ...zoneMocks(),
  }
}

function buildInnerPrisma(baseDispatch: any, seq: number) {
  let id = seq
  return {
    bom_dispatch: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ ...baseDispatch, id: id++ }),
      update: jest.fn(({ data }: any) => Promise.resolve({ ...baseDispatch, ...data })),
    },
    bom_doc_revision: { create: jest.fn().mockResolvedValue({ id: id++ }) },
    bom_assembly: {
      createManyAndReturn: jest.fn(({ data }: any) =>
        Promise.resolve((data as any[]).map((d: any) => ({ id: id++, ...d }))),
      ),
      // Pre-insert supersession step (Task 2) — a no-op fixture here since
      // most tests in this file only cover a single upload() call with
      // nothing pre-existing to deactivate. Multi-upload supersession
      // behavior is covered by its own describe block below, which uses a
      // stateful prisma mock instead of this one.
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    bom_part: {
      createManyAndReturn: jest.fn(({ data }: any) =>
        Promise.resolve((data as any[]).map((d: any) => ({ id: id++, ...d }))),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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

function makeStorage() {
  return {
    putObject: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  }
}

function makeParser(parsed: Partial<ParsedBomFile> = {}): Pick<XlsxParserService, 'parse' | 'peekContractNo'> {
  return {
    parse: jest.fn().mockReturnValue({ ...defaultParsed(), ...parsed }),
    peekContractNo: jest.fn().mockReturnValue(''),
  }
}

function defaultParsed(): ParsedBomFile {
  return {
    docType: 'ASSEMBLY_LIST',
    assemblies: [{ assembly_mark: 'WH-CO-001', name: 'Col A', qty: 1, weight_kg: 500, surface_area_m2: 5 }],
    parts: [],
    assemblyParts: [],
  }
}

function makeMatching(overrides: Record<string, any> = {}) {
  return {
    matchAssemblies: jest.fn().mockResolvedValue(undefined),
    matchParts: jest.fn().mockResolvedValue(undefined),
    enforceStandardIntegrity: jest.fn().mockResolvedValue(undefined),
    autoCreateCustomProducts: jest.fn().mockResolvedValue(0),
    ...overrides,
  }
}

function makeDiffService(prisma: any) {
  return new BomDiffService(prisma)
}

function makeSvc(prismaOverrides: any = {}, parserResult: any = {}) {
  const prisma = makePrisma(prismaOverrides)
  return new BomUploadService(
    prisma as any,
    makeStorage() as any,
    makeParser(parserResult) as any,
    makeMatching() as any,
    makeDiffService(prisma) as any,
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

function makeNcInput(partMark: string, qty = 1): NcFileInput {
  const content = [
    'ST',
    `** ${partMark}.nc1`,
    '  CONTRACT',
    `  ${partMark}`,
    '  1',
    `  ${partMark}`,
    '  S275',
    `  ${qty}`,
    '  PL10',
    'B',
    '    1000.00',
    '     100.00',
    '      10.00',
    '       0.00',
    '       0.00',
    '       0.00',
    '      78.50',
  ].join('\n')
  return { buffer: Buffer.from(content), originalname: `${partMark}.nc1` }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('findMismatchedJunctions', () => {
  it('returns empty array when all rows match', () => {
    const result = findMismatchedJunctions(
      [{ assembly_mark: 'A1', part_mark: 'P1', qty: 1, sequence: 1 }],
      new Set(['A1']),
      new Set(['P1']),
    )
    expect(result).toEqual([])
  })

  it('flags a row whose assembly_mark is not in the assembly set', () => {
    const result = findMismatchedJunctions(
      [{ assembly_mark: 'A9', part_mark: 'P1', qty: 1, sequence: 1 }],
      new Set(['A1']),
      new Set(['P1']),
    )
    expect(result).toEqual([{ assembly_mark: 'A9', part_mark: 'P1', assembly_found: false, part_found: true }])
  })

  it('flags a row whose part_mark is not in the part set', () => {
    const result = findMismatchedJunctions(
      [{ assembly_mark: 'A1', part_mark: 'P9', qty: 1, sequence: 1 }],
      new Set(['A1']),
      new Set(['P1']),
    )
    expect(result).toEqual([{ assembly_mark: 'A1', part_mark: 'P9', assembly_found: true, part_found: false }])
  })

  it('flags a row where neither mark matches', () => {
    const result = findMismatchedJunctions(
      [{ assembly_mark: 'A9', part_mark: 'P9', qty: 1, sequence: 1 }],
      new Set(['A1']),
      new Set(['P1']),
    )
    expect(result).toEqual([{ assembly_mark: 'A9', part_mark: 'P9', assembly_found: false, part_found: false }])
  })

  it('returns empty array for empty input', () => {
    expect(findMismatchedJunctions([], new Set(), new Set())).toEqual([])
  })
})

describe('requiresNcFile', () => {
  it('requires an NC file for a "PL" (plate) profile', () => {
    expect(requiresNcFile({ profile: 'PL16x220', part_mark: 'S1-CO1' })).toBe(true)
  })

  it('is case-insensitive on profile', () => {
    expect(requiresNcFile({ profile: 'pl16x220', part_mark: 'S1-CO1' })).toBe(true)
  })

  it('does not require an NC file for an angle profile', () => {
    expect(requiresNcFile({ profile: 'L50x50x5', part_mark: 'S1-FB1' })).toBe(false)
  })

  it('does not require an NC file for a round-bar profile', () => {
    expect(requiresNcFile({ profile: 'RODRB25', part_mark: 'S1-RB1' })).toBe(false)
  })

  it('does not require an NC file for a pipe profile', () => {
    expect(requiresNcFile({ profile: 'PIPE139.8x3.6', part_mark: 'S1-m1' })).toBe(false)
  })

  it('does not require an NC file when profile is missing', () => {
    expect(requiresNcFile({ profile: undefined, part_mark: 'S1-CO1' })).toBe(false)
  })

  it('does not require an NC file for a procured "LPX" mark, even with a "PL" profile', () => {
    expect(requiresNcFile({ profile: 'PL8x75', part_mark: 'S1-LPX1' })).toBe(false)
  })

  it('does not require an NC file for a procured "px" mark, even with a "PL" profile', () => {
    expect(requiresNcFile({ profile: 'PL5x72.5', part_mark: 'S1-px1' })).toBe(false)
  })

  it('is case-insensitive on the procured-mark pattern', () => {
    expect(requiresNcFile({ profile: 'PL8x75', part_mark: 'S1-lpx1' })).toBe(false)
  })

  it('does not false-positive on an ordinary "p"-prefixed mark that is not "px"', () => {
    expect(requiresNcFile({ profile: 'PL10x100', part_mark: 'S1-p6' })).toBe(true)
  })
})

describe('BomUploadService.upload()', () => {
  it('calls $transaction and writes file to storage', async () => {
    const prisma = makePrisma()
    const storage = makeStorage()
    const parser = makeParser()
    const svc = new BomUploadService(prisma as any, storage as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    await svc.upload([makeFileInput()], [], 1, 2, null, 99)

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(storage.putObject).toHaveBeenCalledTimes(1)
  })

  // 2026-10-28: the client's project/zone/sub-zone pairing is never trusted.
  it('rejects a zone of another project — nothing stored, preview refused too', async () => {
    const prisma = makePrisma()
    prisma.project_zone.findUnique.mockResolvedValue({ code: 'Z9', project_id: 5, project: { project_code: 'OTHER' } })
    const storage = makeStorage()
    const svc = new BomUploadService(prisma as any, storage as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)

    await expect(svc.upload([makeFileInput()], [], 1, 2, null, 99)).rejects.toThrow(new BadRequestException('zone นี้ไม่ได้อยู่ใน project ที่เลือก'))
    await expect(svc.preview([makeFileInput()], [], 'combined', { projectId: 1, zoneId: 2, subZoneId: null })).rejects.toThrow(BadRequestException)
    expect(storage.putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a sub-zone of another zone', async () => {
    const prisma = makePrisma()
    prisma.sub_zone.findUnique.mockResolvedValue({ code: 'SZ9', zone_id: 7 })
    const storage = makeStorage()
    const svc = new BomUploadService(prisma as any, storage as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)

    await expect(svc.upload([makeFileInput()], [], 1, 2, 3, 99)).rejects.toThrow(new BadRequestException('sub-zone นี้ไม่ได้อยู่ใน zone ที่เลือก'))
    expect(storage.putObject).not.toHaveBeenCalled()
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
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(({ select }: any = {}) =>
          select?.revision
            ? Promise.resolve([{ id: 1, revision: 1 }])
            : Promise.resolve([{ id: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }]),
        ),
      },
      bom_doc_revision: { findMany: jest.fn().mockResolvedValue([]) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
      ...zoneMocks(),
    }

    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] }
        return { docType, assemblies: [], parts: [{ part_mark: 'P1' }], assemblyParts: [] }
      }),
    }

    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)
    await svc.upload(
      [makeFileInput({ docType: 'ASSEMBLY_LIST' }), makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' })],
      [makeNcInput('P1', 1)],
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
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(({ select }: any = {}) =>
          select?.revision
            ? Promise.resolve([{ id: 1, revision: 1 }])
            : Promise.resolve([{ id: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }]),
        ),
      },
      bom_doc_revision: { findMany: jest.fn().mockResolvedValue([]) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
      ...zoneMocks(),
    }

    const parser = makeParser({ assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] })
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)
    await svc.upload([makeFileInput()], [], 1, 2, null, 1)

    expect(capturedStatus).toBe('partial')
  })

  it('waives the NC-file requirement for a non-plate profile part — upload succeeds with zero NC files', async () => {
    const innerPrisma = buildInnerPrisma({ id: 1, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }, 400)
    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(innerPrisma)),
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(({ select }: any = {}) =>
          select?.revision
            ? Promise.resolve([{ id: 1, revision: 1 }])
            : Promise.resolve([{ id: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }]),
        ),
      },
      bom_doc_revision: { findMany: jest.fn().mockResolvedValue([]) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
      ...zoneMocks(),
    }
    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] }
        return { docType, assemblies: [], parts: [{ part_mark: 'P1', profile: 'L50x50x5' }], assemblyParts: [] }
      }),
    }
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    await expect(svc.upload(
      [makeFileInput({ docType: 'ASSEMBLY_LIST' }), makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' })],
      [], // no NC files at all
      1, 2, null, 1,
    )).resolves.toBeDefined()
  })

  it('still requires an NC file for a plate ("PL") profile part', async () => {
    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] }
        return { docType, assemblies: [], parts: [{ part_mark: 'P1', profile: 'PL10x100' }], assemblyParts: [] }
      }),
    }
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    await expect(svc.upload(
      [makeFileInput({ docType: 'ASSEMBLY_LIST' }), makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' })],
      [],
      1, 2, null, 1,
    )).rejects.toThrow('Missing NC files for part marks: P1')
  })

  // Mark prefixes no longer gate a BOM upload (2026-10-12): MO type replaced the
  // prefix, and marks like CELESTICA's "BUH1-3" have no Tekla-style prefix at all.
  it('accepts a BOM whose assembly marks have no registered prefix', async () => {
    const prisma = makePrisma()
    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockReturnValue({ docType: 'ASSEMBLY_LIST', assemblies: [{ assembly_mark: 'BUH1-3', name: 'WEB' }], parts: [], assemblyParts: [] }),
    }
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    await expect(svc.upload([makeFileInput()], [], 1, 2, null, 1)).resolves.toBeDefined()
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('skips unmatched assembly/part mark pairs but still creates junctions for matched ones, logging each skip', async () => {
    const innerPrisma = buildInnerPrisma({ id: 1, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }, 300)
    let capturedJunctions: any[] | undefined
    innerPrisma.bom_assembly_part.createMany = jest.fn(({ data }: any) => {
      capturedJunctions = data
      return Promise.resolve({ count: data.length })
    })

    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(innerPrisma)),
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(({ select }: any = {}) =>
          select?.revision
            ? Promise.resolve([{ id: 1, revision: 1 }])
            : Promise.resolve([{ id: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }]),
        ),
      },
      bom_doc_revision: { findMany: jest.fn().mockResolvedValue([]) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
      ...zoneMocks(),
    }

    // A1↔P1 and A2↔P2 match; A1↔P3 doesn't (P3 was never in the Part List) —
    // simulates a mark mismatch between the Assembly Part List and Part List.
    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }, { assembly_mark: 'A2' }], parts: [], assemblyParts: [] }
        if (docType === 'PART_LIST') return { docType, assemblies: [], parts: [{ part_mark: 'P1' }, { part_mark: 'P2' }], assemblyParts: [] }
        return {
          docType,
          assemblies: [], parts: [],
          assemblyParts: [
            { assembly_mark: 'A1', part_mark: 'P1', qty: 1, sequence: 1 },
            { assembly_mark: 'A2', part_mark: 'P2', qty: 1, sequence: 2 },
            { assembly_mark: 'A1', part_mark: 'P3', qty: 1, sequence: 3 },
          ],
        }
      }),
    }

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as any)
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)
    await svc.upload(
      [
        makeFileInput({ docType: 'ASSEMBLY_LIST' }),
        makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' }),
        makeFileInput({ docType: 'ASSEMBLY_PART_LIST', originalname: 'assembly_part_list.xlsx' }),
      ],
      [makeNcInput('P1', 1), makeNcInput('P2', 1)],
      1, 2, null, 1,
    )

    expect(capturedJunctions).toHaveLength(2)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('part_mark="P3"'))
    warnSpy.mockRestore()
  })

  it('drops a duplicate (assembly, part) junction pair instead of crashing on the unique constraint, logging the drop', async () => {
    const innerPrisma = buildInnerPrisma({ id: 1, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }, 600)
    let capturedJunctions: any[] | undefined
    innerPrisma.bom_assembly_part.createMany = jest.fn(({ data }: any) => {
      capturedJunctions = data
      return Promise.resolve({ count: data.length })
    })

    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(innerPrisma)),
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(({ select }: any = {}) =>
          select?.revision
            ? Promise.resolve([{ id: 1, revision: 1 }])
            : Promise.resolve([{ id: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }]),
        ),
      },
      bom_doc_revision: { findMany: jest.fn().mockResolvedValue([]) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
      ...zoneMocks(),
    }

    // A1↔P1 listed twice (e.g. the same part legitimately re-listed for one
    // assembly in the source file, or two rows resolving to the same pair
    // via the Tekla missing-header recovery) — must not crash the upload.
    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] }
        if (docType === 'PART_LIST') return { docType, assemblies: [], parts: [{ part_mark: 'P1' }], assemblyParts: [] }
        return {
          docType, assemblies: [], parts: [],
          assemblyParts: [
            { assembly_mark: 'A1', part_mark: 'P1', qty: 1, sequence: 1 },
            { assembly_mark: 'A1', part_mark: 'P1', qty: 1, sequence: 2 },
          ],
        }
      }),
    }

    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as any)
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)
    await svc.upload(
      [
        makeFileInput({ docType: 'ASSEMBLY_LIST' }),
        makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' }),
        makeFileInput({ docType: 'ASSEMBLY_PART_LIST', originalname: 'assembly_part_list.xlsx' }),
      ],
      [makeNcInput('P1', 1)],
      1, 2, null, 1,
    )

    expect(capturedJunctions).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate skipped'))
    warnSpy.mockRestore()
  })

  it('does not let a delimiter collision between two mark pairs mask a valid junction', async () => {
    const innerPrisma = buildInnerPrisma({ id: 1, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }, 500)
    let capturedJunctions: any[] | undefined
    innerPrisma.bom_assembly_part.createMany = jest.fn(({ data }: any) => {
      capturedJunctions = data
      return Promise.resolve({ count: data.length })
    })

    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(innerPrisma)),
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(({ select }: any = {}) =>
          select?.revision
            ? Promise.resolve([{ id: 1, revision: 1 }])
            : Promise.resolve([{ id: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }]),
        ),
      },
      bom_doc_revision: { findMany: jest.fn().mockResolvedValue([]) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
      ...zoneMocks(),
    }

    // "A1" and "X P1" both exist (valid pair). "A1 X" does NOT exist as an
    // assembly (mismatch). Old space-delimited key collided both pairs to
    // "A1 X P1" — this must not happen with the fixed delimiter.
    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] }
        if (docType === 'PART_LIST') return { docType, assemblies: [], parts: [{ part_mark: 'X P1' }], assemblyParts: [] }
        return {
          docType, assemblies: [], parts: [],
          assemblyParts: [
            { assembly_mark: 'A1 X', part_mark: 'P1', qty: 1, sequence: 1 },
            { assembly_mark: 'A1', part_mark: 'X P1', qty: 2, sequence: 2 },
          ],
        }
      }),
    }

    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)
    await svc.upload(
      [
        makeFileInput({ docType: 'ASSEMBLY_LIST' }),
        makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' }),
        makeFileInput({ docType: 'ASSEMBLY_PART_LIST', originalname: 'assembly_part_list.xlsx' }),
      ],
      [makeNcInput('X P1', 2)],
      1, 2, null, 1,
    )

    // Only the "A1 X" / "P1" pair is a real mismatch. The "A1" / "X P1" pair
    // must still produce a junction — this is the assertion that fails on
    // the old space-delimited key.
    expect(capturedJunctions).toHaveLength(1)
    expect(capturedJunctions![0].qty).toBe(2)
  })

  it('rolls back saved files when $transaction throws', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('DB down')),
      bom_dispatch: { findFirst: jest.fn().mockResolvedValue(null) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      ...zoneMocks(),
    }
    const storage = makeStorage()
    const svc = new BomUploadService(prisma as any, storage as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)

    await expect(svc.upload([makeFileInput()], [], 1, 2, null, 1)).rejects.toThrow('DB down')
    expect(storage.delete).toHaveBeenCalledTimes(1)
  })

  it('throws BadRequestException when no files provided', async () => {
    const svc = makeSvc()
    await expect(svc.upload([], [], 1, 2, null, 1)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when file exceeds 50 MB', async () => {
    const svc = makeSvc()
    const big: FileInput = makeFileInput({ size: 51 * 1024 * 1024 })
    await expect(svc.upload([big], [], 1, 2, null, 1)).rejects.toThrow(BadRequestException)
  })

  it('throws BadRequestException when duplicate doc_type provided', async () => {
    const svc = makeSvc()
    await expect(
      svc.upload(
        [makeFileInput({ docType: 'ASSEMBLY_LIST' }), makeFileInput({ docType: 'ASSEMBLY_LIST', originalname: 'assembly_list2.xlsx' })],
        [], 1, 2, null, 1,
      ),
    ).rejects.toThrow(BadRequestException)
  })

  it('accepts file with matching .xlsx extension even if MIME is octet-stream', async () => {
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)
    const f = makeFileInput({ mimetype: 'application/octet-stream', originalname: 'assembly_list.xlsx' })

    // Should NOT throw — extension override
    await expect(svc.upload([f], [], 1, 2, null, 1)).resolves.toBeDefined()
  })

  it('merges MAIN_* and ACC_* doc types into combined assemblies before insert (separate mode)', async () => {
    const innerPrisma = buildInnerPrisma({ id: 1, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }, 400)
    let capturedAssemblies: any[] | undefined
    innerPrisma.bom_assembly.createManyAndReturn = jest.fn(({ data }: any) => {
      capturedAssemblies = data
      return Promise.resolve((data as any[]).map((d: any, i: number) => ({ id: 500 + i, ...d })))
    })

    const prisma = {
      $transaction: jest.fn(async (cb: any) => cb(innerPrisma)),
      bom_dispatch: {
        findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(({ select }: any = {}) =>
          select?.revision
            ? Promise.resolve([{ id: 1, revision: 1 }])
            : Promise.resolve([{ id: 1, doc_revisions: [{ doc_type: 'MAIN_ASSEMBLY_LIST' }] }]),
        ),
      },
      bom_doc_revision: { findMany: jest.fn().mockResolvedValue([]) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
      ...zoneMocks(),
    }

    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'MAIN_ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'M1' }], parts: [], assemblyParts: [] }
        if (docType === 'ACC_ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] }
        if (docType === 'MAIN_PART_LIST') return { docType, assemblies: [], parts: [{ part_mark: 'P1' }], assemblyParts: [] }
        if (docType === 'ACC_PART_LIST') return { docType, assemblies: [], parts: [{ part_mark: 'P2' }], assemblyParts: [] }
        if (docType === 'MAIN_ASSEMBLY_PART_LIST') return { docType, assemblies: [], parts: [], assemblyParts: [{ assembly_mark: 'M1', part_mark: 'P1', qty: 1, sequence: 1 }] }
        return { docType, assemblies: [], parts: [], assemblyParts: [{ assembly_mark: 'A1', part_mark: 'P2', qty: 1, sequence: 1 }] }
      }),
    }

    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)
    await svc.upload(
      [
        makeFileInput({ docType: 'MAIN_ASSEMBLY_LIST' }),
        makeFileInput({ docType: 'MAIN_ASSEMBLY_PART_LIST', originalname: 'main_assembly_part_list.xlsx' }),
        makeFileInput({ docType: 'MAIN_PART_LIST', originalname: 'main_part_list.xlsx' }),
        makeFileInput({ docType: 'ACC_ASSEMBLY_LIST', originalname: 'acc_assembly_list.xlsx' }),
        makeFileInput({ docType: 'ACC_ASSEMBLY_PART_LIST', originalname: 'acc_assembly_part_list.xlsx' }),
        makeFileInput({ docType: 'ACC_PART_LIST', originalname: 'acc_part_list.xlsx' }),
      ],
      [makeNcInput('P1', 1), makeNcInput('P2', 1)],
      1, 2, null, 1, 'separate',
    )

    expect(capturedAssemblies).toHaveLength(2)
    expect(capturedAssemblies!.map((a: any) => a.assembly_mark).sort()).toEqual(['A1', 'M1'])
  })

  // The old applyBomChangeHolds()/hold_summary auto-hold-on-upload tests that
  // lived here were removed with the trigger itself (multi-mark redesign,
  // 2026-09-17 — hold is now manual only, see WorkOrdersService.transition()
  // 'hold' and POST /wo/:id/hold). BomUploadService no longer depends on
  // WorkOrdersService at all.
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
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)
    const result = await svc.list({ page: 1, limit: 20 })

    expect(result.assembly_total).toBe(4)
    expect(result.part_total).toBe(7)
  })

  it('defaults page=1, limit=20 when not provided', async () => {
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)
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

  it('each assembly carries its former marks (confirmed BOM renames, nearest first) — 2026-10-27', async () => {
    const asm = (id: number, mark: string) => ({ id, dispatch_id: 2, assembly_mark: mark, name: null, qty: 1, weight_kg: null, surface_area_m2: null, length_mm: null, width_mm: null, height_mm: null, match_status: null, rev: 1, rev_source: null, product: null, assembly_parts: [] })
    const renames = jest.fn().mockResolvedValue([
      { id: 1, kind: 'ASSEMBLY', from_mark: 'BR10', to_mark: '2BR10', dispatch_id: 1 },
      { id: 2, kind: 'ASSEMBLY', from_mark: '2BR10', to_mark: '3BR10', dispatch_id: 2 },
      { id: 3, kind: 'PART', from_mark: 'p1', to_mark: 'BR7', dispatch_id: 1 },
    ])
    const svc = makeSvc({ bom_assembly: { findMany: jest.fn().mockResolvedValue([asm(5, '3BR10'), asm(6, 'BR7')]) }, bom_mark_rename: { findMany: renames } })
    const r = await svc.findOne(1)
    expect(r.assemblies!.map(a => [a.assembly_mark, a.former_marks])).toEqual([['3BR10', ['2BR10', 'BR10']], ['BR7', []]])
    expect(renames.mock.calls[0][0].where).toMatchObject({ project_id: 1, zone_id: 2, sub_zone_id: null, kind: 'ASSEMBLY', dispatch: { source: { not: 'PRE_SHOP' } } })
  })

  it('throws NotFoundException when dispatch not found', async () => {
    const prisma = makePrisma({
      bom_dispatch: { ...makePrisma().bom_dispatch, findUnique: jest.fn().mockResolvedValue(null) },
    })
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)

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
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)

    await expect(svc.getRevisions(999)).rejects.toThrow(NotFoundException)
  })
})

describe('BomUploadService.upload() — per-mark revs (2026-10-26)', () => {
  const activeB1 = (rev: number) => ({
    assembly_mark: 'B1', name: 'Col A', qty: '1.000', weight_kg: '500.000', surface_area_m2: '5.0000', length_mm: null, width_mm: null, height_mm: null,
    rev, slot: null, assembly_parts: [],
  })
  function revPrisma(active: any[], latest: { id: number; revision: number } | null, assemblies: any[] = [{ assembly_mark: 'B1', name: 'Col A', qty: 1, weight_kg: 600, surface_area_m2: 5 }]) {
    const inner: any = {
      bom_dispatch: { findFirst: jest.fn().mockResolvedValue(latest), create: jest.fn().mockResolvedValue({ id: 50 }), update: jest.fn() },
      bom_doc_revision: { create: jest.fn() },
      bom_assembly: { updateMany: jest.fn(), createManyAndReturn: jest.fn(({ data }: any) => Promise.resolve(data.map((d: any, i: number) => ({ id: 500 + i, ...d })))) },
      bom_part: { updateMany: jest.fn(), createManyAndReturn: jest.fn(({ data }: any) => Promise.resolve(data.map((d: any, i: number) => ({ id: 600 + i, ...d })))) },
      bom_assembly_part: { createMany: jest.fn() },
    }
    const base = buildPrisma()
    const prisma = makePrisma({
      $transaction: jest.fn(async (cb: any) => cb(inner)),
      bom_assembly: { findMany: jest.fn().mockResolvedValue(active) } as any,
      // carry-forward lookups (id: { not }) and the BIM placeholder find nothing
      bom_dispatch: { ...base.bom_dispatch, findFirst: jest.fn(({ where }: any) => Promise.resolve(where?.id?.not !== undefined || where?.source === 'BIM_PLACEHOLDER' ? null : latest)) },
    })
    const storage = makeStorage()
    const svc = new BomUploadService(prisma as any, storage as any, makeParser({ assemblies }) as any, makeMatching() as any, makeDiffService(prisma) as any)
    return { svc, inner, storage }
  }
  const files = [makeFileInput()]

  it('revision is always the latest + 1 (1 for a first upload) — no continue/new any more', async () => {
    const first = revPrisma([], null)
    await first.svc.upload(files, [], 1, 2, null, 1)
    expect(first.inner.bom_dispatch.create.mock.calls[0][0].data.revision).toBe(1)
    const next = revPrisma([activeB1(0)], { id: 7, revision: 3 })
    await next.svc.upload(files, [], 1, 2, null, 1)
    expect(next.inner.bom_dispatch.create.mock.calls[0][0].data.revision).toBe(4)
  })

  it('writes the confirmed rev on the new row — a ⚠ changed mark is "กำหนด rev เอง" (MANUAL)', async () => {
    const { svc, inner } = revPrisma([activeB1(1)], { id: 7, revision: 1 })
    await svc.upload(files, [], 1, 2, null, 1, 'combined', { revs: [{ mark: 'B1', rev: 3 }], baseDispatchId: 7 })
    expect(inner.bom_assembly.createManyAndReturn.mock.calls[0][0].data[0]).toMatchObject({ assembly_mark: 'B1', rev: 3, rev_source: 'MANUAL', dn_status: null })
  })

  it('no revs sent → the suggestions (unchanged → carried; new → 0)', async () => {
    const { svc, inner } = revPrisma([], null)
    await svc.upload(files, [], 1, 2, null, 1)
    expect(inner.bom_assembly.createManyAndReturn.mock.calls[0][0].data[0]).toMatchObject({ rev: 0, rev_source: 'NEW' })
  })

  it('stale preview: another upload landed since → 409, no file stored, nothing written (Review Focus 3)', async () => {
    const { svc, inner, storage } = revPrisma([activeB1(1)], { id: 8, revision: 2 })
    await expect(svc.upload(files, [], 1, 2, null, 1, 'combined', { revs: [], baseDispatchId: 7 }))
      .rejects.toThrow(new ConflictException('มีคนอัปโหลด BOM ของ zone นี้ไปแล้วระหว่างที่ตรวจ — กดอัปโหลดใหม่อีกครั้ง'))
    expect(storage.putObject).not.toHaveBeenCalled()
    expect(inner.bom_dispatch.create).not.toHaveBeenCalled()
  })

  // final review fix 5: the stale check is repeated inside the transaction
  it('stale check inside the transaction: an upload landing after the first check → 409, nothing written, stored files removed', async () => {
    const { svc, inner, storage } = revPrisma([activeB1(1)], { id: 7, revision: 1 })
    // the outer read still sees dispatch 7; inside the transaction dispatch 8 has landed
    inner.bom_dispatch.findFirst = jest.fn().mockResolvedValue({ id: 8, revision: 2 })
    await expect(svc.upload(files, [], 1, 2, null, 1, 'combined', { revs: [{ mark: 'B1', rev: 2 }], baseDispatchId: 7 }))
      .rejects.toThrow(new ConflictException('มีคนอัปโหลด BOM ของ zone นี้ไปแล้วระหว่างที่ตรวจ — กดอัปโหลดใหม่อีกครั้ง'))
    expect(inner.bom_dispatch.create).not.toHaveBeenCalled()
    expect(storage.delete).toHaveBeenCalled()
  })

  it('a rev below the current one → 400 before anything is stored (Review Focus 5)', async () => {
    const { svc, storage } = revPrisma([activeB1(2)], { id: 7, revision: 1 })
    await expect(svc.upload(files, [], 1, 2, null, 1, 'combined', { revs: [{ mark: 'B1', rev: 1 }], baseDispatchId: 7 }))
      .rejects.toThrow(new BadRequestException('B1: rev ต่ำกว่า rev ปัจจุบัน (2) ไม่ได้'))
    expect(storage.putObject).not.toHaveBeenCalled()
  })

  it('stores the Dispatch Note as a DISPATCH_NOTE doc row and never feeds it to the list parser', async () => {
    const { svc, inner } = revPrisma([], null)
    const wb = XLSX.utils.book_new() // XLSX imported at the top of the spec since Task 5
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['MarkNo.', 'Set', 'Rev', 'WeightKg.'], ['B1', 1, 2, 5]]), 'D')
    const dn = makeFileInput({ docType: 'DISPATCH_NOTE', originalname: 'DN.xls', mimetype: 'application/vnd.ms-excel', buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer })
    await svc.upload([...files, dn], [], 1, 2, null, 1)
    expect(inner.bom_doc_revision.create.mock.calls.map((c: any) => c[0].data.doc_type)).toEqual(['ASSEMBLY_LIST', 'DISPATCH_NOTE'])
    expect(inner.bom_assembly.createManyAndReturn.mock.calls[0][0].data[0]).toMatchObject({ rev: 2, rev_source: 'DISPATCH_NOTE' })
  })

  it('separate mode stores each slot\'s Dispatch Note as its own doc row', async () => {
    const { svc, inner } = revPrisma([], null)
    const book = () => {
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['MarkNo.', 'Set', 'Rev', 'WeightKg.'], ['B1', 1, 2, 5]]), 'D')
      return XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer
    }
    const sep = [
      makeFileInput({ docType: 'MAIN_ASSEMBLY_LIST', originalname: 'main assembly list.xlsx' }),
      makeFileInput({ docType: 'ACC_ASSEMBLY_LIST', originalname: 'acc assembly list.xlsx' }),
      makeFileInput({ docType: 'MAIN_DISPATCH_NOTE', originalname: 'MAIN DN.xls', mimetype: 'application/vnd.ms-excel', buffer: book() }),
      makeFileInput({ docType: 'ACC_DISPATCH_NOTE', originalname: 'ACC DN.xls', mimetype: 'application/vnd.ms-excel', buffer: book() }),
    ]
    await svc.upload(sep, [], 1, 2, null, 1, 'separate')
    expect(inner.bom_doc_revision.create.mock.calls.map((c: any) => c[0].data.doc_type)).toEqual(['MAIN_ASSEMBLY_LIST', 'ACC_ASSEMBLY_LIST', 'MAIN_DISPATCH_NOTE', 'ACC_DISPATCH_NOTE'])
  })

  it('save deactivates exactly what preview called "removed" (ACC-only separate upload keeps MAIN)', async () => {
    const active = [
      { ...activeB1(1), assembly_mark: 'MAIN1', slot: 'MAIN' },
      { ...activeB1(1), assembly_mark: 'ACC1', slot: 'ACC' },
    ]
    const { svc, inner } = revPrisma(active, { id: 7, revision: 1 }, [{ assembly_mark: 'ACC2', name: 'Brace', qty: 1, weight_kg: 10, surface_area_m2: 1 }])
    const accOnly = [makeFileInput({ docType: 'ACC_ASSEMBLY_LIST', originalname: 'acc assembly list.xlsx' })]

    const preview = await svc.preview(accOnly, [], 'separate', { projectId: 1, zoneId: 2, subZoneId: null })
    const previewRemoved = preview.review.rows.filter(r => r.kind === 'removed').map(r => r.mark)
    expect(previewRemoved).toEqual(['ACC1'])

    await svc.upload(accOnly, [], 1, 2, null, 1, 'separate', { revs: [], baseDispatchId: 7 })
    const where = inner.bom_assembly.updateMany.mock.calls[0][0].where
    expect(where.slot).toEqual({ in: ['ACC'] })
    // the save's deactivation filter, applied to the zone's ACTIVE rows, hits exactly the preview's removed marks
    const deactivated = active.filter(a => where.slot.in.includes(a.slot)).map(a => a.assembly_mark)
    expect(deactivated).toEqual(previewRemoved)
  })
})

describe('BomUploadService — getLatestRevision', () => {
  it('returns null when no dispatch exists for the zone/sub-zone', async () => {
    const prisma = { bom_dispatch: { findFirst: jest.fn().mockResolvedValue(null) } }
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)
    const result = await svc.getLatestRevision(1, 2, null)
    expect(result).toEqual({ revision: null })
  })

  it('returns the max revision for that exact zone/sub-zone scope', async () => {
    const prisma = { bom_dispatch: { findFirst: jest.fn().mockResolvedValue({ revision: 5 }) } }
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)
    const result = await svc.getLatestRevision(1, 2, null)
    expect(result).toEqual({ revision: 5 })
    expect(prisma.bom_dispatch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { project_id: 1, zone_id: 2, sub_zone_id: null },
      orderBy: { revision: 'desc' },
    }))
  })
})

describe('BomUploadService.previewJunctions()', () => {
  it('returns empty arrays when every row matches', async () => {
    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] }
        if (docType === 'PART_LIST') return { docType, assemblies: [], parts: [{ part_mark: 'P1' }], assemblyParts: [] }
        return { docType, assemblies: [], parts: [], assemblyParts: [{ assembly_mark: 'A1', part_mark: 'P1', qty: 1, sequence: 1 }] }
      }),
    }
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    const result = await svc.previewJunctions([
      makeFileInput({ docType: 'ASSEMBLY_LIST' }),
      makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' }),
      makeFileInput({ docType: 'ASSEMBLY_PART_LIST', originalname: 'assembly_part_list.xlsx' }),
    ])

    expect(result).toEqual({ unmatchedAssemblyMarks: [], unmatchedPartMarks: [] })
  })

  it('returns deduplicated unmatched marks when rows fail to resolve', async () => {
    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] }
        if (docType === 'PART_LIST') return { docType, assemblies: [], parts: [{ part_mark: 'P1' }], assemblyParts: [] }
        return {
          docType, assemblies: [], parts: [],
          assemblyParts: [
            { assembly_mark: 'A1', part_mark: 'P9', qty: 1, sequence: 1 },
            { assembly_mark: 'A1', part_mark: 'P9', qty: 1, sequence: 2 },
            { assembly_mark: 'A9', part_mark: 'P1', qty: 1, sequence: 3 },
          ],
        }
      }),
    }
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    const result = await svc.previewJunctions([
      makeFileInput({ docType: 'ASSEMBLY_LIST' }),
      makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' }),
      makeFileInput({ docType: 'ASSEMBLY_PART_LIST', originalname: 'assembly_part_list.xlsx' }),
    ])

    expect(result.unmatchedPartMarks).toEqual(['P9'])
    expect(result.unmatchedAssemblyMarks).toEqual(['A9'])
  })

  it('merges MAIN_*/ACC_* doc types before checking, in separate mode', async () => {
    const parser = {
      peekContractNo: jest.fn().mockReturnValue(''),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'MAIN_ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'M1' }], parts: [], assemblyParts: [] }
        if (docType === 'MAIN_PART_LIST') return { docType, assemblies: [], parts: [{ part_mark: 'P1' }], assemblyParts: [] }
        if (docType === 'MAIN_ASSEMBLY_PART_LIST') return { docType, assemblies: [], parts: [], assemblyParts: [{ assembly_mark: 'M1', part_mark: 'P1', qty: 1, sequence: 1 }] }
        return { docType, assemblies: [], parts: [], assemblyParts: [] }
      }),
    }
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    const result = await svc.previewJunctions([
      makeFileInput({ docType: 'MAIN_ASSEMBLY_LIST' }),
      makeFileInput({ docType: 'MAIN_ASSEMBLY_PART_LIST', originalname: 'main_assembly_part_list.xlsx' }),
      makeFileInput({ docType: 'MAIN_PART_LIST', originalname: 'main_part_list.xlsx' }),
    ], 'separate')

    expect(result).toEqual({ unmatchedAssemblyMarks: [], unmatchedPartMarks: [] })
  })

  it('never touches NC-file matching — the method signature has no nc_files parameter', async () => {
    const parser = makeParser({ assemblies: [{ assembly_mark: 'A1' }], parts: [], assemblyParts: [] })
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)
    await expect(svc.previewJunctions([makeFileInput()])).resolves.toBeDefined()
  })
})

describe('BomUploadService — contractNo threading (parseAllFiles)', () => {
  it('derives contractNo from the Assembly List file and passes it to Part List / Assembly Part List parsing', async () => {
    const parser = {
      peekContractNo: jest.fn().mockReturnValue('0X221'),
      parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => {
        if (docType === 'ASSEMBLY_LIST') return { docType, assemblies: [{ assembly_mark: 'S1-CO1' }], parts: [], assemblyParts: [] }
        if (docType === 'PART_LIST') return { docType, assemblies: [], parts: [{ part_mark: 'S1-CO1' }], assemblyParts: [] }
        return { docType, assemblies: [], parts: [], assemblyParts: [{ assembly_mark: 'S1-CO1', part_mark: 'S1-CO1', qty: 1, sequence: 1 }] }
      }),
    }
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    const asmListFile = makeFileInput({ docType: 'ASSEMBLY_LIST' })
    await svc.previewJunctions([
      asmListFile,
      makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' }),
      makeFileInput({ docType: 'ASSEMBLY_PART_LIST', originalname: 'assembly_part_list.xlsx' }),
    ])

    expect(parser.peekContractNo).toHaveBeenCalledTimes(1)
    expect(parser.peekContractNo).toHaveBeenCalledWith(asmListFile.buffer)
    // every parse() call — including the Assembly List's own — receives the
    // contractNo peeked from the Assembly List, not a per-file re-extraction
    for (const call of parser.parse.mock.calls) {
      expect(call[2]).toBe('0X221')
    }
  })

  it('derives contractNo per MAIN/ACC group independently in separate mode', async () => {
    const parser = {
      peekContractNo: jest.fn().mockImplementation((buf: Buffer) => (buf.toString() === 'main-asm-list' ? 'MAIN-NO' : 'ACC-NO')),
      parse: jest.fn().mockReturnValue({ docType: 'ASSEMBLY_LIST', assemblies: [], parts: [], assemblyParts: [] }),
    }
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    await svc.previewJunctions(
      [
        makeFileInput({ docType: 'MAIN_ASSEMBLY_LIST', buffer: Buffer.from('main-asm-list') }),
        makeFileInput({ docType: 'MAIN_PART_LIST', originalname: 'main_part_list.xlsx', buffer: Buffer.from('main-part-list') }),
        makeFileInput({ docType: 'ACC_ASSEMBLY_LIST', originalname: 'acc_assembly_list.xlsx', buffer: Buffer.from('acc-asm-list') }),
        makeFileInput({ docType: 'ACC_PART_LIST', originalname: 'acc_part_list.xlsx', buffer: Buffer.from('acc-part-list') }),
      ],
      'separate',
    )

    const contractNoFor = (docType: string) =>
      parser.parse.mock.calls.find((c: unknown[]) => c[1] === docType)?.[2]
    expect(contractNoFor('MAIN_PART_LIST')).toBe('MAIN-NO')
    expect(contractNoFor('ACC_PART_LIST')).toBe('ACC-NO')
  })

  it('falls back to per-file self-extraction (undefined override) when no Assembly List file is present', async () => {
    const parser = {
      peekContractNo: jest.fn(),
      parse: jest.fn().mockReturnValue({ docType: 'PART_LIST', assemblies: [], parts: [], assemblyParts: [] }),
    }
    const prisma = makePrisma()
    const svc = new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any)

    await svc.previewJunctions([makeFileInput({ docType: 'PART_LIST' })])

    expect(parser.peekContractNo).not.toHaveBeenCalled()
    expect(parser.parse.mock.calls[0][2]).toBeUndefined()
  })
})

// ── Slot-scoped status supersession (write path) ────────────────────────────
// Unlike buildInnerPrisma() (a fresh in-memory tx per upload() call), these
// tests need bom_assembly/bom_part rows to persist ACROSS multiple upload()
// calls so a second upload's deactivation step can see — and correctly scope
// around — rows a first upload created. $transaction always hands the
// callback the SAME tx object, backed by arrays living in the closure below,
// so state survives from one svc.upload() call to the next.
function makePersistentPrisma() {
  let dispatchIdSeq = 1
  let assemblyIdSeq = 1
  let partIdSeq = 1
  const dispatches: any[] = []
  const assemblies: any[] = []
  const parts: any[] = []

  const dispatchMatches = (d: any, where: any) =>
    (where.project_id === undefined || d.project_id === where.project_id) &&
    (where.zone_id === undefined || d.zone_id === where.zone_id) &&
    (!('sub_zone_id' in where) || d.sub_zone_id === where.sub_zone_id)

  const updateManyFor = (rows: any[]) => jest.fn(({ where, data }: any) => {
    let count = 0
    for (const row of rows) {
      if (where.status !== undefined && row.status !== where.status) continue
      if (where.dispatch) {
        const d = dispatches.find(x => x.id === row.dispatch_id)
        if (!d || !dispatchMatches(d, where.dispatch)) continue
      }
      if (where.slot?.in && !where.slot.in.includes(row.slot)) continue
      Object.assign(row, data)
      count++
    }
    return Promise.resolve({ count })
  })

  const tx = {
    bom_dispatch: {
      findFirst: jest.fn(({ where }: any) => {
        const matches = dispatches.filter(d => dispatchMatches(d, where))
        if (!matches.length) return Promise.resolve(null)
        const latest = matches.reduce((a, b) => (b.revision > a.revision ? b : a))
        return Promise.resolve({ revision: latest.revision })
      }),
      create: jest.fn(({ data }: any) => {
        const row = { id: dispatchIdSeq++, revision: 1, ...data }
        dispatches.push(row)
        return Promise.resolve(row)
      }),
      update: jest.fn(({ where, data }: any) => {
        const row = dispatches.find(d => d.id === where.id)
        Object.assign(row, data)
        return Promise.resolve(row)
      }),
    },
    bom_doc_revision: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    bom_assembly: {
      createManyAndReturn: jest.fn(({ data }: any) => {
        const rows = (data as any[]).map(d => ({ id: assemblyIdSeq++, status: 'ACTIVE', ...d }))
        assemblies.push(...rows)
        return Promise.resolve(rows)
      }),
      updateMany: updateManyFor(assemblies),
    },
    bom_part: {
      createManyAndReturn: jest.fn(({ data }: any) => {
        const rows = (data as any[]).map(d => ({ id: partIdSeq++, status: 'ACTIVE', ...d }))
        parts.push(...rows)
        return Promise.resolve(rows)
      }),
      updateMany: updateManyFor(parts),
    },
    bom_assembly_part: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  }

  const prisma = {
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    bom_dispatch: {
      findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
      // Always null → short-circuits carryForwardPaintConfig (a different
      // concern from this suite; exercised elsewhere).
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(({ select }: any = {}) =>
        select?.revision
          ? Promise.resolve([{ id: 1, revision: 1 }])
          : Promise.resolve([{ id: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }]),
      ),
    },
    bom_doc_revision: { findMany: jest.fn().mockResolvedValue([]) },
    bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
    bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    bom_mark_rename: { findMany: jest.fn().mockResolvedValue([]) },
    ...zoneMocks(),
  }

  return { prisma, assemblies, parts, dispatches }
}

// Parser stub whose parse() branches purely on docType — same convention as
// the rest of this file's separate-mode tests.
function makeBranchingParser(byDocType: Record<string, Partial<ParsedBomFile>>) {
  return {
    peekContractNo: jest.fn().mockReturnValue(''),
    parse: jest.fn().mockImplementation((_buf: Buffer, docType: string) => ({
      docType,
      assemblies: [],
      parts: [],
      assemblyParts: [],
      ...byDocType[docType],
    })),
  }
}

describe('BomUploadService — slot-scoped status supersession (write path)', () => {
  it('combined-mode re-upload: dropped marks flip INACTIVE, restated marks keep an INACTIVE+ACTIVE pair, new marks are ACTIVE — all with slot=null', async () => {
    const store = makePersistentPrisma()
    const storage = makeStorage()
    const matching = makeMatching()

    const parserA = makeBranchingParser({
      ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'X' }, { assembly_mark: 'Y' }] },
    })
    const svcA = new BomUploadService(store.prisma as any, storage as any, parserA as any, matching as any, makeDiffService(store.prisma) as any)
    await svcA.upload([makeFileInput({ docType: 'ASSEMBLY_LIST' })], [], 1, 2, null, 1)

    const parserB = makeBranchingParser({
      ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'Y' }, { assembly_mark: 'Z' }] },
    })
    const svcB = new BomUploadService(store.prisma as any, storage as any, parserB as any, matching as any, makeDiffService(store.prisma) as any)
    await svcB.upload([makeFileInput({ docType: 'ASSEMBLY_LIST' })], [], 1, 2, null, 1)

    const byMark = (mark: string) => store.assemblies.filter(a => a.assembly_mark === mark)

    expect(byMark('X')).toHaveLength(1)
    expect(byMark('X')[0].status).toBe('INACTIVE')
    expect(byMark('X')[0].slot).toBeNull()

    const ys = byMark('Y')
    expect(ys).toHaveLength(2)
    expect(ys.filter(r => r.status === 'INACTIVE')).toHaveLength(1)
    expect(ys.filter(r => r.status === 'ACTIVE')).toHaveLength(1)
    expect(ys.every(r => r.slot === null)).toBe(true)

    expect(byMark('Z')).toHaveLength(1)
    expect(byMark('Z')[0].status).toBe('ACTIVE')
    expect(byMark('Z')[0].slot).toBeNull()
  })

  it('separate-mode Acc-only upload never touches Main-slot rows (the production bug this plan fixes)', async () => {
    const store = makePersistentPrisma()
    const storage = makeStorage()
    const matching = makeMatching()

    // Upload A — "both": Main marks X/Y + Acc marks P/Q in one submission.
    const parserA = makeBranchingParser({
      MAIN_ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'X' }, { assembly_mark: 'Y' }] },
      ACC_ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'P' }, { assembly_mark: 'Q' }] },
    })
    const svcA = new BomUploadService(store.prisma as any, storage as any, parserA as any, matching as any, makeDiffService(store.prisma) as any)
    await svcA.upload(
      [
        makeFileInput({ docType: 'MAIN_ASSEMBLY_LIST' }),
        makeFileInput({ docType: 'ACC_ASSEMBLY_LIST', originalname: 'acc_assembly_list.xlsx' }),
      ],
      [], 1, 2, null, 1, 'separate',
    )

    // Upload B — Acc-only: mark P only (Q is dropped, X/Y aren't restated at all).
    const parserB = makeBranchingParser({
      ACC_ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'P' }] },
    })
    const svcB = new BomUploadService(store.prisma as any, storage as any, parserB as any, matching as any, makeDiffService(store.prisma) as any)
    await svcB.upload(
      [makeFileInput({ docType: 'ACC_ASSEMBLY_LIST', originalname: 'acc_assembly_list_2.xlsx' })],
      [], 1, 2, null, 1, 'separate',
    )

    const byMark = (mark: string) => store.assemblies.filter(a => a.assembly_mark === mark)

    // Main-slot rows: completely untouched by the Acc-only upload.
    expect(byMark('X')).toHaveLength(1)
    expect(byMark('X')[0].status).toBe('ACTIVE')
    expect(byMark('X')[0].slot).toBe('MAIN')
    expect(byMark('Y')).toHaveLength(1)
    expect(byMark('Y')[0].status).toBe('ACTIVE')
    expect(byMark('Y')[0].slot).toBe('MAIN')

    // Acc-slot rows: P restated (old row superseded, fresh row active); Q dropped (superseded, nothing new).
    const ps = byMark('P')
    expect(ps).toHaveLength(2)
    expect(ps.filter(r => r.status === 'INACTIVE')).toHaveLength(1)
    expect(ps.filter(r => r.status === 'ACTIVE')).toHaveLength(1)
    expect(ps.every(r => r.slot === 'ACC')).toBe(true)

    expect(byMark('Q')).toHaveLength(1)
    expect(byMark('Q')[0].status).toBe('INACTIVE')
    expect(byMark('Q')[0].slot).toBe('ACC')
  })

  it('separate-mode Main+Acc submitted together: both slots stamped correctly on assemblies AND parts in one transaction', async () => {
    const store = makePersistentPrisma()
    const storage = makeStorage()
    const matching = makeMatching()

    const parser = makeBranchingParser({
      MAIN_ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'M1' }] },
      ACC_ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'A1' }] },
      MAIN_PART_LIST: { parts: [{ part_mark: 'MP1' }] },
      ACC_PART_LIST: { parts: [{ part_mark: 'AP1' }] },
    })
    const svc = new BomUploadService(store.prisma as any, storage as any, parser as any, matching as any, makeDiffService(store.prisma) as any)
    await svc.upload(
      [
        makeFileInput({ docType: 'MAIN_ASSEMBLY_LIST' }),
        makeFileInput({ docType: 'ACC_ASSEMBLY_LIST', originalname: 'acc_assembly_list.xlsx' }),
        makeFileInput({ docType: 'MAIN_PART_LIST', originalname: 'main_part_list.xlsx' }),
        makeFileInput({ docType: 'ACC_PART_LIST', originalname: 'acc_part_list.xlsx' }),
      ],
      [], 1, 2, null, 1, 'separate',
    )

    const asmByMark = (mark: string) => store.assemblies.find(a => a.assembly_mark === mark)
    const partByMark = (mark: string) => store.parts.find(p => p.part_mark === mark)

    expect(asmByMark('M1')?.slot).toBe('MAIN')
    expect(asmByMark('M1')?.status).toBe('ACTIVE')
    expect(asmByMark('A1')?.slot).toBe('ACC')
    expect(asmByMark('A1')?.status).toBe('ACTIVE')
    expect(partByMark('MP1')?.slot).toBe('MAIN')
    expect(partByMark('MP1')?.status).toBe('ACTIVE')
    expect(partByMark('AP1')?.slot).toBe('ACC')
    expect(partByMark('AP1')?.status).toBe('ACTIVE')
  })

  it('an assembly-only re-upload (no Part List this round) leaves existing ACTIVE part rows untouched', async () => {
    const store = makePersistentPrisma()
    const storage = makeStorage()
    const matching = makeMatching()

    const parserA = makeBranchingParser({
      ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'X' }] },
      PART_LIST: { parts: [{ part_mark: 'P1' }] }, // no profile → no NC file required
    })
    const svcA = new BomUploadService(store.prisma as any, storage as any, parserA as any, matching as any, makeDiffService(store.prisma) as any)
    await svcA.upload(
      [makeFileInput({ docType: 'ASSEMBLY_LIST' }), makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' })],
      [], 1, 2, null, 1,
    )

    // Upload B: assembly list only — no PART_LIST file at all this round.
    const parserB = makeBranchingParser({
      ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'Y' }] },
    })
    const svcB = new BomUploadService(store.prisma as any, storage as any, parserB as any, matching as any, makeDiffService(store.prisma) as any)
    await svcB.upload([makeFileInput({ docType: 'ASSEMBLY_LIST' })], [], 1, 2, null, 1)

    expect(store.assemblies.find(a => a.assembly_mark === 'X')?.status).toBe('INACTIVE')
    expect(store.assemblies.find(a => a.assembly_mark === 'Y')?.status).toBe('ACTIVE')
    // The part row from upload A must survive untouched — upload B carried no
    // part rows, so dedupedParts.length was 0 and the part-side deactivation
    // block must have been skipped entirely.
    expect(store.parts).toHaveLength(1)
    expect(store.parts[0].part_mark).toBe('P1')
    expect(store.parts[0].status).toBe('ACTIVE')
  })

  it('a part-only re-upload (no Assembly List this round) leaves existing ACTIVE assembly rows untouched', async () => {
    const store = makePersistentPrisma()
    const storage = makeStorage()
    const matching = makeMatching()

    const parserA = makeBranchingParser({
      ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'X' }] },
      PART_LIST: { parts: [{ part_mark: 'P1' }] },
    })
    const svcA = new BomUploadService(store.prisma as any, storage as any, parserA as any, matching as any, makeDiffService(store.prisma) as any)
    await svcA.upload(
      [makeFileInput({ docType: 'ASSEMBLY_LIST' }), makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' })],
      [], 1, 2, null, 1,
    )

    // Upload B: part list only — no ASSEMBLY_LIST file at all this round.
    const parserB = makeBranchingParser({
      PART_LIST: { parts: [{ part_mark: 'P2' }] },
    })
    const svcB = new BomUploadService(store.prisma as any, storage as any, parserB as any, matching as any, makeDiffService(store.prisma) as any)
    await svcB.upload([makeFileInput({ docType: 'PART_LIST' })], [], 1, 2, null, 1)

    // Assembly row from upload A must survive untouched — upload B carried no
    // assembly rows, so the assembly-side deactivation block must have been
    // skipped entirely.
    expect(store.assemblies).toHaveLength(1)
    expect(store.assemblies[0].assembly_mark).toBe('X')
    expect(store.assemblies[0].status).toBe('ACTIVE')

    expect(store.parts.find(p => p.part_mark === 'P1')?.status).toBe('INACTIVE')
    expect(store.parts.find(p => p.part_mark === 'P2')?.status).toBe('ACTIVE')
  })
})

describe('BomUploadService — carryForwardProgress with a placeholder dispatch', () => {
  function makeService(prismaOverrides: Record<string, unknown>) {
    const prisma = {
      bom_dispatch: { findFirst: jest.fn().mockResolvedValue(null) }, // no prior REAL dispatch for this zone
      bom_assembly_progress: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      bom_assembly: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]) },
      ...prismaOverrides,
    }
    const storage = {} as any
    const parser = {} as any
    const matching = {} as any
    const diffService = {} as any
    return { service: new BomUploadService(prisma as any, storage, parser, matching, diffService), prisma }
  }

  // Full-shaped progress row builder — every test below needs the same
  // field set, only `assembly` (mark/dispatch_id/id) and `cut` vary.
  function progressRow(assembly: { id: number; dispatch_id: number; assembly_mark: string; status?: string }, cut = 80) {
    return {
      cut, buildup: 0, weld1: 0, fitup_drill: 0, weld2: 0, qc_inspection: 0, primer: 0, fireproof: 0, top_coat: 0, qc_final: 0,
      fab_plan_finish_date: null, fab_actual_finish_date: null, plan_load_date: null, actual_load_date: null,
      loaded_pcs: 0, erected_pcs: 0, erection_plan_finish_date: null, erection_actual_finish_date: null,
      payment_status: 'Not Disbursed', write_uid: 7,
      assembly,
    }
  }

  it('copies progress from matched placeholder-dispatch assemblies into the new real rows, then deactivates the matched placeholder rows', async () => {
    let dispatchFindFirstCall = 0
    const { service, prisma } = makeService({
      bom_dispatch: {
        findFirst: jest.fn(() => {
          dispatchFindFirstCall++
          // 1st call inside carryForwardProgress = "previous real dispatch of this zone" → none
          // 2nd call = "this project's placeholder dispatch" → found
          return Promise.resolve(dispatchFindFirstCall === 1 ? null : { id: 800 })
        }),
      },
      bom_assembly_progress: {
        findMany: jest.fn().mockResolvedValue([
          // dispatch_id: 800 matches the mocked placeholder dispatch's id
          // below — only used for the progress-copy source here; which
          // assemblies get deactivated is now decided by the bom_assembly
          // query below, not by this row's presence. status: 'ACTIVE'
          // because this placeholder assembly hasn't been reconciled yet
          // (that happens later in this same call) — see the
          // "excludes a stale reconciled placeholder row" test below for the
          // INACTIVE case.
          progressRow({ id: 501, dispatch_id: 800, assembly_mark: 'WH-CO-001', status: 'ACTIVE' }, 80),
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      bom_assembly: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        // ACTIVE assemblies currently on the placeholder dispatch — this is
        // what the implementation now scans (by mark) to decide what to
        // deactivate, independent of whether they had progress.
        findMany: jest.fn().mockResolvedValue([{ id: 501, assembly_mark: 'WH-CO-001' }]),
      },
    })

    const assemblyIdByMark = new Map([['WH-CO-001', 999]]) // the brand-new real bom_assembly id from this upload
    await (service as any).carryForwardProgress(1234, 1, 10, null, assemblyIdByMark)

    expect(prisma.bom_assembly_progress.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ assembly_id: 999, cut: 80 })],
      skipDuplicates: true,
    }))
    // Matched placeholder assembly (id 501) flips INACTIVE — unmatched ones must not.
    expect(prisma.bom_assembly.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [501] } },
      data: { status: 'INACTIVE' },
    })
  })

  it('deactivates a matched placeholder assembly even when it has NO bom_assembly_progress row (never touched by a user)', async () => {
    let dispatchFindFirstCall = 0
    const { service, prisma } = makeService({
      bom_dispatch: {
        findFirst: jest.fn(() => {
          dispatchFindFirstCall++
          return Promise.resolve(dispatchFindFirstCall === 1 ? null : { id: 800 })
        }),
      },
      // No progress rows at all — the placeholder assembly was never
      // touched by a user, so it has zero bom_assembly_progress rows.
      bom_assembly_progress: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      bom_assembly: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: 502, assembly_mark: 'WH-CO-003' }]),
      },
    })

    const assemblyIdByMark = new Map([['WH-CO-003', 1000]])
    await (service as any).carryForwardProgress(1234, 1, 10, null, assemblyIdByMark)

    // No progress to carry forward — createMany must not be called with rows.
    expect(prisma.bom_assembly_progress.createMany).not.toHaveBeenCalled()
    // But the matched placeholder assembly must still be deactivated.
    expect(prisma.bom_assembly.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [502] } },
      data: { status: 'INACTIVE' },
    })
  })

  it('does nothing extra when the project has no placeholder dispatch', async () => {
    const { service, prisma } = makeService({})
    const assemblyIdByMark = new Map([['WH-CO-001', 999]])
    await (service as any).carryForwardProgress(1234, 1, 10, null, assemblyIdByMark)
    expect(prisma.bom_assembly.updateMany).not.toHaveBeenCalled()
  })

  it('backward compatibility: with only a prior REAL dispatch (no placeholder), carries progress forward exactly like the old single-source behavior and never touches bom_assembly', async () => {
    let dispatchFindFirstCall = 0
    const { service, prisma } = makeService({
      bom_dispatch: {
        findFirst: jest.fn(() => {
          dispatchFindFirstCall++
          // 1st call = "previous real dispatch of this zone" → found (id 700)
          // 2nd call = "this project's placeholder dispatch" → none
          return Promise.resolve(dispatchFindFirstCall === 1 ? { id: 700 } : null)
        }),
      },
      bom_assembly_progress: {
        findMany: jest.fn().mockResolvedValue([
          progressRow({ id: 601, dispatch_id: 700, assembly_mark: 'WH-CO-002' }, 55),
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    })

    const assemblyIdByMark = new Map([['WH-CO-002', 1001]])
    await (service as any).carryForwardProgress(1234, 1, 10, null, assemblyIdByMark)

    expect(prisma.bom_assembly_progress.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ assembly_id: 1001, cut: 55 })],
      skipDuplicates: true,
    }))
    // No placeholder in play at all — neither the new lookup nor the
    // deactivation call should ever fire.
    expect(prisma.bom_assembly.findMany).not.toHaveBeenCalled()
    expect(prisma.bom_assembly.updateMany).not.toHaveBeenCalled()
  })

  it('with both a prior REAL dispatch and a placeholder matched in the same run, carries progress from both sources but only deactivates the placeholder-sourced assembly', async () => {
    let dispatchFindFirstCall = 0
    const { service, prisma } = makeService({
      bom_dispatch: {
        findFirst: jest.fn(() => {
          dispatchFindFirstCall++
          // 1st call = prior real dispatch (id 700), 2nd call = placeholder (id 800)
          return Promise.resolve(dispatchFindFirstCall === 1 ? { id: 700 } : { id: 800 })
        }),
      },
      bom_assembly_progress: {
        findMany: jest.fn().mockResolvedValue([
          // prev-sourced: a real assembly from the prior real dispatch.
          progressRow({ id: 601, dispatch_id: 700, assembly_mark: 'WH-CO-002' }, 55),
          // placeholder-sourced: same shape as the first test above — ACTIVE
          // because it hasn't been reconciled yet.
          progressRow({ id: 501, dispatch_id: 800, assembly_mark: 'WH-CO-001', status: 'ACTIVE' }, 80),
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      bom_assembly: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        // Only the placeholder dispatch's ACTIVE assemblies come back here —
        // the prev-sourced assembly (601) belongs to the real dispatch 700,
        // not the placeholder dispatch, so it must never appear in this list.
        findMany: jest.fn().mockResolvedValue([{ id: 501, assembly_mark: 'WH-CO-001' }]),
      },
    })

    const assemblyIdByMark = new Map([
      ['WH-CO-002', 1001],
      ['WH-CO-001', 999],
    ])
    await (service as any).carryForwardProgress(1234, 1, 10, null, assemblyIdByMark)

    // Progress carries forward from BOTH sources.
    expect(prisma.bom_assembly_progress.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ assembly_id: 1001, cut: 55 }),
        expect.objectContaining({ assembly_id: 999, cut: 80 }),
      ]),
      skipDuplicates: true,
    }))
    expect((prisma.bom_assembly_progress.createMany as jest.Mock).mock.calls[0][0].data).toHaveLength(2)
    // Only the placeholder-sourced assembly (501) is deactivated — the
    // prev-sourced real assembly (601) must be absent from this list.
    expect(prisma.bom_assembly.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [501] } },
      data: { status: 'INACTIVE' },
    })
  })

  it('Finding 1 regression: excludes a stale, already-reconciled INACTIVE placeholder progress row that collides on the SAME mark as current real (prev) progress, keeping the real value', async () => {
    let dispatchFindFirstCall = 0
    const { service, prisma } = makeService({
      bom_dispatch: {
        findFirst: jest.fn(() => {
          dispatchFindFirstCall++
          // 1st call = prior real dispatch (id 700), 2nd call = placeholder (id 800)
          return Promise.resolve(dispatchFindFirstCall === 1 ? { id: 700 } : { id: 800 })
        }),
      },
      bom_assembly_progress: {
        findMany: jest.fn().mockResolvedValue([
          // Current real progress for this mark — assembly is INACTIVE
          // because it was deactivated earlier in THIS same upload
          // transaction (the legitimate "prev" case, must be kept).
          progressRow({ id: 601, dispatch_id: 700, assembly_mark: 'WH-CO-001', status: 'INACTIVE' }, 90),
          // Stale placeholder progress for the SAME mark — reconciled by an
          // EARLIER upload (assembly already INACTIVE from that prior
          // reconciliation, long before this upload ran). Must be excluded.
          progressRow({ id: 501, dispatch_id: 800, assembly_mark: 'WH-CO-001', status: 'INACTIVE' }, 20),
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      bom_assembly: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        // Placeholder dispatch has no ACTIVE assemblies left for this mark —
        // it was already reconciled by an earlier upload.
        findMany: jest.fn().mockResolvedValue([]),
      },
    })

    const assemblyIdByMark = new Map([['WH-CO-001', 999]])
    await (service as any).carryForwardProgress(1234, 1, 10, null, assemblyIdByMark)

    const data = (prisma.bom_assembly_progress.createMany as jest.Mock).mock.calls[0][0].data
    const rowsFor999 = data.filter((r: any) => r.assembly_id === 999)
    expect(rowsFor999).toHaveLength(1)
    expect(rowsFor999[0].cut).toBe(90) // prev/real value, not the stale placeholder's 20
  })

  it('Finding 1 regression: still includes a placeholder-sourced row when its assembly is still ACTIVE (not yet reconciled) — does not regress the existing dual-source case', async () => {
    let dispatchFindFirstCall = 0
    const { service, prisma } = makeService({
      bom_dispatch: {
        findFirst: jest.fn(() => {
          dispatchFindFirstCall++
          return Promise.resolve(dispatchFindFirstCall === 1 ? { id: 700 } : { id: 800 })
        }),
      },
      bom_assembly_progress: {
        findMany: jest.fn().mockResolvedValue([
          progressRow({ id: 601, dispatch_id: 700, assembly_mark: 'WH-CO-001', status: 'INACTIVE' }, 90),
          // Same mark, placeholder-sourced, still ACTIVE (not yet reconciled) — must be included.
          progressRow({ id: 501, dispatch_id: 800, assembly_mark: 'WH-CO-001', status: 'ACTIVE' }, 20),
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      bom_assembly: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: 501, assembly_mark: 'WH-CO-001' }]),
      },
    })

    const assemblyIdByMark = new Map([['WH-CO-001', 999]])
    await (service as any).carryForwardProgress(1234, 1, 10, null, assemblyIdByMark)

    const data = (prisma.bom_assembly_progress.createMany as jest.Mock).mock.calls[0][0].data
    expect(data).toHaveLength(2)
    expect(data.map((r: any) => r.cut).sort()).toEqual([20, 90])
  })
})

// Plate weight bug (memory project_bom_plate_weight_bug, fixed 2026-10-06):
// for PL profiles the NC "weight" line is kg/m², not a per-piece weight.
describe('BomUploadService.buildDedupedParts — plate weight', () => {
  const svc = new BomUploadService({} as any, {} as any, {} as any, {} as any, {} as any)
  const build = (parts: any[], nc: Record<string, any>) =>
    (svc as any).buildDedupedParts(parts, new Map(Object.entries(nc)))
  const ncOf = (o: Partial<Record<string, unknown>>) => ({ partMark: 'X', grade: 'HY370', qty: 1, profileBase: 'PL10', lengthMm: 358.77, weightKg: 78.5, pieceWeightKg: 7.03, ...o })

  it('PL part keeps the Part List per-piece weight, not the NC kg/m²', () => {
    const [p] = build([{ part_mark: 'A-p1', profile: 'PL10', qty: 1, weight_kg: 7.02 }], { 'A-p1': ncOf({}) })
    expect(p.weight_kg).toBe(7.02)
  })
  it('PL part without a Part List weight uses the NC contour piece weight', () => {
    const [p] = build([{ part_mark: 'A-p1', profile: 'PL10', qty: 1, weight_kg: null }], { 'A-p1': ncOf({}) })
    expect(p.weight_kg).toBe(7.03)
  })
  it('non-PL part is unchanged: NC weight wins', () => {
    const [p] = build([{ part_mark: 'A-r1', profile: 'PIPE113.5X2.4', qty: 1, weight_kg: 22 }], { 'A-r1': ncOf({ profileBase: 'PIPE113.5X2.4', weightKg: 21.94, pieceWeightKg: 21.94 }) })
    expect(p.weight_kg).toBe(21.94)
  })
})

describe('BomUploadService.preview() — rev review', () => {
  const dnBook = (rows: unknown[][]) => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No.', 'MarkNo.', 'Set', 'Rev', '', '', 'WeightKg.', 'STATUS'], ...rows]), 'D')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer
  }
  const parserBy = (byType: Record<string, Partial<ParsedBomFile>>) => ({
    peekContractNo: jest.fn().mockReturnValue(''),
    parse: jest.fn((_b: Buffer, docType: string) => ({ docType, assemblies: [], parts: [], assemblyParts: [], ...(byType[docType] ?? {}) })),
  })
  // ACTIVE row as Prisma returns it (Decimals as strings)
  const active = (mark: string, rev: number, over: object = {}) => ({
    assembly_mark: mark, name: 'BRACE', qty: '18.000', weight_kg: '104.445', surface_area_m2: '3.2761', length_mm: '650.00', width_mm: null, height_mm: null,
    rev, slot: null, assembly_parts: [{ qty: '1.000', part: { part_mark: 'p1', description: null, profile: 'L50x50', grade: 'SS400', length_mm: '650.00', weight_kg: '5.800' } }],
    ...over,
  })
  const fileAsm = (mark: string, over: object = {}) => ({ assembly_mark: mark, name: 'BRACE', qty: 18, weight_kg: 104.4449, surface_area_m2: 3.27612, length_mm: 650.004, ...over })
  const combinedParsed = (asms: object[]) => ({
    ASSEMBLY_LIST: { assemblies: asms as any },
    PART_LIST: { parts: [{ part_mark: 'p1', profile: 'L50x50', grade: 'SS400', qty: 18, length_mm: 650, weight_kg: 5.8 }] },
    ASSEMBLY_PART_LIST: { assemblyParts: (asms as any[]).map(a => ({ assembly_mark: a.assembly_mark, part_mark: 'p1', qty: 1 })) },
  })
  const combinedFiles = (extra: FileInput[] = []) => [
    makeFileInput({ docType: 'ASSEMBLY_LIST' }),
    makeFileInput({ docType: 'PART_LIST', originalname: 'part_list.xlsx' }),
    makeFileInput({ docType: 'ASSEMBLY_PART_LIST', originalname: 'assembly_part_list.xlsx' }),
    ...extra,
  ]
  const svcWith = (parser: any, activeRows: any[], latestId: number | null = 7) => {
    const base = buildPrisma()
    const prisma = makePrisma({
      bom_assembly: { findMany: jest.fn().mockResolvedValue(activeRows) } as any,
      bom_dispatch: { ...base.bom_dispatch, findFirst: jest.fn().mockResolvedValue(latestId == null ? null : { id: latestId }) },
    })
    return { svc: new BomUploadService(prisma as any, makeStorage() as any, parser as any, makeMatching() as any, makeDiffService(prisma) as any), prisma }
  }
  const scope = { projectId: 1, zoneId: 2, subZoneId: null }

  it('identical re-upload (file decimals vs stored scale) → no review rows (Review Focus 1)', async () => {
    const { svc } = svcWith(parserBy(combinedParsed([fileAsm('B1')])), [active('B1', 2)])
    const r = await svc.preview(combinedFiles(), [], 'combined', scope)
    expect(r.review).toEqual({ base_dispatch_id: 7, has_dn: false, rows: [], dn_only_marks: [], dn_warnings: [] })
    expect(r.unmatchedAssemblyMarks).toEqual([])
  })

  // final review fix 6: junctions without a Part List can't build part lines → don't compare parts
  it('Assembly List + Assembly Part List with no Part List: parts are left out of the compare (no false "changed")', async () => {
    const parsed = combinedParsed([fileAsm('B1')]) as any
    delete parsed.PART_LIST
    const { svc } = svcWith(parserBy(parsed), [active('B1', 2)])
    const r = await svc.preview([makeFileInput({ docType: 'ASSEMBLY_LIST' }), makeFileInput({ docType: 'ASSEMBLY_PART_LIST', originalname: 'assembly_part_list.xlsx' })], [], 'combined', scope)
    expect(r.review.rows).toEqual([])
  })

  it('reads the zone\'s ACTIVE real-upload rows as the previous state', async () => {
    const { svc, prisma } = svcWith(parserBy(combinedParsed([fileAsm('B1')])), [active('B1', 2)])
    await svc.preview(combinedFiles(), [], 'combined', scope)
    expect(prisma.bom_assembly.findMany.mock.calls[0][0].where).toEqual({ status: 'ACTIVE', dispatch: { project_id: 1, zone_id: 2, sub_zone_id: null, source: 'BOM_UPLOAD' } })
  })

  it('Dispatch Note: changed + DN rev up → DN rev; a mark only in the DN → dn_only_marks (Review Focus 4)', async () => {
    const dn = makeFileInput({ docType: 'DISPATCH_NOTE', originalname: 'Z1 Dispatch Note Rev.2.xls', mimetype: 'application/vnd.ms-excel',
      buffer: dnBook([[1, 'B2', 1, 0, 1, 2, 20, 'changed'], [2, 'X9', 1, 0, 1, '', 5, '']]) })
    const { svc } = svcWith(parserBy(combinedParsed([fileAsm('B1'), fileAsm('B2', { length_mm: 700 })])), [active('B1', 1), active('B2', 1)])
    const r = await svc.preview(combinedFiles([dn]), [], 'combined', scope)
    expect(r.review.has_dn).toBe(true)
    expect(r.review.rows.map(x => [x.mark, x.kind, x.suggested_rev, x.suggested_source, x.dn_status])).toEqual([['B2', 'changed', 2, 'DISPATCH_NOTE', 'changed']])
    expect(r.review.dn_only_marks).toEqual(['X9'])
  })

  it('separate mode, ACC-only upload: MAIN marks are never "removed"; a moved mark keeps its rev (Review Focus 2)', async () => {
    const parser = parserBy({
      ACC_ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'A1', weight_kg: 9 }, { assembly_mark: 'M2' }] as any },
      ACC_PART_LIST: { parts: [] }, ACC_ASSEMBLY_PART_LIST: { assemblyParts: [] },
    })
    const rows = [
      active('M1', 1, { slot: 'MAIN', assembly_parts: [] }), active('M2', 3, { slot: 'MAIN', name: null, qty: null, weight_kg: null, surface_area_m2: null, length_mm: null, assembly_parts: [] }),
      active('A1', 0, { slot: 'ACC', name: null, qty: null, weight_kg: '8.000', surface_area_m2: null, length_mm: null, assembly_parts: [] }),
      active('A2', 0, { slot: 'ACC', assembly_parts: [] }),
    ]
    const { svc } = svcWith(parser, rows)
    const files = ['ACC_ASSEMBLY_LIST', 'ACC_PART_LIST', 'ACC_ASSEMBLY_PART_LIST'].map(t => makeFileInput({ docType: t as any, originalname: `ACC ${t}.xlsx` }))
    const r = await svc.preview(files, [], 'separate', scope)
    expect(r.review.rows.filter(x => x.kind === 'removed').map(x => x.mark)).toEqual(['A2'])
    expect(r.review.rows.find(x => x.mark === 'A1')).toMatchObject({ kind: 'changed', prev_rev: 0, suggested_rev: 1, warning: 'CHANGED_NO_REV_UP' })
    expect(r.review.rows.find(x => x.mark === 'M2')).toBeUndefined() // unchanged, carried at rev 3
  })

  it('first upload of a zone: every mark is new — rev 0, or the DN rev', async () => {
    const dn = makeFileInput({ docType: 'DISPATCH_NOTE', originalname: 'DN.xls', mimetype: 'application/vnd.ms-excel', buffer: dnBook([[1, 'B1', 1, 0, 1, 2, 20, '']]) })
    const { svc } = svcWith(parserBy(combinedParsed([fileAsm('B1'), fileAsm('B2')])), [], null)
    const r = await svc.preview(combinedFiles([dn]), [], 'combined', scope)
    expect(r.review.base_dispatch_id).toBeNull()
    expect(r.review.rows.map(x => [x.mark, x.suggested_rev])).toEqual([['B1', 2], ['B2', 0]])
  })

  it('refuses a Dispatch Note without any BOM list', async () => {
    const dn = makeFileInput({ docType: 'DISPATCH_NOTE', originalname: 'DN.xls', mimetype: 'application/vnd.ms-excel', buffer: dnBook([]) })
    const { svc } = svcWith(parserBy({}), [])
    await expect(svc.preview([dn], [], 'combined', scope)).rejects.toThrow(new BadRequestException('ต้องมีไฟล์ BOM อย่างน้อย 1 ไฟล์ — อัปโหลด Dispatch Note อย่างเดียวไม่ได้'))
  })

  it('a Dispatch Note does not count as "mixing combined and separate"', async () => {
    const dn = makeFileInput({ docType: 'MAIN_DISPATCH_NOTE', originalname: 'MAIN DN.xls', mimetype: 'application/vnd.ms-excel', buffer: dnBook([]) })
    const parser = parserBy({ MAIN_ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'M1' }] as any } })
    const { svc } = svcWith(parser, [])
    await expect(svc.preview([makeFileInput({ docType: 'MAIN_ASSEMBLY_LIST', originalname: 'MAIN AL.xlsx' }), dn], [], 'separate', scope)).resolves.toBeDefined()
  })

  it('the Dispatch Note never reaches the Tekla list parser', async () => {
    const dn = makeFileInput({ docType: 'DISPATCH_NOTE', originalname: 'DN.xls', mimetype: 'application/vnd.ms-excel', buffer: dnBook([[1, 'B1', 1, 0, 1, 2, 20, '']]) })
    const parser = parserBy(combinedParsed([fileAsm('B1')]))
    const { svc } = svcWith(parser, [])
    await svc.preview(combinedFiles([dn]), [], 'combined', scope)
    expect(parser.parse.mock.calls.map(c => c[1])).toEqual(['ASSEMBLY_LIST', 'PART_LIST', 'ASSEMBLY_PART_LIST'])
  })

  describe('separate mode — one Dispatch Note per slot (2026-10-26)', () => {
    const sdn = (slot: 'MAIN' | 'ACC', rows: unknown[][]) =>
      makeFileInput({ docType: `${slot}_DISPATCH_NOTE` as any, originalname: `${slot} DN.xls`, mimetype: 'application/vnd.ms-excel', buffer: dnBook(rows) })
    const mainAl = makeFileInput({ docType: 'MAIN_ASSEMBLY_LIST', originalname: 'MAIN AL.xlsx' })
    const accAl = makeFileInput({ docType: 'ACC_ASSEMBLY_LIST', originalname: 'ACC AL.xlsx' })
    const parser = () => parserBy({
      MAIN_ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'M1' }, { assembly_mark: 'X' }] as any },
      ACC_ASSEMBLY_LIST: { assemblies: [{ assembly_mark: 'A1' }] as any },
    })

    it('each mark takes its own slot\'s DN rev; a mark in both DNs → Thai warning; dn_only per slot', async () => {
      const p = parser()
      const { svc } = svcWith(p, [], null)
      const main = sdn('MAIN', [[1, 'M1', 1, 0, 1, 2, 20, ''], [2, 'X', 1, 0, 1, 1, 20, ''], [3, 'A1', 1, 0, 1, 9, 20, '']])
      const acc = sdn('ACC', [[1, 'A1', 1, 0, 1, 3, 20, ''], [2, 'X', 1, 0, 1, 7, 20, '']])
      const r = await svc.preview([mainAl, accAl, main, acc], [], 'separate', scope)
      expect(r.review.has_dn).toBe(true)
      expect(r.review.rows.map(x => [x.mark, x.suggested_rev])).toEqual([['M1', 2], ['X', 1], ['A1', 3]])
      expect(r.review.dn_only_marks).toEqual(['A1', 'X']) // A1 in the Main DN but not the Main lists; X likewise for Acc
      expect(r.review.dn_warnings).toEqual(['A1, X: อยู่ใน Dispatch Note ทั้ง Main และ Acc — ใช้ rev จาก Dispatch Note ของช่องที่ mark นั้นอยู่'])
      expect(p.parse.mock.calls.map(c => c[1])).toEqual(['MAIN_ASSEMBLY_LIST', 'ACC_ASSEMBLY_LIST'])
    })

    it('only the Main DN sent → has_dn, Acc marks get no DN rev', async () => {
      const { svc } = svcWith(parser(), [], null)
      const r = await svc.preview([mainAl, accAl, sdn('MAIN', [[1, 'M1', 1, 0, 1, 2, 20, '']])], [], 'separate', scope)
      expect(r.review.has_dn).toBe(true)
      expect(r.review.rows.map(x => [x.mark, x.suggested_rev, x.in_dn])).toEqual([['M1', 2, true], ['X', 0, false], ['A1', 0, false]])
    })

    it('refuses a plain Dispatch Note in separate mode', async () => {
      const { svc } = svcWith(parser(), [])
      const dn = makeFileInput({ docType: 'DISPATCH_NOTE', originalname: 'DN.xls', mimetype: 'application/vnd.ms-excel', buffer: dnBook([]) })
      await expect(svc.preview([mainAl, dn], [], 'separate', scope)).rejects.toThrow(new BadRequestException('โหมดแยก Main/Acc: ใส่ Dispatch Note ในช่อง Main หรือ Acc'))
    })

    it('refuses a Main DN without Main lists, and an Acc DN without Acc lists', async () => {
      const { svc } = svcWith(parser(), [])
      await expect(svc.preview([accAl, sdn('MAIN', [])], [], 'separate', scope)).rejects.toThrow(new BadRequestException('ใส่ Dispatch Note ของ Main แล้ว แต่ไม่มีไฟล์ BOM ของ Main'))
      await expect(svc.preview([mainAl, sdn('ACC', [])], [], 'separate', scope)).rejects.toThrow(new BadRequestException('ใส่ Dispatch Note ของ Acc แล้ว แต่ไม่มีไฟล์ BOM ของ Acc'))
      await expect(svc.preview(combinedFiles([sdn('MAIN', [])]), [], 'combined', scope)).rejects.toThrow(new BadRequestException('ใส่ Dispatch Note ของ Main แล้ว แต่ไม่มีไฟล์ BOM ของ Main'))
    })

    it('refuses Dispatch Notes without any BOM list', async () => {
      const { svc } = svcWith(parser(), [])
      await expect(svc.preview([sdn('MAIN', []), sdn('ACC', [])], [], 'separate', scope)).rejects.toThrow(new BadRequestException('ต้องมีไฟล์ BOM อย่างน้อย 1 ไฟล์ — อัปโหลด Dispatch Note อย่างเดียวไม่ได้'))
    })

    it('refuses two Dispatch Notes of the same slot (combined: two DISPATCH_NOTE)', async () => {
      const { svc } = svcWith(parser(), [])
      await expect(svc.preview([mainAl, sdn('MAIN', []), sdn('MAIN', [])], [], 'separate', scope)).rejects.toThrow(BadRequestException)
      const dn = makeFileInput({ docType: 'DISPATCH_NOTE', originalname: 'DN.xls', mimetype: 'application/vnd.ms-excel', buffer: dnBook([]) })
      await expect(svc.preview(combinedFiles([dn, dn]), [], 'combined', scope)).rejects.toThrow(BadRequestException)
    })
  })

  it('a removed mark still listed in the Dispatch Note shows once (removed row), not again in dn_only_marks', async () => {
    const dn = makeFileInput({ docType: 'DISPATCH_NOTE', originalname: 'DN.xls', mimetype: 'application/vnd.ms-excel', buffer: dnBook([[1, 'B2', 1, 0, 1, '', 20, '']]) })
    const { svc } = svcWith(parserBy(combinedParsed([fileAsm('B1')])), [active('B1', 0), active('B2', 0)])
    const r = await svc.preview(combinedFiles([dn]), [], 'combined', scope)
    expect(r.review.rows.map(x => [x.mark, x.kind, x.in_dn])).toEqual([['B2', 'removed', true]])
    expect(r.review.dn_only_marks).toEqual([])
  })
})
