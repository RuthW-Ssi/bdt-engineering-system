import * as fs from 'fs'
import * as path from 'path'
import { BadRequestException } from '@nestjs/common'
import { CuttingPlanService } from '../cutting-plan.service'
import { CuttingPlanShapeService } from './cutting-plan-shape.service'
import * as cutlogic from './cutlogic-parser'

// Real CutLogic CP PDFs (0X222 zone 3, June 2026)
const pdf = (f: string) => fs.readFileSync(path.join(__dirname, '__fixtures__', f))
const P113 = pdf('cp-pipe-113.5x2.4-zone3.pdf')
const P101 = pdf('cp-pipe-101.6x2.6-zone3.pdf')
const N113 = 'CP-0X222 Driving Bangna - BIF Column zone 3 revise -PIPE 113.5X2.4-HSS550.pdf'
const N101 = 'CP-0X222 Driving Bangna - BIF Column zone 3 revise - PIPE 101.6X2.6-HSS550.pdf'
const FIELDS = { project_id: 5, zone_id: 50, version: '1', revision: '0' }
const UUID = '22222222-2222-2222-2222-222222222222'
const key = (n: string) => `cutting-plan/_incoming/0X197/${UUID}/${n}`
const file = (originalname: string, buffer: Buffer) => ({ originalname, buffer })

function build() {
  const objects = new Map<string, Buffer>()
  const storage = {
    objects,
    getMetadata: jest.fn(async (k: string) => (objects.has(k) ? { size: objects.get(k)!.length } : null)),
    getObject: jest.fn(async (k: string) => { if (!objects.has(k)) throw new Error('missing ' + k); return objects.get(k)! }),
    delete: jest.fn(async (k: string) => { objects.delete(k) }),
    copy: jest.fn(async (from: string, to: string) => { objects.set(to, objects.get(from)!) }),
    list: jest.fn(async () => []),
    getUploadUrl: jest.fn(),
  }
  const fileRows: any[] = []
  const sizeCreates: any[] = []
  const tx = {
    cutting_plan_upload: { create: jest.fn(async ({ data }: any) => ({ id: 7, ...data })) },
    cutting_plan_shape_size: { create: jest.fn(async ({ data }: any) => { sizeCreates.push(data); return { id: sizeCreates.length } }) },
    cutting_plan_file: { createMany: jest.fn(async ({ data }: any) => { fileRows.push(...data); return { count: data.length } }) },
  }
  const prisma: any = {
    _tx: tx, _files: fileRows, _sizes: sizeCreates,
    $transaction: jest.fn((cb: any) => cb(tx)),
    project: { findUnique: jest.fn(async ({ where }: any) => (where.id === 5 ? { id: 5, project_code: '0X197' } : null)) },
    project_zone: { findUnique: jest.fn(async ({ where }: any) => (where.id === 50 ? { id: 50, project_id: 5, code: 'Z0' } : null)) },
    sub_zone: { findUnique: jest.fn(async () => null) },
    cutting_plan_shape_size: { findMany: jest.fn(async (): Promise<any[]> => []) },
    cutting_plan_file: { findMany: jest.fn(async () => fileRows.map((r, i) => ({ id: i + 1, ...r }))) },
    cutting_plan_upload: { findUnique: jest.fn(async () => ({ id: 7, files: [], shape_sizes: [] })) },
  }
  const plate = new CuttingPlanService(prisma, { submit: jest.fn() } as any, storage as any)
  return { prisma, storage, shape: new CuttingPlanShapeService(prisma, storage as any, plate) }
}

