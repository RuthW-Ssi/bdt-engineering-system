import { BadRequestException } from '@nestjs/common'
import { ProgressHistoryService } from './progress-history.service'
import { ProgressChangeLogService } from './progress-change-log.service'

/* eslint-disable @typescript-eslint/no-explicit-any */
function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 1, project_code: '0X220' }) },
    progress_change_batch: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 99 }),
    },
    progress_change_entry: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    },
    bom_assembly: { findMany: jest.fn().mockResolvedValue([]) },
    bom_assembly_progress: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    project_zone: { findMany: jest.fn().mockResolvedValue([]) },
  }
  // Shallow-merge each top-level module so e.g. overriding
  // `progress_change_batch: { findFirst }` doesn't clobber the base's
  // `create` mock — same convention as project-progress.service.spec.ts.
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = (base as Record<string, unknown>)[key]
    merged[key] = value && typeof value === 'object' && baseValue && typeof baseValue === 'object' ? { ...baseValue, ...value } : value
  }
  const prisma = merged as unknown as any
  prisma.$transaction = jest.fn((fn: unknown) => (typeof fn === 'function' ? (fn as any)(prisma) : Promise.all(fn as any)))
  return prisma
}

function makeService(prisma: any) {
  return new ProgressHistoryService(prisma, new ProgressChangeLogService(prisma))
}

const D1 = new Date('2026-08-01T00:00:00.000Z')
const D2 = new Date('2026-08-02T00:00:00.000Z')

describe('ProgressHistoryService.listBatches', () => {
  it('marks a batch rolled back only when some OTHER batch targets it via rolled_back_batch_id', async () => {
    const prisma = makePrisma({
      progress_change_batch: {
        findMany: jest.fn().mockResolvedValue([
          { id: 2, source: 'rollback', rolled_back_batch_id: 1, file_name: null, create_date: D2, create_user: { name: 'Tao' }, entries: [] },
          { id: 1, source: 'manual_edit', rolled_back_batch_id: null, file_name: null, create_date: D1, create_user: { name: 'Tao' }, entries: [{ assembly_id: 80 }] },
        ]),
      },
    })
    const svc = makeService(prisma)
    const result = await svc.listBatches('0X220')

    expect(result.find(b => b.id === 1)?.rolledBack).toBe(true)
    expect(result.find(b => b.id === 2)?.rolledBack).toBe(false)
  })

  it('affectedAssemblyCount counts DISTINCT assemblies, not entry rows', async () => {
    const prisma = makePrisma({
      progress_change_batch: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1, source: 'bulk_edit', rolled_back_batch_id: null, file_name: null, create_date: D1, create_user: { name: 'Tao' },
            entries: [{ assembly_id: 80 }, { assembly_id: 80 }, { assembly_id: 81 }], // 2 fields on 80, 1 on 81
          },
        ]),
      },
    })
    const svc = makeService(prisma)
    const result = await svc.listBatches('0X220')
    expect(result[0].affectedAssemblyCount).toBe(2)
  })
})

describe('ProgressHistoryService.getBatchDetail', () => {
  it('maps entries to zone/mark via the assembly + zone lookup', async () => {
    const prisma = makePrisma({
      progress_change_batch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1, source: 'manual_edit', file_name: null, rolled_back_batch_id: null, create_date: D1,
          create_user: { name: 'Tao' },
          entries: [{ assembly_id: 80, field: 'cut', old_value: '3', new_value: '80' }],
        }),
      },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([{ id: 80, assembly_mark: 'TC-CO1', dispatch: { zone_id: 10 } }]) },
      project_zone: { findMany: jest.fn().mockResolvedValue([{ id: 10, label: 'Zone-A' }]) },
    })
    const svc = makeService(prisma)
    const detail = await svc.getBatchDetail('0X220', 1)
    expect(detail.changes).toEqual([{ zone: 'Zone-A', mark: 'TC-CO1', field: 'cut', old: '3', new: '80' }])
  })

  it('throws NotFoundException for a batch that does not belong to this project', async () => {
    const prisma = makePrisma({ progress_change_batch: { findFirst: jest.fn().mockResolvedValue(null) } })
    const svc = makeService(prisma)
    await expect(svc.getBatchDetail('0X220', 999)).rejects.toThrow('Batch 999 not found')
  })
})

