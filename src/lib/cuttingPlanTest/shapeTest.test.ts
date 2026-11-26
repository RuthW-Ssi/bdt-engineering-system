import type { ShapeTestPartList } from '../../api/cutting-plan-test'
import { barGroups, barPieces, splitByMarkSet, defaultKerf, defaultStock, familyOf, maxStockLengths, stockProblem, nestTurn, section, sectionExtent, usesEndCuts, groupByFamily, FAMILY_LABEL, piecesLaidOut, materialBalance, kgPerMetre, splitSleeves, totals, yieldLossGrade } from './shapeTest'

describe('yieldLossGrade (3% = great, over 5% = bad)', () => {
  it.each([[0, 'great'], [3, 'great'], [3.01, 'ok'], [5, 'ok'], [5.01, 'bad'], [7, 'bad']] as const)('%s%% → %s', (loss, grade) => {
    expect(yieldLossGrade(loss)).toBe(grade)
  })
})

describe('defaultStock (Tao 2026-11-16: only lengths the factory has confirmed)', () => {
  it('starts SS400 at 6,000 mm, whatever the shape, without a limit', () => {
    for (const profile of ['C200X80X7.5X11', 'H200X100X5.5X8', 'L50X50X5', 'RHS100X50X2.3', 'SHS50X50X3.2', 'PIPE48.6X2.3', 'PIPE 101.6X2.6'])
      expect(defaultStock(profile, 'SS400')).toEqual([{ lengthMm: 6000, qty: null }])
    expect(defaultStock('L50X50X5', ' ss400 ')).toEqual([{ lengthMm: 6000, qty: null }])
  })
  it('starts deformed and round bars at 10,000 mm, whatever the grade', () => {
    for (const [profile, grade] of [['ROD RB25', 'SS400'], ['RB12', 'SR24'], ['DB16', 'SD40'], ['ROD DB 20', null], ['db25', 'SS400']] as const)
      expect(defaultStock(profile, grade)).toEqual([{ lengthMm: 10000, qty: null }])
  })
  it('leaves every other size empty for the user to fill in', () => {
    expect(defaultStock('PIPE 101.6X2.6', 'HSS550')).toEqual([])
    expect(defaultStock('PIPE 76.3X3.2', null)).toEqual([])
    expect(defaultStock('SHS150X150X4.5')).toEqual([])
  })
})

describe('stockProblem', () => {
  it('asks for a length when there is none', () => expect(stockProblem([])).toBe('Enter a stock length'))
  it('refuses a length under 100 or over 12,500 mm', () => {
    expect(stockProblem([{ lengthMm: 12500, qty: null }])).toBeNull()
    expect(stockProblem([{ lengthMm: 6000, qty: null }, { lengthMm: 12501, qty: null }])).toBe('Stock lengths are 100 to 12,500 mm')
    expect(stockProblem([{ lengthMm: 99, qty: null }])).toBe('Stock lengths are 100 to 12,500 mm')
    expect(stockProblem([{ lengthMm: NaN, qty: null }])).toBe('Stock lengths are 100 to 12,500 mm')
  })
  // 2026-11-26 user test report §5: HSS550 / HSS500 up to 12,500 mm and no more than 3 lengths per size
  it('HSS550 and HSS500 take at most 3 stock lengths, other grades 6', () => {
    expect(maxStockLengths('HSS550')).toBe(3)
    expect(maxStockLengths(' hss500 ')).toBe(3)
    expect(maxStockLengths('SS400')).toBe(6)
    expect(maxStockLengths(null)).toBe(6)
    const four = [6000, 8000, 9500, 12000].map(lengthMm => ({ lengthMm, qty: null }))
    expect(stockProblem(four, undefined, 3)).toBe('At most 3 stock lengths for this grade')
    expect(stockProblem(four.slice(0, 3), undefined, 3)).toBeNull()
  })
  // 2026-11-26: BOX 200X200X4.5 got 6,000 (SS400) for an 8,521 mm piece and only failed after Run
  it('a piece longer than every stock length is said before the run', () => {
    expect(stockProblem([{ lengthMm: 6000, qty: null }], 8521)).toBe('Longest piece 8,521 mm: add a longer stock length')
    expect(stockProblem([{ lengthMm: 6000, qty: null }, { lengthMm: 9000, qty: null }], 8521)).toBeNull()
    expect(stockProblem([{ lengthMm: 6000, qty: null }], 6000)).toBeNull()
    expect(stockProblem([{ lengthMm: 6000, qty: null }])).toBeNull() // no length given: not checked
  })
})

