import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CuttingPlanService, MAX_PLATES, MAX_TXT_BYTES } from './cutting-plan.service'
import { CuttingPlanReportErrors } from './cutting-plan-api.client'
import type { CuttingPlanApiClient, CuttingPlanApiResponse } from './cutting-plan-api.client'

const FIELDS = { project_id: 5, zone_id: 50, description: 'main', version: '1', revision: '0' }
const FILE = { buffer: Buffer.from('NESTING\nNC File\t:\t00009430.cld\n'), originalname: 'X197-Z0-5-1.txt' }
const ALL_NAMES = ['txt', 'xls', 'pdf', 'dxf'].map(e => `X197-Z0-5-1.${e}`)
const UUID = '11111111-1111-1111-1111-111111111111'
const STAGED = ALL_NAMES.map(n => ({ upload_key: `cutting-plan/_incoming/0X197/${UUID}/${n}`, file_name: n }))

// In-memory storage: the four staged objects exist, writes and deletes are recorded.
function buildStorage() {
  const objects = new Map<string, Buffer>(STAGED.map(f => [f.upload_key, f.file_name.endsWith('.txt') ? FILE.buffer : Buffer.from('bytes-' + f.file_name)]))
  return {
    objects,
    getUploadUrl: jest.fn(async (k: string, ct: string) => ({ url: `https://signed/${k}?ct=${ct}`, method: 'PUT' })),
    getMetadata: jest.fn(async (k: string) => (objects.has(k) ? { size: objects.get(k)!.length } : null)),
    getObject: jest.fn(async (k: string) => { if (!objects.has(k)) throw new Error('missing ' + k); return objects.get(k)! }),
    putObject: jest.fn(async (k: string, b: Buffer) => { objects.set(k, b) }),
    delete: jest.fn(async (k: string) => { objects.delete(k) }),
    copy: jest.fn(async (from: string, to: string) => { if (!objects.has(from)) throw new Error('missing ' + from); objects.set(to, objects.get(from)!) }),
    list: jest.fn(async (_prefix: string): Promise<{ key: string; updatedAt: Date }[]> => []),
  }
}

// Real captured single-plate response shape (see cutting-plan-row-mapper.spec.ts
// for the exact fixture provenance) — used here for the upload() nesting_id
// wiring test.
const REAL_API_RESPONSE: CuttingPlanApiResponse = {
  code: 200,
  status: 'success',
  file_id: 'generated-uuid',
  description: 'ETL successfully completed',
  data: {
    nesting: [[
      'generated-uuid', 'X197', 'THEPHA', 'ZONE1', 'main', '1', '0',
      '00009430.cld', '26.08.2025', 3870, 1465, 'JirarojS', '26.08.2025', '23:01', 'Plasma [PlainCuttingUnit]',
      'X197-Z0-5-1',
      1, 1, 11341, 'X197-Z0-5-1', 'HY370', 5, 1480, 6000, 5.75, 226, 75.37,
      'Total', 57.7, 1854, 92.7, 150.4,
    ]],
    order_part: [
      ['generated-uuid', 'X197', 'THEPHA', 'ZONE1', 'main', '1', '0', 1, '0X197', 51, 52, 52, '26.8.2025', 'A-p53 ', 140, 140, 0.6, 'X197-Z0-5-1'],
      ['generated-uuid', 'X197', 'THEPHA', 'ZONE1', 'main', '1', '0', 2, '0X197', 11, 24, 24, '26.8.2025', 'A-p14 ', 284, 98, 1.1, 'X197-Z0-5-1'],
    ],
    plate_usage: [
      ['generated-uuid', 'X197', 'THEPHA', 'ZONE1', 'main', '1', '0', '0X197', 170.24, 225.87, 'X197-Z0-5-1'],
    ],
    remnants: [
      ['generated-uuid', 'X197', 'THEPHA', 'ZONE1', 'main', '1', '0', 'R3715', 2112, 1480, 3.1, 123, 1, 11341, '11341-1', 'X197-Z0-5-1'],
      ['generated-uuid', 'X197', 'THEPHA', 'ZONE1', 'main', '1', '0', 'R3715', 2112, 1480, 3.1, 123, 1, 11341, '11341-1', 'X197-Z0-5-1'], // API's known double-concat bug
    ],
  },
}

function buildApiClient(response: CuttingPlanApiResponse = REAL_API_RESPONSE) {
  return { submit: jest.fn().mockResolvedValue(response) } as unknown as jest.Mocked<CuttingPlanApiClient>
}

