import { describe, it, expect, vi, afterEach } from 'vitest'
import { daysUntil, daysRemainingLabel } from './dateMath'

// "Today" fixed at 2026-09-28 15:00 local — a real time-of-day, not
// midnight, since plan_finish/plan_start are timestamptz instants and the
// bug this file guards against (QA-F-002, 2026-09-28) only shows up when
// "now" itself isn't already at midnight.
const NOW = new Date('2026-09-28T15:00:00')

afterEach(() => {
  vi.useRealTimers()
})

describe('daysUntil', () => {
  it('returns null for a null date', () => {
    expect(daysUntil(null)).toBeNull()
  })

  it('is 0 for a date later today, regardless of time-of-day', () => {
    vi.useFakeTimers().setSystemTime(NOW)
    expect(daysUntil('2026-09-28T23:00:00')).toBe(0)
    expect(daysUntil('2026-09-28T00:00:00')).toBe(0)
  })

  it('is positive for a future date, counting whole calendar days', () => {
    vi.useFakeTimers().setSystemTime(NOW)
    expect(daysUntil('2026-09-30T11:37:00')).toBe(2)
    expect(daysUntil('2026-09-29T00:00:01')).toBe(1)
  })

  // QA-F-002: a plan_finish that's genuinely overdue by a full calendar day,
  // but carries a LATER time-of-day than "now", must not compute to 0 —
  // before the fix, only `today` was normalized to midnight, so
  // `2026-09-27T20:00` (yesterday evening) diffed against `2026-09-28T15:00`
  // (today, un-normalized) gave a ~-19h gap that Math.ceil rounded to 0
  // ("today") instead of -1 ("1D overdue").
  it('is -1 for yesterday even when its time-of-day is later than "now"\'s', () => {
    vi.useFakeTimers().setSystemTime(NOW)
    expect(daysUntil('2026-09-27T20:00:00')).toBe(-1)
  })

  it('is negative for further-past dates, counting whole calendar days', () => {
    vi.useFakeTimers().setSystemTime(NOW)
    expect(daysUntil('2026-09-20T09:00:00')).toBe(-8)
  })
})

describe('daysRemainingLabel', () => {
  it('returns null for a null date', () => {
    expect(daysRemainingLabel(null)).toBeNull()
  })

  it('labels today as "today", red', () => {
    vi.useFakeTimers().setSystemTime(NOW)
    expect(daysRemainingLabel('2026-09-28T23:00:00')).toEqual({ text: 'today', color: '#B91C1C', dot: '🔴' })
  })

  it('labels an overdue date as "ND overdue", red', () => {
    vi.useFakeTimers().setSystemTime(NOW)
    expect(daysRemainingLabel('2026-09-20T09:00:00')).toEqual({ text: '8D overdue', color: '#B91C1C', dot: '🔴' })
  })

  it('labels a near-term future date (<=30D) as "ND", amber', () => {
    vi.useFakeTimers().setSystemTime(NOW)
    expect(daysRemainingLabel('2026-09-30T11:37:00')).toEqual({ text: '2D', color: '#92400E', dot: '🟡' })
  })

  it('labels a far-future date (>30D) as "ND", green', () => {
    vi.useFakeTimers().setSystemTime(NOW)
    expect(daysRemainingLabel('2026-12-01T00:00:00')).toEqual({ text: '64D', color: '#166534', dot: '🟢' })
  })
})
