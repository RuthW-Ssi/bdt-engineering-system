import { BadRequestException } from '@nestjs/common'

// MO/WO actual_start/actual_finish are user-typed, never system-stamped
// (2026-10-01). Shared by MO Complete / WO Done and both edit-after-DONE
// endpoints; the frontend mirrors these rules (minus the skew tolerance).
const CLOCK_SKEW_MS = 5 * 60 * 1000

export function parseActualDates(
  actual_start: string | undefined,
  actual_finish: string | undefined,
  now = new Date(),
): { actual_start: Date; actual_finish: Date } {
  if (!actual_start || !actual_finish) {
    throw new BadRequestException('Actual Start and Actual Finish are required')
  }
  const start = new Date(actual_start)
  const finish = new Date(actual_finish)
  if (isNaN(start.getTime()) || isNaN(finish.getTime())) {
    throw new BadRequestException('Actual Start and Actual Finish are required')
  }
  if (finish < start) {
    throw new BadRequestException('Actual Finish must not be before Actual Start')
  }
  const limit = now.getTime() + CLOCK_SKEW_MS
  if (start.getTime() > limit || finish.getTime() > limit) {
    throw new BadRequestException('Actual Start and Actual Finish must not be in the future')
  }
  return { actual_start: start, actual_finish: finish }
}

/** mail_message tracking rows for just the fields whose value changed (Dates as ISO strings). */
export function actualsTracking(old: Record<string, unknown>, next: Record<string, unknown>) {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : (v ?? null))
  return Object.keys(next)
    .filter((f) => norm(old[f]) !== norm(next[f]))
    .map((f) => ({ field: f, old_value: norm(old[f]), new_value: norm(next[f]) }))
}
