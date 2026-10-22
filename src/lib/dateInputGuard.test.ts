import { describe, expect, it } from 'vitest'
import { isValidDateInput, DATE_INPUT_YEAR_MIN, DATE_INPUT_YEAR_MAX } from './dateInputGuard'

// MO/WO plan + actual date inputs are native <input type="datetime-local"> /
// type="date"> (2026-10-22, user: "ถ้าใส่วันที่เกิน หรือเดือนเกินหรือให้
// ติดลบ ให้เด้งแจ้งเตือนหน่อยและเคลียช่องทิ้งให้กรอกใหม่"). Chrome blocks
// day>31 / month>12 WHILE TYPING, but an impossible combination (31 Feb)
// still lands as `value === ''` + `validity.badInput === true` — so the
// validator must treat badInput as its own failure mode, separate from the
// year/month/day range checks it does on a well-formed value.
describe('isValidDateInput', () => {
  it('accepts a normal datetime-local value', () => {
    expect(isValidDateInput('2026-10-22T10:00')).toBe(true)
  })

  it('accepts a normal date-only value', () => {
    expect(isValidDateInput('2026-10-22')).toBe(true)
  })

  it('accepts an empty value (untouched / cleared field, not this validator\'s job to require it)', () => {
    expect(isValidDateInput('')).toBe(true)
  })

  it('rejects badInput regardless of value (e.g. 31 Feb, which Chrome reports with value === "")', () => {
    expect(isValidDateInput({ value: '', validity: { badInput: true } })).toBe(false)
  })

  it('rejects a month over 12', () => {
    expect(isValidDateInput('2026-13-05T10:00')).toBe(false)
  })

  it('rejects a month of 0', () => {
    expect(isValidDateInput('2026-00-05T10:00')).toBe(false)
  })

  it('rejects a day over 31', () => {
    expect(isValidDateInput('2026-05-32T10:00')).toBe(false)
  })

  it('rejects a day of 0', () => {
    expect(isValidDateInput('2026-05-00T10:00')).toBe(false)
  })

  it('rejects a 6-digit year the browser lets through without badInput', () => {
    expect(isValidDateInput('201911-05-20T10:00')).toBe(false)
  })

  it(`rejects a year below ${DATE_INPUT_YEAR_MIN}`, () => {
    expect(isValidDateInput('1999-05-20T10:00')).toBe(false)
  })

  it(`rejects a year above ${DATE_INPUT_YEAR_MAX}`, () => {
    expect(isValidDateInput('2101-05-20T10:00')).toBe(false)
  })

  it(`accepts the year range boundaries (${DATE_INPUT_YEAR_MIN}, ${DATE_INPUT_YEAR_MAX})`, () => {
    expect(isValidDateInput(`${DATE_INPUT_YEAR_MIN}-01-01T00:00`)).toBe(true)
    expect(isValidDateInput(`${DATE_INPUT_YEAR_MAX}-12-31T23:59`)).toBe(true)
  })

  it('rejects a negative year', () => {
    expect(isValidDateInput('-001-05-20T10:00')).toBe(false)
  })
})
