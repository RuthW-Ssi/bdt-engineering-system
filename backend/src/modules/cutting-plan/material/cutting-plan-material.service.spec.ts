import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CuttingPlanMaterialService, cutLengthMm } from './cutting-plan-material.service'

// User test report 2026-11-26: cut length for the kerf loss, kerf settings, certificate, prices, remnant register
const dec = (v: number | null) => (v == null ? null : { toString: () => String(v) })

function build() {
  const changes: any[] = [], uses: any[] = [], kerfs: any[] = []
  const nestings = [
    { id: 11, upload_id: 1, cuttingplan_number: 'P-1', cut_length_mm: null, certificate: null },
    { id: 12, upload_id: 1, cuttingplan_number: 'P-2', cut_length_mm: dec(5000), certificate: 'HN-77' },
  ]
  const prisma: any = {
    cutting_plan_nesting: {
      findMany: jest.fn(async () => nestings),
      findUnique: jest.fn(async ({ where }: any) => nestings.find(n => n.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => Object.assign(nestings.find(n => n.id === where.id)!, data)),
    },
    cutting_plan_file: { findMany: jest.fn(async () => [{ plate_name: 'P-1', kind: 'DXF', file_key: 'k1' }]) },
    cutting_plan_kerf: {
      findMany: jest.fn(async () => kerfs),
      findUnique: jest.fn(async ({ where }: any) => kerfs.find(k => k.technology === where.technology_thick_mm.technology && Number(k.thick_mm) === where.technology_thick_mm.thick_mm) ?? null),
      upsert: jest.fn(async ({ create }: any) => { kerfs.push(create); return create }),
      delete: jest.fn(async () => ({})),
    },
    cutting_plan_change: { create: jest.fn(async ({ data }: any) => changes.push(data)), findMany: jest.fn(async () => changes) },
    cutting_plan_remnant: { findMany: jest.fn(async () => [
      { id: 5, plate_number: 'R3062', ref_plate: '9229', length_mm: dec(1491), width_mm: dec(1281), weight_kg: dec(90), count: 1, upload_id: 1,
        nesting: { plate_number: '9229', quality: 'HY370', thick_mm: dec(6), certificate: 'HN-77' }, upload: { id: 1, project: { project_code: '0X186' }, zone: { code: 'Z3' }, create_date: new Date('2026-11-01') } },
    ]) },
    cutting_plan_shape_layout: { findMany: jest.fn(async () => [
      { id: 40, stock_length_mm: dec(6013), rest_mm: dec(469.68), repeat: 6, size: { profile: 'PIPE 101.6X2.6', grade: 'HSS550', upload_id: 2, upload: { id: 2, project: { project_code: '0X222' }, zone: { code: 'Z07' }, create_date: new Date('2026-11-02') } } },
      { id: 41, stock_length_mm: dec(12500), rest_mm: dec(0), repeat: 4, size: { profile: 'PIPE 101.6X2.6', grade: 'HSS550', upload_id: 2, upload: { id: 2, project: null, zone: null, create_date: new Date('2026-11-02') } } },
    ]) },
    cutting_plan_remnant_use: {
      groupBy: jest.fn(async () => uses.reduce((a: any[], u) => { const g = a.find(x => x.source === u.source && x.source_id === u.source_id); if (g) g._sum.qty += u.qty; else a.push({ source: u.source, source_id: u.source_id, _sum: { qty: u.qty } }); return a }, [])),
      create: jest.fn(async ({ data }: any) => { uses.push(data); return data }),
    },
    materials: { findMany: jest.fn(async () => [
      { default_code: 'BDTP000104', grade: 'HY370', thickness_mm: dec(9), cost: dec(23.54) },
      { default_code: 'BDTP000178', grade: 'HY370', thickness_mm: dec(5), cost: dec(27.29) },
    ]) },
  }
  const storage: any = { getObject: jest.fn(async () => Buffer.from('dxf')) }
  const parse = jest.fn(() => ({ parts: [], path: [[0, [0, 0, 10, 0]], [1, [10, 0, 10, 300, 410, 300]], [1, [0, 0, 0, 100]]] as any }))
  const svc = new CuttingPlanMaterialService(prisma, storage)
  svc.parse = parse as any
  return { svc, prisma, changes, uses, kerfs, storage }
}

describe('cutLengthMm', () => {
  it('adds up the CUT path only, not the rapid moves', () => {
    expect(cutLengthMm({ parts: [], path: [[0, [0, 0, 50, 0]], [1, [0, 0, 3, 4, 3, 10]], [1, [0, 0, 0, 2]]] })).toBe(13)
  })
})

describe('CuttingPlanMaterialService', () => {
  it('measures the cut length of plates that have a DXF and none yet, once', async () => {
    const { svc, prisma, storage } = build()
    await svc.ensureCutLengths(1)
    expect(storage.getObject).toHaveBeenCalledTimes(1)
    expect(prisma.cutting_plan_nesting.update).toHaveBeenCalledWith({ where: { id: 11 }, data: { cut_length_mm: 800 } })
  })

  it('saves a kerf per technology and thickness and keeps the old → new value', async () => {
    const { svc, changes } = build()
    await svc.saveKerfs([{ technology: 'Plasma [PlainCuttingUnit]', thick_mm: 6, kerf_mm: 2.5 }], 9)
    expect(changes[0]).toMatchObject({ entity: 'KERF', field: 'kerf_mm', old_value: null, new_value: '2.5', changed_by_uid: 9 })
  })

  it('sets a certificate as text and logs it; an unknown plate is a 404', async () => {
    const { svc, changes } = build()
    await svc.setCertificate(12, ' MTC 2026/118-A ', 3)
    expect(changes[0]).toMatchObject({ entity: 'NESTING', entity_id: 12, field: 'certificate', old_value: 'HN-77', new_value: 'MTC 2026/118-A' })
    await expect(svc.setCertificate(99, 'x', 3)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('prices per kg from Materials by grade and thickness', async () => {
    expect(await build().svc.prices()).toEqual([
      { grade: 'HY370', thick_mm: 5, thb_per_kg: 27.29, material: 'BDTP000178' },
      { grade: 'HY370', thick_mm: 9, thb_per_kg: 23.54, material: 'BDTP000104' },
    ])
  })

  it('the register lists every plate remnant and every shape rest, less what was used', async () => {
    const { svc } = build()
    await svc.useRemnant({ source: 'SHAPE', source_id: 40, qty: 2, note: 'job 0X225' }, 4)
    const r = await svc.remnants()
    expect(r).toEqual([
      expect.objectContaining({ source: 'PLATE', source_id: 5, offcut_no: 'R3062', from_plate: '9229', kind: 'PLATE', grade: 'HY370', thick_mm: 6, length_mm: 1491, width_mm: 1281, weight_kg: 90, qty: 1, used: 0, available: 1, certificate: 'HN-77', project_code: '0X186', zone: 'Z3' }),
      expect.objectContaining({ source: 'SHAPE', source_id: 40, offcut_no: 'S40', kind: 'SHAPE', profile: 'PIPE 101.6X2.6', grade: 'HSS550', length_mm: 469.68, qty: 6, used: 2, available: 4, project_code: '0X222' }),
    ])
  })

  it('cannot use more pieces than are left', async () => {
    const { svc } = build()
    await expect(svc.useRemnant({ source: 'PLATE', source_id: 5, qty: 2 }, 4)).rejects.toBeInstanceOf(BadRequestException)
    await expect(svc.useRemnant({ source: 'PLATE', source_id: 999, qty: 1 }, 4)).rejects.toBeInstanceOf(NotFoundException)
  })
})
