import { duplicateGroups, mergeRows, rowErrors, totalWeight } from './moPartLines'

const L = { profile: 'PL25x400', grade: 'SM520', length_mm: 10550, qty: 4, unit_weight_kg: 828.17 }

describe('moPartLines', () => {
  it('rowErrors flags blank profile and fractional qty per row', () => {
    const e = rowErrors([L, { ...L, profile: '', qty: 1.5 }])
    expect(e.get(0)).toBeUndefined()
    expect(e.get(1)).toEqual(['profile is required', 'qty must be a whole number > 0'])
  })
  it('duplicateGroups finds same size ignoring case', () => {
    expect(duplicateGroups([L, { ...L, length_mm: 8550 }, { ...L, profile: 'pl25x400' }])).toEqual([[0, 2]])
  })
  it('duplicateGroups ignores the same size under different marks or part marks', () => {
    expect(duplicateGroups([{ ...L, mark: 'A' }, { ...L, mark: 'B' }, { ...L, part_mark: 'x-p1' }, { ...L, part_mark: 'x-p2' }])).toEqual([])
    expect(duplicateGroups([{ ...L, mark: 'A' }, { ...L, mark: 'A' }])).toEqual([[0, 1]])
  })
  it('mergeRows sums qty into the first row and unions bom ids', () => {
    const merged = mergeRows([{ ...L, bom_part_ids: [1] }, { ...L, length_mm: 8550 }, { ...L, qty: 2, bom_part_ids: [2] }], [0, 2])
    expect(merged).toEqual([{ ...L, qty: 6, bom_part_ids: [1, 2] }, { ...L, length_mm: 8550 }])
  })
  it('totalWeight ignores rows without weight', () => {
    expect(totalWeight([L, { ...L, unit_weight_kg: null }])).toBeCloseTo(3312.68)
  })
})
