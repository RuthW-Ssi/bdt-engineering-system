import * as fs from 'fs'
import * as path from 'path'
import { parsePartList } from './part-list'
import { assertResult, optimizeShape, ShapeOptimizeError, ShapeStock } from './shape-optimizer'

// Same part list and stock as the CutLogic run of 17 Jun 2026 (PS-*.pdf "Plan stocks", kerf 12).
// The optimizer must reach CutLogic's stock count and length on every size.
const sizes = parsePartList(fs.readFileSync(path.join(__dirname, '__fixtures__', 'part-list-0x222-np-zone3.xls'))).sizes
const STOCK: Record<string, ShapeStock[]> = {
  'PIPE 101.6X2.4': [{ lengthMm: 9500, qty: 32 }, { lengthMm: 6013, qty: null }],
  'PIPE 101.6X2.6': [{ lengthMm: 12500, qty: 12 }, { lengthMm: 6013, qty: null }],
  'PIPE 113.5X2.4': [{ lengthMm: 9500, qty: 64 }, { lengthMm: 6013, qty: null }],
  'PIPE 139.8X3.2': [{ lengthMm: 12500, qty: null }],
  'PIPE 165.2X4.5': [{ lengthMm: 12500, qty: null }],
  'PIPE 60.5X2.4': [{ lengthMm: 6013, qty: null }],
}
const CUTLOGIC: Record<string, [number, number]> = {
  'PIPE 101.6X2.4': [72, 544520], 'PIPE 101.6X2.6': [182, 1172210], 'PIPE 113.5X2.4': [220, 1546028],
  'PIPE 139.8X3.2': [12, 150000], 'PIPE 165.2X4.5': [12, 150000], 'PIPE 60.5X2.4': [68, 408884],
}
const KERF = 12

describe('optimizeShape vs CutLogic (0X222 NP zone 3)', () => {
  jest.setTimeout(120_000)
  const results = new Map<string, Awaited<ReturnType<typeof optimizeShape>>>()
  beforeAll(async () => {
    for (const s of sizes) results.set(s.profile, await optimizeShape(s.parts, STOCK[s.profile], KERF))
  })

  it.each(Object.keys(CUTLOGIC))('%s: as few stocks and as short as CutLogic', profile => {
    const r = results.get(profile)!
    expect(r.stocks).toBeLessThanOrEqual(CUTLOGIC[profile][0])
    expect(r.stockLengthMm).toBeLessThanOrEqual(CUTLOGIC[profile][1] + 0.01)
  })

  it('every part is cut exactly as many times as the list says, under its own mark', () => {
    for (const s of sizes) {
      const cut = new Map<string, number>()
      for (const l of results.get(s.profile)!.layouts) for (const m of l.marks) {
        const k = `${m.mark}|${m.lengthMm}`
        cut.set(k, (cut.get(k) ?? 0) + m.pcs)
      }
      expect(cut).toEqual(new Map(s.parts.map(p => [`${p.mark}|${p.lengthMm}`, p.count])))
    }
  })

  it('every layout fits its stock with the kerf; rest and totals add up', () => {
    for (const s of sizes) {
      const r = results.get(s.profile)!
      for (const l of r.layouts) {
        const used = l.pieces.reduce((n, p) => n + (p.lengthMm + KERF) * p.count, 0)
        expect(used).toBeLessThanOrEqual(l.stockLengthMm + KERF + 1e-6)
        expect(l.restMm).toBeCloseTo(Math.max(0, l.stockLengthMm - used), 6)
      }
      expect(r.stockLengthMm).toBeCloseTo(r.layouts.reduce((n, l) => n + l.stockLengthMm * l.repeat, 0), 6)
      expect(r.partsLengthMm + r.scrapMm + r.kerfMm).toBeCloseTo(r.stockLengthMm, 6)
      expect(r.yieldPct).toBeCloseTo((r.partsLengthMm / r.stockLengthMm) * 100, 6)
    }
  })

  // audit 2026-11-11: after the marks split a group, a ×1 layout came before a ×3 one
  it('layouts are listed longest stock first, then most repeated first', () => {
    for (const s of sizes) {
      const ls = results.get(s.profile)!.layouts
      for (let i = 1; i < ls.length; i++) {
        const a = ls[i - 1], b = ls[i]
        expect(a.stockLengthMm > b.stockLengthMm || (a.stockLengthMm === b.stockLengthMm && a.repeat >= b.repeat)).toBe(true)
      }
    }
  })

  // Tao 2026-11-11 (option ก): one layout per cutting pattern; the marks are listed inside it
  it('one layout per cutting pattern, its marks add up to the pieces it cuts', () => {
    for (const s of sizes) {
      const ls = results.get(s.profile)!.layouts
      const keys = ls.map(l => `${l.stockLengthMm}|${l.pieces.map(p => `${p.lengthMm}x${p.count}`).join(',')}`)
      expect(new Set(keys).size).toBe(keys.length)
      for (const l of ls) for (const p of l.pieces) {
        expect(l.marks.filter(m => m.lengthMm === p.lengthMm).reduce((n, m) => n + m.pcs, 0)).toBe(p.count * l.repeat)
      }
    }
    // 3 marks of 12,401 mm on 12,500: CutLogic shows 3 layouts, one pattern here
    expect(results.get('PIPE 139.8X3.2')!.layouts).toEqual([{
      stockLengthMm: 12500, repeat: 12, restMm: 87, cuts: 1, pieces: [{ lengthMm: 12401, count: 1 }],
      marks: [{ mark: 'DBN-A3-m4', lengthMm: 12401, pcs: 4 }, { mark: 'DBN-A3-m90', lengthMm: 12401, pcs: 4 }, { mark: 'DBN-A3-m112', lengthMm: 12401, pcs: 4 }],
    }])
  })

  it('limited stock is never used beyond its quantity', () => {
    const r = results.get('PIPE 101.6X2.6')!
    expect(r.stockMix.find(m => m.lengthMm === 12500)!.pieces).toBeLessThanOrEqual(12)
  })

  it('cuts: one per part, minus the last when the part ends at the stock end', () => {
    const r = results.get('PIPE 139.8X3.2')! // 12,401 on 12,500: rest 87 → 1 cut per stock
    expect(r.cuts).toBe(12)
  })
})

