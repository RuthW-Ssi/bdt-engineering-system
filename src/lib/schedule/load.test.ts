import { buildAxis } from './axis'
import { HEAT_COLORS } from './colors'
import { WORK_MIN, bottleneck, clearIvBuckets, dayLoad, heatGrid, ivBuckets, oeeOf } from './load'
import { buildOps, indexBoard } from './model'
import { bkk, line, makeBoard, op, wc, wo } from './testBoard'

const NO_HOL: ReadonlySet<string> = new Set()

beforeEach(() => clearIvBuckets())

describe('ivBuckets / dayLoad', () => {
  // Fri 02-Oct 20:45 → Sat 03-Oct 11:00: 60 min of โอที (to 21:45) + 150 min of เช้า (08:30–11:00)
  const s = bkk('2026-10-02T20:45')
  const e = bkk('2026-10-03T11:00')

  it('splits an overnight op into productive shift minutes per day', () => {
    expect(ivBuckets(s, e, NO_HOL)).toEqual({ '2026-10-02|O': 60, '2026-10-03|M': 150 })
  })

  it('spreads the work minutes over the days in that proportion', () => {
    const o = { s, e, dur: 210 }
    expect(dayLoad(o, '2026-10-02', NO_HOL)).toBeCloseTo(60, 9)
    expect(dayLoad(o, '2026-10-03', NO_HOL)).toBeCloseTo(150, 9)
    const o2 = { s, e, dur: 420 }
    expect(dayLoad(o2, '2026-10-02', NO_HOL)).toBeCloseTo(120, 9)
    expect(dayLoad(o2, '2026-10-03', NO_HOL)).toBeCloseTo(300, 9)
    expect(dayLoad(o2, '2026-10-04', NO_HOL)).toBe(0)
  })

  it('is memoized by s|e and recomputed when the holidays change', () => {
    const a = ivBuckets(s, e, NO_HOL)
    expect(ivBuckets(s, e, new Set())).toBe(a) // same content → memo kept
    const hol = new Set(['2026-10-03'])
    expect(ivBuckets(s, e, hol)).toEqual({ '2026-10-02|O': 60 })
    expect(dayLoad({ s, e, dur: 210 }, '2026-10-02', hol)).toBe(210)
    expect(dayLoad({ s, e, dur: 210 }, '2026-10-03', hol)).toBe(0)
    expect(ivBuckets(s, e, NO_HOL)).toEqual({ '2026-10-02|O': 60, '2026-10-03|M': 150 })
  })

  it('skips Sundays and charges an op with no in-shift minutes to its start day', () => {
    expect(ivBuckets(bkk('2026-10-03T21:00'), bkk('2026-10-05T09:00'), NO_HOL)).toEqual({ '2026-10-03|O': 45, '2026-10-05|M': 30 })
    const night = { s: bkk('2026-10-05T23:00'), e: bkk('2026-10-05T23:30'), dur: 30 }
    expect(dayLoad(night, '2026-10-05', NO_HOL)).toBe(30)
    expect(dayLoad(night, '2026-10-06', NO_HOL)).toBe(0)
  })

  it('has 705 productive minutes per line-day', () => {
    expect(WORK_MIN).toBe(705)
  })
})

describe('oeeOf', () => {
  it('uses A×P×Q, falling back to oee_target, else 1', () => {
    expect(oeeOf({ availability: 90, performance: 90, quality: 90, oee_target: 50 })).toBeCloseTo(0.729, 9)
    expect(oeeOf({ availability: null, performance: null, quality: null, oee_target: 85 })).toBeCloseTo(0.85, 9)
    expect(oeeOf({ availability: 100, performance: 100, quality: 100, oee_target: null })).toBe(1)
    expect(oeeOf({ availability: 0, performance: null, quality: null, oee_target: 0 })).toBe(1)
  })
})