describe('family and kerf', () => {
  it('kerf 12 mm for pipe, 10 mm for rod, as in the CutLogic runs', () => {
    expect(familyOf('PIPE 101.6X2.6')).toBe('PIPE')
    expect(familyOf('ROD RB25')).toBe('ROD')
    expect(defaultKerf('PIPE 101.6X2.6')).toBe(12)
    expect(defaultKerf('ROD RB25')).toBe(10)
  })

  it('L and BOX are their own families, kerf 12 mm and SS400 = 6,000 mm until the factory says otherwise', () => {
    expect(familyOf('L 50X50X5')).toBe('L')
    expect(familyOf('BOX 150X150X4.5')).toBe('BOX')
    expect(defaultKerf('L 50X50X5')).toBe(12)
    expect(defaultKerf('BOX 100X50X2.3')).toBe(12)
    expect(defaultStock('L 50X50X5', 'SS400')).toEqual([{ lengthMm: 6000, qty: null }])
    expect(defaultStock('BOX 100X50X2.3', 'HY370')).toEqual([])
  })

  it('only pipes use the model end cuts and saddle nesting', () => {
    expect(usesEndCuts('PIPE 101.6X2.6')).toBe(true)
    expect(usesEndCuts('ROD RB25')).toBe(false)
    expect(usesEndCuts('L 50X50X5')).toBe(false)
    expect(usesEndCuts('BOX 150X150X4.5')).toBe(false)
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

// 2026-11-26 user test report: "410 items in, 400 out" was the Cuts total — a piece that fills the bar needs no cut
describe('piecesLaidOut', () => {
  it('counts every piece on every repeat of every layout, not the cuts', () => {
    const r = { layouts: [
      { stockLengthMm: 6000, repeat: 3, restMm: 0, cuts: 0, pieces: [{ lengthMm: 6000, count: 1 }], marks: [] },
      { stockLengthMm: 6000, repeat: 2, restMm: 50, cuts: 2, pieces: [{ lengthMm: 2000, count: 2 }, { lengthMm: 1900, count: 0 }], marks: [] },
    ] }
    expect(piecesLaidOut(r as never)).toBe(7)
  })
})

// 2026-11-26 user report §3 (Tao: "ตามนั้นเลย"): loss = kerf + offcuts shorter than the minimum remnant; an offcut at
// least that long is a remnant, kept. Stock = parts + remnant + loss, always.
describe('materialBalance', () => {
  // 3 bars of 6,000: two cut 2 × 2,963 (+ 2 kerf of 12, rest 50), one cut 2 × 2,440 (+ 24 kerf, rest 1,096)
  const r = { stockLengthMm: 18000, partsLengthMm: 16732, nestedMm: 0, layouts: [
    { stockLengthMm: 6000, repeat: 2, restMm: 50, cuts: 2, pieces: [{ lengthMm: 2963, count: 2 }], marks: [] },
    { stockLengthMm: 6000, repeat: 1, restMm: 1096, cuts: 2, pieces: [{ lengthMm: 2440, count: 2 }], marks: [] },
  ] }
  it('no minimum remnant: every offcut is loss, kerf is what is left over', () => {
    const b = materialBalance(r as never, null)
    expect([b.stockMm, b.partsMm, b.offcutMm, b.remnantMm, b.kerfMm]).toEqual([18000, 16732, 1196, 0, 72])
    expect(b.lossMm).toBe(1268)
    expect(b.lossPct).toBeCloseTo((1268 / 18000) * 100)
  })
  it('with a minimum: offcuts at least that long are remnants, listed by length', () => {
    const b = materialBalance(r as never, 1000)
    expect(b.remnantMm).toBe(1096)
    expect(b.remnants).toEqual([{ lengthMm: 1096, pcs: 1 }])
    expect(b.offcutMm).toBe(100)
    expect(b.lossMm).toBe(172)
    expect(b.partsMm + b.remnantMm + b.lossMm).toBe(b.stockMm)
  })
  it('nested saddles take less steel than their BOM lengths: parts count what they take', () => {
    const b = materialBalance({ ...r, nestedMm: 200 } as never, null)
    expect(b.partsMm).toBe(16532)
    expect(b.partsMm + b.remnantMm + b.lossMm).toBe(18000)
  })
})

describe('kgPerMetre', () => {
  it("the size's own weight first, else its section (area × 7.85 g/cm³)", () => {
    expect(kgPerMetre({ profile: 'L 50X50X5', kgPerM: 3.77 })).toBe(3.77)
    expect(kgPerMetre({ profile: 'PIPE 101.6X2.4', kgPerM: null })).toBeCloseTo(5.87, 1)
    expect(kgPerMetre({ profile: 'ROD RB25' })).toBeCloseTo(3.853, 2)
    expect(kgPerMetre({ profile: 'BOX 100X50X2.3' })).toBeCloseTo(5.25, 1)
    expect(kgPerMetre({ profile: 'L 50X50X5' })).toBeCloseTo(3.73, 1)
    expect(kgPerMetre({ profile: 'H 200X100X5.5X8' })).toBeCloseTo(20.9, 0)
  })
})

// 2026-11-26: the models (0X220, 0X222) draw a sleeve pipe as an inner sleeve, its outside = the pipe's inside
// (139.8X5 SL is 129.8 across). So by default a sleeve is its own size; "with their pipe" is the user's call.
describe('splitSleeves', () => {
  const list: ShapeTestPartList = { pieces: 30, warnings: ['PIPE 139.8X5: sleeve pipes (SL) laid out with it: 1 mark (12 pcs)', 'other'], sizes: [
    { profile: 'PIPE 139.8X5', grade: 'HSS550', kgPerM: 16.6, parts: [{ mark: 'TC-m1', lengthMm: 8000, count: 6 }, { mark: 'TC-m7', lengthMm: 400, count: 12, sleeve: true }] },
    { profile: 'L 50X50X5', grade: 'SS400', parts: [{ mark: 'K1', lengthMm: 900, count: 12 }] },
  ] }
  it('takes the sleeve parts out into their own "… SL" size, right after their pipe', () => {
    const r = splitSleeves(list)
    expect(r.sizes.map(s => [s.profile, s.grade, s.parts.map(p => p.mark)])).toEqual([
      ['PIPE 139.8X5', 'HSS550', ['TC-m1']], ['PIPE 139.8X5 SL', 'HSS550', ['TC-m7']], ['L 50X50X5', 'SS400', ['K1']],
    ])
    expect(r.sizes[1].parts[0].sleeve).toBe(true)
    expect(r.sizes[1].kgPerM).toBeNull() // not the pipe's weight: worked out from the sleeve's own section
    expect(r.pieces).toBe(30)
    expect(r.warnings).toEqual(['PIPE 139.8X5: sleeve pipes (SL) laid out as their own size: 1 mark (12 pcs)', 'other'])
  })
  it('a size that is only sleeves becomes the SL size; a list with no sleeves comes back as it is', () => {
    const only: ShapeTestPartList = { pieces: 12, warnings: [], sizes: [{ profile: 'PIPE 139.8X5', grade: null, parts: [{ mark: 'TC-m7', lengthMm: 400, count: 12, sleeve: true }] }] }
    expect(splitSleeves(only).sizes.map(s => s.profile)).toEqual(['PIPE 139.8X5 SL'])
    const none: ShapeTestPartList = { pieces: 12, warnings: [], sizes: [list.sizes[1]] }
    expect(splitSleeves(none)).toBe(none)
  })
  it('a sleeve size is the tube that fits inside its pipe, cut square', () => {
    expect(section('PIPE 139.8X5 SL')).toEqual({ kind: 'round', outerMm: 129.8, wallMm: 5 })
    expect(section('PIPE 216.3X4.5 SL')).toEqual({ kind: 'round', outerMm: 207.3, wallMm: 4.5 })
    expect(kgPerMetre({ profile: 'PIPE 139.8X5 SL', kgPerM: null })).toBeCloseTo(15.4, 1)
    expect(usesEndCuts('PIPE 139.8X5 SL')).toBe(false)
    expect(familyOf('PIPE 139.8X5 SL')).toBe('PIPE')
  })
})

describe('groupByFamily', () => {
  it('pipe, rod, box, angle, in that order, sizes kept in their order inside a group; empty groups left out', () => {
    const sizes = [{ profile: 'BOX 100X50X2.3' }, { profile: 'L 50X50X5' }, { profile: 'PIPE 60.5X2.4' }, { profile: 'BOX 150X150X4.5' }, { profile: 'PIPE 101.6X2.6' }]
    expect(groupByFamily(sizes).map(g => [g.family, g.sizes.map(s => s.profile)])).toEqual([
      ['PIPE', ['PIPE 60.5X2.4', 'PIPE 101.6X2.6']],
      ['BOX', ['BOX 100X50X2.3', 'BOX 150X150X4.5']],
      ['L', ['L 50X50X5']],
    ])
    expect(FAMILY_LABEL.L).toBe('Angle (L)')
  })

  it('channels and H-beams come after the angles', () => {
    const sizes = [{ profile: 'H 200X100X5.5X8' }, { profile: 'C 150X75X6.5X10' }, { profile: 'L 40X40X3' }, { profile: 'PIPE 25X2.3' }]
    expect(groupByFamily(sizes).map(g => g.family)).toEqual(['PIPE', 'L', 'C', 'H'])
    expect(FAMILY_LABEL.C).toBe('Channel (C)')
    expect(FAMILY_LABEL.H).toBe('H-beam')
    expect(defaultKerf('H 200X100X5.5X8')).toBe(12)
    expect(usesEndCuts('C 150X75X6.5X10')).toBe(false)
  })
})

describe('section', () => {
  it('outer diameter and wall of a pipe; a rod is solid', () => {
    expect(section('PIPE 60.5X2.4')).toEqual({ kind: 'round', outerMm: 60.5, wallMm: 2.4 })
    expect(section('PIPE 165.2x4.5')).toEqual({ kind: 'round', outerMm: 165.2, wallMm: 4.5 })
    expect(section('ROD RB25')).toEqual({ kind: 'round', outerMm: 25, wallMm: null })
  })

  it('a box is height × width × wall; a square box gives one side twice', () => {
    expect(section('BOX 100X50X2.3')).toEqual({ kind: 'box', heightMm: 100, widthMm: 50, wallMm: 2.3 })
    expect(section('BOX 150X150X4.5')).toEqual({ kind: 'box', heightMm: 150, widthMm: 150, wallMm: 4.5 })
    expect(section('BOX 100X3.2')).toEqual({ kind: 'box', heightMm: 100, widthMm: 100, wallMm: 3.2 })
  })

  it('an angle is leg × leg × thickness; an equal angle may give one leg', () => {
    expect(section('L 50X50X5')).toEqual({ kind: 'angle', legAMm: 50, legBMm: 50, thickMm: 5 })
    expect(section('L 100X75X7')).toEqual({ kind: 'angle', legAMm: 100, legBMm: 75, thickMm: 7 })
    expect(section('L 65X6')).toEqual({ kind: 'angle', legAMm: 65, legBMm: 65, thickMm: 6 })
  })

  it('a wall too thick for the section is held to a solid-looking but valid one', () => {
    const b = section('BOX 20X20X15')
    expect(b.kind === 'box' && b.wallMm < 10).toBe(true)
    const a = section('L 20X20X30')
    expect(a.kind === 'angle' && a.thickMm < 20).toBe(true)
  })

  it('an H-beam and a channel are H × B × web × flange; fewer numbers fall back to one thickness', () => {
    expect(section('H 200X100X5.5X8')).toEqual({ kind: 'h', heightMm: 200, widthMm: 100, webMm: 5.5, flangeMm: 8 })
    expect(section('C 150X75X6.5X10')).toEqual({ kind: 'channel', heightMm: 150, widthMm: 75, webMm: 6.5, flangeMm: 10 })
    expect(section('C 100X50X5')).toEqual({ kind: 'channel', heightMm: 100, widthMm: 50, webMm: 5, flangeMm: 5 })
    const thin = section('H 300X150')
    expect(thin.kind === 'h' && thin.webMm > 0 && thin.flangeMm > 0 && thin.flangeMm < 75).toBe(true)
  })

  it('the largest side frames the camera', () => {
    expect(sectionExtent(section('H 200X100X5.5X8'))).toBe(200)
    expect(sectionExtent(section('PIPE 60.5X2.4'))).toBe(60.5)
    expect(sectionExtent(section('BOX 100X50X2.3'))).toBe(100)
    expect(sectionExtent(section('L 100X75X7'))).toBe(100)
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
