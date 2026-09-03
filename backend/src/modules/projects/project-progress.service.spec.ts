import { NotFoundException } from '@nestjs/common'
import { ProjectProgressService, computeFabPct, computeStatus, computePhases, effectiveQty, STAGE_WEIGHTS, FAB_STAGES } from './project-progress.service'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Shallow-merges each top-level module (bom_assembly_progress, etc.) so an
// override like `{ bom_assembly_progress: { upsert } }` keeps the default
// findUnique mock instead of clobbering it — every existing test that only
// overrides `upsert` still gets a working findUnique for free.
function makePrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 1, project_code: '0X220' }) },
    project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 10, project_id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    bom_assembly: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    bom_assembly_progress: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
    progress_change_batch: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    progress_change_entry: { createMany: jest.fn() },
    bom_dispatch: { findMany: jest.fn().mockResolvedValue([]) },
    bim_model: { findFirst: jest.fn().mockResolvedValue(null) },
    bim_element: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
  }
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = (base as Record<string, unknown>)[key]
    merged[key] = value && typeof value === 'object' && baseValue && typeof baseValue === 'object'
      ? { ...baseValue, ...value }
      : value
  }
  const prisma = merged as unknown as any
  // Supports both the legacy array-of-promises form (still used by
  // bulkUpdateAssemblyProgress's older sibling calls, if any remain) and
  // the interactive callback form — `tx` is just the same mock prisma
  // object, since every mocked method already lives on it directly.
  prisma.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
  )
  return prisma
}

const EMPTY = {
  cut: 0, buildup: 0, weld1: 0, fitup_drill: 0, weld2: 0,
  qc_inspection: 0, primer: 0, fireproof: 0, top_coat: 0, qc_final: 0,
  fab_plan_finish_date: null, fab_actual_finish_date: null,
  plan_load_date: null, actual_load_date: null,
  loaded_pcs: 0, erected_pcs: 0,
  erection_plan_finish_date: null, erection_actual_finish_date: null, payment_status: 'Not Disbursed',
  claimed_weight_kg: null, delivered_weight_kg: null,
}
const D = new Date('2026-07-01')

describe('effectiveQty', () => {
  it('null/zero/decimal qty all resolve to at least one physical piece', () => {
    expect(effectiveQty(null)).toBe(1)
    expect(effectiveQty(undefined)).toBe(1)
    expect(effectiveQty(0)).toBe(1)
    expect(effectiveQty(4)).toBe(4)
    expect(effectiveQty('16.000')).toBe(16) // Prisma Decimal arrives stringy
    expect(effectiveQty(2.6)).toBe(3)
  })
})

