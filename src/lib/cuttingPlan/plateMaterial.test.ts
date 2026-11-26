import { kerfFor, priceFor, plateLossKg } from './plateMaterial'
import { summarizePlan } from './planSummary'

// User test report 2026-11-26 (Plate): loss apart from scrap, value from Materials prices
const plate = (o: Record<string, unknown>) => ({ cuttingplan_number: 'P', count: 1, weight_kg: 1000, nesting_percent: 80, thick_mm: 10, technology: 'Plasma [PlainCuttingUnit]', cut_length_mm: 100000, quality: 'HY370', ...o }) as never
const kerfs = [{ technology: 'Plasma [PlainCuttingUnit]', thick_mm: '10.00', kerf_mm: '3.00' }] as never
const prices = [{ grade: 'HY370', thick_mm: 10, thb_per_kg: 23.54, material: 'BDTP000105' }]

describe('kerfFor / priceFor', () => {
  it('kerf by the plate technology and thickness; none set → null', () => {
    expect(kerfFor(kerfs, plate({}))).toBe(3)
    expect(kerfFor(kerfs, plate({ thick_mm: 12 }))).toBeNull()
    expect(kerfFor(kerfs, plate({ technology: 'Gas [PlainCuttingUnit]' }))).toBeNull()
  })
  it('price by grade and thickness, grade case and spaces ignored; none → null', () => {
    expect(priceFor(prices, ' hy370 ', 10)).toBe(23.54)
    expect(priceFor(prices, 'HY370', 6)).toBeNull()
    expect(priceFor(prices, null, 10)).toBeNull()
  })
})

describe('plateLossKg', () => {
  it('cut length × kerf × thickness × 7.85 g/cm³', () => {
    expect(plateLossKg(plate({}), 3)).toBeCloseTo(100000 * 3 * 10 * 7.85e-6) // 23.55 kg
  })
  it('no kerf or no cut length → null', () => {
    expect(plateLossKg(plate({}), null)).toBeNull()
    expect(plateLossKg(plate({ cut_length_mm: null }), 3)).toBeNull()
  })
})

describe('summarizePlan with kerf', () => {
  it('loss comes out of scrap; the parts of the whole still add up', () => {
    const s = summarizePlan([plate({})], [], r => kerfFor(kerfs, r))
    expect(s.lossKg).toBeCloseTo(23.55)
    expect(s.scrapKg).toBeCloseTo(200 - 23.55)
    expect(s.partsKg + s.scrapKg + (s.lossKg ?? 0) + s.remnantKg).toBeCloseTo(s.steelKg)
    expect(s.lossMissing).toBe(0)
  })
  it('plates with no kerf set are counted, their loss stays in scrap', () => {
    const s = summarizePlan([plate({}), plate({ cuttingplan_number: 'Q', thick_mm: 12 })], [], r => kerfFor(kerfs, r))
    expect(s.lossMissing).toBe(1)
    expect(s.scrapKg).toBeCloseTo(400 - 23.55)
  })
  it('without a kerf lookup it is as before (no loss)', () => {
    const s = summarizePlan([plate({})], [])
    expect(s.lossKg).toBeNull()
    expect(s.scrapKg).toBe(200)
  })
})
