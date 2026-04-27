import { validateDescription } from './description.validator'

describe('validateDescription', () => {
  it('passes valid UPPERCASE 2-part description', () => {
    expect(validateDescription('H-BEAM SS400 H=300 B=150').ok).toBe(true)
  })

  it('rejects Thai characters', () => {
    const r = validateDescription('เหล็ก H-BEAM')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Thai')
  })

  it('rejects lowercase letters', () => {
    const r = validateDescription('h-beam ss400')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('UPPERCASE')
  })

  it('rejects single token', () => {
    const r = validateDescription('H-BEAM')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('2 parts')
  })

  it('passes with digits and special chars', () => {
    expect(validateDescription('PLATE A36 T=6 W=1500 L=6000').ok).toBe(true)
  })

  it('rejects empty string', () => {
    expect(validateDescription('').ok).toBe(false)
  })

  it('rejects mixed Thai-English', () => {
    const r = validateDescription('H-BEAM SS400 ขนาด 300')
    expect(r.ok).toBe(false)
  })

  it('passes uppercase with slash and dash', () => {
    expect(validateDescription('C-SECTION G550/G300 T=1.2').ok).toBe(true)
  })
})