// CUT 1 line OEE 1 · WELD 2 lines OEE .8 · DRILL 1 line, idle · SURFACE inactive WC
function board() {
  return makeBoard({
    work_centers: [
      wc(1, 'WC-CUT'),
      wc(2, 'WC-WELD', { availability: 80 }),
      wc(3, 'WC-DRILL'),
      wc(4, 'WC-SURFACE', { active: false }),
    ],
    lines: [line(11, 1, 1), line(21, 2, 1), line(22, 2, 2), line(23, 2, 3, { active: false }), line(31, 3, 1), line(41, 4, 1)],
    work_orders: [
      wo(1, 100, { expected_duration_min: 400 }),
      wo(2, 100, { expected_duration_min: 280 }),
      wo(3, 100, { expected_duration_min: 280 }),
    ],
    ops: [
      op(1, 11, '2026-10-05T08:30', '2026-10-05T16:10'),
      op(2, 21, '2026-10-05T08:30', '2026-10-05T13:40'),
      op(3, 22, '2026-10-06T08:30', '2026-10-06T13:40'),
    ],
  })
}

describe('heatGrid', () => {
  it('is every active WC (Gantt order) × every working day on the axis, with an OEE column', () => {
    const ix = indexBoard(board())
    const ops = buildOps(ix)
    const axis = buildAxis(ops, ix.holidays, 22)
    const grid = heatGrid(ix, ops, axis)!
    expect(grid.days).toHaveLength(7)
    expect(grid.rows.map((r) => r.code)).toEqual(['CUT', 'DRILL', 'WELD'])
    for (const r of grid.rows) expect(r.cells).toHaveLength(7)
    expect(grid.rows.map((r) => r.oeeText)).toEqual(['100%', '100%', '80%'])
    // CUT: 400 min on Mon ÷ (1 × 705 × 1)
    const cut = grid.rows[0].cells[0]
    expect(cut.busy).toBeCloseTo(400, 9)
    expect(cut.text).toBe(`${Math.round((400 / 705) * 100)}%`)
    expect(grid.rows[0].cells[1].text).toBe('')
    expect(grid.rows[1].cells.every((c) => c.text === '' && c.color === HEAT_COLORS[0])).toBe(true)
    // WELD Mon: 280 ÷ (2 lines × 705 × .8)
    expect(grid.rows[2].cells[0].u).toBeCloseTo(280 / (2 * 705 * 0.8), 9)
  })

  it('is null without ops', () => {
    const ix = indexBoard(makeBoard({ work_centers: [wc(1, 'WC-CUT')], lines: [line(11, 1, 1)] }))
    expect(heatGrid(ix, [], buildAxis([], ix.holidays, 22))).toBeNull()
  })
})

describe('bottleneck', () => {
  it('picks the highest work ÷ (lines × OEE), not the most minutes', () => {
    // CUT 400 / (1 × 1) = 400 · WELD 560 / (2 × .8) = 350
    const ix = indexBoard(board())
    const ops = buildOps(ix)
    const b = bottleneck(ix, ops, buildAxis(ops, ix.holidays, 22))!
    expect(b.code).toBe('CUT')
    expect(b.lines).toBe(1)
    expect(b.capHours).toBeCloseTo(705 / 60, 9)
    expect(b.tag).toBe('CUT · capacity = 1 × 11.8h × OEE 100%')
    expect(b.days).toHaveLength(7)
    expect(b.days[0].hoursText).toBe('6.7h')
    expect(b.days[0].over).toBe(false)
    expect(b.days[1].fillPct).toBe(2)
  })

  it('switches when the load ratio flips', () => {
    const base = board()
    const heavier = { ...base, work_orders: base.work_orders.map((w) => (w.id === 1 ? { ...w, expected_duration_min: 300 } : w)) }
    const ix = indexBoard(heavier)
    const ops = buildOps(ix)
    expect(bottleneck(ix, ops, buildAxis(ops, ix.holidays, 22))!.code).toBe('WELD')
  })

  it('is null without ops', () => {
    const ix = indexBoard(board())
    expect(bottleneck(ix, [], buildAxis([], ix.holidays, 22))).toBeNull()
  })
})
