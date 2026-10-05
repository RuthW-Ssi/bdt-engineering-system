import { PRINT_LABELS, PRINT_LANGS, parsePrintLang } from './mo-print-labels'

describe('PRINT_LABELS', () => {
  it('has the exact same keys in every language', () => {
    const enKeys = Object.keys(PRINT_LABELS.en).sort()
    for (const lang of PRINT_LANGS) expect(Object.keys(PRINT_LABELS[lang]).sort()).toEqual(enKeys)
  })

  it('has no blank label in any language', () => {
    for (const lang of PRINT_LANGS) {
      for (const [key, value] of Object.entries(PRINT_LABELS[lang])) {
        const text = typeof value === 'function' ? value('1' as never) : value
        expect({ lang, key, blank: text.trim() === '' }).toEqual({ lang, key, blank: false })
      }
    }
  })

  it('keeps the interpolated value in every templated label', () => {
    for (const lang of PRINT_LANGS) {
      const L = PRINT_LABELS[lang]
      expect(L.assemblyQty('7.00')).toContain('7.00')
      expect(L.minutes('75')).toContain('75')
      expect(L.moreSeeQr(12)).toContain('12')
      expect(L.drawingStamp('v3 · 02/10/26')).toContain('v3 · 02/10/26')
      expect(L.drawingUpdatedAfterWo('CTR10 v3 (02/10/26)')).toContain('CTR10 v3 (02/10/26)')
    }
  })
})

describe('parsePrintLang', () => {
  it('accepts th', () => expect(parsePrintLang('th')).toBe('th'))
  it('accepts en', () => expect(parsePrintLang('en')).toBe('en'))
  it.each([undefined, '', 'TH', 'jp', 'th,en'])('falls back to en for %p (prior behavior)', raw => {
    expect(parsePrintLang(raw)).toBe('en')
  })
})
