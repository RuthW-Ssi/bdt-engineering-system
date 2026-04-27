import { validateAttributes } from './attributes-by-group.schemas'

describe('validateAttributes', () => {
  it('passes valid HR_SHAPE attributes', () => {
    const r = validateAttributes('HR000', { grade: 'SS400', height_h: 300, width_b: 150, web_tw: 6.5, flange_tf: 9 })
    expect(r.ok).toBe(true)
  })

  it('rejects HR_SHAPE missing web_tw', () => {
    const r = validateAttributes('HR000', { grade: 'SS400', height_h: 300, width_b: 150, flange_tf: 9 })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('web_tw')
  })

  it('passes valid PLATE attributes', () => {
    const r = validateAttributes('PL000', { grade: 'A36', thickness_t: 12 })
    expect(r.ok).toBe(true)
  })

  it('rejects PLATE missing thickness_t', () => {
    const r = validateAttributes('PL000', { grade: 'A36' })
    expect(r.ok).toBe(false)
  })

  it('passes unknown prefix with any attrs (passthrough)', () => {
    const r = validateAttributes('XX000', { foo: 'bar', baz: 123 })
    expect(r.ok).toBe(true)
  })

  it('passes valid BOLT attributes', () => {
    const r = validateAttributes('BN000', { diameter_d: 20, length_mm: 80 })
    expect(r.ok).toBe(true)
  })

  it('passes valid COLDFORM attributes', () => {
    const r = validateAttributes('CF000', {
      grade: 'G550', height_h: 150, width_b: 65, thickness_t: 1.5, lip_c: 15,
    })
    expect(r.ok).toBe(true)
  })

  it('rejects COLDFORM missing thickness_t', () => {
    const r = validateAttributes('CF000', { grade: 'G550', height_h: 150, width_b: 65 })
    expect(r.ok).toBe(false)
  })
})