describe('optimizeShape work budget', () => {
  // live 2026-11-11: NP zones 1-5 took ~60 s per size; past the budget the dive stops and says so.
  // Audit 2026-11-12: the budget is work (LP solves), not wall-clock, so the same input always gives the same plan
  it('past the budget: still a full, valid answer, marked timedOut', async () => {
    const s = sizes.find(x => x.profile === 'PIPE 101.6X2.6')!
    const r = await optimizeShape(s.parts, STOCK['PIPE 101.6X2.6'], KERF, { maxSolves: 1 })
    expect(r.timedOut).toBe(true)
    const cut = new Map<number, number>()
    for (const l of r.layouts) for (const p of l.pieces) cut.set(p.lengthMm, (cut.get(p.lengthMm) ?? 0) + p.count * l.repeat)
    expect([...cut.values()].reduce((a, b) => a + b, 0)).toBe(405)
  })

  // live 2026-11-12 (Z08 101.6X2.6, nesting): the budget ran out mid-dive and the integer pick found nothing in its
  // node limit → "Could not finish the layouts". A dive cut short now rounds its last LP up, so a plan always comes back
  it('a dive cut short still finishes: its last LP rounded up covers what is left', async () => {
    const s = sizes.find(x => x.profile === 'PIPE 113.5X2.4')!
    const r = await optimizeShape(s.parts, STOCK['PIPE 113.5X2.4'].map(x => ({ ...x, qty: null })), KERF, { maxSolves: 3, mipNodes: 0 })
    expect(r.timedOut).toBe(true)
    expect(r.method).toBe('dive')
  })

  // Tao 2026-11-13 (Z08 nest ran past 300 s): a deadline stops every solve, the MIP too; a plan still comes back, fast
  it('a deadline already passed: valid layouts within seconds, marked cut short', async () => {
    const s = sizes.find(x => x.profile === 'PIPE 113.5X2.4')!
    const stock = STOCK['PIPE 113.5X2.4'].map(x => ({ ...x, qty: null }))
    const t = Date.now()
    const r = await optimizeShape(s.parts, stock, KERF, { deadline: Date.now() })
    expect(Date.now() - t).toBeLessThan(5_000)
    expect(r.timedOut).toBe(true)
    expect(() => assertResult(s.parts, stock, KERF, r)).not.toThrow()
  })

  it('within the budget: not timedOut', async () => {
    const s = sizes.find(x => x.profile === 'PIPE 139.8X3.2')!
    expect((await optimizeShape(s.parts, STOCK['PIPE 139.8X3.2'], KERF)).timedOut).toBe(false)
  })

  it('the same input gives the same plan every time, budget or not', async () => {
    jest.setTimeout(120_000)
    const s = sizes.find(x => x.profile === 'PIPE 113.5X2.4')!
    const sig = (r: Awaited<ReturnType<typeof optimizeShape>>) => r.layouts.map(l => `${l.stockLengthMm}x${l.repeat}:${l.pieces.map(p => `${p.lengthMm}*${p.count}`).join(',')}`).join(';')
    const [a, b] = await Promise.all([optimizeShape(s.parts, STOCK['PIPE 113.5X2.4'], KERF, { maxSolves: 40 }), optimizeShape(s.parts, STOCK['PIPE 113.5X2.4'], KERF, { maxSolves: 40 })])
    expect(sig(a)).toBe(sig(b))
    expect(a.stocks).toBe(b.stocks)
  })
})

