// Pre-shop MO (2026-10-07): a Dispatch Note / pre-shop drawing upload becomes a
// PRE_SHOP-sourced BOM dispatch for the MO's project/zone, so the MO's lines
// and WOs use the normal bom_assembly / bom_assembly_part machinery and the
// real BOM later supersedes it (same zone + mark → WO "Accept new version").
import { BadRequestException } from '@nestjs/common'
import { PreshopService } from './preshop.service'

const BUH13 = { assembly_mark: 'BUH1-3', qty: 2, weight_kg: 3561.15, surface_area_m2: 42.708, length_mm: 10550, parts: [
  { part_mark: 'C-f1', profile: 'PL25x400', length_mm: 10550, grade: 'SM520', qty: 2, unit_weight_kg: 828.17 },
  { part_mark: 'C-wx58', profile: 'PL20x1150', length_mm: 10550, grade: 'SM520', qty: 1, unit_weight_kg: 1904.8 },
] }
const BUH1A12 = { assembly_mark: 'BUH1A-12', qty: 1, weight_kg: 3229.88, surface_area_m2: 38.48, length_mm: 10550, parts: [
  { part_mark: 'C-f1', profile: 'PL25x400', length_mm: 10550, grade: 'SM520', qty: 2, unit_weight_kg: 828.17 },
] }

function make() {
  const tx = {
    bom_dispatch: { create: jest.fn().mockResolvedValue({ id: 900 }) },
    bom_assembly: { createManyAndReturn: jest.fn(({ data }: any) => Promise.resolve(data.map((a: any, i: number) => ({ id: 700 + i, assembly_mark: a.assembly_mark })))) },
    bom_part: { createManyAndReturn: jest.fn(({ data }: any) => Promise.resolve(data.map((p: any, i: number) => ({ id: 800 + i, part_mark: p.part_mark })))) },
    bom_assembly_part: { createMany: jest.fn() },
  }
  return { svc: new PreshopService(), tx }
}

describe('PreshopService.createDispatch', () => {
  it('creates a PRE_SHOP dispatch with assemblies, deduped parts and per-set links', async () => {
    const { svc, tx } = make()
    const ids = await svc.createDispatch(tx as any, { project_id: 5, zone_id: 3, sub_zone_id: null }, [{ ...BUH13, name: 'WEB' }, BUH1A12], 1)
    expect(tx.bom_dispatch.create.mock.calls[0][0].data).toMatchObject({ project_id: 5, zone_id: 3, sub_zone_id: null, source: 'PRE_SHOP', status: 'ready', revision: 0, create_uid: 1 })
    const asm = tx.bom_assembly.createManyAndReturn.mock.calls[0][0].data
    expect(asm.map((a: any) => [a.assembly_mark, a.name, Number(a.qty), Number(a.weight_kg)])).toEqual([['BUH1-3', 'WEB', 2, 3561.15], ['BUH1A-12', null, 1, 3229.88]])
    const parts = tx.bom_part.createManyAndReturn.mock.calls[0][0].data
    // C-f1: 2 per set × 2 sets + 2 per set × 1 set = 6 pieces
    expect(parts.map((p: any) => [p.part_mark, p.profile, Number(p.qty), Number(p.weight_kg)])).toEqual([['C-f1', 'PL25x400', 6, 828.17], ['C-wx58', 'PL20x1150', 2, 1904.8]])
    expect(tx.bom_assembly_part.createMany.mock.calls[0][0].data.map((l: any) => [l.assembly_id, l.part_id, Number(l.qty)])).toEqual([[700, 800, 2], [700, 801, 1], [701, 800, 2]])
    expect(ids).toEqual(new Map([['BUH1-3', 700], ['BUH1A-12', 701]]))
  })

  it('works for a Dispatch Note (assemblies without parts)', async () => {
    const { svc, tx } = make()
    await svc.createDispatch(tx as any, { project_id: 5, zone_id: 3 }, [{ ...BUH13, parts: [] }], 1)
    expect(tx.bom_part.createManyAndReturn).not.toHaveBeenCalled()
    expect(tx.bom_assembly_part.createMany).not.toHaveBeenCalled()
  })

  it('rejects duplicate assembly marks and empty / non-positive sets', async () => {
    const { svc, tx } = make()
    await expect(svc.createDispatch(tx as any, { project_id: 5, zone_id: 3 }, [BUH13, BUH13], 1)).rejects.toThrow(BadRequestException)
    await expect(svc.createDispatch(tx as any, { project_id: 5, zone_id: 3 }, [{ ...BUH13, qty: 0 }], 1)).rejects.toThrow('BUH1-3: sets must be more than 0')
  })
})

describe('PreshopService.fromDispatchNote', () => {
  it('turns Dispatch Note marks into assemblies (weight per set, L only)', () => {
    const { svc } = make()
    // the file's weight and paint area are for all sets → per set (2026-10-09: W / H back, area added)
    expect(svc.fromDispatchNote([{ mark: 'BUH1-3', name: 'WEB', set_qty: 2, length_mm: 10550, width_mm: 400, height_mm: 1200, weight_kg: 7122.3, area_m2: 85.416 }])).toEqual([
      { assembly_mark: 'BUH1-3', name: 'WEB', qty: 2, weight_kg: 3561.15, surface_area_m2: 42.708, length_mm: 10550, width_mm: 400, height_mm: 1200, parts: [] },
    ])
  })
})

