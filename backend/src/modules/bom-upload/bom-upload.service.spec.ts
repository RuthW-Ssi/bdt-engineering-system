import * as fs from 'fs'
import { BadRequestException, NotFoundException, Logger } from '@nestjs/common'
import { BomUploadService, FileInput, NcFileInput, findMismatchedJunctions, requiresNcFile } from './bom-upload.service'
import { BomDiffService } from './bom-diff.service'
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

function makeMatching() {
  return {
    matchAssemblies: jest.fn().mockResolvedValue(undefined),
    matchParts: jest.fn().mockResolvedValue(undefined),
    enforceStandardIntegrity: jest.fn().mockResolvedValue(undefined),
    autoCreateCustomProducts: jest.fn().mockResolvedValue(0),
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
    }
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)

    await expect(svc.upload([makeFileInput()], [], 1, 2, null, 1)).rejects.toThrow('DB down')
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1)
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

describe('BomUploadService — revision resolution', () => {
  function buildRevisionPrisma(latestRevision: number | null) {
    const dispatch = { id: 1, project_id: 1, zone_id: 2, sub_zone_id: null, status: 'pending', uploaded_at: new Date(), assembly_total: null, part_total: null }
    const innerCreateSpy = jest.fn().mockResolvedValue({ ...dispatch, id: 100 })
    const prisma = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb({
        bom_dispatch: {
          findFirst: jest.fn().mockResolvedValue(latestRevision == null ? null : { revision: latestRevision }),
          create: innerCreateSpy,
          update: jest.fn(({ data }: any) => Promise.resolve({ ...dispatch, ...data })),
        },
        bom_doc_revision: { create: jest.fn().mockResolvedValue({ id: 1 }) },
        bom_assembly: { createManyAndReturn: jest.fn().mockResolvedValue([]) },
        bom_part: { createManyAndReturn: jest.fn().mockResolvedValue([]) },
        bom_assembly_part: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      })),
      bom_dispatch: {
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(makeDetailRow()),
        findMany: jest.fn(({ select }: any = {}) =>
          select?.revision
            ? Promise.resolve([{ id: 1, revision: 1 }])
            : Promise.resolve([{ id: 1, doc_revisions: [{ doc_type: 'ASSEMBLY_LIST' }] }]),
        ),
      },
      bom_doc_revision: { findMany: jest.fn().mockResolvedValue([]) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
      bom_part: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    }
    return { prisma, innerCreateSpy }
  }

  const minimalFiles: FileInput[] = [
    { buffer: Buffer.from('x'), originalname: 'assembly list.xlsx', mimetype: 'application/vnd.ms-excel', size: 1, docType: 'ASSEMBLY_LIST' },
    { buffer: Buffer.from('x'), originalname: 'assembly part list.xlsx', mimetype: 'application/vnd.ms-excel', size: 1, docType: 'ASSEMBLY_PART_LIST' },
    { buffer: Buffer.from('x'), originalname: 'part list.xlsx', mimetype: 'application/vnd.ms-excel', size: 1, docType: 'PART_LIST' },
  ]
  const noNcFiles: NcFileInput[] = []

  it('forces revision 1 when no prior dispatch exists for the zone/sub-zone, regardless of choice', async () => {
    const { prisma, innerCreateSpy } = buildRevisionPrisma(null)
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)
    await svc.upload(minimalFiles, noNcFiles, 1, 2, null, 1, 'combined', 'new')
    expect(innerCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 1 }) }))
  })

  it('reuses the latest revision when revisionChoice is "continue"', async () => {
    const { prisma, innerCreateSpy } = buildRevisionPrisma(3)
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)
    await svc.upload(minimalFiles, noNcFiles, 1, 2, null, 1, 'combined', 'continue')
    expect(innerCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 3 }) }))
  })

  it('increments to latest+1 when revisionChoice is "new" and a prior dispatch exists', async () => {
    const { prisma, innerCreateSpy } = buildRevisionPrisma(3)
    const svc = new BomUploadService(prisma as any, makeStorage() as any, makeParser() as any, makeMatching() as any, makeDiffService(prisma) as any)
    await svc.upload(minimalFiles, noNcFiles, 1, 2, null, 1, 'combined', 'new')
    expect(innerCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 4 }) }))
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
