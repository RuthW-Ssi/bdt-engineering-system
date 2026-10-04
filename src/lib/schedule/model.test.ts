import { buildAxis } from './axis'
import { FAMILY_COLOR } from './colors'
import { barViews, dueMarkers, hiddenOpCount, idleWcIds, layoutRows, wcGroups } from './gantt'
import { activeLines, buildOps, indexBoard, usableVersions, versionLabel } from './model'
import { bkk, line, makeBoard, mo, op, team, version, wc, wo } from './testBoard'

// MO 100 due Tue 06 12:00 · MO 200 due Fri 09 17:00
function board() {
  return makeBoard({
    versions: [version(3, { row_count: 0 }), version(2, { is_active: true, version_code: 'EVENTBASED-V1' }), version(1)],
    version_id: 2,
    work_centers: [wc(1, 'WC-CUT'), wc(2, 'WC-WELD'), wc(3, 'WC-SURFACE'), wc(4, 'WC-DRILL'), wc(5, 'WC-OLD', { active: false })],
    lines: [
      line(22, 2, 2),
      line(21, 2, 1),
      line(11, 1, 1),
      line(31, 3, 1),
      line(41, 4, 1),
      line(23, 2, 3, { active: false }),
      line(51, 5, 1),
    ],
    mos: [mo(100, '2026-10-06T12:00'), mo(200, '2026-10-09T17:00')],
    teams: [team(7, 'T-A', { team_type: 'external' })],
    work_orders: [
      wo(1, 100, { op_label: 'Cutting', marks: ['TC-CO1', 'TC-CO2', 'TC-CO3'], team_id: 7, team_headcount: 3 }),
      wo(2, 100, { op_label: 'Weld', setup_time_min: 15 }),
      wo(3, 200, { op_label: 'Cutting' }),
      wo(4, 200, { op_label: 'Primer', status: 'DONE' }),
      wo(5, 200, { status: 'CANCELLED' }),
      wo(6, 200, { op_label: null, status: 'ON_HOLD' }),
    ],
    ops: [
      op(1, 11, '2026-10-05T08:30', '2026-10-05T10:30'),
      op(2, 21, '2026-10-06T13:00', '2026-10-06T15:00'), // ends after MO 100's due → MO 100 late
      op(3, 11, '2026-10-07T08:30', '2026-10-07T10:00'),
      op(4, 31, '2026-10-12T08:30', '2026-10-12T10:00'), // DONE, after MO 200's due → ignored
      op(5, 22, '2026-10-07T08:30', '2026-10-07T10:00'), // CANCELLED → dropped
      op(6, 23, '2026-10-08T08:30', '2026-10-08T10:00'), // inactive line → hidden
    ],
  })
}

describe('buildOps', () => {
  const ix = indexBoard(board())
  const ops = buildOps(ix)
  const byWo = (id: number) => ops.find((o) => o.uid === id)!

  it('drops CANCELLED WOs', () => {
    expect(ops.map((o) => o.uid)).toEqual([1, 2, 3, 4, 6])
  })

  it('flags every open op of an MO whose last open op ends after its plan_finish', () => {
    expect(byWo(1).late).toBe(true) // finished on time itself, but its order is late
    expect(byWo(2).late).toBe(true)
  })

  it('ignores DONE ops for lateness and never flags them', () => {
    expect(byWo(4).late).toBe(false)
    expect(byWo(3).late).toBe(false)
    expect(byWo(6).late).toBe(false)
  })

  it('flags open ops but not the DONE op of a late MO', () => {
    const b = board()
    b.ops = b.ops.map((p) => (p.work_order_id === 6 ? op(6, 23, '2026-10-10T08:30', '2026-10-10T10:00') : p))
    const late = buildOps(indexBoard(b))
    expect(late.filter((o) => o.mo?.id === 200).map((o) => [o.uid, o.late])).toEqual([[3, true], [4, false], [6, true]])
  })

  it('joins mark, team, line, WC, colours and dates', () => {
    const o = byWo(1)
    expect(o.mark).toBe('TC-CO1 +2')
    expect(byWo(3).mark).toBe('WO-3')
    expect(o.team?.code).toBe('T-A')
    expect(o.headcount).toBe(3)
    expect(o.wc?.code).toBe('WC-CUT')
    expect(o.color).toBe('cut')
    expect(byWo(4).color).toBe('paint') // Primer
    expect(byWo(6).color).toBe('weld') // no label → its WC
    expect(o.moDue).toBe(bkk('2026-10-06T12:00'))
    expect(o.s).toBe(bkk('2026-10-05T08:30'))
  })
})

