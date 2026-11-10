import { describe, expect, it } from 'vitest'
import { barSegments, shapeSummary, stockMix } from './shapeSummary'

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
    expect(shapeSummary(sizes as never)).toEqual({ stocks: 15, stockLengthM: 120, parts: 25, yieldPct: (105000 / 120000) * 100 })
  })
})
