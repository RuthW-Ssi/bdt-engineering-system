import { PRINT_LABELS, PRINT_LANGS, parsePrintLang } from './mo-print-labels'

describe('PRINT_LABELS', () => {
  it('has the exact same keys in every language', () => {
    const enKeys = Object.keys(PRINT_LABELS.en).sort()
    for (const lang of PRINT_LANGS) expect(Object.keys(PRINT_LABELS[lang]).sort()).toEqual(enKeys)
  })

  it('has no blank label in any language', () => {
    for (const lang of PRINT_LANGS) {
      for (const [key, value] of Object.entries(PRINT_LABELS[lang])) {
        const text = typeof value === 'function' ? value(1 as never, 3 as never) : value
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
      expect(L.drawingStamp('Rev 3 · 02/10/26')).toContain('Rev 3 · 02/10/26')
      expect(L.sheet(2, 3)).toContain('2/3')
    }
  })

  // 2026-10-21: Thai print copy says "Drawing", never "แบบ".
  it('says "Drawing" in both languages, never the Thai "แบบ"', () => {
    for (const lang of PRINT_LANGS) {
      expect(PRINT_LABELS[lang].drawingStamp('Rev 3')).toContain('Drawing')
    }
  })

  // Sheet suffix (2026-10-21) — plain fragment appended inside an existing
  // label/watermark line, not a standalone element.
  it('gives the sheet suffix as a leading " · " fragment, per language', () => {
    expect(PRINT_LABELS.en.sheet(1, 3)).toBe(' · sheet 1/3')
    expect(PRINT_LABELS.th.sheet(1, 3)).toBe(' · แผ่น 1/3')
  })
})

describe('parsePrintLang', () => {
  it('accepts th', () => expect(parsePrintLang('th')).toBe('th'))
  it('accepts en', () => expect(parsePrintLang('en')).toBe('en'))
  it.each([undefined, '', 'TH', 'jp', 'th,en'])('falls back to en for %p (prior behavior)', raw => {
    expect(parsePrintLang(raw)).toBe('en')
  })
})