// Audit 2026-11-12: limits equal to a plan the optimizer itself produced were refused as "Not enough stock" — the
// first LP (single-length patterns only) or a residual LP inside the dive was infeasible and the whole run threw
describe('optimizeShape with limits that are exactly enough', () => {
  jest.setTimeout(120_000)
  it('one bar holds 3,000 + 2,000; a limit of one bar is enough', async () => {
    const r = await optimizeShape([{ mark: 'A', lengthMm: 3000, count: 1 }, { mark: 'B', lengthMm: 2000, count: 1 }], [{ lengthMm: 6013, qty: 1 }], KERF)
    expect(r.stocks).toBe(1)
  })
  it.each(['PIPE 60.5X2.4', 'PIPE 101.6X2.4'])('%s: limits set to the unlimited plan\'s own stock mix give a plan, not a shortage', async profile => {
    const s = sizes.find(x => x.profile === profile)!
    const free = await optimizeShape(s.parts, STOCK[profile].map(x => ({ ...x, qty: null })), KERF)
    const limited = await optimizeShape(s.parts, free.stockMix.map(m => ({ lengthMm: m.lengthMm, qty: m.pieces })), KERF)
    expect(limited.stocks).toBeLessThanOrEqual(free.stocks)
    for (const m of limited.stockMix) expect(m.pieces).toBeLessThanOrEqual(free.stockMix.find(x => x.lengthMm === m.lengthMm)!.pieces)
  })
})

// Audit 2026-11-12: with nesting on, every pattern lost the largest credit, even one with no saddle piece in it
describe('optimizeShape nesting credit only charges patterns that nest', () => {
  const credit = new Map([[1000, 60]])
  it('a plain part that fits tip-to-tip still fits when other lengths can nest', async () => {
    const r = await optimizeShape([{ mark: 'S', lengthMm: 1000, count: 3 }, { mark: 'P', lengthMm: 5990, count: 1 }], [{ lengthMm: 6013, qty: null }], KERF, { creditMm: credit })
    const plain = r.layouts.find(l => l.marks.some(m => m.mark === 'P'))!
    expect(plain.pieces).toEqual([{ lengthMm: 5990, count: 1 }])
  })
  it('plain parts that fill a bar to the last kerf still pair up: 4 × 2,995 + 1,000 take 3 bars, not 4', async () => {
    const r = await optimizeShape([{ mark: 'S', lengthMm: 1000, count: 1 }, { mark: 'P', lengthMm: 2995, count: 4 }], [{ lengthMm: 6013, qty: null }], KERF, { creditMm: credit })
    expect(r.stocks).toBe(3) // the old cap (stock + kerf − 60) kept two 2,995s apart: 4 bars
  })
})

// Audit 2026-11-12: a stub shorter than a kerf after the last piece still has to be cut off
describe('optimizeShape cuts at the end of the bar', () => {
  it('a 1 mm stub after the last piece: one cut per piece', async () => {
    const r = await optimizeShape([{ mark: 'A', lengthMm: 3000, count: 2 }], [{ lengthMm: 6013, qty: null }], KERF)
    expect(r.layouts[0]).toMatchObject({ restMm: 0, cuts: 2 })
  })
  it('the last piece ends exactly at the bar end: no last cut', async () => {
    const r = await optimizeShape([{ mark: 'A', lengthMm: 3000.5, count: 2 }], [{ lengthMm: 6013, qty: null }], KERF)
    expect(r.layouts[0]).toMatchObject({ restMm: 0, cuts: 1 })
  })
})

