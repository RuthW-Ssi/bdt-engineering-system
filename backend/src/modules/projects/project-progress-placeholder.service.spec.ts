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
})
