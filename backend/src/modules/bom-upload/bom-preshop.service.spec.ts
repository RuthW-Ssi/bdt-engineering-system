// Pre-shop at the BOM page (2026-11-23, wiki features/bom-preshop-upload-plan):
// each save is a new PRE_SHOP dispatch with revision ≥ 1; the previous
// BOM-page revision goes INACTIVE. MO-made pre-shop (revision 0) is never touched.
import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BomPreshopService } from './bom-preshop.service'

const P101 = { part_mark: 'P101', profile: 'H300x300x10x15', length_mm: 8400, grade: 'SS400', qty: 1, unit_weight_kg: 789.6 }
const P102 = { part_mark: 'P102', profile: 'PL25x400', length_mm: 400, grade: 'SS400', qty: 2, unit_weight_kg: 31.4 }
const C01 = { assembly_mark: 'C-01', name: 'COLUMN', qty: 4, weight_kg: 1265.4, surface_area_m2: 24.6, length_mm: 8450, width_mm: 300, height_mm: 300, parts: [P101, P102] }
const C02 = { assembly_mark: 'C-02', name: 'COLUMN', qty: 2, weight_kg: 1240.8, surface_area_m2: 24.1, length_mm: 8450, width_mm: 300, height_mm: 300, parts: [P102] }
const SCOPE = { project_id: 43, zone_id: 79, sub_zone_id: null }

function make(opts: { prev?: { id: number; revision: number } | null; realBom?: number; zoneOf?: number } = {}) {
  const calls: string[] = []
  const tx = {
    $queryRaw: jest.fn(() => { calls.push('lock'); return Promise.resolve([]) }),
    bom_assembly: {
      count: jest.fn(() => Promise.resolve(opts.realBom ?? 0)),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    bom_part: { updateMany: jest.fn(() => Promise.resolve({ count: 1 })) },
    bom_dispatch: { findFirst: jest.fn((q: any) => {
      if (q.where.revision?.gte) { calls.push('prev'); return Promise.resolve(opts.prev ?? null) }
      return Promise.resolve({ id: 900 }) // read-back of the dispatch just written
    }) },
  }
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)), bom_dispatch: { findFirst: jest.fn() }, bom_assembly: { findMany: jest.fn() },
    project_zone: { findFirst: jest.fn((q: any) => Promise.resolve(opts.zoneOf === undefined || opts.zoneOf === q.where.project_id ? { id: q.where.id } : null)) },
    sub_zone: { findFirst: jest.fn((q: any) => Promise.resolve(q.where.zone_id === 79 ? { id: q.where.id } : null)) },
  }
  const preshop = { createDispatch: jest.fn(() => Promise.resolve(new Map([['C-01', 700]]))), fromDispatchNote: jest.fn() }
  const xlsx = { parse: jest.fn() }
  const svc = new BomPreshopService(prisma as any, preshop as any, xlsx as any)
  return { svc, tx, prisma, preshop, xlsx, calls }
}

describe('BomPreshopService.save', () => {
  it('writes revision 1 the first time and supersedes nothing', async () => {
    const { svc, tx, preshop } = make()
    await svc.save(SCOPE, [C01], 1)
    expect((preshop.createDispatch.mock.calls[0] as any[])[4]).toEqual({ revision: 1 })
    expect(tx.bom_assembly.updateMany).not.toHaveBeenCalled()
  })

  it('sets the previous BOM-page revision INACTIVE and writes the next one', async () => {
    const { svc, tx, preshop } = make({ prev: { id: 55, revision: 2 } })
    const r = await svc.save(SCOPE, [C01], 1)
    expect(tx.bom_assembly.updateMany).toHaveBeenCalledWith({ where: { dispatch_id: 55 }, data: { status: 'INACTIVE' } })
    expect(tx.bom_part.updateMany).toHaveBeenCalledWith({ where: { dispatch_id: 55 }, data: { status: 'INACTIVE' } })
    expect((preshop.createDispatch.mock.calls[0] as any[])[4]).toEqual({ revision: 3 })
    expect(r).toEqual({ dispatch_id: 900, revision: 3 })
  })

  it('looks only at BOM-page pre-shop (revision ≥ 1), never MO pre-shop', async () => {
    const { svc, tx } = make()
    await svc.save(SCOPE, [C01], 1)
    expect((tx.bom_dispatch.findFirst.mock.calls[0] as any[])[0].where).toMatchObject({ project_id: 43, zone_id: 79, sub_zone_id: null, source: 'PRE_SHOP', revision: { gte: 1 } })
  })

  it('refuses a zone that already has a real BOM', async () => {
    const { svc, preshop } = make({ realBom: 3 })
    await expect(svc.save(SCOPE, [C01], 1)).rejects.toThrow('Zone นี้มี BOM แล้ว')
    expect(preshop.createDispatch).not.toHaveBeenCalled()
  })

  it('refuses an assembly without parts', async () => {
    const { svc } = make()
    await expect(svc.save(SCOPE, [C01, { ...C02, parts: [] }], 1)).rejects.toThrow(new BadRequestException('ใส่ part ให้ครบทุก mark ก่อนบันทึก: C-02'))
  })

  it('refuses one part mark with two different sizes', async () => {
    const { svc, preshop } = make()
    await expect(svc.save(SCOPE, [C01, { ...C02, parts: [{ ...P102, profile: 'PL30x400' }] }], 1))
      .rejects.toThrow('Part mark ซ้ำแต่ขนาดไม่ตรงกัน: P102')
    expect(preshop.createDispatch).not.toHaveBeenCalled()
  })

  it('refuses a zone that is not in the project', async () => {
    const { svc, preshop } = make({ zoneOf: 99 })
    await expect(svc.save(SCOPE, [C01], 1)).rejects.toThrow('Zone นี้ไม่ได้อยู่ใน project ที่เลือก')
    expect(preshop.createDispatch).not.toHaveBeenCalled()
  })

  it('refuses a sub-zone that is not in the zone', async () => {
    const { svc } = make()
    await expect(svc.save({ ...SCOPE, zone_id: 80, sub_zone_id: 5 }, [C01], 1)).rejects.toThrow('Sub-zone นี้ไม่ได้อยู่ใน zone ที่เลือก')
  })

  it('takes the per-zone lock before reading the previous revision', async () => {
    const { svc, calls } = make()
    await svc.save(SCOPE, [C01], 1)
    expect(calls.slice(0, 2)).toEqual(['lock', 'prev'])
  })
})

