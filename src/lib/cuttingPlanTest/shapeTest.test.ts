import { barGroups, barPieces, splitByMarkSet, defaultKerf, defaultStock, familyOf, nestTurn, pipeSection, totals, yieldLossGrade } from './shapeTest'

describe('yieldLossGrade (boss: 3% = great, over 7% = bad)', () => {
  it.each([[0, 'great'], [3, 'great'], [3.01, 'ok'], [7, 'ok'], [7.01, 'bad']] as const)('%s%% → %s', (loss, grade) => {
    expect(yieldLossGrade(loss)).toBe(grade)
  })
})

describe('defaultStock', () => {
  // Tao 2026-11-11: plan what to buy — lengths only, no limits; limits are an opt-in per size
  it('known sizes start from the 0X222 NP zone 3 plan-stock lengths, without limits', () => {
    expect(defaultStock('PIPE 101.6X2.6')).toEqual([{ lengthMm: 12500, qty: null }, { lengthMm: 6013, qty: null }])
    expect(defaultStock('PIPE 60.5X2.4')).toEqual([{ lengthMm: 6013, qty: null }])
  })
  it('other pipes start from 6,013 mm, rods from 10,000 mm (BIF all rod 25 run), unlimited', () => {
    expect(defaultStock('PIPE 76.3X3.2')).toEqual([{ lengthMm: 6013, qty: null }])
    expect(defaultStock('ROD RB25')).toEqual([{ lengthMm: 10000, qty: null }])
  })
})

describe('defaultStock with the longest part', () => {
  // live 2026-11-11: PIPE 216.3X8 parts of 12,443 mm on a 6,013 mm default → "longer than every stock length"
  it('adds 12,500 mm unlimited when the longest part does not fit the starting lengths', () => {
    expect(defaultStock('PIPE 216.3X8', 12443)).toEqual([{ lengthMm: 6013, qty: null }, { lengthMm: 12500, qty: null }])
    expect(defaultStock('PIPE 76.3X3.2', 3000)).toEqual([{ lengthMm: 6013, qty: null }])
  })
})

describe('family and kerf', () => {
  it('kerf 12 mm for pipe, 10 mm for rod, as in the CutLogic runs', () => {
    expect(familyOf('PIPE 101.6X2.6')).toBe('PIPE')
    expect(familyOf('ROD RB25')).toBe('ROD')
    expect(defaultKerf('PIPE 101.6X2.6')).toBe(12)
    expect(defaultKerf('ROD RB25')).toBe(10)
  })
})

describe('totals', () => {
  it('adds stock, parts and cuts and works out yield and loss', () => {
    const t = totals([
      { stocks: 2, stockLengthMm: 10000, partsLengthMm: 9500, scrapMm: 400, cuts: 5 },
      { stocks: 1, stockLengthMm: 10000, partsLengthMm: 9300, scrapMm: 600, cuts: 3 },
    ])
    expect(t).toEqual({ stocks: 3, stockLengthMm: 20000, partsLengthMm: 18800, nestedMm: 0, scrapMm: 1000, cuts: 8, yieldPct: 94, lossPct: 6 })
  })
  // audit 2026-11-12: with saddle nesting the BOM lengths overlap on the bar; yield counts what they take up
  it('nested length comes off the parts length for the yield', () => {
    const t = totals([{ stocks: 1, stockLengthMm: 10000, partsLengthMm: 10200, nestedMm: 400, scrapMm: 100, cuts: 5 }])
    expect(t).toMatchObject({ partsLengthMm: 10200, nestedMm: 400, yieldPct: 98, lossPct: 2 })
  })
})

// Tao 2026-11-12 (step 1 of the 3D view): which marks one stock bar is cut into, and where on the bar
describe('barGroups', () => {
  const layout = {
    stockLengthMm: 12500, repeat: 3, restMm: 0, cuts: 3,
    pieces: [{ lengthMm: 3519.32, count: 2 }, { lengthMm: 2000, count: 1 }],
    marks: [{ mark: 'B2-m20', lengthMm: 3519.32, pcs: 4 }, { mark: 'B3-m20', lengthMm: 3519.32, pcs: 2 }, { mark: 'B2-m19', lengthMm: 2000, pcs: 3 }],
  }
  it('hands each bar its marks in piece order, a mark used up before the next; identical bars grouped', () => {
    expect(barGroups(layout)).toEqual([
      { from: 1, to: 2, marks: ['B2-m20', 'B2-m20', 'B2-m19'] },
      { from: 3, to: 3, marks: ['B3-m20', 'B3-m20', 'B2-m19'] },
    ])
  })
  it('every piece of the layout gets exactly one mark', () => {
    const all = barGroups(layout).flatMap(g => Array.from({ length: g.to - g.from + 1 }, () => g.marks)).flat()
    expect(all.filter(m => m === 'B2-m20')).toHaveLength(4)
    expect(all.filter(m => m === 'B3-m20')).toHaveLength(2)
    expect(all.filter(m => m === 'B2-m19')).toHaveLength(3)
  })
})

