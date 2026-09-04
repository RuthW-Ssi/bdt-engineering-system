import { BimService } from './bim.service'

describe('BimService.checkStatus', () => {
  it('checkStatus calls placeholder.syncFromBim after successful extraction, with the model\'s own project_id', async () => {
    const syncFromBim = jest.fn().mockResolvedValue({ created: 3, skipped: 0 })
    const prisma = {
      bim_model: {
        // checkStatus() resolves the model via the private findOrThrow()
        // helper, which calls prisma.bim_model.findUnique (NOT
        // findUniqueOrThrow) and throws NotFoundException itself on null.
        findUnique: jest.fn().mockResolvedValue({
          id: 50, urn: 'urn:x', project_id: 1, create_uid: 7, translation_status: 'processing',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      bim_element: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    }
    const aps = {
      getManifest: jest.fn().mockResolvedValue({ status: 'success', derivatives: [{ status: 'success' }] }),
      hasQueryableMetadata: jest.fn().mockResolvedValue(true),
      streamProperties: jest.fn().mockReturnValue((async function* () {})()),
    }
    const backup = { backup: jest.fn() }
    const placeholder = { syncFromBim }
    const svc = new BimService(prisma as any, aps as any, backup as any, placeholder as any)

    const result = await svc.checkStatus(50)

    expect(result.status).toBe('complete')
    expect(syncFromBim).toHaveBeenCalledWith(1, 50, 7)
  })

  it('checkStatus still completes when placeholder.syncFromBim rejects — best-effort, non-fatal', async () => {
    const syncFromBim = jest.fn().mockRejectedValue(new Error('sync boom'))
    const prisma = {
      bim_model: {
        findUnique: jest.fn().mockResolvedValue({
          id: 50, urn: 'urn:x', project_id: 1, create_uid: 7, translation_status: 'processing',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      bim_element: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    }
    const aps = {
      getManifest: jest.fn().mockResolvedValue({ status: 'success', derivatives: [{ status: 'success' }] }),
      hasQueryableMetadata: jest.fn().mockResolvedValue(true),
      streamProperties: jest.fn().mockReturnValue((async function* () {})()),
    }
    const backup = { backup: jest.fn() }
    const placeholder = { syncFromBim }
    const svc = new BimService(prisma as any, aps as any, backup as any, placeholder as any)

    const result = await svc.checkStatus(50)

    expect(result).toEqual({ id: 50, status: 'complete', error: null })
  })
})