describe('BomPreshopService.current', () => {
  it('returns null when the zone has no BOM-page pre-shop', async () => {
    const { svc, prisma } = make()
    prisma.bom_dispatch.findFirst.mockResolvedValue(null)
    expect(await svc.current(SCOPE)).toBeNull()
    expect(prisma.bom_dispatch.findFirst.mock.calls[0][0].where).toMatchObject({ source: 'PRE_SHOP', revision: { gte: 1 } })
  })

  it('maps ACTIVE rows to assemblies with parts per set (one part in two assemblies)', async () => {
    const { svc, prisma } = make()
    const d = (v: number) => new Prisma.Decimal(v)
    const part = (p: typeof P101) => ({ part_mark: p.part_mark, profile: p.profile, grade: p.grade, length_mm: d(p.length_mm), weight_kg: d(p.unit_weight_kg) })
    prisma.bom_dispatch.findFirst.mockResolvedValue({ id: 60, revision: 2, uploaded_at: new Date('2026-11-23T03:00:00Z') })
    prisma.bom_assembly.findMany.mockResolvedValue([
      { assembly_mark: 'C-01', name: 'COLUMN', qty: d(4), weight_kg: d(1265.4), surface_area_m2: d(24.6), length_mm: d(8450), width_mm: d(300), height_mm: d(300),
        assembly_parts: [{ qty: d(1), part: part(P101) }, { qty: d(2), part: part(P102) }] },
      { assembly_mark: 'C-02', name: 'COLUMN', qty: d(2), weight_kg: d(1240.8), surface_area_m2: d(24.1), length_mm: d(8450), width_mm: d(300), height_mm: d(300),
        assembly_parts: [{ qty: d(2), part: part(P102) }] },
    ])
    const r = await svc.current(SCOPE)
    expect(r).toEqual({ dispatch_id: 60, revision: 2, uploaded_at: '2026-11-23T03:00:00.000Z', assemblies: [C01, C02] })
    expect(prisma.bom_assembly.findMany.mock.calls[0][0].where).toEqual({ dispatch_id: 60, status: 'ACTIVE' })
  })
})

describe('BomPreshopService.partsFromPartList', () => {
  // real parser, sheet built in the test (same as xlsx-parser.service.spec)
  const XLSX = require('xlsx')
  const { XlsxParserService } = require('./xlsx-parser.service')
  const sheet = (rows: (string | number)[][]) => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  }
  const svc = () => new BomPreshopService({} as any, {} as any, new XlsxParserService())

  it('reads a Tekla Part List into parts with the zone count', () => {
    const buf = sheet([
      ['Mark', 'Profile', 'No.', 'Grade', 'Length(mm)', 'Area(m2)/PCS.', 'Weight(kg)/PCS.'],
      ['DBN-B-px1', 'PL20x520', 40, 'HY370', 520, 0.58, 42.45],
    ])
    expect(svc().partsFromPartList(buf)).toEqual([{ part_mark: 'DBN-B-px1', profile: 'PL20x520', grade: 'HY370', length_mm: 520, unit_weight_kg: 42.45, no: 40 }])
  })

  it('folds rows that share a part mark into one: first row\'s size (as the real upload), pieces added up', () => {
    const buf = sheet([
      ['Mark', 'Profile', 'No.', 'Grade', 'Length(mm)', 'Area(m2)/PCS.', 'Weight(kg)/PCS.'],
      ['DBN-B-px7', 'PL12x225.9', 1, 'HY370', 305.02, 0.14, 4.04],
      ['DBN-B-px7', 'PL12x226', 27, 'HY370', 305.51, 0.14, 4.05],
      ['DBN-B-px7', 'PL12x226.1', 1, 'HY370', 305.94, 0.14, 4.05],
    ])
    expect(svc().partsFromPartList(buf)).toEqual([{ part_mark: 'DBN-B-px7', profile: 'PL12x225.9', grade: 'HY370', length_mm: 305.02, unit_weight_kg: 4.04, no: 29 }])
  })

  it('refuses a Dispatch Note with a plain "Mark" header in the Part List slot', () => {
    const buf = sheet([['Mark', 'Name', 'Set', 'WeightKg.'], ['DBN-B1-BR1', 'BRACE', 18, 104.44]])
    expect(() => svc().partsFromPartList(buf)).toThrow('Part List: ไม่พบ part ในไฟล์นี้ — ตรวจว่าเป็นไฟล์ Part List')
  })

  it('refuses a file that is not a Part List', () => {
    const buf = sheet([['No.', 'MarkNo.', 'Name', 'DrawingNumber', 'Set'], [1, 'DBN-B1-BR1', 'BRACE', 'DBN-B1-BR1', 18]])
    expect(() => svc().partsFromPartList(buf)).toThrow('Part List: ไม่พบ part ในไฟล์นี้ — ตรวจว่าเป็นไฟล์ Part List')
  })
})
