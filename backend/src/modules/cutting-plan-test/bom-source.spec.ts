import { BomSourceService } from './bom-source'

// Rows as Prisma returns them: qty / length_mm are Decimal-like (toString), dispatch carries the zone
const dec = (v: number | null) => (v == null ? null : { toString: () => String(v) })
const row = (mark: string, profile: string | null, qty: number, length: number | null, zone = 72, grade: string | null = 'HSS550') =>
  ({ part_mark: mark, profile, grade, qty: dec(qty), length_mm: dec(length), dispatch: { zone_id: zone } })
const ROWS = [
  row('DBN-A3-m49', 'PIPE101.6X2.4', 64, 3000.06),
  row('DBN-A3-m44', 'PIPE101.6X2.4', 64, 500),
  row('DBN-A1-m37', 'PIPE113.5X2.4', 14, 1817.47),
  row('DBN-A3-m1', 'PIPE113.5X2.4', 8, 2052.45),
  row('DBN-A3-m3', 'PIPE165.2x4.5', 4, 12401, 72, 'SS500'),
  row('DBN-A5-p1', 'RODRB25', 10, 2500, 74, 'SS400'),
  row('DBN-A5-p2', 'ROD RB25', 6, null, 74, 'SS400'),
  row('DBN-A3-x1', 'H200X100X5.5X8', 3, 6000),
  row('DBN-A3-p9', 'PL10', 40, 300),
]

function build(rows = ROWS) {
  const prisma: any = {
    project: { findUnique: jest.fn(async ({ where }: any) => (where.id === 7 ? { id: 7 } : null)) },
    project_zone: { findMany: jest.fn(async () => [{ id: 72, code: 'Z07', label: 'BIF TO NP Zone 3' }, { id: 74, code: 'Z09', label: 'ROD Zone 1' }, { id: 99, code: 'Z99', label: 'Empty' }]) },
    bom_part: { findMany: jest.fn(async ({ where }: any) => rows.filter(r => !where.dispatch.zone_id?.in || where.dispatch.zone_id.in.includes(r.dispatch.zone_id))) },
  }
  return { prisma, svc: new BomSourceService(prisma) }
}

describe('BomSourceService.sources', () => {
  it('lists zones with the pieces and mark groups that can be laid out now', async () => {
    const { svc, prisma } = build()
    const r = await svc.sources(7)
    expect(r.zones).toEqual([
      { id: 72, code: 'Z07', label: 'BIF TO NP Zone 3', pieces: 154, groups: [{ group: 'DBN-A1', pieces: 14 }, { group: 'DBN-A3', pieces: 140 }] },
      { id: 74, code: 'Z09', label: 'ROD Zone 1', pieces: 16, groups: [{ group: 'DBN-A5', pieces: 16 }] },
      { id: 99, code: 'Z99', label: 'Empty', pieces: 0, groups: [] },
    ])
    expect(prisma.bom_part.findMany.mock.calls[0][0].where).toMatchObject({ status: 'ACTIVE', dispatch: { project_id: 7, status: 'complete' } })
  })

  it('an unknown project is a 404', async () => {
    await expect(build().svc.sources(1)).rejects.toThrow('Project 1 not found')
  })
})

describe('BomSourceService.parts', () => {
  it('turns BOM parts into sizes, one per profile + grade, names normalised', async () => {
    const r = await build().svc.parts(7, [72, 74], [])
    expect(r.sizes.map(s => [s.profile, s.grade, s.parts])).toEqual([
      ['PIPE 101.6X2.4', 'HSS550', [{ mark: 'DBN-A3-m44', lengthMm: 500, count: 64 }, { mark: 'DBN-A3-m49', lengthMm: 3000.06, count: 64 }]],
      ['PIPE 113.5X2.4', 'HSS550', [{ mark: 'DBN-A1-m37', lengthMm: 1817.47, count: 14 }, { mark: 'DBN-A3-m1', lengthMm: 2052.45, count: 8 }]],
      ['PIPE 165.2X4.5', 'SS500', [{ mark: 'DBN-A3-m3', lengthMm: 12401, count: 4 }]],
      ['ROD RB25', 'SS400', [{ mark: 'DBN-A5-p1', lengthMm: 2500, count: 10 }]],
    ])
    expect(r.pieces).toBe(164)
  })

  it('only the picked mark groups', async () => {
    const r = await build().svc.parts(7, [72], ['DBN-A3'])
    expect(r.sizes.flatMap(s => s.parts.map(p => p.mark))).not.toContain('DBN-A1-m37')
    expect(r.pieces).toBe(140)
  })

  it('warns about parts with no length, shapes not laid out yet, and merged spellings', async () => {
    const r = await build().svc.parts(7, [72, 74], [])
    expect(r.warnings).toEqual([
      'ROD RB25: 1 mark (6 pcs) has no length and is left out: DBN-A5-p2',
      'ROD RB25 is written 2 ways in the BOM (ROD RB25, RODRB25); counted as one size',
      'Not laid out yet: H (1 mark, 3 pcs)',
    ])
  })

  it('needs at least one zone', async () => {
    await expect(build().svc.parts(7, [], [])).rejects.toThrow('Pick at least one zone')
  })

  // live 2026-11-11 (0X222 rod zones): the same mark carries slightly different lengths per zone, and one zone has none
  it('one length per mark across zones: the most common, filling zones that have none', async () => {
    const rows = [
      row('DBN-A5-m2', 'RODRB25', 90, 10000, 74, 'SS400'),
      row('DBN-A5-m2', 'RODRB25', 56, 10000.05, 75, 'SS400'),
      row('DBN-A5-m2', 'ROD RB25', 54, null, 76, 'SS400'),
      row('DBN-A5-m1', 'RODRB25', 34, 500, 74, 'SS400'),
      row('DBN-A5-m1', 'RODRB25', 32, 499.99, 75, 'SS400'),
      row('DBN-A5-m9', 'RODRB25', 4, 800, 74, 'SS400'),
      row('DBN-A5-m9', 'RODRB25', 4, 900, 75, 'SS400'),
    ]
    const r = await build(rows).svc.parts(7, [74, 75, 76], [])
    expect(r.sizes[0].parts).toEqual([
      { mark: 'DBN-A5-m1', lengthMm: 500, count: 66 },
      { mark: 'DBN-A5-m2', lengthMm: 10000, count: 200 },
      { mark: 'DBN-A5-m9', lengthMm: 800, count: 4 },
      { mark: 'DBN-A5-m9', lengthMm: 900, count: 4 },
    ])
    expect(r.warnings).toEqual(expect.arrayContaining([
      'ROD RB25: 2 marks differ by up to 1 mm between zones; used the most common length: DBN-A5-m2 (10,000 / 10,000.05 → 10,000), DBN-A5-m1 (500 / 499.99 → 500)',
      'ROD RB25: 1 mark (54 pcs) had no length in some zones; used the same mark\'s length from the other picked zones: DBN-A5-m2',
      'ROD RB25: 1 mark has lengths more than 1 mm apart between zones; kept apart: DBN-A5-m9 (800 / 900)',
    ]))
  })
})
