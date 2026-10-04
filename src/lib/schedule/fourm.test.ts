import type { FourMWipRow, ScheduleBoard, ScheduleFourM } from '../../api/schedule'
import { FAMILY_COLOR } from './colors'
import {
  FOURM_COLOR,
  FOURM_TEXT,
  axis4,
  bkOf,
  fourMView,
  machineCard,
  manCard,
  materialCard,
  methodCard,
  wipCard,
  type FmBar,
  type FourMCard,
} from './fourm'
import { clearIvBuckets } from './load'
import { buildOps, indexBoard } from './model'
import { bkk, iso, line, makeBoard, op, team, wc, wo } from './testBoard'
import { dShort } from './time'

const NO_HOL: ReadonlySet<string> = new Set()
const MON = '2026-10-05'
const TUE = '2026-10-06'

beforeEach(() => clearIvBuckets())

/** Index + ops + per-shift axis over the ops' span, as fourMView builds them. */
function setup(board: ScheduleBoard) {
  const ix = indexBoard(board)
  const ops = buildOps(ix)
  const ax = axis4(Math.min(...ops.map((o) => o.s)), Math.max(...ops.map((o) => o.e)), ix.holidays)
  return { ix, ops, ax }
}

const bars = (c: FourMCard): FmBar[] => c.chart!.flatMap((d) => d.bars)
const barAt = (c: FourMCard, key: string): FmBar => bars(c).find((b) => b.key === key)!
const chips = (c: FourMCard) => c.chips.map((x) => [x.text, x.tone])

const fourm = (over: Partial<ScheduleFourM> = {}): ScheduleFourM => ({
  version_id: 1,
  operators_by_team: [],
  stock: { materials: 10, with_stock: 4, short: 0 },
  wip: { status: 'ok', rows: [] },
  first_seq_by_mo: [],
  ...over,
})

describe('axis4 / bkOf', () => {
  it('lists the three productive shifts of every working day, skipping Sundays and holidays', () => {
    const ax = axis4(bkk('2026-10-03T21:00'), bkk('2026-10-05T09:00'), NO_HOL)
    expect(ax.map((a) => `${a.day}|${a.k}`)).toEqual([
      '2026-10-03|M', '2026-10-03|A', '2026-10-03|O',
      '2026-10-05|M', '2026-10-05|A', '2026-10-05|O',
    ])
    expect(ax[2].sh).toMatchObject({ label: 'โอที', s: 1080, e: 1305, ot: true })
    expect(axis4(bkk('2026-10-03T21:00'), bkk('2026-10-05T09:00'), new Set([MON])).map((a) => a.day)).toEqual(['2026-10-03', '2026-10-03', '2026-10-03'])
  })

  it('buckets an instant by calendar block (12:00 / 17:30)', () => {
    expect(bkOf(bkk('2026-10-05T05:00'))).toBe('2026-10-05|M')
    expect(bkOf(bkk('2026-10-05T11:59'))).toBe('2026-10-05|M')
    expect(bkOf(bkk('2026-10-05T12:00'))).toBe('2026-10-05|A')
    expect(bkOf(bkk('2026-10-05T17:29'))).toBe('2026-10-05|A')
    expect(bkOf(bkk('2026-10-05T17:30'))).toBe('2026-10-05|O')
    expect(bkOf(bkk('2026-10-05T23:30'))).toBe('2026-10-05|O')
  })
})

// ── Man ───────────────────────────────────────────────────────────────────────
// T-IN internal (7) · T-EX external (8) · T-OLD internal but inactive (9)
// Mon M: WO1 T-IN ×2, 120 min → 240 · Mon A: WO2 T-EX ×3, 60 min → 180
// Mon O: WO4 T-IN ×3, 225 in-shift min (18:00–21:45) → 675 · Tue M: WO3 no team, 60 min → 60
function manBoard() {
  return makeBoard({
    work_centers: [wc(1, 'WC-WELD')],
    lines: [line(11, 1, 1)],
    teams: [team(7, 'T-IN'), team(8, 'T-EX', { team_type: 'external' }), team(9, 'T-OLD', { active: false })],
    work_orders: [
      wo(1, 100, { team_id: 7, team_headcount: 2 }),
      wo(2, 100, { team_id: 8, team_headcount: 3 }),
      wo(3, 100),
      wo(4, 100, { team_id: 7, team_headcount: 3 }),
    ],
    ops: [
      op(1, 11, `${MON}T08:30`, `${MON}T10:30`),
      op(2, 11, `${MON}T13:00`, `${MON}T14:00`),
      op(4, 11, `${MON}T18:00`, `${MON}T22:00`),
      op(3, 11, `${TUE}T08:30`, `${TUE}T09:30`),
    ],
  })
}

