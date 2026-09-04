import { Prisma } from '@prisma/client'
import { ProgressPlaceholderService } from './project-progress-placeholder.service'

function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    project_zone: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 900, project_id: 1, is_placeholder: true }),
    },
    bom_dispatch: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 800, project_id: 1, zone_id: 900, source: 'BIM_PLACEHOLDER' }),
    },
    bom_assembly: {
      findFirst: jest.fn().mockResolvedValue(null), // no real ACTIVE bom_assembly yet
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    bim_element: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  }
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = (base as Record<string, unknown>)[key]
    merged[key] = value && typeof value === 'object' && baseValue && typeof baseValue === 'object'
      ? { ...baseValue, ...value }
      : value
  }
  return merged as unknown as any
}

describe('ProgressPlaceholderService.syncFromBim', () => {
  it('does nothing if the project already has a real ACTIVE bom_assembly', async () => {
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1 }), createMany: jest.fn() },
    })
    const svc = new ProgressPlaceholderService(prisma)
    const result = await svc.syncFromBim(1, 50, 7)
    expect(result).toEqual({ created: 0, skipped: 0 })
    expect(prisma.bim_element.findMany).not.toHaveBeenCalled()
    expect(prisma.bom_assembly.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ dispatch: expect.objectContaining({ source: 'BOM_UPLOAD' }) }),
    }))
  })

  it('creates a placeholder zone+dispatch and upserts marks by createMany+skipDuplicates', async () => {
    const prisma = makePrisma({
      bim_element: {
        findMany: jest.fn().mockResolvedValue([
          { mark: 'WH-CO-001' }, { mark: 'WH-CO-002' }, { mark: 'WH-CO-001' }, // dup mark, must dedupe client-side too
        ]),
      },
      bom_assembly: {
        findFirst: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    })
    const svc = new ProgressPlaceholderService(prisma)
    const result = await svc.syncFromBim(1, 50, 7)

    expect(prisma.project_zone.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ project_id: 1, is_placeholder: true }),
    }))
    expect(prisma.bom_dispatch.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ project_id: 1, zone_id: 900, source: 'BIM_PLACEHOLDER' }),
    }))
    const createManyArg = (prisma.bom_assembly.createMany as jest.Mock).mock.calls[0][0]
    expect(createManyArg.data).toHaveLength(2) // deduped
    expect(createManyArg.skipDuplicates).toBe(true)
    expect(result).toEqual({ created: 2, skipped: 0 })
  })

  it('reuses an existing placeholder zone/dispatch instead of creating a second one', async () => {
    const prisma = makePrisma({
      project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 900, project_id: 1, is_placeholder: true }), create: jest.fn() },
      bom_dispatch: { findFirst: jest.fn().mockResolvedValue({ id: 800, project_id: 1, zone_id: 900, source: 'BIM_PLACEHOLDER' }), create: jest.fn() },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'WH-CO-003' }]) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    })
    const svc = new ProgressPlaceholderService(prisma)
    await svc.syncFromBim(1, 50, 7)
    expect(prisma.project_zone.create).not.toHaveBeenCalled()
    expect(prisma.bom_dispatch.create).not.toHaveBeenCalled()
  })

  // bom_assembly.assembly_mark is VarChar(60); bim_element.mark is
  // VarChar(100) — an oversized mark must not zero out the whole batch.
  it('includes a mark exactly 60 chars long normally', async () => {
    const mark60 = 'A'.repeat(60)
    const prisma = makePrisma({
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: mark60 }]) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    })
    const svc = new ProgressPlaceholderService(prisma)
    const result = await svc.syncFromBim(1, 50, 7)
    const createManyArg = (prisma.bom_assembly.createMany as jest.Mock).mock.calls[0][0]
    expect(createManyArg.data).toHaveLength(1)
    expect(createManyArg.data[0].assembly_mark).toBe(mark60)
    expect(result).toEqual({ created: 1, skipped: 0 })
  })

  it('excludes a mark of 61+ chars from createMany but still creates the other valid marks in the same batch', async () => {
    const mark61 = 'B'.repeat(61)
    const validMark = 'WH-CO-010'
    const prisma = makePrisma({
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: validMark }, { mark: mark61 }]) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    })
    const svc = new ProgressPlaceholderService(prisma)
    const result = await svc.syncFromBim(1, 50, 7)
    const createManyArg = (prisma.bom_assembly.createMany as jest.Mock).mock.calls[0][0]
    expect(createManyArg.data).toHaveLength(1)
    expect(createManyArg.data[0].assembly_mark).toBe(validMark)
    expect(result).toEqual({ created: 1, skipped: 1 })
  })

  it('returns {created: 0, skipped: N} and never touches zone/dispatch/createMany when ALL marks in the batch are oversized', async () => {
    const mark61a = 'C'.repeat(61)
    const mark61b = 'D'.repeat(70)
    const prisma = makePrisma({
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: mark61a }, { mark: mark61b }]) },
    })
    const svc = new ProgressPlaceholderService(prisma)
    const result = await svc.syncFromBim(1, 50, 7)
    expect(result).toEqual({ created: 0, skipped: 2 })
    expect(prisma.project_zone.findFirst).not.toHaveBeenCalled()
    expect(prisma.project_zone.create).not.toHaveBeenCalled()
    expect(prisma.bom_dispatch.create).not.toHaveBeenCalled()
    expect(prisma.bom_assembly.createMany).not.toHaveBeenCalled()
  })
})