describe('ProgressHistoryService.rollback', () => {
  const targetBatch = {
    id: 1, create_date: D1,
    entries: [{ assembly_id: 80, field: 'cut', old_value: '3', new_value: '80' }],
  }

  it('rejects rolling back a batch that was already rolled back', async () => {
    const prisma = makePrisma({
      progress_change_batch: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(targetBatch) // the batch lookup
          .mockResolvedValueOnce({ id: 5 }), // the "already rolled back?" lookup finds a rollback row
      },
    })
    const svc = makeService(prisma)
    await expect(svc.rollback('0X220', 1, 7, false)).rejects.toThrow(BadRequestException)
  })

  it('reports conflicts and writes nothing when a field was touched again by a later batch', async () => {
    const prisma = makePrisma({
      progress_change_batch: { findFirst: jest.fn().mockResolvedValueOnce(targetBatch).mockResolvedValueOnce(null) },
      progress_change_entry: {
        findMany: jest.fn().mockResolvedValue([
          { assembly_id: 80, field: 'cut', batch: { create_date: D2, create_user: { name: 'Someone Else' } } },
        ]),
        createMany: jest.fn(),
      },
    })
    const svc = makeService(prisma)
    const result = await svc.rollback('0X220', 1, 7, false)

    expect(result.conflicts).toEqual([{ mark: '#80', field: 'cut', changedBy: 'Someone Else', changedAt: D2 }])
    expect(result.newBatchId).toBeNull()
    expect(prisma.bom_assembly_progress.upsert).not.toHaveBeenCalled()
  })

  it('force=true applies despite conflicts, writing the old value back', async () => {
    const prisma = makePrisma({
      progress_change_batch: { findFirst: jest.fn().mockResolvedValueOnce(targetBatch).mockResolvedValueOnce(null) },
      progress_change_entry: {
        findMany: jest.fn().mockResolvedValue([{ assembly_id: 80, field: 'cut', batch: { create_date: D2, create_user: { name: 'X' } } }]),
        createMany: jest.fn(),
      },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([{ id: 80, qty: 4 }]) },
      bom_assembly_progress: { findUnique: jest.fn().mockResolvedValue({ cut: 80 }), upsert: jest.fn().mockResolvedValue({}) },
    })
    const svc = makeService(prisma)
    const result = await svc.rollback('0X220', 1, 7, true)

    expect(result.conflicts).toEqual([])
    expect(prisma.bom_assembly_progress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { assembly_id: 80 }, update: expect.objectContaining({ cut: 3 }) }),
    )
    expect(prisma.progress_change_batch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'rollback', rolled_back_batch_id: 1 }) }),
    )
    expect(result.newBatchId).toBe(99)
  })

  it('a no-conflict rollback needs no force flag and still produces a new batch', async () => {
    const prisma = makePrisma({
      progress_change_batch: { findFirst: jest.fn().mockResolvedValueOnce(targetBatch).mockResolvedValueOnce(null) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([{ id: 80, qty: 4 }]) },
      bom_assembly_progress: { findUnique: jest.fn().mockResolvedValue({ cut: 80 }), upsert: jest.fn().mockResolvedValue({}) },
    })
    const svc = makeService(prisma)
    const result = await svc.rollback('0X220', 1, 7, false)
    expect(result.conflicts).toEqual([])
    expect(result.newBatchId).toBe(99)
  })

  // The alwaysCreateBatch wiring (progress-change-log.service.spec.ts covers
  // logBatch itself) — here we confirm rollback's OWN no-op case (writing a
  // value that already matches current state) still produces a batch id,
  // not null, so "already rolled back" stays answerable on retry.
  it('still returns a real batch id even when the write ends up being a no-op', async () => {
    const prisma = makePrisma({
      progress_change_batch: { findFirst: jest.fn().mockResolvedValueOnce(targetBatch).mockResolvedValueOnce(null) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([{ id: 80, qty: 4 }]) },
      // Current value already equals what rollback is about to write (3) —
      // zero-diff write, but the batch must still be created.
      bom_assembly_progress: { findUnique: jest.fn().mockResolvedValue({ cut: 3 }), upsert: jest.fn().mockResolvedValue({}) },
    })
    const svc = makeService(prisma)
    const result = await svc.rollback('0X220', 1, 7, false)
    expect(result.newBatchId).toBe(99)
    expect(prisma.progress_change_entry.createMany).not.toHaveBeenCalled() // no entries, but...
    expect(prisma.progress_change_batch.create).toHaveBeenCalled() // ...the batch itself still exists
  })

  it('an empty batch (no entries at all) is a no-op — nothing to roll back', async () => {
    const prisma = makePrisma({
      progress_change_batch: { findFirst: jest.fn().mockResolvedValueOnce({ ...targetBatch, entries: [] }).mockResolvedValueOnce(null) },
    })
    const svc = makeService(prisma)
    const result = await svc.rollback('0X220', 1, 7, false)
    expect(result).toEqual({ conflicts: [], newBatchId: null })
  })
})
