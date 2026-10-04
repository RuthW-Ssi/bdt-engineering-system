import { AxiosError, type AxiosResponse } from 'axios'
import { buildOps, indexBoard } from './model'
import { RUN_IN_PROGRESS_MESSAGE, SCHEDULER_TIMEOUT_HINT, describeScheduleError } from './runError'
import { backlog, footSummary, headerInfo, kpis, opDetail, opTooltip, orderList } from './summary'
import { bkk, iso, line, makeBoard, mo, op, team, version, wc, wo } from './testBoard'

const NOW = bkk('2026-10-05T07:00')

// MO 100 scheduled + late · MO 200 scheduled on time · MO 300 / 400 backlog · MO 500 running outside the version
function board() {
  const planned = { plan_start: iso('2026-10-01T08:00'), plan_finish: iso('2026-10-20T17:00') }
  return makeBoard({
    work_centers: [wc(1, 'WC-CUT'), wc(2, 'WC-WELD')],
    lines: [line(11, 1, 1), line(21, 2, 1)],
    mos: [
      mo(100, '2026-10-06T12:00'),
      mo(200, '2026-10-09T17:00'),
      mo(300, '2026-10-06T17:00', { primary_mark_prefix_code: 'TC' }),
      mo(400, '2026-10-20T17:00'),
      mo(500, '2026-10-30T17:00'),
    ],
    teams: [team(7, 'T-A')],
    work_orders: [
      wo(1, 100, { op_label: 'Cutting', marks: ['TC-CO1', 'TC-CO2'], team_id: 7, team_headcount: 2, weight_kg: 1234.4, plan_start: iso('2026-10-01T08:00'), plan_finish: iso('2026-10-05T17:00') }),
      wo(2, 100, { ...planned, op_label: 'Weld' }),
      wo(3, 200, { op_label: 'Cutting', status: 'DONE' }),
      // backlog of MO 300: two schedulable WOs (out of sequence order) + one missing its dates
      wo(31, 300, { ...planned, sequence: 20, op_label: 'Weld', expected_duration_min: 90 }),
      wo(30, 300, { ...planned, sequence: 10, op_label: 'Cutting', expected_duration_min: 120, status: 'NOT_STARTED' }),
      wo(32, 300, { sequence: 30, op_label: 'Paint' }),
      wo(40, 400, { ...planned, op_label: null, expected_duration_min: 30 }),
      wo(41, 400, { ...planned, expected_duration_min: 0 }),
      wo(50, 500, { ...planned, status: 'IN_PROGRESS' }),
    ],
    ops: [
      op(1, 11, '2026-10-05T08:30', '2026-10-05T10:30'),
      op(2, 21, '2026-10-06T13:00', '2026-10-06T15:00'),
      op(3, 11, '2026-10-07T08:30', '2026-10-07T10:00'),
    ],
  })
}

describe('kpis', () => {
  it("shows '—' when the version has no ops", () => {
    const ix = indexBoard(makeBoard())
    expect(kpis(ix, buildOps(ix)).map((k) => [k.key, k.value, k.tone])).toEqual([
      ['onTime', '—', ''],
      ['late', '0', 'good'],
      ['backlog', '0', ''],
      ['finish', '—', ''],
    ])
  })

  it('counts per MO: on-time %, late MOs, backlog MOs, finish time', () => {
    const ix = indexBoard(board())
    const k = kpis(ix, buildOps(ix))
    expect(k.map((t) => [t.key, t.value, t.tone]).slice(0, 3)).toEqual([
      ['onTime', '50%', 'accent'],
      ['late', '1', 'bad'],
      ['backlog', '2', 'accent'],
    ])
    expect(k[3].value).toMatch(/07/) // Wed 07 10:00
  })
})

describe('backlog', () => {
  const ix = indexBoard(board())
  const ops = buildOps(ix)
  const view = backlog(ix, ops, NOW)

  it('groups schedulable WOs outside the version by MO, earliest due first', () => {
    expect(view.countLabel).toBe('2 รอจัด')
    expect(view.cards.map((c) => [c.moCode, c.opCount])).toEqual([
      ['MO-300', 2],
      ['MO-400', 1],
    ])
  })

  it('builds the card: prefix, Σ hours, route in sequence order, urgent due chip', () => {
    const c = view.cards[0]
    expect(c.prefix).toBe('TC')
    expect(c.sumHText).toBe('Σ 3.5h')
    expect(c.route.map((r) => [r.woId, r.letter, r.family])).toEqual([
      [30, 'C', 'cut'],
      [31, 'W', 'weld'],
    ])
    expect(c.urgent).toBe(true) // due 06-Oct 17:00 < now + 2 days
    expect(view.cards[1].urgent).toBe(false)
    expect(view.cards[1].route[0]).toMatchObject({ letter: '?', family: 'mach' })
  })

  it('notes WOs missing plan data and active WOs outside the version', () => {
    // WO 32 (no dates) and WO 41 (no duration) · WO 50 IN_PROGRESS
    expect(view.notes).toEqual(['2 WO ขาด plan date / duration — จัดไม่ได้', '1 WO กำลังผลิต / พัก / hold — ไม่อยู่ในตาราง'])
    expect(view.emptyText).toBeNull()
  })

  it('says why the list is empty', () => {
    const empty = indexBoard(makeBoard())
    expect(backlog(empty, [], NOW).emptyText).toBe('ไม่มี WO ที่พร้อมจัด')
    const b = board()
    b.work_orders = b.work_orders.filter((w) => w.mo_id < 300)
    const allIn = indexBoard(b)
    expect(backlog(allIn, buildOps(allIn), NOW)).toMatchObject({ cards: [], emptyText: 'ทุกงานถูกจัดแล้ว ✓', notes: [] })
  })
})

