import { describe, expect, it } from 'vitest'
import { partErrors, preshopErrors, preshopTotals } from './preshop'

const A = { assembly_mark: 'BUH1B-18', qty: 2, weight_kg: 5454.93, surface_area_m2: 63.372, length_mm: 13975, parts: [
  { part_mark: 'C-f32', profile: 'PL25x600', length_mm: 13975, grade: 'SM520', qty: 2, unit_weight_kg: 1645.56 },
  { part_mark: 'C-p8', profile: 'PL20x115', length_mm: 550, grade: 'SM520', qty: 8, unit_weight_kg: 9.93 },
] }

describe('preshopTotals', () => {
  it('sums sets, weight over all sets and part pieces over all sets', () => {
    expect(preshopTotals([A, { ...A, assembly_mark: 'X', qty: 1, weight_kg: null, parts: [] }])).toEqual({ assemblies: 2, sets: 3, weightKg: 10909.86, pieces: 20 })
  })
})

describe('preshopErrors', () => {
  it('flags blank marks, sets ≤ 0 and duplicates', () => {
    expect(preshopErrors([{ ...A, assembly_mark: ' ' }, { ...A, qty: 0 }, { ...A }])).toEqual(['แถว 1: ยังไม่ใส่ assembly mark', 'แถว 2 (BUH1B-18): ยังไม่ได้กรอกจำนวนชุด', 'assembly ซ้ำ: BUH1B-18'])
    expect(preshopErrors([A])).toEqual([])
  })
})

describe('partErrors', () => {
  const p = { part_mark: 'C-f1', profile: 'PL25x400', length_mm: 10550, grade: 'SM520', qty: 2, unit_weight_kg: 828.17 }
  it('flags a missing mark / profile, a zero count per set and a repeated part', () => {
    expect(partErrors([p, { ...p, part_mark: ' ' }, { ...p, part_mark: 'C-x', profile: '' }, { ...p, part_mark: 'C-y', qty: 0, length_mm: 0, unit_weight_kg: 0 }, { ...p }])).toEqual([
      'part แถว 2: ยังไม่ใส่ part mark', 'C-x: ยังไม่ใส่ profile', 'C-y: ยังไม่ใส่ L', 'C-y: ยังไม่ใส่ kg/ชิ้น', 'C-y: จำนวนต่อชุดต้องมากกว่า 0', 'part ซ้ำ: C-f1',
    ])
    expect(partErrors([p])).toEqual([])
  })
})
