import { parseProfile, normalizeProfileString } from './profile-parser'

describe('parseProfile', () => {
  // H-section
  it('parses H section', () => {
    const r = parseProfile('H300x300x10x15')
    expect(r.shape).toBe('H')
    expect(r.method).toBe('HR')
    expect(r.height_mm).toBe(300)
    expect(r.width_mm).toBe(300)
    expect(r.web_thickness_mm).toBe(10)
    expect(r.flange_thickness_mm).toBe(15)
    expect(r.profile).toBe('H300x300x10x15')
  })

  it('parses THEPHA H950x150x6x6', () => {
    const r = parseProfile('H950x150x6x6')
    expect(r.shape).toBe('H')
    expect(r.height_mm).toBe(950)
    expect(r.width_mm).toBe(150)
    expect(r.web_thickness_mm).toBe(6)
    expect(r.flange_thickness_mm).toBe(6)
  })

  it('parses H with decimal dims H500.5x150.0x5x6', () => {
    const r = parseProfile('H500.5x150.0x5x6')
    expect(r.shape).toBe('H')
    expect(r.height_mm).toBe(500.5)
    expect(r.width_mm).toBe(150.0)
  })

  it('parses H case-insensitive h200x100x5x8', () => {
    const r = parseProfile('h200x100x5x8')
    expect(r.shape).toBe('H')
  })

  // Plate
  it('parses PL6x950', () => {
    const r = parseProfile('PL6x950')
    expect(r.shape).toBe('PL')
    expect(r.method).toBe('PL')
    expect(r.thickness_mm).toBe(6)
    expect(r.width_mm).toBe(950)
  })

  it('parses PL with decimal PL12.5x200', () => {
    const r = parseProfile('PL12.5x200')
    expect(r.shape).toBe('PL')
    expect(r.thickness_mm).toBe(12.5)
  })

  it('parses plate case-insensitive pl8x300', () => {
    const r = parseProfile('pl8x300')
    expect(r.shape).toBe('PL')
  })

  // Angle
  it('parses L75x75x6', () => {
    const r = parseProfile('L75x75x6')
    expect(r.shape).toBe('L')
    expect(r.method).toBe('ANG')
    expect(r.leg_a_mm).toBe(75)
    expect(r.leg_b_mm).toBe(75)
    expect(r.thickness_mm).toBe(6)
  })

  it('parses unequal angle L50x50x5', () => {
    const r = parseProfile('L50x50x5')
    expect(r.shape).toBe('L')
    expect(r.leg_a_mm).toBe(50)
  })

  it('parses L case-insensitive l100x75x8', () => {
    const r = parseProfile('l100x75x8')
    expect(r.shape).toBe('L')
  })

  // Pipe
  it('parses PIPE139.8x2.5', () => {
    const r = parseProfile('PIPE139.8x2.5')
    expect(r.shape).toBe('PIPE')
    expect(r.method).toBe('PIPE')
    expect(r.outer_diameter_mm).toBe(139.8)
    expect(r.thickness_mm).toBe(2.5)
  })

  it('parses PIPE114.3x4.5', () => {
    const r = parseProfile('PIPE114.3x4.5')
    expect(r.shape).toBe('PIPE')
    expect(r.outer_diameter_mm).toBe(114.3)
  })

  // Round bar
  it('parses RB22', () => {
    const r = parseProfile('RB22')
    expect(r.shape).toBe('RB')
    expect(r.method).toBe('BAR')
    expect(r.diameter_mm).toBe(22)
  })

  it('parses RODRB22', () => {
    const r = parseProfile('RODRB22')
    expect(r.shape).toBe('RB')
    expect(r.diameter_mm).toBe(22)
  })

  it('parses RB case-insensitive rb16', () => {
    const r = parseProfile('rb16')
    expect(r.shape).toBe('RB')
  })

  // Accessory
  it('parses COUPLING as ACCESSORY', () => {
    const r = parseProfile('COUPLING_M20')
    expect(r.shape).toBe('ACCESSORY')
    expect(r.method).toBe('ACCESSORY')
  })

  it('parses THREAD as ACCESSORY', () => {
    const r = parseProfile('THREADBAR32')
    expect(r.shape).toBe('ACCESSORY')
  })

  // Unknown
  it('returns UNKNOWN for unrecognized profile', () => {
    const r = parseProfile('CUSTOM_SHAPE_XYZ')
    expect(r.shape).toBe('UNKNOWN')
    expect(r.method).toBe('UNKNOWN')
    expect(r._raw).toBe('CUSTOM_SHAPE_XYZ')
  })

  it('handles leading/trailing whitespace', () => {
    const r = parseProfile('  PL6x950  ')
    expect(r.shape).toBe('PL')
  })
})

describe('normalizeProfileString', () => {
  it('leaves already-normal strings unchanged', () => {
    expect(normalizeProfileString('H300x300x10x15')).toBe('H300X300X10X15')
  })

  it('replaces dash separators with x', () => {
    expect(normalizeProfileString('H300-300-10-15')).toBe('H300X300X10X15')
  })

  it('replaces × (multiplication sign) separator', () => {
    expect(normalizeProfileString('PL6×950')).toBe('PL6X950')
  })

  it('removes trailing .0 decimals', () => {
    expect(normalizeProfileString('H300.0x300.0x10.0x15.0')).toBe('H300X300X10X15')
  })

  it('preserves significant decimals', () => {
    expect(normalizeProfileString('PIPE139.8x2.5')).toBe('PIPE139.8X2.5')
  })

  it('removes .00 and .000', () => {
    expect(normalizeProfileString('PL6.00x950.000')).toBe('PL6X950')
  })

  it('uppercases the result', () => {
    expect(normalizeProfileString('pl6x950')).toBe('PL6X950')
  })
})

describe('parseProfile — normalized inputs', () => {
  it('parses H with dash separators H300-300-10-15', () => {
    const r = parseProfile('H300-300-10-15')
    expect(r.shape).toBe('H')
    expect(r.height_mm).toBe(300)
    expect(r.width_mm).toBe(300)
    expect(r.web_thickness_mm).toBe(10)
    expect(r.flange_thickness_mm).toBe(15)
    expect(r.profile).toBe('H300x300x10x15')
  })

  it('parses PL with trailing .0 decimals PL6.0x950.0', () => {
    const r = parseProfile('PL6.0x950.0')
    expect(r.shape).toBe('PL')
    expect(r.thickness_mm).toBe(6)
    expect(r.width_mm).toBe(950)
    expect(r.profile).toBe('PL6x950')
  })

  it('parses H with all .0 decimals H300.0x300.0x10.0x15.0', () => {
    const r = parseProfile('H300.0x300.0x10.0x15.0')
    expect(r.shape).toBe('H')
    expect(r.profile).toBe('H300x300x10x15')
  })

  it('does NOT strip significant decimals — PIPE139.8x2.5 stays', () => {
    const r = parseProfile('PIPE139.8x2.5')
    expect(r.shape).toBe('PIPE')
    expect(r.outer_diameter_mm).toBe(139.8)
    expect(r.thickness_mm).toBe(2.5)
  })

  it('parses L with dash separator L75-75-6', () => {
    const r = parseProfile('L75-75-6')
    expect(r.shape).toBe('L')
    expect(r.leg_a_mm).toBe(75)
    expect(r.leg_b_mm).toBe(75)
    expect(r.thickness_mm).toBe(6)
  })
})
