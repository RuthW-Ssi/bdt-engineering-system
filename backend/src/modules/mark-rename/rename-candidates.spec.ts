import { partPairScore, splitDisappeared, suggestAssemblies, suggestParts, type AsmRow, type PartRow } from './rename-candidates'

const part = (m: string, profile = 'PL25x400', L = 10550, q = 2) => ({ part_mark: m, profile, length_mm: L, grade: 'SM520', qty: q, unit_weight_kg: 828.17 })
const asm = (id: number, mark: string, over: Partial<AsmRow> = {}): AsmRow => ({ id, mark, length_mm: 10550, weight_kg: 3561.15, parts: [part('C-f1'), part('C-f2', 'PL12x150', 300, 4)], ...over })
const prt = (id: number, mark: string, over: Partial<PartRow> = {}): PartRow => ({ id, mark, profile: 'PL25x400', grade: 'SM520', length_mm: 10550, weight_kg: 828.17, ...over })
const none = { from: new Set<string>(), to: new Set<string>() }

describe('splitDisappeared', () => {
  it('a mark still present by name is the same piece — never disappeared; only first-time marks are fresh', () => {
    const { disappeared, fresh } = splitDisappeared([asm(1, 'BUH1B-18'), asm(2, 'X')], [asm(10, 'BUH1B-18'), asm(11, '3BUH1B-18'), asm(12, 'X')], none)
    expect(disappeared.map(r => r.mark)).toEqual([])
    expect(fresh.map(r => r.mark)).toEqual(['3BUH1B-18'])
  })

  it('a disappeared mark and a fresh mark; already-paired names drop out of both lists', () => {
    const prev = [asm(1, 'BUH1B-18'), asm(2, 'BUH9')]
    const curr = [asm(11, '3BUH1B-18'), asm(12, 'C9')]
    expect(splitDisappeared(prev, curr, none).disappeared.map(r => r.mark)).toEqual(['BUH1B-18', 'BUH9'])
    const r = splitDisappeared(prev, curr, { from: new Set(['BUH1B-18']), to: new Set(['3BUH1B-18']) })
    expect([r.disappeared.map(x => x.mark), r.fresh.map(x => x.mark)]).toEqual([['BUH9'], ['C9']])
  })
})

describe('suggestAssemblies', () => {
  it('top 3 with score >= 30, best first; a prefix-added twin scores 100', () => {
    const fresh = [asm(11, '3BUH1B-18'), asm(12, 'ZZ', { length_mm: 999, weight_kg: 1, parts: [part('q', 'PL1x1', 1, 1)] }), asm(13, 'BUH1B-18X', { weight_kg: 1 })]
    const s = suggestAssemblies(asm(1, 'BUH1B-18'), fresh)
    expect(s.map(x => [x.mark, x.score])).toEqual([['3BUH1B-18', 100], ['BUH1B-18X', 85]])
  })

  it('caps at 3', () => {
    const fresh = [1, 2, 3, 4].map(i => asm(10 + i, `N${i}`))
    expect(suggestAssemblies(asm(1, 'A'), fresh)).toHaveLength(3)
  })
})

describe('partPairScore / suggestParts', () => {
  it('same profile + L + grade + kg + one name inside the other = 100', () => {
    expect(partPairScore(prt(1, 'C-f1'), prt(2, '3C-f1'))).toBe(100)
  })
  it('weights: profile 35, L 25, grade 10, kg 20, name 10', () => {
    expect(partPairScore(prt(1, 'C-f1'), prt(2, 'Q', { grade: 'SS400', weight_kg: 1 }))).toBe(60)
    expect(partPairScore(prt(1, 'C-f1'), prt(2, '3C-f1', { profile: 'X', length_mm: 1, grade: 'Y', weight_kg: 1 }))).toBe(10)
  })
  it('suggests only >= 30, best first', () => {
    const s = suggestParts(prt(1, 'C-f1'), [prt(2, 'Q', { profile: 'X', length_mm: 1, grade: 'Y', weight_kg: 1 }), prt(3, '3C-f1')])
    expect(s).toEqual([{ mark: '3C-f1', ref_id: 3, score: 100 }])
  })
})
