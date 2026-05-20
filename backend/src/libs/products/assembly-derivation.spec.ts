import { deriveAssemblyAttrs, PartRow } from './assembly-derivation'

// Helper: make parts for a typical H-column (web + 2 flanges + accessories)
function columnParts(webLength = 9050): PartRow[] {
  return [
    // WEB plate: long, narrow
    { profile: 'PL6x950', grade: 'HY370', length_mm: webLength, qty: 1 },
    // FLANGE plates: same length, wider
    { profile: 'PL6x150', grade: 'HY370', length_mm: webLength, qty: 2 },
    // End plate (short)
    { profile: 'PL10x200', grade: 'HY370', length_mm: 200, qty: 2 },
    // Stiffener (short)
    { profile: 'PL8x100', grade: 'HY370', length_mm: 150, qty: 4 },
    // Bolt (accessory)
    { profile: 'COUPLING_M20', grade: null, length_mm: null, qty: 4 },
  ]
}

describe('deriveAssemblyAttrs', () => {
  describe('H-shape (Column)', () => {
    it('derives H column from TH-2CO1', () => {
      const result = deriveAssemblyAttrs('TH-2CO1', columnParts())
      expect(result.attrs.shape).toBe('H')
      expect(result.markPrefix).toBe('CO')
      expect(result.confidence).toBe('high')
      expect(result.flags).toHaveLength(0)
    })

    it('sets correct H dimensions from WEB and FLANGE plates', () => {
      const result = deriveAssemblyAttrs('TH-2CO1', columnParts())
      // WEB: PL6x950 → width_mm=950 (web height), thickness=6 (web_t)
      // FLANGE: PL6x150 → width_mm=150, thickness=6 (flange_t)
      expect(result.attrs.height_mm).toBe(950)   // web width
      expect(result.attrs.width_mm).toBe(150)    // flange width
      expect(result.attrs.web_thickness_mm).toBe(6)
      expect(result.attrs.flange_thickness_mm).toBe(6)
    })

    it('sets grade from majority vote', () => {
      const result = deriveAssemblyAttrs('TH-2CO1', columnParts())
      expect(result.attrs.grade).toBe('HY370')
    })

    it('flags mixed_grade when parts have different grades', () => {
      const parts: PartRow[] = [
        { profile: 'PL6x950', grade: 'HY370', length_mm: 9050, qty: 1 },
        { profile: 'PL6x150', grade: 'SS400', length_mm: 9050, qty: 2 },
      ]
      const result = deriveAssemblyAttrs('TH-2CO1', parts)
      expect(result.flags).toContain('mixed_grade')
      expect(result.confidence).toBe('medium')
      expect(result.attrs.grade).toBe('MIXED')
    })

    it('flags insufficient_long_plates when no long plates found', () => {
      const parts: PartRow[] = [
        { profile: 'PL6x100', grade: 'HY370', length_mm: 200, qty: 4 },
      ]
      const result = deriveAssemblyAttrs('TH-2CO1', parts)
      expect(result.flags).toContain('insufficient_long_plates')
      expect(result.confidence).toBe('low')
    })

    it('derives rafter TH-2RF1', () => {
      const result = deriveAssemblyAttrs('TH-2RF1', columnParts(6000))
      expect(result.attrs.shape).toBe('H')
      expect(result.markPrefix).toBe('RF')
    })
  })

  describe('L-shape (Fly Brace)', () => {
    it('derives L angle from TH-2FB1', () => {
      const parts: PartRow[] = [
        { profile: 'L75x75x6', grade: 'SS400', length_mm: 1500, qty: 1 },
        { profile: 'COUPLING_M16', grade: null, length_mm: null, qty: 2 },
      ]
      const result = deriveAssemblyAttrs('TH-2FB1', parts)
      expect(result.attrs.shape).toBe('L')
      expect(result.attrs.leg_a_mm).toBe(75)
      expect(result.attrs.leg_b_mm).toBe(75)
      expect(result.markPrefix).toBe('FB')
      expect(result.confidence).toBe('high')
    })

    it('low confidence when no L part found', () => {
      const parts: PartRow[] = [{ profile: 'PL6x100', grade: 'SS400', length_mm: 500, qty: 1 }]
      const result = deriveAssemblyAttrs('TH-2FB1', parts)
      expect(result.confidence).toBe('low')
      expect(result.flags).toContain('derivation_failed')
    })
  })

  describe('edge cases', () => {
    it('returns low confidence for assembly with only accessories', () => {
      const parts: PartRow[] = [
        { profile: 'COUPLING_M20', grade: null, length_mm: null, qty: 4 },
      ]
      const result = deriveAssemblyAttrs('TH-2CO1', parts)
      expect(result.confidence).toBe('low')
    })

    it('handles null profiles gracefully', () => {
      const parts: PartRow[] = [
        { profile: null, grade: 'HY370', length_mm: 5000, qty: 1 },
        { profile: 'PL6x200', grade: 'HY370', length_mm: 4900, qty: 2 },
      ]
      expect(() => deriveAssemblyAttrs('TH-2CO1', parts)).not.toThrow()
    })

    it('extracts mark prefix from single-segment mark', () => {
      const result = deriveAssemblyAttrs('CO-001', columnParts())
      expect(result.markPrefix).toBe('CO')
    })
  })
})