describe('computeFabPct', () => {
  it('no row = 0', () => {
    expect(computeFabPct(null)).toBe(0)
  })

  it('single stage contributes exactly its weight', () => {
    expect(computeFabPct({ ...EMPTY, cut: 100 })).toBe(10)
    expect(computeFabPct({ ...EMPTY, weld1: 100 })).toBe(15)
    expect(computeFabPct({ ...EMPTY, qc_final: 100 })).toBe(5)
  })

  it('all stages at 100 = exactly 100 (weights sum to 100)', () => {
    const all100 = Object.fromEntries(FAB_STAGES.map(s => [s, 100]))
    expect(computeFabPct({ ...EMPTY, ...all100 })).toBe(100)
    expect(Object.values(STAGE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('fractional stage values weight proportionally', () => {
    // weld1 at 50% of its 15 weight = 7.5
    expect(computeFabPct({ ...EMPTY, weld1: 50 })).toBe(7.5)
  })

  it('worked mixed example matches the Excel weight table', () => {
    // cut 100 (10) + buildup 100 (10) + weld1 100 (15) + fitup 50 (5) = 40
    expect(computeFabPct({ ...EMPTY, cut: 100, buildup: 100, weld1: 100, fitup_drill: 50 })).toBe(40)
  })
})

describe('computeStatus — phase ladder + shade', () => {
  it('no row = notstart', () => {
    expect(computeStatus(null, 4)).toEqual({ status: 'notstart', shade: 'light' })
  })

  it('any fab progress = fabrication light; all stages done = fabrication dark', () => {
    expect(computeStatus({ ...EMPTY, cut: 1 }, 4)).toEqual({ status: 'fabrication', shade: 'light' })
    const all100 = Object.fromEntries(FAB_STAGES.map(s => [s, 100]))
    expect(computeStatus({ ...EMPTY, ...all100 }, 4)).toEqual({ status: 'fabrication', shade: 'dark' })
  })

  it('partial load = load light; full load = load dark', () => {
    expect(computeStatus({ ...EMPTY, loaded_pcs: 1 }, 4)).toEqual({ status: 'load', shade: 'light' })
    expect(computeStatus({ ...EMPTY, loaded_pcs: 4 }, 4)).toEqual({ status: 'load', shade: 'dark' })
  })

  it('partial erection = erection light; full erection = done', () => {
    expect(computeStatus({ ...EMPTY, erected_pcs: 1 }, 4)).toEqual({ status: 'erection', shade: 'light' })
    expect(computeStatus({ ...EMPTY, erected_pcs: 4 }, 4)).toEqual({ status: 'done', shade: 'light' })
  })

  it('furthest phase wins — out-of-order entry is legal', () => {
    // erected with zero fab: still erection
    expect(computeStatus({ ...EMPTY, erected_pcs: 1 }, 4).status).toBe('erection')
    // loaded full + fab partial: load dark (load is further than fabrication)
    expect(computeStatus({ ...EMPTY, cut: 50, loaded_pcs: 4 }, 4)).toEqual({ status: 'load', shade: 'dark' })
  })

  it('actual_load_date alone does NOT advance status — pcs are the phase signal', () => {
    expect(computeStatus({ ...EMPTY, actual_load_date: D }, 4)).toEqual({ status: 'notstart', shade: 'light' })
  })

  it('null qty behaves as one piece', () => {
    expect(computeStatus({ ...EMPTY, loaded_pcs: 1 }, null)).toEqual({ status: 'load', shade: 'dark' })
    expect(computeStatus({ ...EMPTY, erected_pcs: 1 }, null)).toEqual({ status: 'done', shade: 'light' })
  })
})

describe('computePhases — independent per-phase pass + shade', () => {
  it('no row = every phase not passed; payment always reports dark shade regardless', () => {
    expect(computePhases(null, 4)).toEqual({
      fabrication: { passed: false, shade: 'light' },
      payment: { passed: false, shade: 'dark' },
      load: { passed: false, shade: 'light' },
      erection: { passed: false, shade: 'light' },
    })
  })

  it('fabrication: any progress = passed/light; all stages at 100 = passed/dark', () => {
    expect(computePhases({ ...EMPTY, cut: 1 }, 4).fabrication).toEqual({ passed: true, shade: 'light' })
    const all100 = Object.fromEntries(FAB_STAGES.map(s => [s, 100]))
    expect(computePhases({ ...EMPTY, ...all100 }, 4).fabrication).toEqual({ passed: true, shade: 'dark' })
  })

  it('payment: only "Paid" counts as passed; no partial state', () => {
    expect(computePhases({ ...EMPTY, payment_status: 'Paid' }, 4).payment).toEqual({ passed: true, shade: 'dark' })
    expect(computePhases({ ...EMPTY, payment_status: 'Not Disbursed' }, 4).payment).toEqual({ passed: false, shade: 'dark' })
    expect(computePhases({ ...EMPTY, payment_status: 'Disbursed' }, 4).payment).toEqual({ passed: false, shade: 'dark' })
  })

  it('load: partial pcs = passed/light; full pcs = passed/dark', () => {
    expect(computePhases({ ...EMPTY, loaded_pcs: 1 }, 4).load).toEqual({ passed: true, shade: 'light' })
    expect(computePhases({ ...EMPTY, loaded_pcs: 4 }, 4).load).toEqual({ passed: true, shade: 'dark' })
  })

  it('erection: partial pcs = passed/light; full pcs = passed/dark — NOT folded into a "done" terminal state like computeStatus', () => {
    expect(computePhases({ ...EMPTY, erected_pcs: 1 }, 4).erection).toEqual({ passed: true, shade: 'light' })
    expect(computePhases({ ...EMPTY, erected_pcs: 4 }, 4).erection).toEqual({ passed: true, shade: 'dark' })
  })

  it('phases are independent — mid-fabrication + paid, and fully-erected + unpaid, both hold true simultaneously', () => {
    const midFabPaid = computePhases({ ...EMPTY, cut: 50, payment_status: 'Paid' }, 4)
    expect(midFabPaid.fabrication).toEqual({ passed: true, shade: 'light' })
    expect(midFabPaid.payment).toEqual({ passed: true, shade: 'dark' })

    const erectedUnpaid = computePhases({ ...EMPTY, erected_pcs: 4, payment_status: 'Not Disbursed' }, 4)
    expect(erectedUnpaid.erection).toEqual({ passed: true, shade: 'dark' })
    expect(erectedUnpaid.payment).toEqual({ passed: false, shade: 'dark' })
  })
})

describe('getOverview rollup', () => {
  it('fab weighted by weight_kg; load/erection by pieces (Σ/Σ, not averaged)', async () => {
    const all100 = Object.fromEntries(FAB_STAGES.map(s => [s, 100]))
    const rows = [
      // 10kg fully fabricated + paid, qty 4, loaded 4, erected 0 → load dark
      { weight_kg: 10, qty: 4, progress: { ...EMPTY, ...all100, loaded_pcs: 4, payment_status: 'Paid' }, dispatch: { zone_id: 10 } },
      // 30kg untouched, unpaid, qty 4 → notstart
      { weight_kg: 30, qty: 4, progress: null, dispatch: { zone_id: 10 } },
    ]
    const prisma = makePrisma({
      project_zone: { findMany: jest.fn().mockResolvedValue([{ id: 10, code: 'ZA', label: 'Zone-A' }]), findFirst: jest.fn() },
      bom_assembly: { findMany: jest.fn().mockResolvedValue(rows), findFirst: jest.fn() },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getOverview('0X220')

    // fab: (10kg×100 + 30kg×0) / 40kg = 25
    expect(result.total.fab_pct).toBe(25)
    // payment: (10kg×100 + 30kg×0) / 40kg = 25 — same weighted formula as fab_pct
    expect(result.total.payment_pct).toBe(25)
    // load: 4 of 8 pcs = 50% — NOT the per-row average (100+0)/2
    expect(result.total.load_pct).toBe(50)
    expect(result.total.erect_pct).toBe(0)
    expect(result.total.total_qty).toBe(8)
    expect(result.total.loaded_pcs).toBe(4)
    expect(result.total.buckets).toEqual({ notstart: 1, in_progress: 1, done: 0 })
  })

  it('fabrication/load/erection all map to the in_progress bucket', async () => {
    const rows = [
      { weight_kg: 1, qty: 2, progress: { ...EMPTY, cut: 50 }, dispatch: { zone_id: 10 } },
      { weight_kg: 1, qty: 2, progress: { ...EMPTY, loaded_pcs: 1 }, dispatch: { zone_id: 10 } },
      { weight_kg: 1, qty: 2, progress: { ...EMPTY, erected_pcs: 1 }, dispatch: { zone_id: 10 } },
      { weight_kg: 1, qty: 2, progress: { ...EMPTY, erected_pcs: 2 }, dispatch: { zone_id: 10 } },
    ]
    const prisma = makePrisma({
      project_zone: { findMany: jest.fn().mockResolvedValue([{ id: 10, code: 'ZA', label: 'Zone-A' }]), findFirst: jest.fn() },
      bom_assembly: { findMany: jest.fn().mockResolvedValue(rows), findFirst: jest.fn() },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getOverview('0X220')
    expect(result.total.buckets).toEqual({ notstart: 0, in_progress: 3, done: 1 })
  })

  it('zero rows → zero guards, no division blowups', async () => {
    const prisma = makePrisma({
      project_zone: { findMany: jest.fn().mockResolvedValue([{ id: 10, code: 'ZA', label: 'Zone-A' }]), findFirst: jest.fn() },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getOverview('0X220')
    expect(result.total).toMatchObject({ fab_pct: 0, load_pct: 0, erect_pct: 0, total_qty: 0 })
  })

  it('rollup caps over-qty pcs defensively (carry-forward after qty shrink)', async () => {
    const rows = [
      // loaded_pcs 16 carried forward but qty now 4 → counts as 4, not 16
      { weight_kg: 1, qty: 4, progress: { ...EMPTY, loaded_pcs: 16 }, dispatch: { zone_id: 10 } },
    ]
    const prisma = makePrisma({
      project_zone: { findMany: jest.fn().mockResolvedValue([{ id: 10, code: 'ZA', label: 'Zone-A' }]), findFirst: jest.fn() },
      bom_assembly: { findMany: jest.fn().mockResolvedValue(rows), findFirst: jest.fn() },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getOverview('0X220')
    expect(result.total.loaded_pcs).toBe(4)
    expect(result.total.load_pct).toBe(100)
  })
})

describe('getProjectRows', () => {
  it('rows carry stages, pcs, four pcts, status, shade, payment/erection-date fields and per-phase state', async () => {
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'TC-FB1', weight_kg: 10, qty: 4, progress: { ...EMPTY, cut: 100, loaded_pcs: 2, payment_status: 'Paid' } },
        ]),
        findFirst: jest.fn(),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const rows = await svc.getProjectRows('0X220')
    expect(rows[0]).toMatchObject({
      assembly_id: 1, mark: 'TC-FB1', qty: 4,
      cut: 100, buildup: 0,
      loaded_pcs: 2, erected_pcs: 0,
      erection_actual_finish_date: null, payment_status: 'Paid',
      fab_pct: 10, load_pct: 50, erect_pct: 0, payment_pct: 100,
      status: 'load', shade: 'light',
      phases: {
        fabrication: { passed: true, shade: 'light' },
        payment: { passed: true, shade: 'dark' },
        load: { passed: true, shade: 'light' },
        erection: { passed: false, shade: 'light' },
      },
    })
  })
})

describe('updateAssemblyProgress', () => {
  it('404s when the assembly belongs to a different project', async () => {
    const prisma = makePrisma({ bom_assembly: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() } })
    const svc = new ProjectProgressService(prisma)
    await expect(svc.updateAssemblyProgress('0X220', 999, { cut: 50 }, 1)).rejects.toThrow(NotFoundException)
  })

  it('partial update — omitted fields stay undefined in the update clause', async () => {
    const upsert = jest.fn().mockResolvedValue({ ...EMPTY, assembly_id: 1, cut: 50, write_uid: 1, write_date: D })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 1, { cut: 50 }, 1)

    const args = upsert.mock.calls[0][0]
    expect(args.update.cut).toBe(50)
    expect(args.update.buildup).toBeUndefined()
    expect(args.update.loaded_pcs).toBeUndefined()
    expect(args.update.plan_load_date).toBeUndefined()
  })

  it('clamps percents to 0..100 with rounding (guards the "50"-for-0.5 typo class)', async () => {
    const upsert = jest.fn().mockResolvedValue({ ...EMPTY, assembly_id: 1, write_uid: 1, write_date: D })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 1, { weld1: 5000, primer: -5, fireproof: 50.4 }, 1)

    const args = upsert.mock.calls[0][0]
    expect(args.update.weld1).toBe(100)
    expect(args.update.primer).toBe(0)
    expect(args.update.fireproof).toBe(50)
  })

  it('clamps pcs to the assembly qty', async () => {
    const upsert = jest.fn().mockResolvedValue({ ...EMPTY, assembly_id: 1, loaded_pcs: 4, write_uid: 1, write_date: D })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 1, { loaded_pcs: 99 }, 1)
    expect(upsert.mock.calls[0][0].update.loaded_pcs).toBe(4)
  })

  it('coerces date strings and clears on explicit null', async () => {
    const upsert = jest.fn().mockResolvedValue({ ...EMPTY, assembly_id: 1, write_uid: 1, write_date: D })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 1, { plan_load_date: '2026-07-01', actual_load_date: null }, 1)

    const args = upsert.mock.calls[0][0]
    expect(args.update.plan_load_date).toEqual(new Date('2026-07-01'))
    expect(args.update.actual_load_date).toBeNull()
  })

  it('payment_status passes through untouched — string, no clamping', async () => {
    const upsert = jest.fn().mockResolvedValue({ ...EMPTY, assembly_id: 1, payment_status: 'Paid', write_uid: 1, write_date: D })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 1, { payment_status: 'Paid' }, 1)
    expect(upsert.mock.calls[0][0].update.payment_status).toBe('Paid')
  })

  it('claimed_weight_kg/delivered_weight_kg floor at zero, no upper bound', async () => {
    const upsert = jest.fn().mockResolvedValue({ ...EMPTY, assembly_id: 1, write_uid: 1, write_date: D })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 1, { claimed_weight_kg: -5, delivered_weight_kg: 9999 }, 1)
    expect(upsert.mock.calls[0][0].update.claimed_weight_kg).toBe(0)
    expect(upsert.mock.calls[0][0].update.delivered_weight_kg).toBe(9999)
  })

  it('erection_actual_finish_date coerces date strings and clears on explicit null', async () => {
    const upsert = jest.fn().mockResolvedValue({ ...EMPTY, assembly_id: 1, write_uid: 1, write_date: D })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 1, { erection_actual_finish_date: '2026-08-01' }, 1)
    expect(upsert.mock.calls[0][0].update.erection_actual_finish_date).toEqual(new Date('2026-08-01'))

    await svc.updateAssemblyProgress('0X220', 1, { erection_actual_finish_date: null }, 1)
    expect(upsert.mock.calls[1][0].update.erection_actual_finish_date).toBeNull()
  })

  it('fab_plan_finish_date/fab_actual_finish_date coerce date strings and clear on explicit null', async () => {
    const upsert = jest.fn().mockResolvedValue({ ...EMPTY, assembly_id: 1, write_uid: 1, write_date: D })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 1, { fab_plan_finish_date: '2026-07-15', fab_actual_finish_date: '2026-07-20' }, 1)
    expect(upsert.mock.calls[0][0].update.fab_plan_finish_date).toEqual(new Date('2026-07-15'))
    expect(upsert.mock.calls[0][0].update.fab_actual_finish_date).toEqual(new Date('2026-07-20'))

    await svc.updateAssemblyProgress('0X220', 1, { fab_plan_finish_date: null, fab_actual_finish_date: null }, 1)
    expect(upsert.mock.calls[1][0].update.fab_plan_finish_date).toBeNull()
    expect(upsert.mock.calls[1][0].update.fab_actual_finish_date).toBeNull()
  })

  it('erection_plan_finish_date coerces date strings and clears on explicit null', async () => {
    const upsert = jest.fn().mockResolvedValue({ ...EMPTY, assembly_id: 1, write_uid: 1, write_date: D })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 1, { erection_plan_finish_date: '2026-08-10' }, 1)
    expect(upsert.mock.calls[0][0].update.erection_plan_finish_date).toEqual(new Date('2026-08-10'))

    await svc.updateAssemblyProgress('0X220', 1, { erection_plan_finish_date: null }, 1)
    expect(upsert.mock.calls[1][0].update.erection_plan_finish_date).toBeNull()
  })

  it('response carries the four pcts + status + shade + phases', async () => {
    const upsert = jest.fn().mockResolvedValue({
      ...EMPTY, assembly_id: 1, cut: 100, loaded_pcs: 2, payment_status: 'Paid', write_uid: 1, write_date: D,
    })
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 1, qty: 4, dispatch: { project_id: 1 } }), findMany: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.updateAssemblyProgress('0X220', 1, { cut: 100 }, 1)
    expect(result).toMatchObject({
      fab_pct: 10, load_pct: 50, erect_pct: 0, payment_pct: 100,
      status: 'load', shade: 'light',
      phases: { payment: { passed: true, shade: 'dark' } },
    })
  })
})

