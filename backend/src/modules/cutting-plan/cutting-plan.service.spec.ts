import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CuttingPlanService } from './cutting-plan.service'
import type { CuttingPlanApiClient, CuttingPlanApiResponse } from './cutting-plan-api.client'

const FIELDS = { tag: 'ZONE1', description: 'main', version: '1', revision: '0' }
const FILE = { buffer: Buffer.from('NC File\t:\t00009430.cld\n'), originalname: 'X197-Z0-5-1.txt' }

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
  }

  return {
    $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(tx)),
    _tx: tx,
    cutting_plan_upload: {
      findUnique: jest.fn().mockResolvedValue({ ...upload, nestings: [], order_parts: [], plate_usages: [], remnants: [] }),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(upload),
    },
    cutting_plan_order_part: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  }
}

describe('CuttingPlanService', () => {
  let prisma: ReturnType<typeof buildPrisma>
  let apiClient: ReturnType<typeof buildApiClient>
  let service: CuttingPlanService

  beforeEach(() => {
    prisma = buildPrisma()
    apiClient = buildApiClient()
    service = new CuttingPlanService(prisma as any, apiClient as any)
  })

  describe('validation', () => {
    it('rejects preview() with no files', async () => {
      await expect(service.preview([], FIELDS)).rejects.toThrow(BadRequestException)
    })

    it('rejects upload() with a missing required field', async () => {
      await expect(service.upload([FILE], { ...FIELDS, tag: '' }, 1)).rejects.toThrow(BadRequestException)
    })
  })

  describe('preview', () => {
    it('does not write to the database', async () => {
      await service.preview([FILE], FIELDS)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('summarizes counts from the API response, remnants counted before dedup', async () => {
      const result = await service.preview([FILE], FIELDS)
      expect(result.summary).toEqual({ plateCount: 1, partCount: 2, plateUsageCount: 1, remnantCount: 2 })
    })

    it('flags a file that looks like it bundles multiple plates', async () => {
      const multiPlateFile = {
        buffer: Buffer.from('NC File\t:\tA.cld\nNC File\t:\tB.cld\n'),
        originalname: 'bundle.txt',
      }
      const result = await service.preview([multiPlateFile], FIELDS)
      expect(result.warnings).toEqual([{ filename: 'bundle.txt', plateCountDetected: 2 }])
    })

    it('has no mappingError for a well-shaped response', async () => {
      const result = await service.preview([FILE], FIELDS)
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
      const badService = new CuttingPlanService(prisma as any, badApiClient as any)

      const result = await badService.preview([FILE], FIELDS)
      expect(result.mappingError).toMatch(/unexpected column count/)
      expect(result.summary.plateCount).toBe(1) // summary still reflects raw API counts
    })
  })

  describe('upload', () => {
    it('persists nesting/order_part/plate_usage/remnant rows with nesting_id correctly resolved, remnants deduped', async () => {
      await service.upload([FILE], FIELDS, 7)

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

    it('leaves order_part.project_code null when no project was picked at upload time', async () => {
      await service.upload([FILE], FIELDS, 7)
      const orderPartCall = prisma._tx.cutting_plan_order_part.createMany.mock.calls[0][0]
      expect(orderPartCall.data.every((r: any) => r.project_code === null)).toBe(true)
    })

    it('applies a picked project_code to every order_part row, and forwards it to the external API', async () => {
      await service.upload([FILE], { ...FIELDS, project_code: ' 0X197 ' }, 7)

      const orderPartCall = prisma._tx.cutting_plan_order_part.createMany.mock.calls[0][0]
      expect(orderPartCall.data.every((r: any) => r.project_code === '0X197')).toBe(true)

      const submitCall = apiClient.submit.mock.calls[0]
      expect(submitCall[1].project_code).toBe('0X197')
    })
  })

  describe('list', () => {
    it('builds a case-insensitive OR search across tag and order_parts.project_code', async () => {
      await service.list({ search: 'thepha' })
      const args = prisma.cutting_plan_upload.findMany.mock.calls[0][0]
      expect(args.where.OR).toEqual([
        { tag: { contains: 'thepha', mode: 'insensitive' } },
        { order_parts: { some: { project_code: { contains: 'thepha', mode: 'insensitive' } } } },
      ])
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
})
