import { buildFromSources, compareSizes, deriveMarkPlates } from './moPartMatch'

const ML = [
  { profile: 'PL20x950', grade: 'SM520', length_mm: 8550, qty: 5, unit_weight_kg: 1275.23 },
  { profile: 'PL20x950', grade: 'SM520', length_mm: 10550, qty: 1, unit_weight_kg: 1573.53 },
  { profile: 'PL20x950', grade: 'SM520', length_mm: 13975, qty: 2, unit_weight_kg: 2084.37 },
  { profile: 'PL20x1150', grade: 'SM520', length_mm: 10550, qty: 2, unit_weight_kg: 1904.8 },
  { profile: 'PL25x400', grade: 'SM520', length_mm: 8550, qty: 10, unit_weight_kg: 671.18 },
  { profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 4, unit_weight_kg: 828.17 },
  { profile: 'PL25x600', grade: 'SM520', length_mm: 13975, qty: 4, unit_weight_kg: 1645.56 },
]
const MARKS = [
  { mark: 'BUH1-3', set_qty: 2, length_mm: 10550, width_mm: 400, height_mm: 1200 },
  { mark: 'BUH1A-12', set_qty: 1, length_mm: 10550, width_mm: 400, height_mm: 1000 },
  { mark: 'BUH1A-14', set_qty: 5, length_mm: 8550, width_mm: 400, height_mm: 1000 },
  { mark: 'BUH1B-18', set_qty: 2, length_mm: 13975, width_mm: 600, height_mm: 1000 },
]

describe('deriveMarkPlates', () => {
  it('finds tf from PLt×W and tw from PLt×(H−2tf) at the same length', () => {
    const r = deriveMarkPlates(MARKS[0], ML)
    expect(r).toEqual({ tf: 25, tw: 20, lines: [
      { mark: 'BUH1-3', profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 4, unit_weight_kg: 828.17 },
      { mark: 'BUH1-3', profile: 'PL20x1150', grade: 'SM520', length_mm: 10550, qty: 2, unit_weight_kg: 1904.8 },
    ] })
  })
  it('uses typed tw/tf even with no Material List (grade blank, weight null)', () => {
    const r = deriveMarkPlates({ ...MARKS[1], tf_mm: 25, tw_mm: 20 }, [])
    expect(r).toEqual({ tf: 25, tw: 20, lines: [
      { mark: 'BUH1A-12', profile: 'PL25x400', grade: '', length_mm: 10550, qty: 2, unit_weight_kg: null },
      { mark: 'BUH1A-12', profile: 'PL20x950', grade: '', length_mm: 10550, qty: 1, unit_weight_kg: null },
    ] })
  })
  it('gives a reason instead of guessing when no flange size matches', () => {
    expect(deriveMarkPlates({ ...MARKS[0], width_mm: 450 }, ML)).toEqual({ reason: 'BUH1-3: ไม่พบแผ่น PL…x450 ยาว 10550 ใน Material List — กรอก tf/tw เอง' })
  })
  it('gives a reason when L, W or H is missing', () => {
    expect(deriveMarkPlates({ ...MARKS[0], height_mm: null }, ML)).toEqual({ reason: 'BUH1-3: ต้องมีความยาว ความกว้าง และความสูง' })
  })
})

describe('buildFromSources + compareSizes (Celestica)', () => {
  it('derives 8 mark lines, no unassigned leftovers, and shows the PL25x400 @10550 gap', () => {
    const { lines, warnings } = buildFromSources(MARKS, ML)
    expect(warnings).toEqual([])
    expect(lines).toHaveLength(8)
    expect(lines.every(l => l.mark)).toBe(true)
    const cmp = compareSizes(lines, ML).filter(c => c.diff !== 0)
    expect(cmp).toEqual([{ profile: 'PL25x400', grade: 'SM520', length_mm: 10550, from_marks: 6, from_list: 4, diff: 2 }])
  })
  it('keeps Material List qty no mark explains as an unassigned line', () => {
    const { lines } = buildFromSources(MARKS.slice(0, 1), ML)
    const extra = lines.filter(l => !l.mark && l.profile === 'PL25x400' && l.length_mm === 8550)
    expect(extra).toEqual([{ mark: null, profile: 'PL25x400', grade: 'SM520', length_mm: 8550, qty: 10, unit_weight_kg: 671.18 }])
  })
  it('with marks only, every size compares against null', () => {
    const cmp = compareSizes(buildFromSources([{ ...MARKS[1], tf_mm: 25, tw_mm: 20 }], []).lines, null)
    expect(cmp.every(c => c.from_list === null)).toBe(true)
  })
})
