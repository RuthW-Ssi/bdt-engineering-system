import { asmValues, valueChanges, valueText } from './asm-fields'

// Every assembly value is compared and logged (2026-10-09, user: "ต้องเปรียบเทียบกันทุกค่า").
describe('assembly values', () => {
  const was = { name: 'WEB', length_mm: 10550, width_mm: 400, height_mm: 1200, weight_kg: 3561.15, surface_area_m2: 42.708 }

  it('reads every value from a DB row (Decimals → numbers, blank name → null)', () => {
    expect(asmValues({ name: ' ', length_mm: '10550', width_mm: null, height_mm: '1200.00', weight_kg: '3561.150', surface_area_m2: '42.7080' }))
      .toEqual({ name: null, length_mm: 10550, width_mm: null, height_mm: 1200, weight_kg: 3561.15, surface_area_m2: 42.708 })
  })

  it('lists every value that differs, a value that appears or disappears included', () => {
    expect(valueChanges(was, { ...was, name: 'BUILT-UP H', width_mm: 450, surface_area_m2: null })).toEqual([
      { key: 'name', label: 'Name', from: 'WEB', to: 'BUILT-UP H' },
      { key: 'width_mm', label: 'W', from: 400, to: 450 },
      { key: 'surface_area_m2', label: 'area/ชุด', from: 42.708, to: null },
    ])
    expect(valueChanges({ ...was, width_mm: null }, was).map(c => c.key)).toEqual(['width_mm'])
    expect(valueChanges(was, { ...was, name: ' WEB ' })).toEqual([])
  })

  it('a file that does not carry a value leaves it out (onlyGiven)', () => {
    // a pre-shop PDF has no name / W / H — that is not a change
    expect(valueChanges(was, { ...was, name: null, width_mm: null, height_mm: null }, { onlyGiven: true })).toEqual([])
  })

  it('writes a value for History', () => {
    expect(valueText(null)).toBe('—')
    expect(valueText(42.708)).toBe('42.708')
    expect(valueText('BUILT-UP H')).toBe('BUILT-UP H')
  })
})
