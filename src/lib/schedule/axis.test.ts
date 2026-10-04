import { OFF_BAND_PX, X, buildAxis, cursorAt, dayGroups, initialScrollLeft, invX, segAt, workWindows, zoomIn, zoomOut } from './axis'
import { bkk } from './testBoard'

const NO_HOL: ReadonlySet<string> = new Set()
const PXH = 22
// Mon 2026-10-05 08:00–10:00 (Bangkok), no MO due
const OPS = [{ s: bkk('2026-10-05T08:00'), e: bkk('2026-10-05T10:00'), moDue: null }]

describe('axis range', () => {
  it('spans 7 whole working days and skips the Sunday', () => {
    const axis = buildAxis(OPS, NO_HOL, PXH)
    expect(dayGroups(axis).map((g) => g.day)).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12',
    ])
    expect(axis.seg).toHaveLength(7 * 3 + 7 * 3 - 1) // 21 shift windows, 20 gaps
    expect(axis.seg[0].s).toBe(bkk('2026-10-05T08:00'))
    expect(axis.seg.at(-1)!.e).toBe(bkk('2026-10-12T22:00'))
  })

  it('skips a holiday and still finds 7 working days', () => {
    const axis = buildAxis(OPS, new Set(['2026-10-07']), PXH)
    const days = dayGroups(axis).map((g) => g.day)
    expect(days).not.toContain('2026-10-07')
    expect(days).toHaveLength(7)
    expect(days.at(-1)).toBe('2026-10-13')
  })

  it('stretches to MO dues within ±14 days of the ops, not beyond', () => {
    const near = buildAxis([{ ...OPS[0], moDue: bkk('2026-10-16T17:00') }], NO_HOL, PXH)
    expect(dayGroups(near).at(-1)!.day).toBe('2026-10-16')
    const before = buildAxis([{ ...OPS[0], moDue: bkk('2026-10-01T17:00') }], NO_HOL, PXH)
    expect(dayGroups(before)[0].day).toBe('2026-10-01')
    const far = buildAxis([{ ...OPS[0], moDue: bkk('2026-11-30T17:00') }], NO_HOL, PXH)
    expect(dayGroups(far).at(-1)!.day).toBe('2026-10-12')
  })

  it('without ops starts on the Bangkok day of `now`', () => {
    const axis = buildAxis([], NO_HOL, PXH, bkk('2026-10-03T23:30')) // Saturday night
    const days = dayGroups(axis).map((g) => g.day)
    expect(days[0]).toBe('2026-10-03')
    expect(days).toHaveLength(7)
    expect(initialScrollLeft(axis, 0)).toBe(0)
  })
})

describe('off-shift bands and widths', () => {
  const axis = buildAxis(OPS, new Set(['2026-10-07']), PXH)
  const off = (from: string) => axis.seg.find((g) => g.t === 'o' && g.s === bkk(from))!
  const width = (g: { x0: number; x1: number }) => g.x1 - g.x0

  it('is 4 px for lunch / dinner, 16 px overnight, 30 px over a Sunday or holiday', () => {
    expect(width(off('2026-10-05T12:00'))).toBe(OFF_BAND_PX.short)
    expect(width(off('2026-10-05T17:30'))).toBe(OFF_BAND_PX.short)
    expect(width(off('2026-10-05T22:00'))).toBe(OFF_BAND_PX.night)
    expect(width(off('2026-10-06T22:00'))).toBe(OFF_BAND_PX.dayOff) // Tue → Thu over the holiday
    expect(width(off('2026-10-10T22:00'))).toBe(OFF_BAND_PX.dayOff) // Sat → Mon
  })

  it('draws working windows at pxh per hour', () => {
    const w = axis.seg[0] // 08:00–12:00
    expect(width(w)).toBe(4 * PXH)
  })

  it('totals 12.5 h/day of windows plus the bands', () => {
    const plain = buildAxis(OPS, NO_HOL, PXH)
    // 7 days × 12.5 h × 22 px + 7 × (4+4) + 5 nights × 16 + 1 weekend × 30
    expect(plain.totalW).toBeCloseTo(7 * 12.5 * 22 + 56 + 80 + 30, 6)
  })
})

describe('X / invX', () => {
  const axis = buildAxis(OPS, NO_HOL, PXH)

  it('round-trips inside working windows and off bands', () => {
    for (const t of ['2026-10-05T08:00', '2026-10-05T09:17', '2026-10-06T13:45', '2026-10-06T19:30', '2026-10-09T03:00', '2026-10-11T12:00']) {
      expect(invX(axis, X(axis, bkk(t)))).toBeCloseTo(bkk(t), -1)
    }
  })

  it('maps one working hour to pxh px and clamps outside the axis', () => {
    expect(X(axis, bkk('2026-10-05T09:00')) - X(axis, bkk('2026-10-05T08:00'))).toBeCloseTo(PXH, 6)
    expect(X(axis, bkk('2026-10-04T10:00'))).toBe(0)
    expect(X(axis, bkk('2026-10-20T10:00'))).toBe(axis.totalW)
    expect(invX(axis, axis.totalW + 50)).toBe(axis.seg.at(-1)!.e)
  })

  it('puts an off-shift instant inside its band', () => {
    const px = X(axis, bkk('2026-10-05T12:30'))
    expect(segAt(axis, px)?.t).toBe('o')
  })

  it('auto-scrolls the first op 40 px in', () => {
    const later = buildAxis([{ s: bkk('2026-10-06T08:00'), e: bkk('2026-10-06T09:00'), moDue: bkk('2026-10-05T17:00') }], NO_HOL, PXH)
    expect(initialScrollLeft(later, 1)).toBeCloseTo(X(later, bkk('2026-10-06T08:00')) - 40, 6)
  })
})

describe('cursor + zoom', () => {
  const axis = buildAxis(OPS, NO_HOL, PXH)

  it('labels an off-shift position with " · นอกเวลา" and hides past the axis', () => {
    const inBand = X(axis, bkk('2026-10-05T12:30'))
    expect(cursorAt(axis, inBand).label.endsWith(' · นอกเวลา')).toBe(true)
    expect(cursorAt(axis, X(axis, bkk('2026-10-05T09:00'))).label).not.toContain('นอกเวลา')
    expect(cursorAt(axis, axis.totalW + 1).visible).toBe(false)
  })

  it('zooms in steps of 6 within 10..60', () => {
    expect(zoomIn(22)).toBe(28)
    expect(zoomIn(58)).toBe(60)
    expect(zoomOut(22)).toBe(16)
    expect(zoomOut(12)).toBe(10)
  })

  it('workWindows only keeps windows touching the range', () => {
    const w = workWindows(bkk('2026-10-05T12:30'), bkk('2026-10-05T18:30'), NO_HOL)
    expect(w.map((x) => x.s)).toEqual([bkk('2026-10-05T13:00'), bkk('2026-10-05T18:00')])
  })
})
