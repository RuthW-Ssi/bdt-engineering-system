import type { BoardLine, BoardWorkCenter } from '../../api/schedule'
import { type Axis, X } from './axis'
import { FAMILY_COLOR, wcColor, type OpFamily } from './colors'
import { shortWc, type BoardIndex, type SchedOp } from './model'
import { fmt } from './time'

// Resource Gantt layout (port of the tree / bars / due-lane part of
// prod-scheduler.html render()): WC header rows (collapsible) + one row per
// visible line, bars positioned absolutely on the Axis.

export const GANTT = {
  /** WC header row height. */
  wcRowH: 24,
  /** Line row height. */
  lineRowH: 40,
  /** Bar offset inside its line row, and bar height. */
  barTop: 8,
  barH: 24,
  barMinW: 7,
  /** Bars narrower than this carry no label. */
  labelMinW: 40,
  /** Due diamonds stay this far from either edge. */
  dueEdge: 30,
} as const

/** WO statuses whose bars are dimmed: the status changed after the run. */
export const HELD_STATUSES: ReadonlySet<string> = new Set(['DONE', 'ON_HOLD', 'PAUSED'])

export interface WcGroup {
  wcId: number
  wc: BoardWorkCenter
  /** "WC-PAINT" → "PAINT". */
  code: string
  family: OpFamily
  lines: BoardLine[]
  /** Ops of this version on the WC (any line). */
  opCount: number
  /** Header counter, e.g. "2L · 5 op". */
  countLabel: string
}

/** Group the ordered active lines by work center, keeping the order of first appearance. */
export function wcGroups(ix: BoardIndex, lines: readonly BoardLine[], ops: readonly SchedOp[]): WcGroup[] {
  const opsPerWc = new Map<number, number>()
  for (const o of ops) if (o.line) opsPerWc.set(o.line.workcenter_id, (opsPerWc.get(o.line.workcenter_id) ?? 0) + 1)
  const groups = new Map<number, WcGroup>()
  for (const l of lines) {
    let g = groups.get(l.workcenter_id)
    if (!g) {
      const wc = ix.wcById.get(l.workcenter_id)!
      g = { wcId: wc.id, wc, code: shortWc(wc.code), family: wcColor(wc.code), lines: [], opCount: opsPerWc.get(wc.id) ?? 0, countLabel: '' }
      groups.set(l.workcenter_id, g)
    }
    g.lines.push(l)
  }
  for (const g of groups.values()) g.countLabel = `${g.lines.length}L${g.opCount ? ` · ${g.opCount} op` : ''}`
  return [...groups.values()]
}

/** Per version / reload: collapse every WC without ops (user toggles stick until the next one). */
export function idleWcIds(groups: readonly WcGroup[], ops: readonly SchedOp[]): Set<number> {
  const busy = new Set<number>()
  for (const o of ops) if (o.line) busy.add(o.line.workcenter_id)
  return new Set(groups.filter((g) => !busy.has(g.wcId)).map((g) => g.wcId))
}

export type GanttRow =
  | { kind: 'wc'; key: string; y: number; h: number; group: WcGroup; collapsed: boolean }
  | { kind: 'line'; key: string; y: number; h: number; line: BoardLine; alt: boolean }

export interface GanttLayout {
  rows: GanttRow[]
  /** line id → y of its row (only lines of expanded WCs). */
  rowY: Map<number, number>
  height: number
}

export function layoutRows(groups: readonly WcGroup[], collapsed: ReadonlySet<number>): GanttLayout {
  const rows: GanttRow[] = []
  const rowY = new Map<number, number>()
  let y = 0
  let li = 0
  for (const g of groups) {
    const isC = collapsed.has(g.wcId)
    rows.push({ kind: 'wc', key: `wc-${g.wcId}`, y, h: GANTT.wcRowH, group: g, collapsed: isC })
    y += GANTT.wcRowH
    if (isC) continue
    for (const l of g.lines) {
      rowY.set(l.id, y)
      rows.push({ kind: 'line', key: `ln-${l.id}`, y, h: GANTT.lineRowH, line: l, alt: li++ % 2 === 1 })
      y += GANTT.lineRowH
    }
  }
  return { rows, rowY, height: y }
}

export interface BarView {
  op: SchedOp
  uid: number
  left: number
  top: number
  width: number
  color: string
  /** "mark · op" when the bar is wide enough, else null. */
  label: string | null
  late: boolean
  selected: boolean
  /** Dimmed by the late-only toggle (opacity .16). */
  dim: boolean
  /** DONE / ON_HOLD / PAUSED since the run (opacity .45) — never on top of `dim`. */
  held: boolean
  /** Draw the dark setup strip at the bar's left edge. */
  setup: boolean
}

/** Bars of the ops whose line row is visible. */
export function barViews(
  ops: readonly SchedOp[],
  axis: Axis,
  rowY: ReadonlyMap<number, number>,
  opts: { lateOnly: boolean; selUid: number | null },
): BarView[] {
  const out: BarView[] = []
  for (const o of ops) {
    const y = o.line ? rowY.get(o.line.id) : undefined
    if (y == null) continue
    const x0 = X(axis, o.s)
    const w = Math.max(GANTT.barMinW, X(axis, o.e) - x0)
    const dim = opts.lateOnly && !o.late
    out.push({
      op: o,
      uid: o.uid,
      left: x0,
      top: y + GANTT.barTop,
      width: w,
      color: FAMILY_COLOR[o.color],
      label: w > GANTT.labelMinW ? `${o.mark}${o.opLabel ? ' · ' + o.opLabel : ''}` : null,
      late: o.late,
      selected: o.uid === opts.selUid,
      dim,
      held: !dim && HELD_STATUSES.has(o.status),
      setup: o.setup > 0,
    })
  }
  return out
}

/** Ops that sit on an inactive / missing line (not just a collapsed WC) — reported in the footer. */
export function hiddenOpCount(ops: readonly SchedOp[], rowY: ReadonlyMap<number, number>, collapsed: ReadonlySet<number>): number {
  return ops.filter((o) => (o.line ? !rowY.has(o.line.id) : true) && !(o.line && collapsed.has(o.line.workcenter_id))).length
}

export interface DueMarker {
  moId: number
  code: string
  ms: number
  /** Any op of the MO is late. */
  late: boolean
  left: number
  /** '◂ ' / '▸ ' when the due date is off the axis (marker pinned to the edge), else ''. */
  edge: string
  title: string
}

/** One diamond per MO at its plan_finish, red when the order is late. */
export function dueMarkers(ops: readonly SchedOp[], axis: Axis): DueMarker[] {
  const byMo = new Map<number, { ms: number; code: string; late: boolean }>()
  for (const o of ops) {
    if (!o.mo || o.moDue == null) continue
    let r = byMo.get(o.mo.id)
    if (!r) byMo.set(o.mo.id, (r = { ms: o.moDue, code: o.mo.mo_code, late: false }))
    if (o.late) r.late = true
  }
  const a0 = axis.seg[0]?.s ?? 0
  const a1 = axis.seg.at(-1)?.e ?? 0
  return [...byMo.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([moId, m]) => ({
      moId,
      code: m.code,
      ms: m.ms,
      late: m.late,
      left: Math.max(GANTT.dueEdge, Math.min(axis.totalW - GANTT.dueEdge, X(axis, m.ms))),
      edge: m.ms < a0 ? '◂ ' : m.ms > a1 ? '▸ ' : '',
      title: `${m.code || ''} · กำหนดส่ง ${fmt(m.ms)}`,
    }))
}