describe('PreshopService.mergeFiles', () => {
  it('concatenates files, keeps the first of a repeated mark and warns', () => {
    const { svc } = make()
    const r = svc.mergeFiles([
      { filename: 'a.pdf', assemblies: [BUH13] },
      { filename: 'b.pdf', assemblies: [{ ...BUH13, qty: 9 }, BUH1A12] },
      { filename: 'c.pdf', assemblies: [] },
    ])
    // each assembly says which file it came from — the Upload modal removes a wrong file's rows (2026-10-08)
    expect(r.assemblies.map(a => [a.assembly_mark, a.qty, a.source_file])).toEqual([['BUH1-3', 2, 'a.pdf'], ['BUH1A-12', 1, 'b.pdf']])
    expect(r.warnings).toEqual(['b.pdf: BUH1-3 already read from a.pdf — skipped', 'c.pdf: no BILL OF MATERIAL found'])
  })
})


// Filling parts in later (2026-10-07: a pre-shop MO takes more files any time).
// A mark uploaded again / compared with the real BOM: every value is compared
// exactly (2026-10-09, user: "ต้องเปรียบเทียบกันทุกค่า") — empty = same.
describe('PreshopService.sizeChanges', () => {
  const svc = new PreshopService()
  const P = (part_mark: string, profile = 'PL25x400', length_mm = 10550, qty = 2, grade = 'SM520', unit_weight_kg = 1) => ({ part_mark, profile, length_mm, grade, qty, unit_weight_kg })
  const V = { name: 'WEB', length_mm: 10550, width_mm: 400, height_mm: 1200, weight_kg: 2140.9, surface_area_m2: 42.708 }
  const was = { ...V, parts: [P('C-f1'), P('C-wx26', 'PL20x950', 10550, 1)] }

  it('identical → no changes (part order does not matter)', () => {
    expect(svc.sizeChanges(was, { ...V, parts: [P('C-wx26', 'PL20x950', 10550, 1), P('C-f1')] })).toEqual([])
  })
  it('lists every value and every part field that differs — no tolerance', () => {
    expect(svc.sizeChanges(was, {
      ...V, name: 'BUILT-UP H', length_mm: 10600, width_mm: 450, height_mm: 1250, weight_kg: 2150, surface_area_m2: 43,
      parts: [P('C-f1', 'PL28x400', 10550, 2, 'SS400', 2), P('C-p8', 'PL20x115', 550, 8)],
    })).toEqual([
      'Name WEB → BUILT-UP H', 'L 10550 → 10600', 'W 400 → 450', 'H 1200 → 1250', 'kg/ชุด 2140.9 → 2150', 'area/ชุด 42.708 → 43',
      'C-f1: PL25x400 SM520 L10550 ×2 1kg → PL28x400 SS400 L10550 ×2 2kg', 'ไม่มี part C-wx26', 'part ใหม่ C-p8',
    ])
  })
  it('an upload: what the file does not carry is not a change (Dispatch Note: no parts · PDF: no name / W / H)', () => {
    expect(svc.sizeChanges(was, { name: null, length_mm: 10550, width_mm: null, height_mm: null, weight_kg: 2140.9, surface_area_m2: 42.708, parts: [] })).toEqual([])
    // …but a value the MO didn't have yet is
    expect(svc.sizeChanges({ ...was, width_mm: null }, { ...V, parts: [] })).toEqual(['W — → 400'])
  })
  it('the real BOM (strict): a value the BOM lacks is a difference too', () => {
    expect(svc.sizeChanges(was, { ...V, width_mm: null, parts: was.parts }, { strict: true })).toEqual(['W 400 → —'])
  })
})

// Marks / parts renamed between pre-shop and the real BOM (2026-10-09, user:
// "mark อาจจะมีการเปลี่ยน"): suggest who is who; the user confirms every pair.
describe('PreshopService — pairing renamed marks and parts', () => {
  const svc = new PreshopService()
  const P = (part_mark: string, profile = 'PL25x400', length_mm = 10550, qty = 2) => ({ part_mark, profile, length_mm, grade: 'SM520', qty, unit_weight_kg: 1 })
  const was = { length_mm: 10550, weight_kg: 3561.15, parts: [P('C-f1'), P('C-wx58', 'PL20x1150', 10550, 1)] }

  it('pairs parts by name first, then by spec; the rest stay unpaired', () => {
    expect(svc.pairParts(was.parts, [P('C-f1'), P('P101', 'PL20x1150', 10550, 1), P('P102', 'PL12x150', 300, 4)])).toEqual([
      { from: 'C-f1', to: 'C-f1', how: 'name' },
      { from: 'C-wx58', to: 'P101', how: 'spec' },
    ])
    expect(svc.pairParts(was.parts, [P('C-f1')])).toEqual([{ from: 'C-f1', to: 'C-f1', how: 'name' }, { from: 'C-wx58', to: null, how: 'none' }])
  })

  it('scores a renamed mark with the same parts and size high, an unrelated one low', () => {
    const same = svc.pairScore('BUH1-3', was, 'C1-BUH1-3', { length_mm: 10550, weight_kg: 3561.15, parts: [P('P100'), P('P101', 'PL20x1150', 10550, 1)] })
    const other = svc.pairScore('BUH1-3', was, 'BUH9', { length_mm: 6000, weight_kg: 900, parts: [P('C-x1', 'PL20x300', 6000, 2)] })
    expect(same).toBeGreaterThanOrEqual(90)
    expect(other).toBeLessThan(30)
  })
})