function buildPrisma() {
  let idSeq = 1
  const upload = { id: 1 }
  const fileRows: any[] = []

  const tx = {
    cutting_plan_upload: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: idSeq++, ...data })),
    },
    cutting_plan_nesting: {
      createManyAndReturn: jest.fn(({ data }: { data: any[] }) =>
        Promise.resolve(data.map(d => ({ id: idSeq++, ...d })))),
    },
    cutting_plan_order_part: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    cutting_plan_plate_usage: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    cutting_plan_remnant: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    cutting_plan_file: { createMany: jest.fn(({ data }: { data: any[] }) => { fileRows.push(...data.map(d => ({ id: idSeq++, ...d }))); return Promise.resolve({ count: data.length }) }) },
  }

  return {
    $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(tx)),
    _tx: tx,
    cutting_plan_upload: {
      findUnique: jest.fn().mockResolvedValue({ ...upload, nestings: [], order_parts: [], plate_usages: [], remnants: [], files: [] }),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(upload),
    },
    _files: fileRows,
    cutting_plan_file: {
      findMany: jest.fn(async (_args?: any) => fileRows),
      findUnique: jest.fn(async ({ where }: any) => fileRows.find(r => r.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => Object.assign(fileRows.find(r => r.id === where.id), data)),
    },
    cutting_plan_order_part: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    cutting_plan_nesting: {
      findFirst: jest.fn(async () => ({ id: 3, length_mm: '6000', width_mm: '1524', thick_mm: '12', quality: 'HY370', weight_kg: '861', nesting_percent: '77.37' })),
      findMany: jest.fn(async (_args?: any): Promise<any[]> => []), // no plate is in the system unless a test says so
    },
    // Upload picks: project 5 (0X197) → zone 50 → sub-zone 500; zone 60 belongs to another project.
    project: { findUnique: jest.fn(({ where }) => Promise.resolve(where.id === 5 ? { id: 5, project_code: '0X197' } : null)) },
    project_zone: {
      findUnique: jest.fn(({ where }) => Promise.resolve(
        where.id === 50 ? { id: 50, project_id: 5, code: 'Z0' } : where.id === 60 ? { id: 60, project_id: 6, code: 'Z9' } : null)),
    },
    sub_zone: {
      findUnique: jest.fn(({ where }) => Promise.resolve(
        where.id === 500 ? { id: 500, zone_id: 50, active: true, code: 'SZA' } : where.id === 600 ? { id: 600, zone_id: 60, active: true } : null)),
    },
  }
}