describe('manCard', () => {
  it('shows internal crew util % per shift when the internal crew is known', () => {
    const { ix, ops, ax } = setup(manBoard())
    // only active internal teams count: 2 operators of T-IN (T-EX's 5 and T-OLD's 3 are not internal crew)
    const c = manCard(ix, ops, ax, [
      { team_id: 7, active_operators: 2 },
      { team_id: 8, active_operators: 5 },
      { team_id: 9, active_operators: 3 },
    ])
    expect(c.tag).toBe('internal crew util %/shift')
    expect(chips(c)).toEqual([
      ['1 internal teams', ''],
      ['1 external teams', ''],
      ['2 internal operators', 'ok'],
      ['1 WO ไม่มีทีม', 'warn'],
    ])
    expect(c.chart!.map((d) => d.day)).toEqual([MON, TUE])
    expect(c.chart!.every((d) => d.bars.length === 3)).toBe(true)
    // Mon M 240 ÷ (210 × 2) · Mon O 675 ÷ (225 × 2) = 150 % → red
    const m = barAt(c, `${MON}|M`)
    expect(m.value).toBeCloseTo((240 / 420) * 100, 9)
    expect(m.heightPx).toBeCloseTo((240 / 420) * 62, 9)
    expect(m.fill).toBe(FOURM_COLOR.shift)
    expect(m.title).toBe(`${dShort(MON)} เช้า: 57%`)
    const o = barAt(c, `${MON}|O`)
    expect(o.value).toBeCloseTo(150, 9)
    expect(o.heightPx).toBe(62)
    expect(o.fill).toBe(FOURM_COLOR.over)
    // external / no-team demand is not internal load; an idle OT bar keeps the OT colour at 1 px
    expect(barAt(c, `${MON}|A`).value).toBe(0)
    expect(barAt(c, `${TUE}|M`).value).toBe(0)
    expect(barAt(c, `${TUE}|O`)).toMatchObject({ heightPx: 1, fill: FOURM_COLOR.ot })
    expect(c.legend.map((l) => l.label)).toEqual(['เช้า/บ่าย', 'โอที', '>100%'])
    expect(c.legendNote).toBe('internal crew util % · external 3.0 crew-h')
  })

  it('falls back to crew demand stacked by team type when there is no internal crew', () => {
    const { ix, ops, ax } = setup(manBoard())
    const c = manCard(ix, ops, ax, [
      { team_id: 8, active_operators: 5 },
      { team_id: 9, active_operators: 3 },
    ])
    expect(c.tag).toBe('crew demand/shift')
    expect(chips(c)).toEqual([
      ['1 internal teams', ''],
      ['1 external teams', ''],
      ['operators: 0', 'warn'],
      ['1 WO ไม่มีทีม', 'warn'],
    ])
    // scaled to the busiest shift (Mon O, 675 crew-min)
    expect(barAt(c, `${MON}|O`)).toMatchObject({ value: 675, heightPx: 62, fill: null, title: `${dShort(MON)} โอที: 675m` })
    expect(barAt(c, `${MON}|M`).segs).toEqual([{ label: 'internal', value: 240, color: FOURM_COLOR.shift, heightPx: (240 / 675) * 62 }])
    expect(barAt(c, `${MON}|A`).segs).toEqual([{ label: 'external', value: 180, color: FOURM_COLOR.ot, heightPx: (180 / 675) * 62 }])
    expect(barAt(c, `${TUE}|M`).segs).toEqual([{ label: 'ไม่มีทีม', value: 60, color: FOURM_COLOR.over, heightPx: (60 / 675) * 62 }])
    expect(barAt(c, `${TUE}|A`)).toMatchObject({ value: 0, heightPx: 1, segs: [] })
    expect(c.legend.map((l) => l.label)).toEqual(['internal', 'external', 'ไม่มีทีม'])
    expect(c.legendNote).toBe('crew-minutes/shift')
  })
})

