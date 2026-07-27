import { NotFoundException } from '@nestjs/common'
import { BomDiffBimMatchService } from './bom-diff-bim-match.service'

/* eslint-disable @typescript-eslint/no-explicit-any */
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    bom_dispatch: { findUnique: jest.fn().mockResolvedValue({ project_id: 1 }) },
    bim_model: { findMany: jest.fn().mockResolvedValue([]) },
    bim_element: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as any
}

function makeDiffSvc(computeDiffResult: any) {
  return { computeDiff: jest.fn().mockResolvedValue(computeDiffResult) } as any
}

const row = (mark: string | null, prevMark?: string) => ({
  status: prevMark ? 'changed' : 'added',
  prev: prevMark ? { assembly_mark: prevMark } : null,
  curr: mark ? { assembly_mark: mark } : null,
})

describe('BomDiffBimMatchService.getDiffBimModels', () => {
  it('returns null (no dispatch/model lookup at all) when computeDiff finds no previous version', async () => {
    const prisma = makePrisma()
    const diffSvc = makeDiffSvc(null)
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    const result = await svc.getDiffBimModels(999)

    expect(result).toBeNull()
    expect(prisma.bom_dispatch.findUnique).not.toHaveBeenCalled()
    expect(prisma.bim_model.findMany).not.toHaveBeenCalled()
  })

  it('throws NotFoundException when the dispatch itself is missing', async () => {
    const prisma = makePrisma({ bom_dispatch: { findUnique: jest.fn().mockResolvedValue(null) } })
    const diffSvc = makeDiffSvc({ assembly_diff: [] })
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    await expect(svc.getDiffBimModels(1)).rejects.toThrow(NotFoundException)
  })

  it('0 complete models -> { old: null, new: null }', async () => {
    const prisma = makePrisma({ bim_model: { findMany: jest.fn().mockResolvedValue([]) } })
    const diffSvc = makeDiffSvc({ assembly_diff: [row('TC-FB1')] })
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    expect(await svc.getDiffBimModels(1)).toEqual({ old: null, new: null })
  })

  it('exactly 1 complete model -> only "new" populated, "old" stays null', async () => {
    const prisma = makePrisma({
      bim_model: { findMany: jest.fn().mockResolvedValue([{ id: 5, major_version: 1, minor_version: 0 }]) },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'TC-FB1', global_id: 'g1' }]) },
    })
    const diffSvc = makeDiffSvc({ assembly_diff: [row('TC-FB1')] })
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    const result = await svc.getDiffBimModels(1)
    expect(result!.old).toBeNull()
    expect(result!.new).toEqual({ model_id: 5, version: '1.0', matches: { 'TC-FB1': ['g1'] } })
  })

  it('2 complete models -> old/new correctly ordered, each scoped to its own bim_element rows', async () => {
    const prisma = makePrisma({
      bim_model: {
        findMany: jest.fn().mockResolvedValue([
          { id: 6, major_version: 1, minor_version: 1 }, // newest
          { id: 5, major_version: 1, minor_version: 0 }, // older
        ]),
      },
      bim_element: {
        findMany: jest.fn(({ where }: any) => {
          if (where.model_id === 5) return Promise.resolve([{ mark: 'TC-FB1', global_id: 'g-old' }])
          // TC-BR1 only exists in the newer model — genuine new-construction case
          if (where.model_id === 6) return Promise.resolve([
            { mark: 'TC-FB1', global_id: 'g-new' },
            { mark: 'TC-BR1', global_id: 'g-new-2' },
          ])
          return Promise.resolve([])
        }),
      },
    })
    const diffSvc = makeDiffSvc({ assembly_diff: [row('TC-FB1', 'TC-FB1'), row('TC-BR1')] })
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    const result = await svc.getDiffBimModels(1)
    expect(result!.old).toEqual({ model_id: 5, version: '1.0', matches: { 'TC-FB1': ['g-old'] } })
    expect(result!.new).toEqual({
      model_id: 6, version: '1.1',
      matches: { 'TC-FB1': ['g-new'], 'TC-BR1': ['g-new-2'] },
    })
  })

  it('matches exact marks and contract-prefix-stripped marks; junk never matches', async () => {
    const prisma = makePrisma({
      bim_model: { findMany: jest.fn().mockResolvedValue([{ id: 7, major_version: 2, minor_version: 1 }]) },
      bim_element: {
        findMany: jest.fn().mockResolvedValue([
          { mark: 'TC-FB1', global_id: 'g1' },
          { mark: 'TC-FB1', global_id: 'g2' }, // repeated instance, same mark
          { mark: '00X220-2TC-RF2', global_id: 'g3' }, // raw Tekla prefix
          { mark: '0(?)', global_id: 'g4' }, // junk — must not match anything
        ]),
      },
    })
    const diffSvc = makeDiffSvc({ assembly_diff: [row('TC-FB1'), row('TC-RF2'), row('TC-CO9')] })
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    const result = await svc.getDiffBimModels(1)
    expect(result!.new).toEqual({
      model_id: 7, version: '2.1',
      matches: { 'TC-FB1': ['g1', 'g2'], 'TC-RF2': ['g3'] },
    })
  })

  it('filters matches down to only marks referenced by this diff — an unrelated model mark is excluded', async () => {
    const prisma = makePrisma({
      bim_model: { findMany: jest.fn().mockResolvedValue([{ id: 7, major_version: 1, minor_version: 0 }]) },
      bim_element: {
        findMany: jest.fn().mockResolvedValue([
          { mark: 'TC-FB1', global_id: 'g1' },
          { mark: 'PU3', global_id: 'g-purlin' }, // a real model element, but not in this diff at all
        ]),
      },
    })
    const diffSvc = makeDiffSvc({ assembly_diff: [row('TC-FB1')] })
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    const result = await svc.getDiffBimModels(1)
    expect(result!.new!.matches).toEqual({ 'TC-FB1': ['g1'] })
    expect(result!.new!.matches['PU3']).toBeUndefined()
  })

  it('override params pick explicit models per side; unspecified side keeps its default', async () => {
    const prisma = makePrisma({
      bim_model: {
        findMany: jest.fn().mockResolvedValue([
          { id: 8, major_version: 2, minor_version: 0 }, // default new
          { id: 7, major_version: 1, minor_version: 1 }, // default old
        ]),
        // override target: an older model outside the top-2
        findFirst: jest.fn().mockResolvedValue({ id: 5, major_version: 1, minor_version: 0 }),
      },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'TC-FB1', global_id: 'g1' }]) },
    })
    const diffSvc = makeDiffSvc({ assembly_diff: [row('TC-FB1')] })
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    const result = await svc.getDiffBimModels(1, { oldModelId: 5 })

    expect(prisma.bim_model.findFirst.mock.calls[0][0].where).toEqual({
      id: 5, project_id: 1, translation_status: 'complete',
    })
    expect(result!.old!.model_id).toBe(5)
    expect(result!.old!.version).toBe('1.0')
    expect(result!.new!.model_id).toBe(8) // default untouched
  })

  it('override pointing at a missing/incomplete/foreign model throws NotFoundException', async () => {
    const prisma = makePrisma({
      bim_model: {
        findMany: jest.fn().mockResolvedValue([{ id: 8, major_version: 2, minor_version: 0 }]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    })
    const diffSvc = makeDiffSvc({ assembly_diff: [row('TC-FB1')] })
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    await expect(svc.getDiffBimModels(1, { newModelId: 999 })).rejects.toThrow(NotFoundException)
  })

  it('dedupes marks across both prev and curr sides of the diff (removed + added + changed together)', async () => {
    const prisma = makePrisma({
      bim_model: { findMany: jest.fn().mockResolvedValue([{ id: 7, major_version: 1, minor_version: 0 }]) },
      bim_element: {
        findMany: jest.fn().mockResolvedValue([
          { mark: 'TC-FB1', global_id: 'g1' }, // changed (present both sides)
          { mark: 'TC-BR1', global_id: 'g2' }, // added (curr only)
          { mark: 'TC-CO1', global_id: 'g3' }, // removed (prev only)
        ]),
      },
    })
    const diffSvc = makeDiffSvc({
      assembly_diff: [
        { status: 'changed', prev: { assembly_mark: 'TC-FB1' }, curr: { assembly_mark: 'TC-FB1' } },
        { status: 'added', prev: null, curr: { assembly_mark: 'TC-BR1' } },
        { status: 'removed', prev: { assembly_mark: 'TC-CO1' }, curr: null },
      ],
    })
    const svc = new BomDiffBimMatchService(prisma, diffSvc)

    const result = await svc.getDiffBimModels(1)
    expect(result!.new!.matches).toEqual({
      'TC-FB1': ['g1'], 'TC-BR1': ['g2'], 'TC-CO1': ['g3'],
    })
  })
})