describe('bulkUpdateAssemblyProgress', () => {
  it('applies shared percents/dates to every owned row', async () => {
    const upsert = jest.fn().mockResolvedValue({})
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, qty: 4 }, { id: 2, qty: 16 }]),
        findFirst: jest.fn(),
      },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.bulkUpdateAssemblyProgress(
      '0X220',
      {
        assembly_ids: [1, 2], cut: 100, plan_load_date: '2026-07-01', payment_status: 'Paid',
        fab_plan_finish_date: '2026-07-10', fab_actual_finish_date: '2026-07-15',
        erection_plan_finish_date: '2026-07-25', erection_actual_finish_date: '2026-08-01',
      },
      1,
    )

    expect(result).toEqual({ updated: 2 })
    expect(upsert).toHaveBeenCalledTimes(2)
    for (const call of upsert.mock.calls) {
      expect(call[0].update.cut).toBe(100)
      expect(call[0].update.plan_load_date).toEqual(new Date('2026-07-01'))
      expect(call[0].update.payment_status).toBe('Paid')
      expect(call[0].update.fab_plan_finish_date).toEqual(new Date('2026-07-10'))
      expect(call[0].update.fab_actual_finish_date).toEqual(new Date('2026-07-15'))
      expect(call[0].update.erection_plan_finish_date).toEqual(new Date('2026-07-25'))
      expect(call[0].update.erection_actual_finish_date).toEqual(new Date('2026-08-01'))
    }
  })

  it('set_loaded_full resolves each row to its OWN qty', async () => {
    const upsert = jest.fn().mockResolvedValue({})
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, qty: 4 }, { id: 2, qty: 16 }]),
        findFirst: jest.fn(),
      },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.bulkUpdateAssemblyProgress('0X220', { assembly_ids: [1, 2], set_loaded_full: true }, 1)

    const byId = new Map(upsert.mock.calls.map((c: any[]) => [c[0].where.assembly_id, c[0].update.loaded_pcs]))
    expect(byId.get(1)).toBe(4)
    expect(byId.get(2)).toBe(16)
    // erected untouched when its flag is absent
    expect(upsert.mock.calls[0][0].update.erected_pcs).toBeUndefined()
  })

  it('silently skips ids not belonging to the project; empty ownership is a no-op', async () => {
    const upsert = jest.fn().mockResolvedValue({})
    const prisma = makePrisma({
      bom_assembly: { findMany: jest.fn().mockResolvedValue([{ id: 1, qty: 1 }]), findFirst: jest.fn() },
      bom_assembly_progress: { upsert },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.bulkUpdateAssemblyProgress('0X220', { assembly_ids: [1, 999], qc_final: 100 }, 1)
    expect(result).toEqual({ updated: 1 })

    const prismaEmpty = makePrisma({
      bom_assembly: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    })
    const svc2 = new ProjectProgressService(prismaEmpty)
    expect(await svc2.bulkUpdateAssemblyProgress('0X220', { assembly_ids: [999], qc_final: 100 }, 1)).toEqual({ updated: 0 })
  })
})

