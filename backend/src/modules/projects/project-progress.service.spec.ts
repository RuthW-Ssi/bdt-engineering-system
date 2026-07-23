import { NotFoundException } from '@nestjs/common'
import { ProjectProgressService, computePct, computeStatus } from './project-progress.service'

/* eslint-disable @typescript-eslint/no-explicit-any */
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 1, project_code: '0X220' }) },
    project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 10, project_id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    bom_assembly: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    bom_assembly_progress: { upsert: jest.fn() },
    bom_dispatch: { findMany: jest.fn().mockResolvedValue([]) },
    bim_model: { findFirst: jest.fn().mockResolvedValue(null) },
    bim_element: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides,
  } as unknown as any
}

const EMPTY = {
  qc_inspection_pass: false, qc_final_pass: false,
  actual_load_date: null, install_date: null, qc_install_date: null,
}
const D = new Date('2026-07-01')

describe('computePct / computeStatus', () => {
  it('no row = not started, 0%', () => {
    expect(computePct(null)).toBe(0)
    expect(computeStatus(null)).toBe('notstart')
  })

  it('additive weights, no sequential enforcement', () => {
    expect(computePct({ ...EMPTY, qc_inspection_pass: true })).toBe(20)
    expect(computePct({ ...EMPTY, qc_inspection_pass: true, qc_final_pass: true })).toBe(40)
    expect(computePct({ ...EMPTY, qc_inspection_pass: true, qc_final_pass: true, actual_load_date: D })).toBe(60)
    expect(computePct({ ...EMPTY, qc_inspection_pass: true, qc_final_pass: true, actual_load_date: D, install_date: D })).toBe(90)
    expect(computePct({ ...EMPTY, qc_inspection_pass: true, qc_final_pass: true, actual_load_date: D, install_date: D, qc_install_date: D })).toBe(100)
    // out-of-order entry is legal: install alone = 30
    expect(computePct({ ...EMPTY, install_date: D })).toBe(30)
  })

  it('status = furthest milestone reached, independent of earlier gaps', () => {
    expect(computeStatus({ ...EMPTY, qc_inspection_pass: true })).toBe('qcinsp')
    expect(computeStatus({ ...EMPTY, qc_final_pass: true })).toBe('qcfinal')
    expect(computeStatus({ ...EMPTY, actual_load_date: D })).toBe('load')
    expect(computeStatus({ ...EMPTY, install_date: D })).toBe('install')
    expect(computeStatus({ ...EMPTY, qc_install_date: D })).toBe('done')
    // install date set but load skipped — still "install"
    expect(computeStatus({ ...EMPTY, qc_inspection_pass: true, install_date: D })).toBe('install')
  })
})

describe('getOverview rollup', () => {
  // Spec worked example: 16 assemblies (equal weight 1kg so the weighted
  // rollup degenerates to the count average) — expected 53.75%.
  it('reproduces the 16-assembly worked example at equal weights', async () => {
    const rows: any[] = []
    const mk = (progress: any, n: number) => {
      for (let i = 0; i < n; i++) rows.push({ weight_kg: 1, progress, dispatch: { zone_id: 10 } })
    }
    mk(null, 3) // not started
    mk({ ...EMPTY, qc_inspection_pass: true }, 2) // 20
    mk({ ...EMPTY, qc_inspection_pass: true, qc_final_pass: true }, 1) // 40
    mk({ ...EMPTY, qc_inspection_pass: true, qc_final_pass: true, actual_load_date: D }, 5) // 60
    mk({ ...EMPTY, qc_inspection_pass: true, qc_final_pass: true, actual_load_date: D, install_date: D }, 2) // 90
    mk({ ...EMPTY, qc_inspection_pass: true, qc_final_pass: true, actual_load_date: D, install_date: D, qc_install_date: D }, 3) // 100

    const prisma = makePrisma({
      project_zone: {
        findMany: jest.fn().mockResolvedValue([{ id: 10, code: 'Z1', label: 'NP Zone 1' }]),
        findFirst: jest.fn(),
      },
      bom_assembly: { findMany: jest.fn().mockResolvedValue(rows), findFirst: jest.fn() },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getOverview('0X220')

    expect(result.total.assembly_count).toBe(16)
    expect(result.total.pct).toBe(53.75)
    expect(result.total.buckets).toEqual({ notstart: 3, in_progress: 10, done: 3 })
    expect(result.zones[0].pct).toBe(53.75)
  })

  it('weights the rollup by weight_kg, not by count', async () => {
    // one 100kg done assembly vs one 0kg-weight untouched one → 100%, not 50%
    const rows = [
      { weight_kg: 100, progress: { ...EMPTY, qc_inspection_pass: true, qc_final_pass: true, actual_load_date: D, install_date: D, qc_install_date: D }, dispatch: { zone_id: 10 } },
      { weight_kg: 0, progress: null, dispatch: { zone_id: 10 } },
    ]
    const prisma = makePrisma({
      project_zone: { findMany: jest.fn().mockResolvedValue([{ id: 10, code: 'Z1', label: 'Z1' }]), findFirst: jest.fn() },
      bom_assembly: { findMany: jest.fn().mockResolvedValue(rows), findFirst: jest.fn() },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getOverview('0X220')
    expect(result.total.pct).toBe(100)
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
    const findMany = jest.fn().mockResolvedValue([{ id: 1, assembly_mark: 'TC-FB1' }])
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue({ id: 7, major_version: 1, minor_version: 0 }) },
      bom_assembly: { findMany, findFirst: jest.fn() },
      bim_element: { findMany: jest.fn().mockResolvedValue([{ mark: 'TC-FB1', global_id: 'g1' }]) },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getProjectBimMatch('0X220')

    expect(result).toEqual({
      model_id: 7, model_version: '1.0', matches: [{ assembly_id: 1, mark: 'TC-FB1', global_ids: ['g1'] }],
    })
    const where = findMany.mock.calls[0][0].where
    expect(where.dispatch.zone_id).toBeUndefined()
  })

  it('returns empty match set when the project has no complete BIM model', async () => {
    const prisma = makePrisma()
    const svc = new ProjectProgressService(prisma)
    expect(await svc.getProjectBimMatch('0X220')).toEqual({ model_id: null, model_version: null, matches: [] })
  })
})

describe('getProjectRows', () => {
  it('returns per-assembly rows across every zone, computed pct/status included', async () => {
    const prisma = makePrisma({
      bom_assembly: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'TC-FB1', weight_kg: 100, qty: 1, progress: null },
          { id: 2, assembly_mark: 'TC-FB2', weight_kg: 50, qty: 1, progress: { ...EMPTY, qc_inspection_pass: true } },
        ]),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const rows = await svc.getProjectRows('0X220')

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ assembly_id: 1, mark: 'TC-FB1', pct: 0, status: 'notstart' })
    expect(rows[1]).toMatchObject({ assembly_id: 2, mark: 'TC-FB2', pct: 20, status: 'qcinsp' })
  })
})