describe('ProgressPlaceholderService — concurrent placeholder creation race (P2002)', () => {
  // Two BIM extractions finishing near-simultaneously for the same project
  // could both pass the findFirst check before either row exists. The
  // resulting unique-constraint violation on create() should resolve to
  // the race winner via re-fetch, not crash.
  it('ensurePlaceholderZone re-fetches and returns the winner when create() races into a P2002', async () => {
    const winnerZone = { id: 901, project_id: 1, is_placeholder: true }
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.0.0' })
    const findFirstMock = jest.fn()
      .mockResolvedValueOnce(null) // first check: no existing zone yet
      .mockResolvedValueOnce(winnerZone) // re-fetch after P2002: the race winner
    const prisma = makePrisma({
      project_zone: { findFirst: findFirstMock, create: jest.fn().mockRejectedValue(p2002) },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'WH-CO-020' }]) },
      bom_dispatch: {
        findFirst: jest.fn().mockResolvedValue({ id: 800, project_id: 1, zone_id: 901, source: 'BIM_PLACEHOLDER' }),
        create: jest.fn(),
      },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    })
    const svc = new ProgressPlaceholderService(prisma)
    const result = await svc.syncFromBim(1, 50, 7)
    expect(findFirstMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ created: 1, skipped: 0 })
  })

  it('ensurePlaceholderDispatch re-fetches and returns the winner when create() races into a P2002', async () => {
    const winnerDispatch = { id: 801, project_id: 1, zone_id: 900, source: 'BIM_PLACEHOLDER' }
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '6.0.0' })
    const findFirstMock = jest.fn()
      .mockResolvedValueOnce(null) // first check: no existing dispatch yet
      .mockResolvedValueOnce(winnerDispatch) // re-fetch after P2002: the race winner
    const prisma = makePrisma({
      bom_dispatch: { findFirst: findFirstMock, create: jest.fn().mockRejectedValue(p2002) },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'WH-CO-021' }]) },
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    })
    const svc = new ProgressPlaceholderService(prisma)
    const result = await svc.syncFromBim(1, 50, 7)
    expect(findFirstMock).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ created: 1, skipped: 0 })
  })

  // Non-race path (create() never throws) already covered by the
  // "reuses an existing placeholder zone/dispatch" test in the describe
  // block above — findFirst hits on the first call, create() is never
  // invoked at all, so there's nothing race-specific left to verify here.
})