describe('getZoneBimMatch', () => {
  it('matches exact marks and contract-prefix-stripped marks; junk never matches; surfaces model version', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue({ id: 7, major_version: 2, minor_version: 1 }) },
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'TC-FB1', dispatch: { id: 100, revision: 3, zone_id: 10, sub_zone_id: null } }, // exact
          { id: 2, assembly_mark: 'TC-RF2', dispatch: { id: 100, revision: 3, zone_id: 10, sub_zone_id: null } }, // via stripped prefix
          { id: 3, assembly_mark: 'TC-CO9', dispatch: { id: 100, revision: 3, zone_id: 10, sub_zone_id: null } }, // no BIM counterpart
        ]),
        findFirst: jest.fn(),
      },
      bom_dispatch: { findMany: jest.fn().mockResolvedValue([{ id: 100, revision: 3, zone_id: 10, sub_zone_id: null }]) },
      bim_element: {
        findMany: jest.fn().mockResolvedValue([
          { mark: 'TC-FB1', global_id: 'g1' },
          { mark: 'TC-FB1', global_id: 'g2' }, // repeated instance, same mark
          { mark: '00X220-2TC-RF2', global_id: 'g3' }, // raw Tekla prefix
          { mark: '0(?)', global_id: 'g4' }, // junk — must not match anything
        ]),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getZoneBimMatch('0X220', 10)

    expect(result.model_id).toBe(7)
    expect(result.model_version).toBe('2.1')
    // Only dispatch in its (zone, sub_zone, revision) group → minor index 0.
    expect(result.bom_version).toBe('3.0')
    expect(result.matches).toEqual([
      { assembly_id: 1, mark: 'TC-FB1', global_ids: ['g1', 'g2'] },
      { assembly_id: 2, mark: 'TC-RF2', global_ids: ['g3'] },
    ])
  })

  it('ranks "continue revision" dispatches chronologically as X.0, X.1… (mirrors BomList.tsx exactly)', async () => {
    // Zone re-uploaded twice under the same revision (1) via "Continue
    // revision" — id 50 (first upload) then id 51 (second, now active).
    // The BomUploadService worked example for this exact scenario is
    // documented as v1.0 → v1.1 in BomList.tsx; this must agree.
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'TC-FB1', dispatch: { id: 51, revision: 1, zone_id: 10, sub_zone_id: null } },
        ]),
        findFirst: jest.fn(),
      },
      bom_dispatch: {
        findMany: jest.fn().mockResolvedValue([
          { id: 50, revision: 1, zone_id: 10, sub_zone_id: null }, // superseded — INACTIVE assemblies only
          { id: 51, revision: 1, zone_id: 10, sub_zone_id: null }, // current — the one with ACTIVE assemblies
        ]),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getZoneBimMatch('0X220', 10)
    expect(result.bom_version).toBe('1.1')
  })

  it('jumps the major number on "start new revision" — no minor suffix confusion with continue', async () => {
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'TC-FB1', dispatch: { id: 60, revision: 2, zone_id: 10, sub_zone_id: null } },
        ]),
        findFirst: jest.fn(),
      },
      bom_dispatch: {
        findMany: jest.fn().mockResolvedValue([
          { id: 50, revision: 1, zone_id: 10, sub_zone_id: null },
          { id: 60, revision: 2, zone_id: 10, sub_zone_id: null }, // "Start new revision" → major jumps to 2
        ]),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getZoneBimMatch('0X220', 10)
    expect(result.bom_version).toBe('2.0')
  })

  it('reports only the highest version when a partial "continue" upload leaves some marks ACTIVE on an older dispatch', async () => {
    // Real-world case that motivated this: dispatch 1 (v1.0) re-uploaded via
    // "Continue revision" touching only some marks → dispatch 2 (v1.1).
    // Marks NOT in the second file stay ACTIVE on dispatch 1, so the zone's
    // live assemblies span both dispatches at once. Reporting every version
    // technically in play would read as noise — just the highest matters.
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'TC-CO1', dispatch: { id: 1, revision: 1, zone_id: 10, sub_zone_id: null } },
          { id: 2, assembly_mark: 'TC-BR1', dispatch: { id: 2, revision: 1, zone_id: 10, sub_zone_id: null } },
        ]),
        findFirst: jest.fn(),
      },
      bom_dispatch: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, revision: 1, zone_id: 10, sub_zone_id: null },
          { id: 2, revision: 1, zone_id: 10, sub_zone_id: null },
        ]),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getZoneBimMatch('0X220', 10)
    expect(result.bom_version).toBe('1.1')
  })

  it('returns empty match set (model + versions null/empty) when the project has no complete BIM model', async () => {
    const prisma = makePrisma()
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getZoneBimMatch('0X220', 10)
    expect(result).toEqual({ model_id: null, model_version: null, bom_version: null, matches: [] })
  })
})