describe('updateAssemblyProgress', () => {
  it('404s when the assembly belongs to a different project', async () => {
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
    })
    const svc = new ProjectProgressService(prisma)
    await expect(svc.updateAssemblyProgress('0X220', 999, {}, 1)).rejects.toThrow(NotFoundException)
    expect(prisma.bom_assembly_progress.upsert).not.toHaveBeenCalled()
  })

  it('upserts only provided fields and returns computed pct/status', async () => {
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 5 }), findMany: jest.fn() },
      bom_assembly_progress: {
        upsert: jest.fn().mockResolvedValue({
          assembly_id: 5, ...EMPTY, qc_inspection_pass: true, write_uid: 1, write_date: new Date(),
        }),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.updateAssemblyProgress('0X220', 5, { qc_inspection_pass: true }, 1)

    const call = prisma.bom_assembly_progress.upsert.mock.calls[0][0]
    // omitted fields must be undefined in the update payload (left unchanged)
    expect(call.update.qc_final_pass).toBeUndefined()
    expect(call.update.actual_load_date).toBeUndefined()
    expect(call.update.qc_inspection_pass).toBe(true)
    expect(result.pct).toBe(20)
    expect(result.status).toBe('qcinsp')
  })

  it('null date clears the value; date string converts to Date', async () => {
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn().mockResolvedValue({ id: 5 }), findMany: jest.fn() },
      bom_assembly_progress: {
        upsert: jest.fn().mockResolvedValue({ assembly_id: 5, ...EMPTY, write_uid: 1, write_date: new Date() }),
      },
    })
    const svc = new ProjectProgressService(prisma)
    await svc.updateAssemblyProgress('0X220', 5, { actual_load_date: '2026-07-01', install_date: null }, 1)

    const call = prisma.bom_assembly_progress.upsert.mock.calls[0][0]
    expect(call.update.actual_load_date).toEqual(new Date('2026-07-01'))
    expect(call.update.install_date).toBeNull()
    expect(call.update.qc_install_date).toBeUndefined()
  })
})

describe('bulkUpdateAssemblyProgress', () => {
  it('applies the same fields to every owned assembly in one transaction', async () => {
    const prisma = makePrisma({
      bom_assembly: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 5 }, { id: 6 }, { id: 7 }]),
      },
      bom_assembly_progress: {
        upsert: jest.fn().mockImplementation(({ where }: any) => Promise.resolve({ assembly_id: where.assembly_id })),
      },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.bulkUpdateAssemblyProgress(
      '0X220', { assembly_ids: [5, 6, 7], qc_inspection_pass: true, actual_load_date: '2026-07-20' }, 1,
    )

    expect(result.updated).toBe(3)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.bom_assembly_progress.upsert).toHaveBeenCalledTimes(3)
    const ids = prisma.bom_assembly_progress.upsert.mock.calls.map((c: any) => c[0].where.assembly_id)
    expect(ids.sort()).toEqual([5, 6, 7])
    prisma.bom_assembly_progress.upsert.mock.calls.forEach((c: any) => {
      expect(c[0].update.qc_inspection_pass).toBe(true)
      expect(c[0].update.actual_load_date).toEqual(new Date('2026-07-20'))
      expect(c[0].update.qc_final_pass).toBeUndefined()
    })
  })

  it('only touches assembly_ids that actually belong to this project — no 404 for a mixed batch', async () => {
    const prisma = makePrisma({
      bom_assembly: {
        findFirst: jest.fn(),
        // Only 5 and 6 "belong" — 999 (foreign/stray id) is silently dropped.
        findMany: jest.fn().mockResolvedValue([{ id: 5 }, { id: 6 }]),
      },
      bom_assembly_progress: { upsert: jest.fn().mockResolvedValue({}) },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.bulkUpdateAssemblyProgress('0X220', { assembly_ids: [5, 6, 999], qc_final_pass: true }, 1)

    expect(result.updated).toBe(2)
    expect(prisma.bom_assembly_progress.upsert).toHaveBeenCalledTimes(2)
  })

  it('no-ops (no transaction) when none of the ids belong to this project', async () => {
    const prisma = makePrisma({
      bom_assembly: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    })
    const svc = new ProjectProgressService(prisma)
    const result = await svc.bulkUpdateAssemblyProgress('0X220', { assembly_ids: [999] }, 1)

    expect(result.updated).toBe(0)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