// ── Machine ───────────────────────────────────────────────────────────────────
// WELD: 2 active lines (+1 inactive) · CUT: 1 line
// Mon M: WELD 210 + 180 = 390 ÷ (210 × 2) = 92.9 % · CUT 90 ÷ 210 = 42.9 % · Mon A: CUT 135 ÷ 270 = 50 %
function machineBoard() {
  return makeBoard({
    work_centers: [wc(1, 'WC-CUT'), wc(2, 'WC-WELD')],
    lines: [line(11, 1, 1), line(21, 2, 1), line(22, 2, 2), line(23, 2, 3, { active: false })],
    work_orders: [wo(1, 100), wo(2, 100), wo(3, 100), wo(4, 100)],
    ops: [
      op(1, 21, `${MON}T08:30`, `${MON}T12:00`),
      op(2, 22, `${MON}T08:30`, `${MON}T11:30`),
      op(3, 11, `${MON}T08:30`, `${MON}T10:00`),
      op(4, 11, `${MON}T13:00`, `${MON}T15:15`),
    ],
  })
}

describe('machineCard', () => {
  it('takes the busiest WC per shift: busy ÷ (shift minutes × active lines)', () => {
    const { ix, ops, ax } = setup(machineBoard())
    const c = machineCard(ix, ops, ax)
    expect(c.tag).toBe('bottleneck WC util %/shift')
    const m = barAt(c, `${MON}|M`)
    expect(m.value).toBeCloseTo((390 / 420) * 100, 9)
    expect(m.peak).toBe('WC-WELD')
    expect(m.title).toBe(`${dShort(MON)} เช้า: 93% · WC-WELD`)
    expect(barAt(c, `${MON}|A`)).toMatchObject({ value: 50, peak: 'WC-CUT' })
    expect(barAt(c, `${MON}|O`)).toMatchObject({ value: 0, peak: '', heightPx: 1 })
    expect(chips(c)).toEqual([
      ['2 WC', ''],
      ['bottleneck WELD 93%', 'warn'],
    ])
    expect(c.legendNote).toBe('busiest WC per shift · busy ÷ (shift × lines)')
  })

  it('does not warn at 90 % or below', () => {
    const b = machineBoard()
    const { ix, ops, ax } = setup({ ...b, ops: b.ops.filter((o) => o.work_order_id === 3) })
    expect(chips(machineCard(ix, ops, ax))).toEqual([
      ['1 WC', ''],
      ['bottleneck CUT 43%', ''],
    ])
  })
})

// ── Material ──────────────────────────────────────────────────────────────────
// What GET /schedule/board returns: the version's WOs + open ones — never an
// unscheduled DONE or CANCELLED WO. So MO 100's seq 10 (DONE) and MO 200's
// seq 10 (CANCELLED) are absent; only the 4M payload's first_seq_by_mo knows them.
// MO 100: cutting (seq 10) DONE → its seq-20 op draws no new steel
// MO 200: seq 10 CANCELLED → seq 20 is the first op · MO 300: seq 10 counts, seq 20 not
// MO 400: first op has no weight → skipped
function materialBoard() {
  return makeBoard({
    work_centers: [wc(1, 'WC-CUT')],
    lines: [line(11, 1, 1)],
    work_orders: [
      wo(102, 100, { sequence: 20, weight_kg: 400 }),
      wo(202, 200, { sequence: 20, weight_kg: 1200 }),
      wo(301, 300, { sequence: 10, weight_kg: 800 }),
      wo(302, 300, { sequence: 20, weight_kg: 800 }),
      wo(401, 400, { sequence: 10 }),
    ],
    ops: [
      op(102, 11, `${MON}T08:30`, `${MON}T09:30`),
      op(301, 11, `${MON}T09:30`, `${MON}T10:30`),
      op(202, 11, `${MON}T13:30`, `${MON}T14:30`),
      op(302, 11, `${TUE}T08:30`, `${TUE}T09:30`),
      op(401, 11, `${TUE}T18:00`, `${TUE}T19:00`),
    ],
  })
}