describe('CuttingPlanService', () => {
  let prisma: ReturnType<typeof buildPrisma>
  let apiClient: ReturnType<typeof buildApiClient>
  let storage: ReturnType<typeof buildStorage>
  let service: CuttingPlanService

  beforeEach(() => {
    prisma = buildPrisma()
    apiClient = buildApiClient()
    storage = buildStorage()
    service = new CuttingPlanService(prisma as any, apiClient as any, storage as any)
  })

  describe('validation', () => {
    it('rejects preview() with no files', async () => {
      await expect(service.preview([], FIELDS, ALL_NAMES)).rejects.toThrow(BadRequestException)
    })

    it('rejects upload() with a missing required field', async () => {
      await expect(service.upload(STAGED, { ...FIELDS, version: '' }, 1)).rejects.toThrow(BadRequestException)
    })

    it.each([
      ['no project', { project_id: undefined }, 'project_id is required'],
      ['no zone', { zone_id: undefined }, 'zone_id is required'],
      ['an unknown project', { project_id: 99 }, 'Project 99 not found'],
      ['a zone of another project', { zone_id: 60 }, 'Zone 60 is not in the chosen project'],
      ['a sub-zone of another zone', { sub_zone_id: 600 }, 'Sub-zone 600 is not in the chosen zone'],
      ['a lot longer than 60 characters', { lot: 'x'.repeat(61) }, 'lot must be at most 60 characters'],
    ])('rejects preview() with %s, before calling the parser', async (_label, patch, message) => {
      await expect(service.preview([FILE], { ...FIELDS, ...patch } as any, ALL_NAMES)).rejects.toThrow(message)
      expect(apiClient.submit).not.toHaveBeenCalled()
    })
  })

  describe('preview', () => {
    it('does not write to the database', async () => {
      await service.preview([FILE], FIELDS, ALL_NAMES)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('summarizes counts from the API response, remnants counted before dedup', async () => {
      const result = await service.preview([FILE], FIELDS, ALL_NAMES)
      expect(result.summary).toEqual({ plateCount: 1, partCount: 2, plateUsageCount: 1, remnantCount: 2 })
    })

    // 2026-11-09: check every report before saving; any problem refuses the upload and every one is listed
    it('lists a report that bundles several plates and keeps it away from the parser', async () => {
      const multiPlateFile = {
        buffer: Buffer.from('NESTING\nNC File\t:\tA.cld\nNC File\t:\tB.cld\n'),
        originalname: 'bundle.txt',
      }
      const result = await service.preview([FILE, multiPlateFile], FIELDS, [])
      expect(result.reportProblems).toEqual([{ file: 'bundle.txt', section: 'Report', problem: 'Holds 2 plates (NC A, B): export one report per plate' }])
      expect(apiClient.submit.mock.calls[0][0].map((f: any) => f.originalname)).toEqual([FILE.originalname])
    })

    it('lists every report the parser rejects instead of failing with one long message', async () => {
      apiClient.submit.mockRejectedValue(new CuttingPlanReportErrors([
        { file: 'A.txt', message: 'Text format in Remnants is not complatible with criteria. >>> Empty remnants data.' },
        { file: 'B.txt', message: 'Something else' },
      ], 'Error in ETL process: ...'))
      const result = await service.preview([FILE], FIELDS, ALL_NAMES)
      expect(result.reportProblems).toEqual([
        { file: 'A.txt', section: 'Remnants', problem: 'Empty remnants data.' },
        { file: 'B.txt', section: 'Report', problem: 'Something else' },
      ])
    })

    it('still fails on a parser error that names no report', async () => {
      apiClient.submit.mockRejectedValue(new Error('network down'))
      await expect(service.preview([FILE], FIELDS, ALL_NAMES)).rejects.toThrow('network down')
    })

    it('has no mappingError for a well-shaped response', async () => {
      const result = await service.preview([FILE], FIELDS, ALL_NAMES)
      expect(result.mappingError).toBeNull()
    })

    // Regression: a real multi-plate bundled file caused the API to emit 37
    // nesting columns instead of 32 for a non-first plate block — must be
    // caught here (before the user can click "Confirm & Save"), not only at
    // upload() time.
    it('sets mappingError when a row has an unexpected column count, without throwing', async () => {
      const badApiClient = buildApiClient({
        ...REAL_API_RESPONSE,
        data: { ...REAL_API_RESPONSE.data, nesting: [[...REAL_API_RESPONSE.data.nesting[0], 'extra', 'columns']] },
      })
      const badService = new CuttingPlanService(prisma as any, badApiClient as any, storage as any)

      const result = await badService.preview([FILE], FIELDS, ALL_NAMES)
      expect(result.mappingError).toMatch(/unexpected column count/)
      expect(result.summary.plateCount).toBe(1) // summary still reflects raw API counts
    })
  })

  describe('upload', () => {
    it('persists nesting/order_part/plate_usage/remnant rows with nesting_id correctly resolved, remnants deduped', async () => {
      await service.upload(STAGED, FIELDS, 7)

      const nestingCall = prisma._tx.cutting_plan_nesting.createManyAndReturn.mock.calls[0][0]
      expect(nestingCall.data).toHaveLength(1)
      expect(nestingCall.data[0].cuttingplan_number).toBe('X197-Z0-5-1')
      expect(nestingCall.data[0].upload_id).toBe(1)

      const orderPartCall = prisma._tx.cutting_plan_order_part.createMany.mock.calls[0][0]
      expect(orderPartCall.data).toHaveLength(2)
      expect(orderPartCall.data[0].nesting_id).not.toBeNull() // resolved via cuttingplan_number match

      const remnantCall = prisma._tx.cutting_plan_remnant.createMany.mock.calls[0][0]
      expect(remnantCall.data).toHaveLength(1) // 2 duplicated rows from the API -> deduped to 1

      const createCall = prisma._tx.cutting_plan_upload.create.mock.calls[0][0]
      expect(createCall.data.create_uid).toBe(7)
      expect(createCall.data.raw_response).toEqual(REAL_API_RESPONSE)
    })

    it('stores the picks + lot, no tag; pre-fills the project code on every order_part and sends it to the parser', async () => {
      await service.upload(STAGED, { ...FIELDS, sub_zone_id: 500, lot: ' L3 ' }, 7)

      const createCall = prisma._tx.cutting_plan_upload.create.mock.calls[0][0]
      expect(createCall.data).toMatchObject({ project_id: 5, zone_id: 50, sub_zone_id: 500, lot: 'L3' })
      expect(createCall.data).not.toHaveProperty('tag')

      const orderPartCall = prisma._tx.cutting_plan_order_part.createMany.mock.calls[0][0]
      expect(orderPartCall.data.every((r: any) => r.project_code === '0X197')).toBe(true)

      const apiFields = apiClient.submit.mock.calls[0][1]
      expect(apiFields).toMatchObject({ project_code: '0X197', tag: '-' }) // the parser still needs a non-empty tag
    })

    // Real CutLogic quirk (2026-11-07): a long Charge wraps inside the report, so file 0X203-Z1-10-10.txt
    // says "0X203-Z1-10-1 0". 119 of 243 plates in one upload lost their files, 3D view and filters.
    it('names every row after its plate file when the report wraps the plate name', async () => {
      const wrapped = JSON.parse(JSON.stringify(REAL_API_RESPONSE).replaceAll('X197-Z0-5-1', 'X197-Z0-5- 1'))
      apiClient.submit.mockResolvedValue(wrapped)
      await service.upload(STAGED, FIELDS, 7)

      const tx = prisma._tx
      const names = [
        ...tx.cutting_plan_nesting.createManyAndReturn.mock.calls[0][0].data,
        ...tx.cutting_plan_order_part.createMany.mock.calls[0][0].data,
        ...tx.cutting_plan_plate_usage.createMany.mock.calls[0][0].data,
        ...tx.cutting_plan_remnant.createMany.mock.calls[0][0].data,
      ].map((r: any) => r.cuttingplan_number)
      expect(new Set(names)).toEqual(new Set(['X197-Z0-5-1'])) // = the plate_name its files are stored under
      expect(tx.cutting_plan_remnant.createMany.mock.calls[0][0].data[0].nesting_id).not.toBeNull()
    })

    // Real CP_2024_09_0413325: all 40 files are named Z332-… while their reports say Charge Z322-…, so
    // matching names left every plate without its files and 3D. Rows follow the file their Charge is in.
    it('names rows after the file whose report carries their Charge, even when the names differ', async () => {
      const report = Buffer.from([
        'NESTING', 'Article Number\tCount\tPlate Number \tCharge\tQuality', 'm', '1\t1\t11341 \tX197-Z0-5-1\tHY370', 'Orders',
      ].join('\r\n'))
      const staged = ['txt', 'xls', 'pdf', 'dxf'].map(e => ({ upload_key: `cutting-plan/_incoming/0X197/${UUID}/Z332-5-1.${e}`, file_name: `Z332-5-1.${e}` }))
      for (const f of staged) storage.objects.set(f.upload_key, f.file_name.endsWith('.txt') ? report : Buffer.from('bytes'))
      await service.upload(staged, FIELDS, 7)

      const tx = prisma._tx
      const names = [
        ...tx.cutting_plan_nesting.createManyAndReturn.mock.calls[0][0].data,
        ...tx.cutting_plan_order_part.createMany.mock.calls[0][0].data,
        ...tx.cutting_plan_remnant.createMany.mock.calls[0][0].data,
      ].map((r: any) => r.cuttingplan_number)
      expect(new Set(names)).toEqual(new Set(['Z332-5-1']))
      expect(new Set(prisma._files.map((f: any) => f.plate_name))).toEqual(new Set(['Z332-5-1']))
    })

    // Real uploads #83/#126 (2026-11-09): a plate re-nested from another plate's remnant keeps that plate's
    // Charge (205-Z0-10-3-1REVISE2.txt says Charge 205-Z0-10-3). The parser now tags every row with the
    // report it came from (one trailing column); rows follow that file, so the two plates stay apart.
    it('refuses the whole save when a report has a problem, naming it, and stores nothing', async () => {
      const report = Buffer.from([
        'NESTING', 'Article Number\tCount\tPlate Number \tCharge\tQuality', 'm', '1\t1\t11341 \tX197-Z0-5-1\tHY370', 'Orders',
        'Remnants', 'Plate Number\tDimensions\tArea\tm\tWeight kg\tCount', 'R2380', 'Machine times',
      ].join('\r\n'))
      const staged = ['txt', 'xls', 'pdf', 'dxf'].map(e => ({ upload_key: `cutting-plan/_incoming/0X197/${UUID}/Z00-14-6.${e}`, file_name: `Z00-14-6.${e}` }))
      for (const f of staged) storage.objects.set(f.upload_key, f.file_name.endsWith('.txt') ? report : Buffer.from('bytes'))
      await expect(service.upload(staged, FIELDS, 7)).rejects.toThrow('Z00-14-6.txt · Remnants · R2380 has no dimensions')
      expect(apiClient.submit).not.toHaveBeenCalled()
      expect(prisma._tx.cutting_plan_upload.create).not.toHaveBeenCalled()
    })

    it('names rows after the report they came from when two reports share one Charge', async () => {
      const report = Buffer.from([
        'NESTING', 'Article Number\tCount\tPlate Number \tCharge\tQuality', 'm', '1\t1\t11341 \tX197-Z0-5-1\tHY370', 'Orders',
      ].join('\r\n'))
      const staged = ['PLATE-A', 'PLATE-A-1REVISE2'].flatMap(p => ['txt', 'xls', 'pdf', 'dxf']
        .map(e => ({ upload_key: `cutting-plan/_incoming/0X197/${UUID}/${p}.${e}`, file_name: `${p}.${e}` })))
      for (const f of staged) storage.objects.set(f.upload_key, f.file_name.endsWith('.txt') ? report : Buffer.from('bytes'))
      const tagged = (rows: unknown[][]) => ['PLATE-A', 'PLATE-A-1REVISE2'].flatMap(file => rows.map(r => [...r, file]))
      const d = REAL_API_RESPONSE.data
      apiClient.submit.mockResolvedValue({
        ...REAL_API_RESPONSE,
        data: { nesting: tagged(d.nesting), order_part: tagged(d.order_part), plate_usage: tagged(d.plate_usage), remnants: tagged(d.remnants ?? []) },
      })
      await service.upload(staged, FIELDS, 7)

      const tx = prisma._tx
      const nesting = tx.cutting_plan_nesting.createManyAndReturn.mock.calls[0][0].data
      expect(nesting.map((r: any) => r.cuttingplan_number).sort()).toEqual(['PLATE-A', 'PLATE-A-1REVISE2'])
      for (const table of [tx.cutting_plan_order_part, tx.cutting_plan_plate_usage, tx.cutting_plan_remnant]) {
        const rows = table.createMany.mock.calls[0][0].data
        expect(new Set(rows.map((r: any) => r.cuttingplan_number))).toEqual(new Set(['PLATE-A', 'PLATE-A-1REVISE2']))
        expect(rows.every((r: any) => r.nesting_id != null)).toBe(true)
      }
      expect(tx.cutting_plan_remnant.createMany.mock.calls[0][0].data).toHaveLength(2) // one per plate after dedup
    })

    it('stores no sub-zone and no lot when they are left empty', async () => {
      await service.upload(STAGED, { ...FIELDS, lot: '  ' }, 7)
      const createCall = prisma._tx.cutting_plan_upload.create.mock.calls[0][0]
      expect(createCall.data).toMatchObject({ sub_zone_id: null, lot: null })
    })
  })

  describe('plate files (four per plate, kept in storage)', () => {
    it('signs every staging URL in one call, under the project prefix, pdf vs octet-stream', async () => {
      const urls = await service.stagingUrls(5, ['A-1.txt', 'A-1.pdf', 'sub/dir.dxf'])
      expect(urls).toHaveLength(3)
      for (const u of urls) expect(u.upload_key).toMatch(/^cutting-plan\/_incoming\/0X197\/[0-9a-f-]{36}\/[^/]+$/)
      expect(urls.find(u => u.file_name === 'A-1.pdf')!.content_type).toBe('application/pdf')
      expect(urls.find(u => u.file_name === 'A-1.txt')!.content_type).toBe('application/octet-stream')
      expect(urls.find(u => u.file_name === 'sub/dir.dxf')!.upload_key.endsWith('/sub_dir.dxf')).toBe(true)
      await expect(service.stagingUrls(99, ['x.txt'])).rejects.toThrow('Project 99 not found')
    })

    it('preview blocks a plate without its .txt, but not one missing .xls / .dxf', async () => {
      expect((await service.preview([FILE], FIELDS, ['X197-Z0-5-1.txt', 'X197-Z0-5-1.pdf'])).fileProblems).toEqual([])
      expect((await service.preview([FILE], FIELDS, ['X197-Z0-5-1.txt', 'B-2.pdf'])).fileProblems).toEqual(['แผ่น B-2 ไม่มีไฟล์ .txt (ทุกแผ่นต้องมี .txt)'])
    })

    it('preview flags an empty .txt (a real 0-byte file from Drive) and does not send it to the parser', async () => {
      const empty = { buffer: Buffer.alloc(0), originalname: '0X203-Z1-16-17.txt' }
      const r = await service.preview([FILE, empty], FIELDS, [...ALL_NAMES, ...['txt', 'xls', 'pdf', 'dxf'].map(e => `0X203-Z1-16-17.${e}`)])
      expect(r.fileProblems).toEqual(['ไฟล์ .txt ว่างหรือไม่ใช่รายงาน nesting: 0X203-Z1-16-17.txt'])
      expect(apiClient.submit.mock.calls[0][0].map((f: any) => f.originalname)).toEqual(['X197-Z0-5-1.txt'])
    })

    it('save refuses a staged .txt that is empty', async () => {
      storage.objects.set(STAGED[0].upload_key, Buffer.alloc(0))
      await expect(service.upload(STAGED, FIELDS, 7)).rejects.toThrow('ไฟล์ .txt ว่างหรือไม่ใช่รายงาน nesting: X197-Z0-5-1.txt')
      expect(apiClient.submit).not.toHaveBeenCalled()
    })

    it('preview has no problems for a complete set', async () => {
      expect((await service.preview([FILE], FIELDS, ALL_NAMES)).fileProblems).toEqual([])
    })

    it('save refuses a plate without its .txt before calling the parser', async () => {
      await expect(service.upload(STAGED.filter(f => !f.file_name.endsWith('.txt')), FIELDS, 7)).rejects.toThrow('ไม่มีไฟล์ .txt')
      expect(apiClient.submit).not.toHaveBeenCalled()
    })

    it('saves a plate missing its .dxf and stores the files it has', async () => {
      await service.upload(STAGED.filter(f => !f.file_name.endsWith('.dxf')), FIELDS, 7)
      expect(prisma._files.map((f: any) => f.kind).sort()).toEqual(['PDF', 'TXT', 'XLS'])
    })

    // Real CP_2024_09_0413325: 13 plates have a 0-byte .pdf (empty inside the old zip too)
    it('does not store an empty .pdf / .dxf: the plate is saved as having no such file', async () => {
      const pdf = STAGED.find(f => f.file_name.endsWith('.pdf'))!
      storage.objects.set(pdf.upload_key, Buffer.alloc(0))
      await service.upload(STAGED, FIELDS, 7)
      expect(prisma._files.map((f: any) => f.kind).sort()).toEqual(['DXF', 'TXT', 'XLS'])
      expect(storage.objects.has(pdf.upload_key)).toBe(false) // staging cleared
    })

    it('save refuses a staged key outside the chosen project', async () => {
      const other = STAGED.map((f, i) => (i ? f : { ...f, upload_key: `cutting-plan/_incoming/0X999/${UUID}/${f.file_name}` }))
      await expect(service.upload(other, FIELDS, 7)).rejects.toThrow('อัปโหลดไม่ถูกต้อง')
    })

    it('save refuses a staged file that is not in storage', async () => {
      storage.objects.delete(STAGED[2].upload_key)
      await expect(service.upload(STAGED, FIELDS, 7)).rejects.toThrow('ไม่พบไฟล์ X197-Z0-5-1.pdf')
    })

    it('parses only the .txt, stores all four under plate/<project>/<zone>/<sub-zone>/<upload-id>/, and clears staging', async () => {
      await service.upload(STAGED, { ...FIELDS, sub_zone_id: 500 }, 7)
      expect(apiClient.submit.mock.calls[0][0].map((f: any) => f.originalname)).toEqual(['X197-Z0-5-1.txt'])
      const keys = prisma._files.map((r: any) => r.file_key).sort()
      expect(keys).toEqual(['dxf', 'pdf', 'txt', 'xls'].map(e => `cutting-plan/plate/0X197/Z0/SZA/1/X197-Z0-5-1.${e}`))
      expect(prisma._files.map((r: any) => r.kind).sort()).toEqual(['DXF', 'PDF', 'TXT', 'XLS'])
      for (const k of keys) expect(storage.objects.has(k)).toBe(true)
      for (const f of STAGED) expect(storage.objects.has(f.upload_key)).toBe(false)
      expect(prisma._files.every((r: any) => r.size_bytes > 0)).toBe(true)
    })

    it('if storing a file fails, the upload is removed again with the files already written', async () => {
      storage.copy.mockImplementationOnce(async (f: string, t: string) => { storage.objects.set(t, storage.objects.get(f)!) })
        .mockImplementationOnce(async () => { throw new Error('GCS down') })
      await expect(service.upload(STAGED, FIELDS, 7)).rejects.toThrow('บันทึกไฟล์ไม่สำเร็จ')
      expect(prisma.cutting_plan_upload.delete).toHaveBeenCalledWith({ where: { id: 1 } })
      expect([...storage.objects.keys()].some(k => k.startsWith('cutting-plan/plate/'))).toBe(false)
    })

    it('plateView reads the stored .dxf and .txt into geometry, feeds and sheet size', async () => {
      await service.upload(STAGED, FIELDS, 7)
      const dxfKey = prisma._files.find((r: any) => r.kind === 'DXF').file_key
      const txtKey = prisma._files.find((r: any) => r.kind === 'TXT').file_key
      storage.objects.set(dxfKey, Buffer.from(['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'PartA-p1_1', '10', '0', '20', '0', '10', '10', '20', '0', '10', '10', '20', '10', '10', '0', '20', '10', '10', '0', '20', '0',
        '0', 'LINE', '8', 'RAPID', '10', '0', '20', '0', '11', '5', '21', '0', '0', 'ENDSEC'].join('\n')))
      storage.objects.set(txtKey, Buffer.from('Machine times\nBasic Cutting\t2200\t627\t0.10\t62.7\t138.0\nRapid\t10000\t627\t0.00\t0.0\t11.4\nTotal\t86.7\t1254\t62.7\t149.4\n'))
      prisma.cutting_plan_file.findMany.mockImplementationOnce(async () => prisma._files.filter((r: any) => r.kind === 'DXF' || r.kind === 'TXT'))
      const v = await service.plateView(1, 'X197-Z0-5-1')
      expect(v.parts).toHaveLength(1)
      expect(v.path).toEqual([[0, [0, 0, 5, 0]]])
      expect(v.machine).toEqual({ cutFeed: 2200, rapidFeed: 10000, pierceMin: 0.1, totalMin: 149.4 })
      expect(v.sheet).toMatchObject({ length_mm: 6000, width_mm: 1524, thick_mm: 12 })
    })

    // Real X190XZ1-16-9 (R12 DXF, 2026-11-09 re-check): layers are upper case (PARTA-P166 for A-p166), so the
    // parts table found no order row and showed "—" for size and ordered. Marks follow the report's spelling.
    it('plateView spells part marks as the report does when the DXF writes them in upper case', async () => {
      await service.upload(STAGED, FIELDS, 7)
      const dxfKey = prisma._files.find((r: any) => r.kind === 'DXF').file_key
      const square = (layer: string, x: number) => ['0', 'LWPOLYLINE', '8', layer, '10', x, '20', 0, '10', x + 10, '20', 0, '10', x + 10, '20', 10, '10', x, '20', 10, '10', x, '20', 0].map(String)
      storage.objects.set(dxfKey, Buffer.from(['0', 'SECTION', '2', 'ENTITIES', ...square('PARTA-P166_1', 0), ...square('PARTA-F72_2', 20), ...square('PARTZZ-9_3', 40), '0', 'ENDSEC'].join('\n')))
      prisma.cutting_plan_file.findMany.mockImplementationOnce(async () => prisma._files.filter((r: any) => r.kind === 'DXF'))
      prisma.cutting_plan_order_part.findMany.mockResolvedValueOnce([{ drawing_part_no_version_no: 'A-p166 ' }, { drawing_part_no_version_no: 'A-f72' }])
      const v = await service.plateView(1, 'X197-Z0-5-1')
      expect(v.parts.map((p: any) => p.mark)).toEqual(['A-p166', 'A-f72', 'ZZ-9']) // a mark the report does not list keeps the DXF's spelling
    })

    it('plateView says so when the plate has no .dxf', async () => {
      prisma.cutting_plan_file.findMany.mockImplementationOnce(async () => [])
      await expect(service.plateView(1, 'nope')).rejects.toThrow('ไม่มีไฟล์ .dxf')
    })

    it('deleting an upload deletes its stored files', async () => {
      prisma.cutting_plan_upload.findUnique.mockResolvedValueOnce({ id: 1, files: [{ file_key: 'cutting-plan/plate/a.pdf' }] })
      await service.remove(1)
      expect(storage.delete).toHaveBeenCalledWith('cutting-plan/plate/a.pdf')
    })

    it('getFile serves the stored bytes with a type that matches the kind', async () => {
      await service.upload(STAGED, FIELDS, 7)
      const pdf = prisma._files.find((r: any) => r.kind === 'PDF')
      const out = await service.getFile(pdf.id)
      expect(out.contentType).toBe('application/pdf')
      expect(out.buffer.toString()).toBe('bytes-X197-Z0-5-1.pdf')
    })
  })

  describe('list', () => {
    it('searches lot, the picked project and order_parts.project_code (case-insensitive)', async () => {
      await service.list({ search: 'thepha' })
      const args = prisma.cutting_plan_upload.findMany.mock.calls[0][0]
      const q = { contains: 'thepha', mode: 'insensitive' }
      expect(args.where.OR).toEqual([
        { lot: q },
        { project: { project_code: q } },
        { project: { name: q } },
        { order_parts: { some: { project_code: q } } },
      ])
      expect(args.include).toMatchObject({ project: expect.anything(), zone: expect.anything(), sub_zone: expect.anything() })
    })
  })

  describe('bulkAssignOrderPartProjectCode', () => {
    it('updates all given order_part ids with the trimmed project_code', async () => {
      const result = await service.bulkAssignOrderPartProjectCode({ order_part_ids: [1, 2, 3], project_code: ' 0X197 ' })

      expect(prisma.cutting_plan_order_part.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2, 3] } },
        data: { project_code: '0X197' },
      })
      expect(result).toEqual({ updated: 0 }) // mock resolves count: 0 by default
    })
  })

  describe('remove', () => {
    it('throws NotFoundException for a missing upload', async () => {
      prisma.cutting_plan_upload.findUnique.mockResolvedValueOnce(null)
      await expect(service.remove(999)).rejects.toThrow(NotFoundException)
      expect(prisma.cutting_plan_upload.delete).not.toHaveBeenCalled()
    })

    it('deletes the upload by id', async () => {
      const result = await service.remove(1)
      expect(prisma.cutting_plan_upload.delete).toHaveBeenCalledWith({ where: { id: 1 } })
      expect(result).toEqual({ deleted: true })
    })
  })

  // 2026-11-10: nothing stopped the same NC File from being saved twice — 637 of the 3,749 legacy rows were
  // copies. Same report → the plate is skipped at save; a changed report → saved as the newer version.
  describe('plates already in the system (same NC File)', () => {
    const KEY = 'cutting-plan/plate/0X197/Z0/40/X197-Z0-5-1.txt'
    // The stored report differs from the new one only in its Changer line (export date/time)
    const sameReport = Buffer.from('NESTING\nNC File\t:\t00009430.cld\nNesting Dim.\t:\t5,982\tChanger\t:\tOther\t01.01.2024\t09:00\n')
    const newReport = { ...FILE, buffer: Buffer.from('NESTING\nNC File\t:\t00009430.cld\nNesting Dim.\t:\t5,982\tChanger\t:\tJirarojS\t26.08.2025\t23:01\n') }
    const stagedWith = (txt: Buffer) => { storage.objects.set(STAGED[0].upload_key, txt) }
    const inSystem = (txt: Buffer) => {
      prisma.cutting_plan_nesting.findMany.mockResolvedValue([{ nc_file: '00009430.cld', cuttingplan_number: 'X197-Z0-5-1', upload_id: 40 }])
      prisma.cutting_plan_file.findMany.mockImplementation(async ({ where }: any) =>
        where?.OR ? [{ upload_id: 40, plate_name: 'X197-Z0-5-1', kind: 'TXT', file_key: KEY }] : prisma._files)
      storage.objects.set(KEY, txt)
    }

    it('preview names the plate, the upload that holds it, and whether the report is the same', async () => {
      inSystem(sameReport)
      const result = await service.preview([newReport], FIELDS, ALL_NAMES)
      expect(result.alreadyInSystem).toEqual([{ plate: 'X197-Z0-5-1', ncFile: '00009430.cld', uploadId: 40, sameReport: true }])
    })

    it('preview marks a changed report as a newer version, not a copy', async () => {
      inSystem(Buffer.from('NESTING\nNC File\t:\t00009430.cld\nsomething else\n'))
      const result = await service.preview([newReport], FIELDS, ALL_NAMES)
      expect(result.alreadyInSystem).toEqual([{ plate: 'X197-Z0-5-1', ncFile: '00009430.cld', uploadId: 40, sameReport: false }])
    })

    it('preview lists nothing when the NC File is new', async () => {
      prisma.cutting_plan_nesting.findMany.mockResolvedValue([])
      const result = await service.preview([newReport], FIELDS, ALL_NAMES)
      expect(result.alreadyInSystem).toEqual([])
    })

    it('upload refuses when every plate is already in the system with the same report, and drops the staged files', async () => {
      inSystem(sameReport); stagedWith(newReport.buffer)
      await expect(service.upload(STAGED, FIELDS, 7)).rejects.toThrow(/already in the system.*Nothing was saved/)
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(STAGED.every(f => !storage.objects.has(f.upload_key))).toBe(true)
    })

    // The path most likely to break quietly: a copy plate's rows and file rows must all go, its staged files too
    it('upload of one copy plate and one new plate saves only the new one, rows and files alike', async () => {
      const NEW = 'X197-Z0-5-2'
      const swap = (v: unknown) => (v === 'X197-Z0-5-1' ? NEW : v === '00009430.cld' ? '00009431.cld' : v)
      const d = REAL_API_RESPONSE.data
      apiClient.submit.mockResolvedValue({
        ...REAL_API_RESPONSE,
        data: {
          nesting: [...d.nesting, ...d.nesting.map(r => r.map(swap))],
          order_part: [...d.order_part, ...d.order_part.map(r => r.map(swap))],
          plate_usage: [...d.plate_usage, ...d.plate_usage.map(r => r.map(swap))],
          remnants: [...(d.remnants ?? []), ...(d.remnants ?? []).map(r => r.map(swap))],
        },
      } as CuttingPlanApiResponse)
      const staged2 = ['txt', 'xls', 'pdf', 'dxf'].map(e => ({ upload_key: `cutting-plan/_incoming/0X197/${UUID}/${NEW}.${e}`, file_name: `${NEW}.${e}` }))
      staged2.forEach(f => storage.objects.set(f.upload_key, f.file_name.endsWith('.txt') ? Buffer.from('NESTING\nNC File\t:\t00009431.cld\n') : Buffer.from('bytes')))
      inSystem(sameReport); stagedWith(newReport.buffer)

      await service.upload([...STAGED, ...staged2], FIELDS, 7)

      const tx = prisma._tx
      const plateOf = (call: any) => [...new Set(call.mock.calls[0][0].data.map((r: any) => r.cuttingplan_number))]
      expect(plateOf(tx.cutting_plan_nesting.createManyAndReturn)).toEqual([NEW])
      expect(plateOf(tx.cutting_plan_order_part.createMany)).toEqual([NEW])
      expect(plateOf(tx.cutting_plan_plate_usage.createMany)).toEqual([NEW])
      expect(plateOf(tx.cutting_plan_remnant.createMany)).toEqual([NEW])
      expect([...new Set(prisma._files.map((r: any) => r.plate_name))]).toEqual([NEW])
      expect([...STAGED, ...staged2].every(f => !storage.objects.has(f.upload_key))).toBe(true) // the copy's staged files too
    })

    it('upload saves a changed report as the newer version', async () => {
      inSystem(Buffer.from('NESTING\nNC File\t:\t00009430.cld\nsomething else\n')); stagedWith(newReport.buffer)
      await service.upload(STAGED, FIELDS, 7)
      expect(prisma._tx.cutting_plan_nesting.createManyAndReturn.mock.calls[0][0].data).toHaveLength(1)
    })
  })

  // 2026-11-10 release gate: every .txt is held in memory, so plates and report size are capped (memory DoS)
  describe('size caps', () => {
    const plates = (n: number) => Array.from({ length: n }, (_, i) => ['txt', 'xls', 'pdf', 'dxf'].map(e => `P-${i}.${e}`)).flat()

    it('preview refuses more than MAX_PLATES plates', async () => {
      await expect(service.preview([FILE], FIELDS, plates(MAX_PLATES + 1))).rejects.toThrow(/251 plates in one upload; the limit is 250/)
      expect(apiClient.submit).not.toHaveBeenCalled()
    })

    it('upload refuses more than MAX_PLATES plates before touching storage', async () => {
      const staged = plates(MAX_PLATES + 1).map(n => ({ upload_key: `cutting-plan/_incoming/0X197/${UUID}/${n}`, file_name: n }))
      await expect(service.upload(staged, FIELDS, 7)).rejects.toThrow(/the limit is 250/)
      expect(storage.getMetadata).not.toHaveBeenCalled()
    })

    it('upload refuses a .txt over 1 MB without reading it, and drops the staged files', async () => {
      storage.objects.set(STAGED[0].upload_key, Buffer.alloc(MAX_TXT_BYTES + 1))
      await expect(service.upload(STAGED, FIELDS, 7)).rejects.toThrow(/larger than 1 MB: X197-Z0-5-1.txt/)
      expect(storage.getObject).not.toHaveBeenCalled()
      expect(STAGED.every(f => !storage.objects.has(f.upload_key))).toBe(true)
    })
  })

  // 2026-11-10: 316 files sat in cutting-plan/_incoming/ after refused or failed saves
  describe('staged files left behind', () => {
    it('upload drops the staged files when the save is refused after staging', async () => {
      apiClient.submit.mockRejectedValue(new CuttingPlanReportErrors([{ file: 'X197-Z0-5-1.txt', message: 'Text format in Remnants is not complatible with criteria. >>> Empty remnants data.' }], 'Error in ETL process'))
      await expect(service.upload(STAGED, FIELDS, 7)).rejects.toThrow(BadRequestException)
      expect(STAGED.every(f => !storage.objects.has(f.upload_key))).toBe(true)
    })

    it('upload leaves staged files alone when the keys fail the ownership check (never deletes on a bad request)', async () => {
      const foreign = STAGED.map(f => ({ ...f, upload_key: f.upload_key.replace('0X197', '0X999') }))
      await expect(service.upload(foreign, FIELDS, 7)).rejects.toThrow(BadRequestException)
      expect(storage.delete).not.toHaveBeenCalled()
    })

    it('stagingUrls first removes incoming files older than a day', async () => {
      const old = new Date(Date.now() - 36 * 3600 * 1000), fresh = new Date(Date.now() - 60 * 1000)
      storage.list.mockImplementation(async (prefix: string) => [
        { key: `${prefix}0X197/${UUID}/old.txt`, updatedAt: old }, { key: `${prefix}0X197/${UUID}/fresh.txt`, updatedAt: fresh },
      ])
      await service.stagingUrls(5, ['A.txt'])
      expect(storage.list).toHaveBeenCalledWith('cutting-plan/_incoming/')
      expect(storage.delete.mock.calls.map(c => c[0])).toEqual([`cutting-plan/_incoming/0X197/${UUID}/old.txt`])
    })

    it('stagingUrls still answers when the sweep fails', async () => {
      storage.list.mockRejectedValue(new Error('list failed'))
      const urls = await service.stagingUrls(5, ['A.txt'])
      expect(urls).toHaveLength(1)
    })
  })
})