describe('getProjectBimMatch', () => {
  it('matches across all zones — no zone_id filter on the assembly query; surfaces model version', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue({ id: 7, major_version: 1, minor_version: 0 }) },
      bom_assembly: { findMany: jest.fn().mockResolvedValue([{ id: 1, assembly_mark: 'TC-FB1' }]), findFirst: jest.fn() },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'TC-FB1', global_id: 'g1' }]) },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getProjectBimMatch('0X220')

    expect(result.model_id).toBe(7)
    expect(result.matches).toEqual([{ assembly_id: 1, mark: 'TC-FB1', global_ids: ['g1'] }])
    const where = (prisma.bom_assembly.findMany as jest.Mock).mock.calls[0][0].where
    expect(where.dispatch.zone_id).toBeUndefined()
  })

  it('returns nulls when no complete model exists', async () => {
    const prisma = makePrisma()
    const svc = new ProjectProgressService(prisma)
    expect(await svc.getProjectBimMatch('0X220')).toEqual({ model_id: null, model_version: null, matches: [] })
  })
})

describe('getZoneRows — placeholder zone', () => {
  it('tags every row is_placeholder=true and flags marks missing from the latest bim_model as stale', async () => {
    const prisma = makePrisma({
      project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 900, project_id: 1, is_placeholder: true }) },
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'WH-CO-001', weight_kg: null, qty: null, progress: null },
          { id: 2, assembly_mark: 'WH-CO-002', weight_kg: null, qty: null, progress: null },
        ]),
      },
      bim_model: { findFirst: jest.fn().mockResolvedValue({ id: 50, major_version: 1, minor_version: 0 }) },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'WH-CO-001' }]) }, // WH-CO-002 no longer in the model
    })
    const svc = new ProjectProgressService(prisma)
    const rows = await svc.getZoneRows('0X220', 900)

    expect(rows).toHaveLength(2)
    expect(rows.every(r => r.is_placeholder === true)).toBe(true)
    expect(rows.find(r => r.mark === 'WH-CO-001')!.stale).toBe(false)
    expect(rows.find(r => r.mark === 'WH-CO-002')!.stale).toBe(true)
  })

  it('a normal (non-placeholder) zone never queries bim_element and reports is_placeholder=false, stale=false', async () => {
    const prisma = makePrisma({
      project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 10, project_id: 1, is_placeholder: false }) },
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, assembly_mark: 'WH-CO-001', weight_kg: 100, qty: 2, progress: null }]),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const rows = await svc.getZoneRows('0X220', 10)

    expect(rows[0].is_placeholder).toBe(false)
    expect(rows[0].stale).toBe(false)
    expect(prisma.bim_element.findMany).not.toHaveBeenCalled()
    expect(prisma.bim_model.findFirst).not.toHaveBeenCalled()
  })
})