// Tao 2026-11-12: one layout per set of marks (not per cut pattern), so a layout's bars are all the same pieces
describe('splitByMarkSet', () => {
  const layout = {
    stockLengthMm: 12500, repeat: 3, restMm: 0, cuts: 3,
    pieces: [{ lengthMm: 3519.32, count: 2 }, { lengthMm: 2000, count: 1 }],
    marks: [{ mark: 'B2-m20', lengthMm: 3519.32, pcs: 4 }, { mark: 'B3-m20', lengthMm: 3519.32, pcs: 2 }, { mark: 'B2-m19', lengthMm: 2000, pcs: 3 }],
  }
  const other = { stockLengthMm: 6013, repeat: 1, restMm: 1, cuts: 1, pieces: [{ lengthMm: 6000, count: 1 }], marks: [{ mark: 'X', lengthMm: 6000, pcs: 1 }] }
  it('a cut pattern cut for two sets of marks becomes two layouts, each with its own bars and marks', () => {
    expect(splitByMarkSet([layout, other])).toEqual([
      { pattern: 0, marks: ['B2-m20', 'B2-m20', 'B2-m19'], layout: { ...layout, repeat: 2, marks: [{ mark: 'B2-m20', lengthMm: 3519.32, pcs: 4 }, { mark: 'B2-m19', lengthMm: 2000, pcs: 2 }] } },
      { pattern: 0, marks: ['B3-m20', 'B3-m20', 'B2-m19'], layout: { ...layout, repeat: 1, marks: [{ mark: 'B3-m20', lengthMm: 3519.32, pcs: 2 }, { mark: 'B2-m19', lengthMm: 2000, pcs: 1 }] } },
      { pattern: 1, marks: ['X'], layout: other },
    ])
  })
  it('bars and pieces add up to the cut patterns\' ones', () => {
    const split = splitByMarkSet([layout])
    expect(split.reduce((n, s) => n + s.layout.repeat, 0)).toBe(3)
    expect(split.flatMap(s => s.layout.marks).reduce((n, m) => n + m.pcs, 0)).toBe(9)
  })
})

describe('barPieces', () => {
  it('positions along the bar with the kerf between pieces (as BdtPipeCut: 0 – 1,796, 1,808 – 3,604)', () => {
    const layout = { stockLengthMm: 6013, repeat: 5, restMm: 77, cuts: 4, pieces: [{ lengthMm: 1796.09, count: 3 }, { lengthMm: 500, count: 1 }], marks: [] }
    const ps = barPieces(layout, ['m41', 'm41', 'm41', 'm44'], 12)
    expect(ps.map(p => [p.n, p.mark, p.lengthMm])).toEqual([[1, 'm41', 1796.09], [2, 'm41', 1796.09], [3, 'm41', 1796.09], [4, 'm44', 500]])
    expect(ps[1].fromMm).toBeCloseTo(1808.09, 6)
    expect(ps[3].fromMm).toBeCloseTo(5424.27, 6)
    expect(ps[3].toMm).toBeCloseTo(5924.27, 6)
  })
})

describe('pipeSection', () => {
  it('outer diameter and wall of a pipe; a rod is solid', () => {
    expect(pipeSection('PIPE 60.5X2.4')).toEqual({ outerMm: 60.5, wallMm: 2.4 })
    expect(pipeSection('PIPE 165.2x4.5')).toEqual({ outerMm: 165.2, wallMm: 4.5 })
    expect(pipeSection('ROD RB25')).toEqual({ outerMm: 25, wallMm: null })
  })
})

// Tao 2026-11-12 POC: saddle nesting
describe('barPieces with nesting', () => {
  it('a nested piece starts earlier by its joint\'s nest', () => {
    const layout = { stockLengthMm: 2900, repeat: 1, restMm: 64, cuts: 3, pieces: [{ lengthMm: 1000, count: 3 }], marks: [], nestMm: [100, 100] }
    expect(barPieces(layout, ['S1', 'S1', 'S1'], 12).map(p => [p.fromMm, p.toMm])).toEqual([[0, 1000], [912, 1912], [1824, 2824]])
  })
})

describe('nestTurn', () => {
  it('two mitred ends nest when the next piece is turned half round', () => {
    const deg = Array.from({ length: 361 }, (_, i) => (i * Math.PI) / 180)
    const left = deg.map(t => 50 * (1 + Math.cos(t))), right = deg.map(t => 1000 - 50 * (1 + Math.cos(t)))
    const g = { LW: left, LN: left, RW: right, RN: right }
    expect(nestTurn(g, g, 12)).toBe(180)
  })
})
