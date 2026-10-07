import { parseNcDetail, parseNcFile } from './nc-parser'

// Synthetic DSTV NC1 files (same layout as Tekla's export — see wiki
// features/mo-part-round3-impl-plan §A). No customer files committed.
function nc(opts: { mark?: string; code?: string; profile?: string; qty?: number; length?: number; height?: number; t?: number; unit?: number; blocks?: string }) {
  const { mark = 'X-p1', code = 'B', profile = 'PL10', qty = 2, length = 300, height = 200, t = 10, unit = 78.5, blocks = '' } = opts
  return [
    'ST',
    `** ${mark}.nc1`,
    '  00X999-1', `  ${mark}`, '  2008', `  ${mark}`, '  HY370', `  ${qty}`, `  ${profile}`, `  ${code}`,
    `     ${length.toFixed(2)}`, `     ${height.toFixed(2)}`, `      ${t.toFixed(2)}`, `      ${t.toFixed(2)}`, `      ${t.toFixed(2)}`,
    '       0.00', `     ${unit.toFixed(3)}`, '      1.000', '      0.000', '      0.000', '      0.000', '      0.000',
    '', '',
    blocks,
    'EN',
  ].join('\n')
}

const RECT = [
  'AK',
  '  v       0.00u      0.00       0.00',
  '        300.00s      0.00       0.00',
  '        300.00     200.00       0.00',
  '          0.00     200.00       0.00',
  '          0.00       0.00       0.00',
].join('\n')
const HOLES = ['BO', '  v      60.02s     54.98      22.00', '  v     190.02s     55.11      22.00'].join('\n')
const INNER = ['IK', '  v     100.00     50.00       0.00', '        150.00     50.00       0.00', '        150.00    100.00       0.00', '        100.00    100.00       0.00', '        100.00     50.00       0.00'].join('\n')

describe('parseNcDetail — plates', () => {
  // Tekla's Part List weight is the gross plate (holes NOT deducted) — checked
  // on 671 real plates, median error 0.09% with this rule.
  it('computes gross area from the contour (holes not deducted), piece weight, cut length and hole groups', () => {
    const d = parseNcDetail('X-p1.nc1', nc({ blocks: `${RECT}\n${HOLES}` }))
    expect(d.partMark).toBe('X-p1')
    expect(d.orderNo).toBe('00X999-1')
    expect(d.code).toBe('B')
    expect(d.qty).toBe(2)
    expect(d.widthMm).toBe(200)
    expect(d.thicknessMm).toBe(10)
    expect(d.unitWeight).toBe(78.5)
    expect(d.areaM2).toBeCloseTo(0.06, 6)
    expect(d.pieceWeightKg).toBeCloseTo(0.06 * 78.5, 4)
    expect(d.cutLengthMm).toBeCloseTo(1000 + 2 * Math.PI * 22, 2)
    expect(d.holes).toEqual([{ diameter_mm: 22, count: 2 }])
  })

  it('subtracts inner contours (IK) from the area and adds their perimeter to the cut length', () => {
    const d = parseNcDetail('X-p1.nc1', nc({ blocks: `${RECT}\n${INNER}` }))
    expect(d.areaM2).toBeCloseTo(0.06 - 0.0025, 6)
    expect(d.cutLengthMm).toBeCloseTo(1000 + 200, 2)
    expect(d.holes).toEqual([])
  })

  it('follows arcs: a radius on a contour point bulges the segment that starts there (full circle r=100)', () => {
    const circle = ['AK', '  v       0.00u    100.00     100.00', '        200.00     100.00     100.00', '          0.00     100.00       0.00'].join('\n')
    const d = parseNcDetail('X-p2.nc1', nc({ length: 200, height: 200, blocks: circle }))
    expect(d.areaM2).toBeCloseTo(Math.PI * 0.01, 6)
    expect(d.cutLengthMm).toBeCloseTo(2 * Math.PI * 100, 2)
  })

  it('a negative radius cuts a notch: rectangle minus a half-disc', () => {
    const notch = ['AK', '  v       0.00u      0.00       0.00', '        300.00      0.00       0.00', '        300.00    200.00       0.00',
      '        200.00    200.00     -50.00', '        100.00    200.00       0.00', '          0.00    200.00       0.00', '          0.00      0.00       0.00'].join('\n')
    const d = parseNcDetail('X-p3.nc1', nc({ blocks: notch }))
    expect(d.areaM2).toBeCloseTo(0.06 - (Math.PI * 0.05 ** 2) / 2, 6)
  })

  it('returns nulls (no throw) for a plate file without a contour', () => {
    const d = parseNcDetail('X-p1.nc1', nc({}))
    expect(d.areaM2).toBeNull()
    expect(d.pieceWeightKg).toBeNull()
    expect(d.cutLengthMm).toBeNull()
  })
})

describe('parseNcDetail — sections', () => {
  it('piece weight = kg/m × length; no area', () => {
    const d = parseNcDetail('X-c1.nc1', nc({ mark: 'X-c1', code: 'I', profile: 'H200X100X5.5X8', qty: 1, length: 6000, unit: 30.7, blocks: RECT }))
    expect(d.pieceWeightKg).toBeCloseTo(184.2, 3)
    expect(d.areaM2).toBeNull()
    expect(d.widthMm).toBeNull()
  })
})

describe('parseNcFile (unchanged contract)', () => {
  it('still returns the original six fields', () => {
    expect(parseNcFile('X-p1.nc1', nc({ blocks: RECT }))).toEqual({
      partMark: 'X-p1', grade: 'HY370', qty: 2, profileBase: 'PL10', lengthMm: 300, weightKg: 78.5,
    })
  })
})
