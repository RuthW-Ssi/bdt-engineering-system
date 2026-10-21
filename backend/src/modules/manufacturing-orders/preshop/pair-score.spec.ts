import { pairParts, pairPartsWithRenames } from './pair-score'

const P = (m: string, profile = 'PL25x400', L = 10550, q = 2) => ({ part_mark: m, profile, length_mm: L, grade: 'SM520', qty: q, unit_weight_kg: 828.17 })

describe('pairPartsWithRenames', () => {
  it('same name first, then a confirmed part rename, then same spec', () => {
    const was = [P('C-f1'), P('C-x', 'PL12x150', 300, 4), P('C-y', 'PL9x100', 200, 1)]
    const now = [P('C-f1'), P('3C-x', 'PL12x150', 300, 4), P('C-z', 'PL9x100', 200, 1)]
    expect(pairPartsWithRenames(was, now, m => (m === 'C-x' ? '3C-x' : m))).toEqual([
      { from: 'C-f1', to: 'C-f1', how: 'name' },
      { from: 'C-x', to: '3C-x', how: 'rename' },
      { from: 'C-y', to: 'C-z', how: 'spec' },
    ])
  })

  it('pairParts keeps its old output (no rename pass)', () => {
    expect(pairParts([P('C-f1'), P('C-wx58')], [P('C-f1')])).toEqual([
      { from: 'C-f1', to: 'C-f1', how: 'name' },
      { from: 'C-wx58', to: null, how: 'none' },
    ])
  })
})