// Audit 2026-11-12: with nesting the BOM lengths overlap on the bar, so parts ÷ stock went past 100 % and the kerf
// total negative; yield and kerf count the footprint (BOM length less what tucked in), and the nested length is told
describe('optimizeShape totals with nesting', () => {
  it('yield and kerf use the footprint; nestedMm says what tucked in', async () => {
    const r = await optimizeShape([{ mark: 'S1', lengthMm: 1000, count: 3 }], [{ lengthMm: 2900, qty: null }], KERF, { creditMm: new Map([[1000, 100]]) })
    expect(r).toMatchObject({ stocks: 1, partsLengthMm: 3000, nestedMm: 200, scrapMm: 64, kerfMm: 36 })
    expect(r.yieldPct).toBeCloseTo((2800 / 2900) * 100, 6)
  })
  it('without nesting nestedMm is 0 and nothing else changes', async () => {
    const r = await optimizeShape([{ mark: 'A', lengthMm: 3000, count: 2 }], [{ lengthMm: 6013, qty: null }], KERF)
    expect(r.nestedMm).toBe(0)
    expect(r.yieldPct).toBeCloseTo((6000 / 6013) * 100, 6)
  })
})

// Audit 2026-11-12: a result is checked before it goes out — demand, limits, stock length — so a solver slip can
// never reach the shop as a plan
describe('assertResult', () => {
  const parts = [{ mark: 'A', lengthMm: 3000, count: 2 }]
  const stock = [{ lengthMm: 6013, qty: null }]
  it('passes a sound result', async () => {
    expect(() => assertResult(parts, stock, KERF, { layouts: [{ stockLengthMm: 6013, repeat: 1, restMm: 0, cuts: 2, pieces: [{ lengthMm: 3000, count: 2 }], marks: [{ mark: 'A', lengthMm: 3000, pcs: 2 }] }] })).not.toThrow()
  })
  it('a layout past the stock, a mark short, or a limit broken is refused', () => {
    expect(() => assertResult(parts, stock, KERF, { layouts: [{ stockLengthMm: 6013, repeat: 1, restMm: 0, cuts: 2, pieces: [{ lengthMm: 3000, count: 3 }], marks: [{ mark: 'A', lengthMm: 3000, pcs: 2 }] }] })).toThrow(/past the stock/)
    expect(() => assertResult(parts, stock, KERF, { layouts: [{ stockLengthMm: 6013, repeat: 1, restMm: 0, cuts: 2, pieces: [{ lengthMm: 3000, count: 1 }], marks: [{ mark: 'A', lengthMm: 3000, pcs: 1 }] }] })).toThrow(/A 3,000 mm: 2 pcs needed, 1 laid out/)
    expect(() => assertResult(parts, [{ lengthMm: 6013, qty: 0 }], KERF, { layouts: [{ stockLengthMm: 6013, repeat: 1, restMm: 0, cuts: 2, pieces: [{ lengthMm: 3000, count: 2 }], marks: [{ mark: 'A', lengthMm: 3000, pcs: 2 }] }] })).toThrow(/6,013 mm: 1 used, limit 0/)
  })
})

describe('optimizeShape refusals', () => {
  it('a part longer than every stock', async () => {
    await expect(optimizeShape([{ mark: 'X1', lengthMm: 13000, count: 1 }], [{ lengthMm: 12500, qty: null }], KERF))
      .rejects.toThrow(new ShapeOptimizeError('X1 (13,000 mm) is longer than every stock length'))
  })

  it('not enough limited stock, nothing unlimited', async () => {
    await expect(optimizeShape([{ mark: 'X1', lengthMm: 5000, count: 5 }], [{ lengthMm: 6000, qty: 2 }], KERF))
      .rejects.toThrow(new ShapeOptimizeError('Not enough stock: 5 pcs only fit the limited lengths (6,000 mm × 2), which cannot hold them all. Clear a limit or add a length without a limit.'))
  })

  // live 2026-11-11: NP zones 1-5 with the zone-3 limits (9,500 × 32) — say which parts and which limit
  it('long parts that only fit a limited length', async () => {
    await expect(optimizeShape([{ mark: 'L1', lengthMm: 8000, count: 3 }, { mark: 'S1', lengthMm: 1000, count: 10 }],
      [{ lengthMm: 9500, qty: 1 }, { lengthMm: 6013, qty: null }], KERF))
      .rejects.toThrow(new ShapeOptimizeError('Not enough stock: 3 pcs are longer than 6,013 mm and only fit the limited lengths (9,500 mm × 1), which cannot hold them all. Clear a limit or add a longer length without a limit.'))
  })
})