describe('versions', () => {
  it('offers only versions with rows and stars the active one', () => {
    const b = board()
    expect(usableVersions(b).map((v) => v.id)).toEqual([2, 1])
    expect(versionLabel(b.versions[1])).toBe('★ Event-based (forward)')
    expect(versionLabel(b.versions[2])).toBe('V1')
    expect(indexBoard(b).version?.id).toBe(2)
  })
})

describe('Gantt layout', () => {
  const ix = indexBoard(board())
  const ops = buildOps(ix)
  const lines = activeLines(ix)
  const groups = wcGroups(ix, lines, ops)

  it('orders active lines by process family, then line_no', () => {
    expect(lines.map((l) => l.id)).toEqual([11, 41, 21, 22, 31])
    expect(groups.map((g) => [g.code, g.countLabel])).toEqual([
      ['CUT', '1L · 2 op'],
      ['DRILL', '1L'],
      ['WELD', '2L · 2 op'],
      ['SURFACE', '1L · 1 op'],
    ])
  })

  it('auto-collapses idle WCs and lays out header + line rows', () => {
    const collapsed = idleWcIds(groups, ops)
    expect([...collapsed]).toEqual([4])
    const lay = layoutRows(groups, collapsed)
    expect(lay.rows.map((r) => r.kind)).toEqual(['wc', 'line', 'wc', 'wc', 'line', 'line', 'wc', 'line'])
    expect(lay.rowY.get(11)).toBe(24)
    expect(lay.rowY.has(41)).toBe(false)
    expect(lay.rowY.get(21)).toBe(24 + 40 + 24 + 24)
    expect(lay.height).toBe(4 * 24 + 4 * 40)
    expect(hiddenOpCount(ops, lay.rowY, collapsed)).toBe(1) // WO 6 on the inactive line
  })

  it('draws bars with late outline, late-only dim, held dim, selection and setup strip', () => {
    const axis = buildAxis(ops, ix.holidays, 22)
    const { rowY } = layoutRows(groups, new Set())
    const bars = barViews(ops, axis, rowY, { lateOnly: false, selUid: 2 })
    expect(bars.map((b) => b.uid)).toEqual([1, 2, 3, 4])
    const b2 = bars.find((b) => b.uid === 2)!
    expect(b2).toMatchObject({ late: true, selected: true, setup: true, dim: false, held: false, color: FAMILY_COLOR.weld })
    expect(b2.top).toBe(rowY.get(21)! + 8)
    expect(b2.width).toBeCloseTo(2 * 22, 6)
    expect(b2.label).toBe('WO-2 · Weld')
    expect(bars.find((b) => b.uid === 4)!.held).toBe(true)
    const dimmed = barViews(ops, axis, rowY, { lateOnly: true, selUid: null })
    expect(dimmed.find((b) => b.uid === 4)).toMatchObject({ dim: true, held: false })
    expect(dimmed.find((b) => b.uid === 1)!.dim).toBe(false)
  })

  it('puts one due diamond per MO, red when late, pinned with ◂ / ▸ off the axis', () => {
    const axis = buildAxis(ops, ix.holidays, 22)
    const due = dueMarkers(ops, axis)
    expect(due.map((d) => [d.code, d.late, d.edge])).toEqual([
      ['MO-100', true, ''],
      ['MO-200', false, ''],
    ])
    const narrow = buildAxis(ops.filter((o) => o.mo?.id === 100), ix.holidays, 22)
    const off = dueMarkers([{ ...ops[0], moDue: bkk('2026-11-30T17:00') }], narrow)
    expect(off[0].edge).toBe('▸ ')
    expect(off[0].left).toBe(narrow.totalW - 30)
  })
})
