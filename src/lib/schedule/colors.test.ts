import { FAMILY_COLOR, HEAT_COLORS, LEGEND, byFamily, familyRank, heatBand, opColor, wcColor } from './colors'

describe('op-family colours', () => {
  it('uses the mockup tokens', () => {
    expect(FAMILY_COLOR).toEqual({
      cut: '#2f6f9f', fit: '#2a9d8f', weld: '#e8731a', blast: '#7a828c', paint: '#3a9d5d', assy: '#6f5bd0', mach: '#9c7b4a',
    })
    expect(LEGEND.map((l) => l.family)).toEqual(['cut', 'mach', 'fit', 'weld', 'blast', 'paint', 'assy'])
  })

  it('maps work center codes, SURFACE → blast, unmapped → mach', () => {
    expect(wcColor('WC-SURFACE')).toBe('blast')
    expect(wcColor('WC-SHOTBLAST')).toBe('blast')
    expect(wcColor('WC-PAINT')).toBe('paint')
    expect(wcColor('WC-FITUP')).toBe('fit')
    expect(wcColor('WC-WELD')).toBe('weld')
    expect(wcColor('WC-CNC-PLASMA')).toBe('cut')
    expect(wcColor('WC-BANDSAW')).toBe('cut')
    expect(wcColor('WC-AS')).toBe('assy')
    expect(wcColor('WC-ASSEMBLY')).toBe('assy')
    expect(wcColor('WC-DRILL')).toBe('mach')
    expect(wcColor(null)).toBe('mach')
  })

  it('maps op labels first, then falls back to the work center', () => {
    expect(opColor('Primer coat', 'WC-WELD')).toBe('paint')
    expect(opColor('Shot blast', 'WC-PAINT')).toBe('blast')
    expect(opColor('Final check', 'WC-CUT')).toBe('assy')
    expect(opColor('Drilling', 'WC-SURFACE')).toBe('blast')
    expect(opColor(null, 'WC-XYZ')).toBe('mach')
  })
})

describe('familyRank / byFamily', () => {
  it('orders CUT · machining · build · fit/weld · surface, unknown last', () => {
    const codes = ['WC-PAINT', 'WC-XYZ', 'WC-WELD', 'WC-HBEAM', 'WC-DRILL', 'WC-SAW', 'WC-FIT']
    expect([...codes].sort(byFamily)).toEqual(['WC-SAW', 'WC-DRILL', 'WC-HBEAM', 'WC-FIT', 'WC-WELD', 'WC-PAINT', 'WC-XYZ'])
    expect(familyRank('WC-GRIND')).toBe(4)
    expect(familyRank('WC-SURFACE')).toBe(5)
    expect(familyRank('WC-OTHER')).toBe(9)
  })
})

describe('heatBand', () => {
  it('ramps by utilization and turns orange at ≥ 100 %', () => {
    expect([0, 0.2, 0.5, 0.8, 0.95, 1, 1.4].map(heatBand)).toEqual([
      HEAT_COLORS[0], HEAT_COLORS[1], HEAT_COLORS[2], HEAT_COLORS[3], HEAT_COLORS[4], HEAT_COLORS[5], HEAT_COLORS[5],
    ])
  })
})