describe('CuttingPlanShapeService.preview', () => {
  afterEach(() => jest.restoreAllMocks())

  it('PS and part lists are not used', async () => {
    const { shape } = build()
    const r = await shape.preview([file(N113, P113)], FIELDS, [N113, 'PS-0X222 … PIPE 113.5X2.4-HSS550.pdf', 'BIF PIPE COLUMN ZONE 3 Part List.xls'])
    expect(r.notUsed).toEqual(['PS-0X222 … PIPE 113.5X2.4-HSS550.pdf', 'BIF PIPE COLUMN ZONE 3 Part List.xls'])
    expect(r.problems).toEqual([])
    expect(r.sizes).toEqual([{ file: N113, profile: 'PIPE 113.5X2.4', grade: 'HSS550', stocks: 22, parts: 47, yieldPct: 93.77 }])
  })

  it('another kind of file is a problem', async () => {
    const { shape } = build()
    const r = await shape.preview([file(N113, P113)], FIELDS, [N113, 'drawing.dxf'])
    expect(r.problems).toEqual([{ file: 'drawing.dxf', problem: 'Not a CutLogic CP-*.pdf (PS-*.pdf and Part Lists are left out)' }])
  })

  it('same size twice in one upload is refused', async () => {
    const { shape } = build()
    const copy = N113.replace('CP-', 'CP-copy ')
    const r = await shape.preview([file(N113, P113), file(copy, P113)], FIELDS, [N113, copy])
    expect(r.problems).toEqual([{ file: copy, problem: `Same size (PIPE 113.5X2.4) as ${N113}` }])
  })

  it('a profile in the title that differs from the file name refuses the file', async () => {
    const { shape } = build()
    const wrong = 'CP-x - PIPE 101.6X2.6-HSS550.pdf'
    const r = await shape.preview([file(wrong, P113)], FIELDS, [wrong])
    expect(r.problems).toEqual([{ file: wrong, problem: 'The file name says PIPE 101.6X2.6, the report is PIPE 113.5X2.4' }])
  })

  it('a non-CutLogic PDF is listed as "Not a CutLogic 1D cutting layout"', async () => {
    const { shape } = build()
    jest.spyOn(cutlogic, 'pdfLines').mockResolvedValueOnce(['Some other PDF'])
    const r = await shape.preview([file(N113, P113)], FIELDS, [N113])
    expect(r.problems).toEqual([{ file: N113, problem: 'Not a CutLogic 1D cutting layout' }])
  })

  // final review 2026-11-10: Note 2 / marks are free text; longer than their columns used to pass preview and 500 on save
  it('a grade or mark longer than its column is a problem, not a failed save', async () => {
    const { shape } = build()
    const real = cutlogic.parseCutLogic(await cutlogic.pdfLines(P113))
    jest.spyOn(cutlogic, 'parseCutLogic').mockReturnValueOnce({ ...real, grade: 'G'.repeat(31), layouts: [{ ...real.layouts[0], parts: [{ ...real.layouts[0].parts[0], mark: 'M'.repeat(121) }] }, ...real.layouts.slice(1)] })
    const r = await shape.preview([file(N113, P113)], FIELDS, [N113])
    expect(r.problems.map(p => p.problem)).toEqual(expect.arrayContaining([
      'Grade (Note 2) is longer than 30 characters', `Mark ${'M'.repeat(20)}… is longer than 120 characters`,
    ]))
  })

  it('grade mismatch is a warning', async () => {
    const { shape } = build()
    const n = 'CP-x - PIPE 113.5X2.4-SS500.pdf'
    const r = await shape.preview([file(n, P113)], FIELDS, [n])
    expect(r.problems).toEqual([])
    expect(r.warnings).toEqual([`${n}: the file name says grade SS500, the report says HSS550`])
  })

  it('names a size already in the system for the same project + zone', async () => {
    const { shape, prisma } = build()
    const same = cutlogic.shapeFingerprint(await cutlogic.pdfLines(P113))
    prisma.cutting_plan_shape_size.findMany.mockResolvedValueOnce([{ profile: 'PIPE 113.5X2.4', fingerprint: same, upload_id: 3 }])
    const r = await shape.preview([file(N113, P113)], FIELDS, [N113])
    expect(r.alreadyInSystem).toEqual([{ profile: 'PIPE 113.5X2.4', uploadId: 3, sameReport: true }])
    expect(prisma.cutting_plan_shape_size.findMany.mock.calls[0][0].where.upload).toMatchObject({ plan_type: 'SHAPE', project_id: 5, zone_id: 50, sub_zone_id: null })
  })
})