/** first_seq_by_mo of materialBoard: MO 100's first WO is seq 10 (DONE), or seq 20 once seq 10 is CANCELLED. */
const firstSeqs = (firstOf100 = 10) => [
  { mo_id: 100, first_seq: firstOf100 },
  { mo_id: 200, first_seq: 20 },
  { mo_id: 300, first_seq: 10 },
  { mo_id: 400, first_seq: 10 },
]

describe('materialCard', () => {
  it("sums the kg of each MO's first op across all its non-cancelled WOs, by start shift", () => {
    const { ix, ops, ax } = setup(materialBoard())
    const c = materialCard(ix, ops, ax, { materials: 1234, with_stock: 0, short: 3 }, firstSeqs())
    expect(c.tag).toBe('kg entering production/shift')
    expect(barAt(c, `${MON}|M`)).toMatchObject({ value: 800, fill: FOURM_COLOR.kg })
    expect(barAt(c, `${MON}|M`).heightPx).toBeCloseTo((800 / 1200) * 62, 9)
    expect(barAt(c, `${MON}|A`)).toMatchObject({ value: 1200, heightPx: 62, title: `${dShort(MON)} บ่าย: 1,200kg · 1p` })
    expect(barAt(c, `${TUE}|M`).value).toBe(0)
    expect(barAt(c, `${TUE}|O`)).toMatchObject({ value: 0, heightPx: 1, fill: FOURM_COLOR.ot })
    expect(chips(c)).toEqual([
      ['1,234 materials', ''],
      ['0 with stock', 'warn'],
      ['3 short', 'bad'],
      ['2.0 t in schedule', ''],
    ])
    expect(c.legendNote).toBe('kg entering production/shift (first op of each MO)')
    expect(c.message).toBeNull()
  })

  it('counts the next op as intake only when the earlier one is cancelled, not done', () => {
    const { ix, ops, ax } = setup(materialBoard())
    const c = materialCard(ix, ops, ax, { materials: 10, with_stock: 4, short: 0 }, firstSeqs(20))
    expect(barAt(c, `${MON}|M`)).toMatchObject({ value: 1200, title: `${dShort(MON)} เช้า: 1,200kg · 2p` })
    expect(chips(c)).toEqual([
      ['10 materials', ''],
      ['4 with stock', ''],
      ['0 short', 'ok'],
      ['2.4 t in schedule', ''],
    ])
  })

  it("falls back to the board's non-cancelled WOs for MOs the payload doesn't cover", () => {
    // a scheduled CANCELLED WO is on the board but never anyone's first op
    const b = materialBoard()
    const board = { ...b, work_orders: [...b.work_orders, wo(299, 200, { sequence: 5, status: 'CANCELLED', weight_kg: 999 })] }
    const { ix, ops, ax } = setup({ ...board, ops: [...board.ops, op(299, 11, `${TUE}T13:00`, `${TUE}T14:00`)] })
    // no payload (older backend): MO 100's DONE seq 10 is unknown, so its seq-20 op counts
    let c = materialCard(ix, ops, ax, { materials: 10, with_stock: 4, short: 0 })
    expect(barAt(c, `${MON}|M`).value).toBe(1200)
    expect(barAt(c, `${TUE}|A`).value).toBe(0)
    expect(c.chips.at(-1)!.text).toBe('2.4 t in schedule')
    // MO 100 covered, the rest from the board → same as the full payload
    c = materialCard(ix, ops, ax, { materials: 10, with_stock: 4, short: 0 }, [{ mo_id: 100, first_seq: 10 }])
    expect(barAt(c, `${MON}|M`).value).toBe(800)
    expect(c.chips.at(-1)!.text).toBe('2.0 t in schedule')
  })

  it('says weights are missing when no scheduled WO has one', () => {
    const { ix, ops, ax } = setup(
      makeBoard({ work_centers: [wc(1, 'WC-CUT')], lines: [line(11, 1, 1)], work_orders: [wo(1, 100)], ops: [op(1, 11, `${MON}T08:30`, `${MON}T09:30`)] }),
    )
    const c = materialCard(ix, ops, ax, { materials: 10, with_stock: 4, short: 0 })
    expect(c.chart).toBeNull()
    expect(c.message).toBe(FOURM_TEXT.noWeights)
    expect(c.chips.at(-1)!.text).toBe('0.0 t in schedule')
  })
})