describe('getProjectPositions', () => {
  it('groups (position, mark) pairs — a bay can hold several marks, a mark can span several bays', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue({ id: 7, major_version: 1, minor_version: 0 }) },
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'TC-FB1', weight_kg: 100, qty: 16, progress: { ...EMPTY, cut: 100 } },
          { id: 2, assembly_mark: 'TC-RB1', weight_kg: 50, qty: 2, progress: null },
        ]),
        findFirst: jest.fn(),
      },
      bim_element: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([
          { position: 'BAY-1', mark: 'TC-FB1', _count: { _all: 8 } },
          { position: 'BAY-2', mark: 'TC-FB1', _count: { _all: 8 } },
          { position: 'BAY-1', mark: 'TC-RB1', _count: { _all: 2 } },
        ]),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getProjectPositions('0X220')

    expect(result.model_id).toBe(7)
    expect(result.unmatched).toEqual([])
    // BAY-1 holds both marks; TC-FB1 also shows up again at BAY-2, same %s.
    expect(result.groups).toEqual([
      {
        position: 'BAY-1',
        marks: [
          expect.objectContaining({ mark: 'TC-FB1', count: 8, fab_pct: 10 }),
          expect.objectContaining({ mark: 'TC-RB1', count: 2, fab_pct: 0 }),
        ],
      },
      {
        position: 'BAY-2',
        marks: [expect.objectContaining({ mark: 'TC-FB1', count: 8, fab_pct: 10 })],
      },
    ])
  })

  it('a BIM mark with no matching BOM row still appears in its group, with null progress instead of being dropped', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue({ id: 7, major_version: 1, minor_version: 0 }) },
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, assembly_mark: 'TC-FB1', weight_kg: 100, qty: 16, progress: { ...EMPTY, cut: 100 } }]),
        findFirst: jest.fn(),
      },
      bim_element: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([
          { position: 'BAY-1', mark: 'TC-FB1', _count: { _all: 8 } },
          { position: 'BAY-1', mark: 'PU99', _count: { _all: 3 } }, // in the model, never uploaded to BOM
        ]),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getProjectPositions('0X220')

    expect(result.groups).toEqual([
      {
        position: 'BAY-1',
        marks: [
          expect.objectContaining({ mark: 'PU99', count: 3, assembly_id: null, fab_pct: null, load_pct: null, erect_pct: null, status: null, shade: null }),
          expect.objectContaining({ mark: 'TC-FB1', count: 8, fab_pct: 10 }),
        ],
      },
    ])
    expect(result.unmatched).toEqual([]) // TC-FB1 DID match — only the reverse direction (BOM w/ no BIM) belongs here
  })

  it('surfaces marks with no BIM position data under `unmatched` instead of dropping them', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue({ id: 7, major_version: 1, minor_version: 0 }) },
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([{ id: 3, assembly_mark: 'TC-ZZ1', weight_kg: 10, qty: 4, progress: null }]),
        findFirst: jest.fn(),
      },
      bim_element: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getProjectPositions('0X220')

    expect(result.groups).toEqual([])
    expect(result.unmatched).toEqual([expect.objectContaining({ mark: 'TC-ZZ1', count: 4 })]) // count falls back to qty
  })

  it('no complete BIM model — every assembly reported as unmatched, none silently dropped', async () => {
    const prisma = makePrisma({
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, assembly_mark: 'TC-FB1', weight_kg: 100, qty: 16, progress: null }]),
        findFirst: jest.fn(),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getProjectPositions('0X220')

    expect(result).toEqual({
      model_id: null, model_version: null, groups: [],
      unmatched: [expect.objectContaining({ mark: 'TC-FB1', count: 16 })],
    })
  })
})