describe('CuttingPlanShapeService.upload', () => {
  afterEach(() => jest.restoreAllMocks())
  const stage = (s: ReturnType<typeof build>['storage'], ...files: [string, Buffer][]) =>
    files.map(([n, b]) => { s.objects.set(key(n), b); return { upload_key: key(n), file_name: n } })

  it('save writes sizes, layouts and parts and moves the PDF to cutting-plan/shape/0X197/Z0/<id>/', async () => {
    const { shape, storage, prisma } = build()
    const staged = stage(storage, [N113, P113], [N101, P101])
    await shape.upload(staged, FIELDS, 9)
    expect(prisma._tx.cutting_plan_upload.create.mock.calls[0][0].data).toMatchObject({ plan_type: 'SHAPE', project_id: 5, zone_id: 50, create_uid: 9 })
    const s113 = prisma._sizes.find((s: any) => s.profile === 'PIPE 113.5X2.4')
    expect(s113).toMatchObject({ grade: 'HSS550', plan_no: 668, stocks: 22, parts: 47, layouts_count: 5 })
    expect(s113.layouts.create[0]).toMatchObject({ seq: 1, stock_no: 1, stock_length_mm: 6013, rest_mm: 0, repeat: 10 })
    expect(s113.layouts.create[0].parts.createMany.data[0]).toMatchObject({ seq: 1, part_no: 4, mark: 'DBN-A3-m76', length_mm: 3400.71, count: 1 })
    expect(prisma._files.map((f: any) => [f.plate_name, f.kind, f.file_key])).toEqual([
      ['PIPE 113.5X2.4', 'PDF', `cutting-plan/shape/0X197/Z0/7/${N113}`],
      ['PIPE 101.6X2.6', 'PDF', `cutting-plan/shape/0X197/Z0/7/${N101}`],
    ])
    expect(storage.objects.has(`cutting-plan/shape/0X197/Z0/7/${N113}`)).toBe(true)
    expect(staged.every(f => !storage.objects.has(f.upload_key))).toBe(true)
  })

  it('totals that don\'t add up refuse the whole upload', async () => {
    const { shape, storage, prisma } = build()
    const staged = stage(storage, [N113, P113], [N101, P101])
    jest.spyOn(cutlogic, 'planProblems').mockReturnValueOnce(['Stocks: layouts add up to 23, the report says 22'])
    await expect(shape.upload(staged, FIELDS, 9)).rejects.toThrow(/Cannot save: fix these files and upload again\. .* · Stocks: layouts add up to 23, the report says 22/)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(staged.every(f => !storage.objects.has(f.upload_key))).toBe(true)
  })

  it('same project + zone + size + same report is skipped; all copies → refused', async () => {
    const { shape, storage, prisma } = build()
    const fp = cutlogic.shapeFingerprint(await cutlogic.pdfLines(P113))
    prisma.cutting_plan_shape_size.findMany.mockResolvedValue([{ profile: 'PIPE 113.5X2.4', fingerprint: fp, upload_id: 3 }])
    await expect(shape.upload(stage(storage, [N113, P113]), FIELDS, 9)).rejects.toThrow(/Every size is already in the system with the same report \(PIPE 113\.5X2\.4\)\. Nothing was saved\./)
    await shape.upload(stage(storage, [N113, P113], [N101, P101]), FIELDS, 9)
    expect(prisma._sizes.map((s: any) => s.profile)).toEqual(['PIPE 101.6X2.6'])
  })

  it('All zones: no zone → files under cutting-plan/shape/0X197/ALL/<id>/', async () => {
    const { shape, storage, prisma } = build()
    await shape.upload(stage(storage, [N113, P113]), { ...FIELDS, zone_id: undefined }, 9)
    expect(prisma._tx.cutting_plan_upload.create.mock.calls[0][0].data.zone_id).toBeNull()
    expect(prisma._files[0].file_key).toBe(`cutting-plan/shape/0X197/ALL/7/${N113}`)
  })

  it('refuses staged files that are not CP PDFs, without deleting anything', async () => {
    const { shape, storage } = build()
    const staged = stage(storage, ['PS-x - PIPE 113.5X2.4-HSS550.pdf', P113])
    await expect(shape.upload(staged, FIELDS, 9)).rejects.toThrow(BadRequestException)
    expect(storage.delete).not.toHaveBeenCalled()
  })
})
