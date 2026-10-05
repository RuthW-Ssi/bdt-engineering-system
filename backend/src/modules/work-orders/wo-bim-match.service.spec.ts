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
    bim_model: { findMany: jest.fn().mockResolvedValue([]) },
    bim_element: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as any
}

const completeModel = { id: 5, major_version: 1, minor_version: 2, translation_status: 'complete', create_date: new Date('2026-09-01T00:00:00Z') }

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
    expect(result.global_ids).toEqual([])
  })

  it('returns model_not_ready (pending) when no model has finished translating yet', async () => {
    const prisma = makePrisma({
      bim_model: { findMany: jest.fn().mockResolvedValue([{ ...completeModel, translation_status: 'processing' }]) },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('model_not_ready')
    expect(result.translation_status).toBe('processing')
    expect(result.model_id).toBe(5)
    expect(result.global_ids).toEqual([])
    expect(prisma.bim_element.findMany).not.toHaveBeenCalled()
  })

  it('returns model_not_ready (failed) with translation_status passed through', async () => {
    const prisma = makePrisma({
      bim_model: { findMany: jest.fn().mockResolvedValue([{ ...completeModel, translation_status: 'failed' }]) },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('model_not_ready')
    expect(result.translation_status).toBe('failed')
  })

  it('returns mark_not_found when the complete model has zero matching elements', async () => {
    const prisma = makePrisma({
      bim_model: { findMany: jest.fn().mockResolvedValue([completeModel]) },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'TC-CO9', global_id: 'guid-x' }]) },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('mark_not_found')
    expect(result.model_version).toBe('1.2')
    expect(result.global_id).toBeNull()
    expect(result.global_ids).toEqual([])
  })

  it('returns ok on an exact mark match', async () => {
    const prisma = makePrisma({
      bim_model: { findMany: jest.fn().mockResolvedValue([completeModel]) },
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
      bim_model: { findMany: jest.fn().mockResolvedValue([completeModel]) },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: '00X220-TC-CO3', global_id: 'guid-2' }]) },
    })
    const svc = new WoBimMatchService(prisma)

    const result = await svc.getBimMatch(1)

    expect(result.status).toBe('ok')
    expect(result.global_id).toBe('guid-2')
  })

  it('returns ok with the first match + full match_count when a mark matches multiple physical instances', async () => {
    const prisma = makePrisma({
      bim_model: { findMany: jest.fn().mockResolvedValue([completeModel]) },
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
    // Every instance, for the Visual tab's whole-model highlight mode.
    expect(result.global_ids).toEqual(['guid-first', 'guid-second', 'guid-third'])
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
        bim_model: { findMany: jest.fn().mockResolvedValue([]) },
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

  // Visual tab version picker (2026-10-05): every project model is listed so
  // the user can switch, defaulting to the newest one that can actually render.
  describe('model version selection', () => {
    const processingV2 = { id: 6, major_version: 2, minor_version: 0, translation_status: 'processing', create_date: new Date('2026-10-02T00:00:00Z') }
    const completeV2 = { ...processingV2, translation_status: 'complete' }
    // A factory, not one shared jest.fn — call assertions must only ever see
    // the current test's calls.
    const matchingElements = () => ({ findMany: jest.fn().mockResolvedValue([{ mark: 'TC-CO3', global_id: 'guid-1' }]) })

    it('queries only the mark\'s own project, newest version first', async () => {
      const prisma = makePrisma()
      const svc = new WoBimMatchService(prisma)

      await svc.getBimMatch(1)

      expect(prisma.bim_model.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { project_id: 1 },
        orderBy: [{ major_version: 'desc' }, { minor_version: 'desc' }, { id: 'desc' }],
      }))
    })

    it('lists every project model (any status) as a picker option', async () => {
      const prisma = makePrisma({
        bim_model: { findMany: jest.fn().mockResolvedValue([processingV2, completeModel]) },
        bim_element: matchingElements(),
      })
      const svc = new WoBimMatchService(prisma)

      const result = await svc.getBimMatch(1)

      expect(result.models).toEqual([
        { id: 6, version: '2.0', translation_status: 'processing', create_date: processingV2.create_date },
        { id: 5, version: '1.2', translation_status: 'complete', create_date: completeModel.create_date },
      ])
    })

    it('returns an empty models list alongside no_model', async () => {
      const svc = new WoBimMatchService(makePrisma())

      const result = await svc.getBimMatch(1)

      expect(result.models).toEqual([])
    })

    it('defaults to the newest COMPLETE model, skipping a newer one still processing', async () => {
      const prisma = makePrisma({
        bim_model: { findMany: jest.fn().mockResolvedValue([processingV2, completeModel]) },
        bim_element: matchingElements(),
      })
      const svc = new WoBimMatchService(prisma)

      const result = await svc.getBimMatch(1)

      expect(result.status).toBe('ok')
      expect(result.model_id).toBe(5)
      expect(result.model_version).toBe('1.2')
      expect(prisma.bim_element.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ model_id: 5 }) }))
    })

    it('falls back to the newest model overall when none has finished translating', async () => {
      const failedV1 = { ...completeModel, translation_status: 'failed' }
      const prisma = makePrisma({
        bim_model: { findMany: jest.fn().mockResolvedValue([processingV2, failedV1]) },
      })
      const svc = new WoBimMatchService(prisma)

      const result = await svc.getBimMatch(1)

      expect(result.status).toBe('model_not_ready')
      expect(result.model_id).toBe(6)
      expect(result.translation_status).toBe('processing')
    })

    it('uses the requested model_id instead of the default', async () => {
      const prisma = makePrisma({
        bim_model: { findMany: jest.fn().mockResolvedValue([completeV2, completeModel]) },
        bim_element: matchingElements(),
      })
      const svc = new WoBimMatchService(prisma)

      const result = await svc.getBimMatch(1, undefined, 5)

      expect(result.status).toBe('ok')
      expect(result.model_id).toBe(5)
      expect(prisma.bim_element.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ model_id: 5 }) }))
    })

    it('reports model_not_ready when the requested model is still processing', async () => {
      const prisma = makePrisma({
        bim_model: { findMany: jest.fn().mockResolvedValue([processingV2, completeModel]) },
      })
      const svc = new WoBimMatchService(prisma)

      const result = await svc.getBimMatch(1, undefined, 6)

      expect(result.status).toBe('model_not_ready')
      expect(result.model_id).toBe(6)
      expect(result.translation_status).toBe('processing')
      expect(prisma.bim_element.findMany).not.toHaveBeenCalled()
    })

    it('throws NotFoundException when model_id does not belong to the mark\'s project', async () => {
      const prisma = makePrisma({
        bim_model: { findMany: jest.fn().mockResolvedValue([completeModel]) },
      })
      const svc = new WoBimMatchService(prisma)

      await expect(svc.getBimMatch(1, undefined, 999)).rejects.toThrow(NotFoundException)
    })
  })

  // Visual tab "highlight every mark on this WO" mode (2026-10-05).
  describe('wo_global_ids', () => {
    function makeWoPrisma(elements: { mark: string; global_id: string }[]) {
      return makePrisma({
        work_order: {
          findUnique: jest.fn().mockResolvedValue({
            marks: [
              { bom_assembly_id: 2868, bom_assembly: { assembly_mark: 'TC-CO3', dispatch: { project_id: 1 } } },
              { bom_assembly_id: 2869, bom_assembly: { assembly_mark: 'TC-CO9', dispatch: { project_id: 1 } } },
              // An MO (so a WO) can span projects — this mark lives in another
              // project's model, so a same-named element here is a coincidence.
              { bom_assembly_id: 2870, bom_assembly: { assembly_mark: 'TC-CO7', dispatch: { project_id: 2 } } },
            ],
          }),
        },
        bim_model: { findMany: jest.fn().mockResolvedValue([completeModel]) },
        bim_element: { findMany: jest.fn().mockResolvedValue(elements) },
      })
    }

    it('lists every instance of every same-project WO mark, prefix-stripped too', async () => {
      const svc = new WoBimMatchService(makeWoPrisma([
        { mark: 'TC-CO3', global_id: 'guid-3' },
        { mark: '00X220-TC-CO9', global_id: 'guid-9a' },
        { mark: 'TC-CO9', global_id: 'guid-9b' },
        { mark: 'TC-CO7', global_id: 'guid-7' },
        { mark: 'NOT-ON-WO', global_id: 'guid-x' },
      ]))

      const result = await svc.getBimMatch(1, 2868)

      expect(result.global_ids).toEqual(['guid-3'])
      expect(result.wo_global_ids).toEqual(['guid-3', 'guid-9a', 'guid-9b'])
    })

    it('still lists the other WO marks when the selected mark is not in the model', async () => {
      const svc = new WoBimMatchService(makeWoPrisma([{ mark: 'TC-CO9', global_id: 'guid-9' }]))

      const result = await svc.getBimMatch(1, 2868)

      expect(result.status).toBe('mark_not_found')
      expect(result.wo_global_ids).toEqual(['guid-9'])
    })

    it('is empty when there is no model to match against', async () => {
      const svc = new WoBimMatchService(makePrisma())

      const result = await svc.getBimMatch(1)

      expect(result.wo_global_ids).toEqual([])
    })
  })
})
