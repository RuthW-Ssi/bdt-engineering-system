import { describe, expect, it } from 'vitest'
import { sheetKgByPlate, summarizePlan } from './planSummary'
import type { CuttingPlanNestingRow, CuttingPlanRemnantRow } from '../../api/cutting-plan'

const plate = (thick: number, kg: number, pct: number, count: number | null = 1, min = 0, w = 1480, l = 7800) =>
  ({ thick_mm: thick, weight_kg: kg, nesting_percent: pct, count, total_time_min: min, width_mm: w, length_mm: l }) as CuttingPlanNestingRow
const remnant = (w: number, l: number, kg: number, m2: number, plate = '') =>
  ({ width_mm: w, length_mm: l, weight_kg: kg, area_m2: m2, count: 1, cuttingplan_number: plate }) as CuttingPlanRemnantRow

describe('summarizePlan', () => {
  // Real report 224-F7-20-4: only a 1,922 × 1,460 piece of the 1,480 × 6,000 sheet is nested. The
  // report's plate weight (452 kg) is that piece; the rest of the sheet is remnant R4532 (942 kg).
  it('counts the whole sheet as plate weight + its remnants, and scrap as the nested piece minus parts', () => {
    const s = summarizePlan([{ ...plate(20, 452, 77.49), cuttingplan_number: 'F7-20-4' }], [remnant(1480, 4056, 942, 6, 'F7-20-4')])
    expect(s.steelKg).toBe(1394) // = 20 × 1,480 × 6,000 × 7.85e-6
    expect(s.partsKg).toBeCloseTo(350.25, 1) // report net 350.02
    expect(s.remnantKg).toBe(942)
    expect(s.scrapKg).toBeCloseTo(101.75, 1) // report gross − net = 101.66
    expect(s.byThickness[0].kg).toBe(1394)
  })

  it('groups plates by thickness, thinnest first, counting identical plates', () => {
    const s = summarizePlan([plate(16, 900, 90), plate(6, 300, 90, 2), plate(16, 900, 90), plate(6, 300, 90, null)], [])
    expect(s.plates).toBe(5)
    expect(s.byThickness).toEqual([{ thick: 6, plates: 3, kg: 600, minutes: 0 }, { thick: 16, plates: 2, kg: 1800, minutes: 0 }])
  })

  it('lists remnant sizes most common first', () => {
    const s = summarizePlan([], [remnant(203, 6500, 166, 1.3), remnant(203, 2200, 56, 0.4), remnant(203, 6500, 166, 1.3)])
    expect(s.remnantPieces).toBe(3)
    expect(s.remnantM2).toBeCloseTo(3)
    expect(s.remnantSizes[0]).toEqual({ thick: 0, width: 203, length: 6500, pieces: 2 })
  })

  it('survives missing values', () => {
    const s = summarizePlan([{ thick_mm: null, weight_kg: null, nesting_percent: null, count: 1 } as CuttingPlanNestingRow], [remnant(1, 1, 50, 0)])
    expect(s.scrapKg).toBe(0)
    expect(s.steelKg).toBe(50)
    expect(s.byThickness).toEqual([{ thick: 0, plates: 1, kg: 0, minutes: 0 }])
  })
  it('adds up machine minutes per thickness and for the plan', () => {
    const s = summarizePlan([plate(6, 300, 90, 1, 40), plate(6, 300, 90, 1, 20.5), plate(16, 900, 90, 1, 55)], [])
    expect(s.machineMin).toBe(115.5)
    expect(s.byThickness.map(g => g.minutes)).toEqual([60.5, 55])
  })

  it('lists stock plate sizes most used first, counting identical plates', () => {
    const s = summarizePlan([
      plate(16, 1, 90, 1, 0, 1480, 9530), plate(16, 1, 90, 2, 0, 1480, 7800), plate(12, 1, 90, 1, 0, 1480, 7800),
    ], [])
    expect(s.plateSizes).toEqual([
      { thick: 16, width: 1480, length: 7800, plates: 2 },
      { thick: 12, width: 1480, length: 7800, plates: 1 },
      { thick: 16, width: 1480, length: 9530, plates: 1 },
    ])
  })
  it('keeps same-size remnants of different thickness apart, taking the thickness from their plate', () => {
    const plates = [{ ...plate(6, 1, 90), cuttingplan_number: 'A' }, { ...plate(12, 1, 90), cuttingplan_number: 'B' }]
    const s = summarizePlan(plates, [remnant(150, 7800, 1, 1, 'A'), remnant(150, 7800, 1, 1, 'B'), remnant(150, 7800, 1, 1, 'B')])
    expect(s.remnantSizes).toEqual([
      { thick: 12, width: 150, length: 7800, pieces: 2 },
      { thick: 6, width: 150, length: 7800, pieces: 1 },
    ])
  })
})

describe('sheetKgByPlate', () => {
  it('adds each plate\'s remnants to its nested weight (224-F7-20-4: 452 + 942 = 1,394 kg)', () => {
    const m = sheetKgByPlate(
      [{ ...plate(20, 452, 77.49), cuttingplan_number: 'F7-20-4' }, { ...plate(20, 1394, 90), cuttingplan_number: 'F7-20-1' }],
      [remnant(1480, 4056, 942, 6, 'F7-20-4'), remnant(1, 1, 5, 0, 'unknown')],
    )
    expect(m.get('F7-20-4')).toBe(1394)
    expect(m.get('F7-20-1')).toBe(1394) // no remnant: the nested area is the whole sheet
    expect(m.has('unknown')).toBe(false)
  })
})
