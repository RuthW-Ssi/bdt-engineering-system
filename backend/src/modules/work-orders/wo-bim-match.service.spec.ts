import { NotFoundException } from '@nestjs/common'
import { WoBimMatchService } from './wo-bim-match.service'

/* eslint-disable @typescript-eslint/no-explicit-any */
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    work_order: {
      // A WO now spans marks[] (work_order_mark, 2026-09-17 multi-mark
      // redesign) — findUnique's select pre-filters to non-removed marks,
      // so every mark handed back here is assumed printable/matchable.
      findUnique: jest.fn().mockResolvedValue({
        marks: [{ bom_assembly_id: 2868, bom_assembly: { assembly_mark: 'TC-CO3', dispatch: { project_id: 1 } } }],
      }),
    },
    bim_model: { findFirst: jest.fn().mockResolvedValue(null) },
    bim_element: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as any
}

const completeModel = { id: 5, major_version: 1, minor_version: 2, translation_status: 'complete' }

describe('WoBimMatchService.getBimMatch', () => {
  it('throws NotFoundException when the WO is missing', async () => {
    const prisma = makePrisma({ work_order: { findUnique: jest.fn().mockResolvedValue(null) } })
    const svc = new WoBimMatchService(prisma)

    await expect(svc.getBimMatch(999)).rejects.toThrow(NotFoundException)
  })

  it('returns no_model when the project has no bim_model row', async () => {
    const prisma = makePrisma()
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('no_model')
    expect(result.mark).toBe('TC-CO3')
    expect(result.global_id).toBeNull()
  })

  it('returns model_not_ready (pending) when the latest model has not finished translating', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue({ ...completeModel, translation_status: 'processing' }) },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('model_not_ready')
    expect(result.translation_status).toBe('processing')
    expect(result.model_id).toBe(5)
    expect(prisma.bim_element.findMany).not.toHaveBeenCalled()
  })

  it('returns model_not_ready (failed) with translation_status passed through', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue({ ...completeModel, translation_status: 'failed' }) },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('model_not_ready')
    expect(result.translation_status).toBe('failed')
  })

  it('returns mark_not_found when the complete model has zero matching elements', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue(completeModel) },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'TC-CO9', global_id: 'guid-x' }]) },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('mark_not_found')
    expect(result.model_version).toBe('1.2')
    expect(result.global_id).toBeNull()
  })

  it('returns ok on an exact mark match', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue(completeModel) },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'TC-CO3', global_id: 'guid-1' }]) },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('ok')
    expect(result.global_id).toBe('guid-1')
    expect(result.match_count).toBe(1)
  })

  it('returns ok when the match only succeeds via stripContractPrefix fallback', async () => {
    // BOM marks are stored prefix-stripped; BIM marks come raw off IFC TAG
    // with the contract number still attached (e.g. "00X220-TC-CO3").
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue(completeModel) },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: '00X220-TC-CO3', global_id: 'guid-2' }]) },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('ok')
    expect(result.global_id).toBe('guid-2')
  })

  it('returns ok with the first match + full match_count when a mark matches multiple physical instances', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue(completeModel) },
      bim_element: {
        findMany: jest.fn().mockResolvedValue([
          { mark: 'TC-CO3', global_id: 'guid-first' },
          { mark: 'TC-CO3', global_id: 'guid-second' },
          { mark: 'TC-CO3', global_id: 'guid-third' },
        ]),
      },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('ok')
    expect(result.global_id).toBe('guid-first')
    expect(result.match_count).toBe(3)
  })

  // Multi-mark redesign (2026-09-17): a WO can now span several marks —
  // bomAssemblyId lets a caller (a future frontend mark-selector) request a
  // specific one instead of always matching the first.
  describe('bomAssemblyId parameter', () => {
    function makeMultiMarkPrisma(overrides: Record<string, unknown> = {}) {
      return makePrisma({
        work_order: {
          findUnique: jest.fn().mockResolvedValue({
            marks: [
              { bom_assembly_id: 2868, bom_assembly: { assembly_mark: 'TC-CO3', dispatch: { project_id: 1 } } },
              { bom_assembly_id: 2869, bom_assembly: { assembly_mark: 'TC-CO9', dispatch: { project_id: 1 } } },
            ],
          }),
        },
        bim_model: { findFirst: jest.fn().mockResolvedValue(null) },
        ...overrides,
      })
    }

    it('defaults to the WO\'s first non-removed mark when omitted', async () => {
      const svc = new WoBimMatchService(makeMultiMarkPrisma())

      const result = await svc.getBimMatch(1)

      expect(result.mark).toBe('TC-CO3')
    })

    it('matches the requested mark when bomAssemblyId is given', async () => {
      const svc = new WoBimMatchService(makeMultiMarkPrisma())

      const result = await svc.getBimMatch(1, 2869)

      expect(result.mark).toBe('TC-CO9')
    })

    it('throws NotFoundException when bomAssemblyId does not match any mark on the WO', async () => {
      const svc = new WoBimMatchService(makeMultiMarkPrisma())

      await expect(svc.getBimMatch(1, 9999)).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when the WO has no non-removed marks', async () => {
      const prisma = makePrisma({ work_order: { findUnique: jest.fn().mockResolvedValue({ marks: [] }) } })
      const svc = new WoBimMatchService(prisma)

      await expect(svc.getBimMatch(1)).rejects.toThrow(NotFoundException)
    })
  })
})
