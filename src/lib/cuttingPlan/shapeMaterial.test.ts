import { shapeKgPerM, shapeSizeBalance } from './shapeMaterial'

// User test report 2026-11-26 (Shape tab, production): weight per profile, loss (kerf) apart from scrap (Rest)
describe('shapeKgPerM', () => {
  it('section area × 7.85 g/cm³ for the shapes CutLogic plans come in', () => {
    expect(shapeKgPerM('PIPE 101.6X2.6')).toBeCloseTo(6.35, 1)
    expect(shapeKgPerM('PIPEØ139.8X3.2')).toBeCloseTo(10.78, 1)
    expect(shapeKgPerM('ROD RB25')).toBeCloseTo(3.85, 2)
    expect(shapeKgPerM('L 50X50X5')).toBeCloseTo(3.73, 1)
    expect(shapeKgPerM('RHS100X50X2.3')).toBeCloseTo(5.25, 1)
    expect(shapeKgPerM('SHS150X150X4.5')).toBeCloseTo(20.6, 0)
    expect(shapeKgPerM('C 150X75X6.5X10')).toBeCloseTo(18.4, 1) // steel table 18.6 (root radii)
    expect(shapeKgPerM('H200X100X5.5X8')).toBeCloseTo(20.5, 0)
    expect(shapeKgPerM('mystery')).toBeNull()
  })
})

describe('shapeSizeBalance', () => {
  // 2 bars of 6,013: 2 × 2,963 per bar + 2 kerf of 12 → rest 63; 1 bar of 6,013: 4,880 + 24 → rest 1,109
  const size = { profile: 'PIPE 101.6X2.6', parts_length_mm: 16732, layouts: [
    { stock_length_mm: 6013, rest_mm: 63, repeat: 2 }, { stock_length_mm: 6013, rest_mm: 1109, repeat: 1 },
  ] }
  it('stock = parts + scrap (Rest, kept as remnants) + loss (kerf); in m and kg', () => {
    const b = shapeSizeBalance(size as never)
    expect(b.stockMm).toBe(18039)
    expect(b.scrapMm).toBe(1235)
    expect(b.lossMm).toBe(72)
    expect(b.partsMm + b.scrapMm + b.lossMm).toBe(b.stockMm)
    expect(b.stockKg).toBeCloseTo((18039 / 1000) * 6.35, 0)
    expect(b.remnantPcs).toBe(3)
  })
})
