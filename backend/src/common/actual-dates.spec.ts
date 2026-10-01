import { BadRequestException } from '@nestjs/common'
import { actualsTracking, parseActualDates } from './actual-dates'

describe('actualsTracking', () => {
  it('lists only changed fields, Dates as ISO strings, missing old values as null', () => {
    const old = { actual_start: new Date('2026-10-01T08:00:00.000Z'), actual_finish: null, delay_note: 'x' }
    const next = { actual_start: new Date('2026-10-01T08:00:00.000Z'), actual_finish: new Date('2026-10-01T09:00:00.000Z'), delay_note: 'x', timeliness: 'ON_PLAN' }
    expect(actualsTracking(old, next)).toEqual([
      { field: 'actual_finish', old_value: null, new_value: '2026-10-01T09:00:00.000Z' },
      { field: 'timeliness', old_value: null, new_value: 'ON_PLAN' },
    ])
  })
})

describe('parseActualDates', () => {
  const now = new Date('2026-10-01T10:00:00.000Z')

  it('returns both dates parsed', () => {
    expect(parseActualDates('2026-09-30T08:00:00.000Z', '2026-10-01T09:00:00.000Z', now)).toEqual({
      actual_start: new Date('2026-09-30T08:00:00.000Z'),
      actual_finish: new Date('2026-10-01T09:00:00.000Z'),
    })
  })

  it('accepts finish equal to start', () => {
    expect(() => parseActualDates('2026-10-01T08:00:00.000Z', '2026-10-01T08:00:00.000Z', now)).not.toThrow()
  })

  it.each([
    [undefined, '2026-10-01T09:00:00.000Z'],
    ['2026-10-01T08:00:00.000Z', undefined],
    ['', ''],
  ])('rejects a missing date (%s, %s)', (s, f) => {
    expect(() => parseActualDates(s, f, now)).toThrow(new BadRequestException('Actual Start and Actual Finish are required'))
  })

  it('rejects finish before start', () => {
    expect(() => parseActualDates('2026-10-01T09:00:00.000Z', '2026-10-01T08:59:00.000Z', now)).toThrow(
      new BadRequestException('Actual Finish must not be before Actual Start'),
    )
  })

  it('allows up to 5 minutes of clock skew, rejects beyond it', () => {
    expect(() => parseActualDates('2026-10-01T09:00:00.000Z', '2026-10-01T10:05:00.000Z', now)).not.toThrow()
    expect(() => parseActualDates('2026-10-01T09:00:00.000Z', '2026-10-01T10:05:01.000Z', now)).toThrow(
      new BadRequestException('Actual Start and Actual Finish must not be in the future'),
    )
  })

  it('rejects a future start (even with finish after it)', () => {
    expect(() => parseActualDates('2026-10-02T09:00:00.000Z', '2026-10-02T10:00:00.000Z', now)).toThrow(
      new BadRequestException('Actual Start and Actual Finish must not be in the future'),
    )
  })
})
