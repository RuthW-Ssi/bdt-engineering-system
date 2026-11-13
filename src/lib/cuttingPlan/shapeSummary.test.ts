import { describe, expect, it } from 'vitest'
import { barSegments, labelFits, scrapMm, shapeCharts, shapeSummary, stockMix } from './shapeSummary'

const layout = (stock: number, repeat: number, parts: [number, number][] = [], rest = 0) => ({
  id: 1, seq: 1, stock_no: 1, stock_length_mm: String(stock), rest_mm: String(rest), repeat,
  parts: parts.map(([len, count], i) => ({ id: i, seq: i + 1, part_no: i + 1, mark: `M${i + 1}`, length_mm: String(len), count })),
})

describe('stockMix', () => {
  it('groups by stock length, sums repeats, longest first', () => {
    expect(stockMix([layout(12500, 12), layout(6013, 100), layout(6013, 70)])).toBe('12,500 × 12 + 6,013 × 170')
  })
})

describe('barSegments', () => {
  // Plan #668 layout 1: 6,013 stock, kerf 12, DBN-A3-m76 3,400.71 + DBN-A3-m72 2,598.78
  it('places parts in order with a kerf after each, then the rest, never past the stock', () => {
    const segs = barSegments(layout(6013, 10, [[3400.71, 1], [2598.78, 1]]), 12)
    const parts = segs.filter(s => s.kind === 'part')
    expect(parts.map(p => p.mark)).toEqual(['M1', 'M2'])
    expect(parts[1].toMm).toBeCloseTo(3400.71 + 12 + 2598.78, 2)
    expect(Math.max(...segs.map(s => s.toMm))).toBeLessThanOrEqual(6013)
    expect(segs[segs.length - 1].kind).not.toBe('kerf')
  })
  it('expands counts: 2,880.64 × 2', () => {
    expect(barSegments(layout(6013, 6, [[2880.64, 2]]), 12).filter(s => s.kind === 'part')).toHaveLength(2)
  })
})

describe('shapeSummary', () => {
  it('sums stock pieces and parts and gives yield = parts length / stock length used', () => {
    const sizes = [
      { stocks: 10, parts: 20, parts_length_mm: '50000', layouts: [layout(6000, 10)] },
      { stocks: 5, parts: 5, parts_length_mm: '55000', layouts: [layout(12000, 5)] },
    ]
    expect(shapeSummary(sizes as never)).toEqual({ stocks: 15, stockLengthM: 120, parts: 25, yieldPct: (105000 / 120000) * 100, scrapM: 0 })
  })
})

// 2026-11-11: scrap = CutLogic "Rest" only (kerf not counted), × the layout's repeat
describe('scrap', () => {
  // Plan #667 layouts 1-2: 12,500 ×4 rest 70; 6,013 ×12 rest 82.67
  const layouts = [layout(12500, 4, [], 70), layout(6013, 12, [], 82.67)]
  it('scrapMm = Σ rest × repeat, from the report, not recomputed', () => {
    expect(scrapMm(layouts)).toBeCloseTo(70 * 4 + 82.67 * 12, 2)
  })
  it('shapeSummary.scrapM sums every size, in metres', () => {
    const sizes = [{ stocks: 16, parts: 28, parts_length_mm: '0', layouts }, { stocks: 1, parts: 1, parts_length_mm: '0', layouts: [layout(6013, 1, [], 1000)] }]
    expect(shapeSummary(sizes as never).scrapM).toBeCloseTo((70 * 4 + 82.67 * 12 + 1000) / 1000, 5)
  })
})

describe('labelFits', () => {
  it('a span of 6% of the stock or more gets its number on the bar; narrower ones keep it in the tooltip', () => {
    expect(labelFits(0, 3000, 6013)).toBe(true)
    expect(labelFits(5930.33, 6013, 6013)).toBe(false) // 82.67 rest
    expect(labelFits(0, 360.78, 6013)).toBe(true)
    expect(labelFits(0, 360, 6013)).toBe(false)
  })
})

// 2026-11-11: charts like plate's. Plan #667 layouts 1-2 + #668 layout 1
describe('shapeCharts', () => {
  const size = (id: number, profile: string, grade: string, partsMm: number, layouts: ReturnType<typeof layout>[]) =>
    ({ id, profile, grade, parts_length_mm: String(partsMm), layouts })
  const sizes = [
    size(1, 'PIPE 101.6X2.6', 'HSS550', 12418 * 4 + (3000 + 2906.33) * 12, [layout(12500, 4, [[12418, 1]], 70), layout(6013, 12, [[3000, 1], [2906.33, 1]], 82.67)]),
    size(2, 'PIPE 113.5X2.4', 'HSS550', (3400.71 + 2598.78) * 10, [layout(6013, 10, [[3400.71, 1], [2598.78, 1]], 0)]),
  ]
  it('steel = parts + scrap (Rest) + kerf, every metre of stock accounted for', () => {
    const c = shapeCharts(sizes as never)
    expect(c.stockMm).toBe(12500 * 4 + 6013 * 22)
    expect(c.partsMm).toBeCloseTo(12418 * 4 + 5906.33 * 12 + 5999.49 * 10, 2)
    expect(c.scrapMm).toBeCloseTo(70 * 4 + 82.67 * 12, 2)
    expect(c.kerfMm).toBeCloseTo(c.stockMm - c.partsMm - c.scrapMm, 6)
    expect(c.kerfMm).toBeCloseTo(12 * (4 + 24) + 13.51 * 10, 1) // 12 per cut; #668's last cut gets the 13.51 left over
  })
  it('bySize: pieces and metres per size, split by stock length, longest stock first', () => {
    expect(shapeCharts(sizes as never).bySize).toEqual([
      { id: 1, profile: 'PIPE 101.6X2.6', grade: 'HSS550', pieces: 16, stockMm: 12500 * 4 + 6013 * 12, byStock: [{ lengthMm: 12500, pieces: 4 }, { lengthMm: 6013, pieces: 12 }] },
      { id: 2, profile: 'PIPE 113.5X2.4', grade: 'HSS550', pieces: 10, stockMm: 60130, byStock: [{ lengthMm: 6013, pieces: 10 }] },
    ])
  })
  it('stock: what to prepare, one row per size + grade + stock length, most pieces first', () => {
    expect(shapeCharts(sizes as never).stock.map(s => [s.profile, s.grade, s.lengthMm, s.pieces])).toEqual([
      ['PIPE 101.6X2.6', 'HSS550', 6013, 12], ['PIPE 113.5X2.4', 'HSS550', 6013, 10], ['PIPE 101.6X2.6', 'HSS550', 12500, 4],
    ])
  })
})