describe('orderList', () => {
  it('lists MOs in the version or still open by due date, with first op and status meta', () => {
    const ix = indexBoard(board())
    const rows = orderList(ix, buildOps(ix))
    expect(rows.map((r) => [r.mo.mo_code, r.firstOp?.uid ?? null, r.meta.startsWith('ส่ง ') ? 'ส่ง' : r.meta])).toEqual([
      ['MO-100', 1, 'สาย'],
      ['MO-300', null, 'รอจัด'],
      ['MO-200', 3, 'ส่ง'],
      ['MO-400', null, 'รอจัด'],
      ['MO-500', null, 'กำลังผลิต'],
    ])
    expect(rows[0].dotColor).toBe('#dc2626')
    expect(rows[1].dotColor).toBe('#e8590c')
    expect(rows[2].dotColor).toBe('#9aa3ad')
  })
})

describe('detail / tooltip / footer / header', () => {
  const ix = indexBoard(board())
  const ops = buildOps(ix)
  const o = ops.find((x) => x.uid === 1)!

  it('details the WO: marks, op, team · type · headcount, kg, WC, line, dates, duration', () => {
    const d = opDetail(o)
    expect(d.title).toBe('TC-CO1 +1')
    expect(d.subtitle).toBe('WO-1')
    expect(d.pill).toBe('สาย (LATE)')
    const row = (label: string) => d.rows.find((r) => r.label === label)?.value
    expect(row('Assembly marks')).toBe('TC-CO1, TC-CO2')
    expect(row('Operation')).toBe('Cutting')
    expect(row('Team')).toBe('T-A team · internal · 2 คน')
    expect(row('น้ำหนักชิ้นงาน')).toBe('1,234 kg')
    expect(row('Work Center')).toBe('WC-CUT name')
    expect(row('Line')).toBe('L1')
    expect(row('ระยะเวลา')).toBe('60 นาที')
    expect(row('WO / MO')).toBe('WO-1 · MO-100')
    expect(row('WO plan finish')).not.toBe('—')
    const plain = opDetail(ops.find((x) => x.uid === 2)!)
    expect(plain.rows.find((r) => r.label === 'Team')?.value).toBe('— (ยังไม่มีทีม)')
    expect(plain.rows.some((r) => r.label === 'น้ำหนักชิ้นงาน')).toBe(false)
  })

  it('builds the tooltip and footer', () => {
    expect(opTooltip(o)).toMatchObject({ title: 'TC-CO1 +1 · Cutting', late: true })
    expect(opTooltip(o).lines[0]).toBe('WC-CUT name · L1 · T-A ×2')
    expect(opTooltip(o).lines[1]).toMatch(/\(60m\)$/)
    expect(footSummary(ops, 2, ix.version)).toEqual([
      '⚠ 2 op อยู่บน line ที่ปิดใช้ / ไม่มี line — ไม่แสดงบน Gantt',
      'Version: V1 · operations: 3 · assembly สาย: TC-CO1 +1, WO-2',
      'read-only view · คลิก ▾ ที่ Work Center เพื่อย่อ/ขยาย · drag-drop edit = งานถัดไป',
    ])
    expect(headerInfo(version(1, { scheduler_source: 'python-aps', description: 'EDD run' }))).toEqual({ badge: 'PYTHON-APS', sub: 'finite-capacity · EDD run' })
    expect(headerInfo(null).badge).toBe('LIVE')
  })
})

describe('describeScheduleError', () => {
  const axiosErr = (status: number, data: unknown) =>
    new AxiosError('fail', 'ERR_BAD_RESPONSE', undefined, undefined, { status, data } as AxiosResponse)

  it('maps 409 to the run-in-progress message', () => {
    expect(describeScheduleError(axiosErr(409, { message: 'A scheduler run is in progress' }))).toEqual({ message: RUN_IN_PROGRESS_MESSAGE, reasons: [] })
  })

  it('keeps the 422 data_not_ready reasons', () => {
    expect(describeScheduleError(axiosErr(422, { message: 'Scheduler input data is not ready', reasons: ['3 WO without line', 42] }))).toEqual({
      message: 'Scheduler input data is not ready',
      reasons: ['3 WO without line'],
    })
  })

  it('adds the "may still finish" hint to a 504', () => {
    expect(describeScheduleError(axiosErr(504, { message: 'Scheduler timed out' }))).toEqual({
      message: `Scheduler timed out · ${SCHEDULER_TIMEOUT_HINT}`,
      reasons: [],
    })
  })

  it('falls back to getErrorMessage for anything else', () => {
    expect(describeScheduleError(axiosErr(500, {}), 'x').message).toBe('Server error. Please try again later.')
    expect(describeScheduleError(new Error('boom'), 'คำนวณไม่สำเร็จ')).toEqual({ message: 'คำนวณไม่สำเร็จ', reasons: [] })
  })
})
