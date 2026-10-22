import type { ChangeEvent, FocusEvent } from 'react'
import { toast } from 'sonner'

// Shared guard for every MO/WO plan/actual date(-time) input (2026-10-22,
// user: "เรื่อง plan actual date ถ้าใส่วันที่เกิน หรือเดือนเกินหรือให้
// ติดลบ ให้เด้งแจ้งเตือนหน่อยและเคลียช่องทิ้งให้กรอกใหม่"). These inputs are
// native <input type="datetime-local"> / type="date">. Two failure shapes:
//  - an impossible combination (31 Feb, 32nd of any month) — Chrome refuses
//    to commit it, so `value` comes back '' with `validity.badInput` true;
//  - a well-formed but absurd value Chrome does NOT block, notably a year
//    typed past 4 digits (it accepts up to 6) or a plainly-wrong year like
//    1999/2101 — this one only shows up once the full value parses.
export const DATE_INPUT_YEAR_MIN = 2000
export const DATE_INPUT_YEAR_MAX = 2100

export const DATE_INPUT_ERROR_MESSAGE = 'วันที่ไม่ถูกต้อง — ตรวจวัน/เดือน/ปีอีกครั้ง แล้วกรอกใหม่'

// year-month-day prefix shared by both type="date" ("YYYY-MM-DD") and
// type="datetime-local" ("YYYY-MM-DDTHH:MM") values.
const DATE_PREFIX = /^(-?\d{1,6})-(-?\d{1,2})-(-?\d{1,2})/

type DateInputLike = string | { value: string; validity?: { badInput?: boolean } }

/**
 * Pure validity check for a date/datetime-local input's current value.
 * Accepts either the raw string value or an element-like object (so it can
 * be driven straight off `input.validity.badInput` without a real DOM).
 * Empty is valid here — requiring a value is a separate, field-specific rule.
 */
export function isValidDateInput(input: DateInputLike): boolean {
  const value = typeof input === 'string' ? input : input.value
  const badInput = typeof input !== 'string' && Boolean(input.validity?.badInput)
  if (badInput) return false
  if (!value) return true

  const m = value.match(DATE_PREFIX)
  if (!m) return false
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (!Number.isFinite(year) || year < DATE_INPUT_YEAR_MIN || year > DATE_INPUT_YEAR_MAX) return false
  if (!Number.isFinite(month) || month < 1 || month > 12) return false
  if (!Number.isFinite(day) || day < 1 || day > 31) return false
  return true
}

/**
 * onChange/onBlur pair to spread onto a plan/actual date input. onChange
 * only catches badInput (the value is already '' by then, so there's
 * nothing to clear beyond the toast); onBlur runs the full check, including
 * the year-range check deferred here on purpose — checking it mid-keystroke
 * would fight a 4-digit year being typed one digit at a time. On either
 * failure: toast + clear both the DOM input and the React state.
 */
export function dateInputGuardHandlers(setValue: (v: string) => void, label?: string) {
  function reject(input: HTMLInputElement) {
    toast.error(label ? `${label}: ${DATE_INPUT_ERROR_MESSAGE}` : DATE_INPUT_ERROR_MESSAGE)
    input.value = ''
    setValue('')
  }
  return {
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.validity.badInput) { reject(e.target); return }
      setValue(e.target.value)
    },
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      if (!isValidDateInput(e.target)) reject(e.target)
    },
  }
}