// ── Method ────────────────────────────────────────────────────────────────────
function methodBoard(labels: Array<string | null>, minutes: (i: number) => number = () => 60) {
  return makeBoard({
    work_centers: [wc(1, 'WC-CUT')],
    lines: [line(11, 1, 1)],
    work_orders: labels.map((l, i) => wo(i + 1, 100, { op_label: l })),
    ops: labels.map((_, i) => ({
      work_order_id: i + 1,
      workcenter_line_id: 11,
      start: iso(`${MON}T08:30`),
      end: new Date(bkk(`${MON}T08:30`) + minutes(i) * 60_000).toISOString(),
    })),
  })
}

describe('methodCard', () => {
  it('reports op-type count and label coverage', () => {
    let s = setup(methodBoard(['Cutting', 'Welding', null]))
    expect(chips(methodCard(s.ix, s.ops, s.ax))).toEqual([
      ['3 op-types', ''],
      ['coverage 67%', 'warn'],
    ])
    s = setup(methodBoard(['Cutting', 'Welding', 'Cutting']))
    expect(chips(methodCard(s.ix, s.ops, s.ax))).toEqual([
      ['2 op-types', ''],
      ['coverage 100%', 'ok'],
    ])
  })

  it("stacks the top 6 op labels and folds the rest into '?'", () => {
    const labels = ['Cutting', 'Drilling', 'Fit-up', 'Welding', 'Blasting', 'Painting', 'Grinding', 'Marking']
    const { ix, ops, ax } = setup(methodBoard(labels, (i) => 80 - 10 * i))
    const c = methodCard(ix, ops, ax)
    const m = barAt(c, `${MON}|M`)
    expect(m).toMatchObject({ value: 360, heightPx: 62, fill: null, title: `${dShort(MON)} เช้า: 360m` })
    expect(m.segs.map((x) => [x.label, x.value, x.color])).toEqual([
      ['Cutting', 80, FAMILY_COLOR.cut],
      ['Drilling', 70, FAMILY_COLOR.mach],
      ['Fit-up', 60, FAMILY_COLOR.fit],
      ['Welding', 50, FAMILY_COLOR.weld],
      ['Blasting', 40, FAMILY_COLOR.blast],
      ['Painting', 30, FAMILY_COLOR.paint],
      ['?', 30, FAMILY_COLOR.mach],
    ])
    expect(m.segs[0].heightPx).toBeCloseTo((80 / 360) * 62, 9)
    expect(c.legend.map((l) => l.label)).toEqual(labels.slice(0, 6))
    expect(c.legendNote).toBe('op-type min/shift')
  })
})

// ── WIP / Storage ─────────────────────────────────────────────────────────────
function wipAxis() {
  return setup(
    makeBoard({
      work_centers: [wc(1, 'WC-CUT')],
      lines: [line(11, 1, 1)],
      work_orders: [wo(1, 100), wo(2, 100)],
      ops: [op(1, 11, `${MON}T08:30`, `${MON}T10:00`), op(2, 11, `${TUE}T09:00`, `${TUE}T11:00`)],
    }),
  ).ax
}

const row = (storage_code: string, local: string, area_pct: number | null): FourMWipRow => ({ storage_code, t: iso(local), area_pct })

