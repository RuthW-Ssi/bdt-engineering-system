import { NotFoundException } from '@nestjs/common'
import { ProjectProgressService, computePct, computeStatus } from './project-progress.service'

/* eslint-disable @typescript-eslint/no-explicit-any */
function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 1, project_code: '0X220' }) },
    project_zone: { findFirst: jest.fn().mockResolvedValue({ id: 10, project_id: 1 }), findMany: jest.fn().mockResolvedValue([]) },
    bom_assembly: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    bom_assembly_progress: { upsert: jest.fn() },
    bim_model: { findFirst: jest.fn().mockResolvedValue(null) },
    bim_element: { findMany: jest.fn().mockResolvedValue([]) },
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
  it('matches exact marks and contract-prefix-stripped marks; junk never matches', async () => {
    const prisma = makePrisma({
      bim_model: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
      bom_assembly: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, assembly_mark: 'TC-FB1' }, // exact
          { id: 2, assembly_mark: 'TC-RF2' }, // via stripped prefix
          { id: 3, assembly_mark: 'TC-CO9' }, // no BIM counterpart
        ]),
        findFirst: jest.fn(),
      },
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
    expect(result.matches).toEqual([
      { assembly_id: 1, mark: 'TC-FB1', global_ids: ['g1', 'g2'] },
      { assembly_id: 2, mark: 'TC-RF2', global_ids: ['g3'] },
    ])
  })

  it('returns empty match set when the project has no complete BIM model', async () => {
    const prisma = makePrisma()
    const svc = new ProjectProgressService(prisma)
    const result = await svc.getZoneBimMatch('0X220', 10)
    expect(result).toEqual({ model_id: null, matches: [] })
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
