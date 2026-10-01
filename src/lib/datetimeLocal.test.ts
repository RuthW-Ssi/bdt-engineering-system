import { datetimeLocalToIso, toDatetimeLocal } from './datetimeLocal'

describe('toDatetimeLocal', () => {
  it('returns empty string for null / undefined / empty / invalid input', () => {
    expect(toDatetimeLocal(null)).toBe('')
    expect(toDatetimeLocal(undefined)).toBe('')
    expect(toDatetimeLocal('')).toBe('')
    expect(toDatetimeLocal('not a date')).toBe('')
  })

  it('formats in LOCAL time using local getters (not the UTC slice)', () => {
    const local = new Date(2026, 9, 1, 8, 5) // 01 Oct 2026, 08:05 local
    expect(toDatetimeLocal(local.toISOString())).toBe('2026-10-01T08:05')
  })

  it('drops seconds', () => {
    const local = new Date(2026, 0, 2, 23, 59, 45)
    expect(toDatetimeLocal(local.toISOString())).toBe('2026-01-02T23:59')
  })
})

describe('datetimeLocalToIso', () => {
  it('reads the value as local time and returns the UTC ISO instant', () => {
    expect(datetimeLocalToIso('2026-10-01T08:05')).toBe(new Date(2026, 9, 1, 8, 5).toISOString())
  })

  it('round-trips with toDatetimeLocal', () => {
    expect(toDatetimeLocal(datetimeLocalToIso('2026-03-15T17:30'))).toBe('2026-03-15T17:30')
  })
})