describe('wipCard', () => {
  it('asks for the migration when the wip_balance view is missing', () => {
    const c = wipCard(wipAxis(), { status: 'view_missing', rows: [] })
    expect(chips(c)).toEqual([['ยังไม่มี view wip_balance', 'bad']])
    expect(c.chart).toBeNull()
    expect(c.message).toContain('apply migration 20261003000000')
  })

  it('warns when the version has no WIP rows', () => {
    const c = wipCard(wipAxis(), { status: 'ok', rows: [] })
    expect(chips(c)).toEqual([['0 rows for this version', 'warn']])
    expect(c.chart).toBeNull()
    expect(c.message).toBe(FOURM_TEXT.wipEmpty)
  })

  it("carries each buffer's last level into later shifts and flags overflow", () => {
    // ordered by storage_code, t — as the API sends them
    const c = wipCard(wipAxis(), {
      status: 'ok',
      rows: [
        row('STG-A', `${MON}T09:00`, 80),
        row('STG-A', `${TUE}T10:00`, 20),
        row('STG-B', `${MON}T14:00`, 130),
        row('STG-B', `${MON}T15:00`, 40),
      ],
    })
    expect(bars(c).map((b) => [b.key, b.value, b.peak])).toEqual([
      [`${MON}|M`, 80, 'STG-A'],
      [`${MON}|A`, 130, 'STG-B'],
      [`${MON}|O`, 80, 'STG-A'], // no event in the shift — A's level carries
      [`${TUE}|M`, 80, 'STG-A'], // A held 80 until it dropped to 20 at 10:00
      [`${TUE}|A`, 40, 'STG-B'],
      [`${TUE}|O`, 40, 'STG-B'],
    ])
    expect(barAt(c, `${MON}|A`)).toMatchObject({ heightPx: 62, fill: FOURM_COLOR.over })
    const o = barAt(c, `${MON}|O`)
    expect(o.fill).toBe(FOURM_COLOR.ot)
    expect(o.heightPx).toBeCloseTo((80 / 130) * 62, 9)
    expect(o.title).toBe(`${dShort(MON)} โอที: 80% (A)`)
    expect(chips(c)).toEqual([
      ['2 buffers', ''],
      ['1 overflow: B', 'bad'],
    ])
    expect(c.legendNote).toBe('worst-buffer area% · 0–130%')
  })

  it('takes levels set before the axis, reads a null area as 0, and scales to at least 120 %', () => {
    const c = wipCard(wipAxis(), {
      status: 'ok',
      rows: [row('STG-C', '2026-10-04T10:00', 50), row('STG-C', `${MON}T13:00`, null)],
    })
    expect(bars(c).map((b) => b.value)).toEqual([50, 50, 0, 0, 0, 0])
    expect(barAt(c, `${MON}|O`).peak).toBe('')
    expect(barAt(c, `${MON}|M`).heightPx).toBeCloseTo((50 / 120) * 62, 9)
    expect(chips(c)).toEqual([
      ['1 buffers', ''],
      ['no overflow', 'ok'],
    ])
    expect(c.legendNote).toBe('worst-buffer area% · 0–120%')
  })
})

// ── panel ─────────────────────────────────────────────────────────────────────
describe('fourMView', () => {
  it('is loading until 4M data of the board version is in', () => {
    const ix = indexBoard(machineBoard())
    const ops = buildOps(ix)
    expect(fourMView(ix, ops, undefined)).toEqual({ state: 'loading', text: FOURM_TEXT.loading })
    expect(fourMView(ix, ops, fourm({ version_id: 2 }))).toEqual({ state: 'loading', text: FOURM_TEXT.loading })
  })

  it('is empty when the version has no ops', () => {
    const ix = indexBoard(makeBoard())
    expect(fourMView(ix, [], fourm())).toEqual({ state: 'empty', text: FOURM_TEXT.empty })
  })

  it('builds the five cards over the working days of the scheduled span', () => {
    const ix = indexBoard(materialBoard())
    const v = fourMView(ix, buildOps(ix), fourm({ first_seq_by_mo: firstSeqs() }))
    expect(v.state).toBe('ready')
    if (v.state !== 'ready') return
    expect(v.cards.map((c) => c.key)).toEqual(['man', 'machine', 'material', 'method', 'wip'])
    for (const c of v.cards.slice(0, 4)) expect(c.chart!.map((d) => d.day)).toEqual([MON, TUE])
    // the payload's first sequences reach the Material card (MO 100's DONE cutting)
    expect(v.cards[2].chips.at(-1)!.text).toBe('2.0 t in schedule')
    expect(v.cards[4].message).toBe(FOURM_TEXT.wipEmpty)
  })
})
