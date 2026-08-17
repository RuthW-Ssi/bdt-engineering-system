import { ProgressChangeLogService } from './progress-change-log.service'

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    progress_change_batch: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    progress_change_entry: { createMany: jest.fn() },
    ...overrides,
  } as unknown as any
}

describe('ProgressChangeLogService.computeDiff', () => {
  const svc = new ProgressChangeLogService({} as any)

  it('omitted (undefined) fields produce no entry', () => {
    expect(svc.computeDiff({ cut: 50 }, { cut: undefined })).toEqual([])
  })

  it('a value equal to current produces no entry', () => {
    expect(svc.computeDiff({ cut: 50 }, { cut: 50 })).toEqual([])
  })

  it('a genuinely different value produces one normalized entry', () => {
    expect(svc.computeDiff({ cut: 50 }, { cut: 80 })).toEqual([{ field: 'cut', old: 50, new: 80 }])
  })

  it('null row (no progress yet) diffs against field-kind defaults, not against null wholesale', () => {
    // fab stage/pcs default to 0, payment_status defaults to "Not Disbursed"
    expect(svc.computeDiff(null, { cut: 0 })).toEqual([]) // matches default, no-op
    expect(svc.computeDiff(null, { cut: 10 })).toEqual([{ field: 'cut', old: 0, new: 10 }])
    expect(svc.computeDiff(null, { payment_status: 'Not Disbursed' })).toEqual([])
    expect(svc.computeDiff(null, { payment_status: 'Paid' })).toEqual([{ field: 'payment_status', old: 'Not Disbursed', new: 'Paid' }])
  })

  it('explicit null on a nullable field (date/weight) is a real change, not a no-op', () => {
    const current = { plan_load_date: new Date('2026-07-01') }
    expect(svc.computeDiff(current, { plan_load_date: null })).toEqual([{ field: 'plan_load_date', old: '2026-07-01', new: null }])
  })

  it('dates normalize to YYYY-MM-DD regardless of Date vs string input, so equal dates never false-diff', () => {
    const current = { plan_load_date: new Date('2026-07-01T00:00:00.000Z') }
    expect(svc.computeDiff(current, { plan_load_date: new Date('2026-07-01') })).toEqual([])
  })

  it('Prisma Decimal-like values normalize via Number() for weight fields', () => {
    const decimalLike = { toString: () => '12.500', valueOf: () => 12.5 }
    expect(svc.computeDiff({ claimed_weight_kg: decimalLike }, { claimed_weight_kg: 12.5 })).toEqual([])
    expect(svc.computeDiff({ claimed_weight_kg: decimalLike }, { claimed_weight_kg: 20 })).toEqual([{ field: 'claimed_weight_kg', old: 12.5, new: 20 }])
  })

  it('multiple changed fields all appear, unchanged fields do not', () => {
    const diff = svc.computeDiff({ cut: 50, buildup: 10, payment_status: 'Not Disbursed' }, { cut: 80, buildup: 10, payment_status: 'Paid' })
    expect(diff).toEqual([
      { field: 'cut', old: 50, new: 80 },
      { field: 'payment_status', old: 'Not Disbursed', new: 'Paid' },
    ])
  })
})

describe('ProgressChangeLogService.logBatch', () => {
  const svc = new ProgressChangeLogService({} as any)

  it('skips creating a batch entirely when every row has an empty diff', async () => {
    const tx = makeTx()
    const result = await svc.logBatch(tx, {
      projectId: 1, source: 'import', userId: 1,
      rows: [{ assemblyId: 1, diff: [] }, { assemblyId: 2, diff: [] }],
    })
    expect(result.batchId).toBeNull()
    expect(tx.progress_change_batch.create).not.toHaveBeenCalled()
  })

  it('creates a batch + entries only for rows with a non-empty diff', async () => {
    const tx = makeTx()
    const result = await svc.logBatch(tx, {
      projectId: 1, source: 'manual_edit', userId: 7,
      rows: [
        { assemblyId: 1, diff: [{ field: 'cut', old: 0, new: 50 }] },
        { assemblyId: 2, diff: [] },
      ],
    })
    expect(result.batchId).toBe(1)
    expect(tx.progress_change_batch.create).toHaveBeenCalledWith({
      data: { project_id: 1, source: 'manual_edit', file_name: null, rolled_back_batch_id: null, create_uid: 7 },
    })
    const createManyArg = tx.progress_change_entry.createMany.mock.calls[0][0]
    expect(createManyArg.data).toEqual([{ batch_id: 1, assembly_id: 1, field: 'cut', old_value: '0', new_value: '50' }])
  })

  it('alwaysCreateBatch forces a batch row even with zero entries (rollback tracking requirement)', async () => {
    const tx = makeTx()
    const result = await svc.logBatch(tx, {
      projectId: 1, source: 'rollback', rolledBackBatchId: 3, userId: 1,
      rows: [{ assemblyId: 1, diff: [] }],
      alwaysCreateBatch: true,
    })
    expect(result.batchId).toBe(1)
    expect(tx.progress_change_batch.create).toHaveBeenCalledWith({
      data: { project_id: 1, source: 'rollback', file_name: null, rolled_back_batch_id: 3, create_uid: 1 },
    })
    expect(tx.progress_change_entry.createMany).not.toHaveBeenCalled()
  })
})

describe('ProgressChangeLogService.coerceForWrite', () => {
  const svc = new ProgressChangeLogService({} as any)

  it('parses each field kind back to its typed value', () => {
    expect(svc.coerceForWrite('cut', '80')).toBe(80)
    expect(svc.coerceForWrite('loaded_pcs', '4')).toBe(4)
    expect(svc.coerceForWrite('claimed_weight_kg', '12.5')).toBe(12.5)
    expect(svc.coerceForWrite('payment_status', 'Paid')).toBe('Paid')
    expect(svc.coerceForWrite('plan_load_date', '2026-07-01')).toEqual(new Date('2026-07-01'))
  })

  it('null stored value stays null (clears the field on rollback)', () => {
    expect(svc.coerceForWrite('claimed_weight_kg', null)).toBeNull()
    expect(svc.coerceForWrite('plan_load_date', null)).toBeNull()
  })

  it('claimed_weight_kg floors at zero via nonNegDecimal, same as any other write path', () => {
    expect(svc.coerceForWrite('claimed_weight_kg', '-5')).toBe(0)
  })
})
