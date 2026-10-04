import type {
  BoardLine,
  BoardMo,
  BoardTeam,
  BoardVersion,
  BoardWorkCenter,
  BoardWorkOrder,
  ScheduleBoard,
} from '../../api/schedule'
import { byFamily, opColor, type OpFamily } from './colors'
import { parseMs } from './time'

// Board → lookups + scheduled ops (port of prod-scheduler.html load() / ops() /
// lines()). Build once per board with indexBoard() and pass the index around.

export interface BoardIndex {
  board: ScheduleBoard
  woById: Map<number, BoardWorkOrder>
  moById: Map<number, BoardMo>
  wcById: Map<number, BoardWorkCenter>
  lineById: Map<number, BoardLine>
  teamById: Map<number, BoardTeam>
  holidays: ReadonlySet<string>
  /** The version the board's ops belong to. */
  version: BoardVersion | null
}

const byId = <T extends { id: number }>(rows: T[]): Map<number, T> => new Map(rows.map((r) => [r.id, r]))

export function indexBoard(board: ScheduleBoard): BoardIndex {
  return {
    board,
    woById: byId(board.work_orders),
    moById: byId(board.mos),
    wcById: byId(board.work_centers),
    lineById: byId(board.lines),
    teamById: byId(board.teams),
    holidays: new Set(board.holidays),
    version: board.versions.find((v) => v.id === board.version_id) ?? null,
  }
}

/** Versions the switcher offers: those that have schedule rows (contract order, newest first). */
export function usableVersions(board: ScheduleBoard): BoardVersion[] {
  return board.versions.filter((v) => v.row_count > 0)
}

const VERSION_NAMES: Record<string, string> = {
  'EVENTBASED-V1': 'Event-based (forward)',
  'BACKWARD-V1': 'Backward (ALAP)',
}

/** Switcher label; ★ marks the active version. */
export function versionLabel(v: Pick<BoardVersion, 'version_code' | 'is_active'>): string {
  return (v.is_active ? '★ ' : '') + (VERSION_NAMES[v.version_code] ?? v.version_code)
}

/** One scheduled op (a prod_schedule row joined to its WO / MO / line / WC / team). */
export interface SchedOp {
  /** work_order_id — bars, selection and tooltips key on it. */
  uid: number
  wo: BoardWorkOrder | null
  mo: BoardMo | null
  line: BoardLine | null
  wc: BoardWorkCenter | null
  status: string
  s: number
  e: number
  /** The WO's own plan_finish (shown in the detail). */
  due: number | null
  /** The MO's plan_finish — lateness and due diamonds use this one. */
  moDue: number | null
  /** Order-level lateness, see buildOps(). */
  late: boolean
  /** Display mark: first assembly mark (+N more), else the wo_code. */
  mark: string
  marks: string[]
  team: BoardTeam | null
  headcount: number
  /** expected_duration_min (work minutes). */
  dur: number
  setup: number
  opLabel: string | null
  color: OpFamily
}

/**
 * Ops of the board's version. A version is a snapshot: WOs cancelled since the
 * run are dropped. One lateness rule everywhere (as in the mockup): an order is
 * late when its last not-yet-DONE op ends after the MO's plan_finish, and every
 * open op of that order is flagged.
 */
export function buildOps(ix: BoardIndex): SchedOp[] {
  const R: SchedOp[] = []
  for (const p of ix.board.ops) {
    const w = ix.woById.get(p.work_order_id) ?? null
    if (w?.status === 'CANCELLED') continue
    const line = p.workcenter_line_id != null ? ix.lineById.get(p.workcenter_line_id) ?? null : null
    const wc = line ? ix.wcById.get(line.workcenter_id) ?? null : null
    const mo = w ? ix.moById.get(w.mo_id) ?? null : null
    const marks = w?.marks ?? []
    // multi-mark WO → "TC-CO1 +2"
    const mark = marks.length ? marks[0] + (marks.length > 1 ? ` +${marks.length - 1}` : '') : w?.wo_code ?? ''
    const opLabel = w?.op_label ?? null
    R.push({
      uid: p.work_order_id,
      wo: w,
      mo,
      line,
      wc,
      status: w?.status ?? '',
      s: Date.parse(p.start),
      e: Date.parse(p.end),
      due: parseMs(w?.plan_finish),
      moDue: parseMs(mo?.plan_finish),
      late: false,
      mark,
      marks,
      team: w?.team_id != null ? ix.teamById.get(w.team_id) ?? null : null,
      headcount: Number(w?.team_headcount) || 0,
      dur: Number(w?.expected_duration_min) || 0,
      setup: Number(w?.setup_time_min) || 0,
      opLabel,
      color: opColor(opLabel, wc?.code),
    })
  }
  const lastOpen = new Map<number, number>()
  for (const o of R) {
    if (o.mo && o.status !== 'DONE') lastOpen.set(o.mo.id, Math.max(lastOpen.get(o.mo.id) ?? 0, o.e))
  }
  for (const o of R) {
    const f = o.moDue
    o.late = !!(f && o.mo && (lastOpen.get(o.mo.id) ?? 0) > f) && o.status !== 'DONE'
  }
  return R
}

/** Active lines of active work centers, WC by process family then line_no (Gantt row order). */
export function activeLines(ix: BoardIndex): BoardLine[] {
  return ix.board.lines
    .filter((l) => l.active && ix.wcById.get(l.workcenter_id)?.active)
    .sort((a, b) => byFamily(ix.wcById.get(a.workcenter_id)!.code, ix.wcById.get(b.workcenter_id)!.code) || a.line_no - b.line_no)
}

/** Number of active lines of a work center (capacity multiplier). */
export function linesOfWC(ix: BoardIndex, wcId: number): number {
  let n = 0
  for (const l of ix.board.lines) if (l.active && l.workcenter_id === wcId) n++
  return n
}

/** "WC-PAINT" → "PAINT". */
export const shortWc = (code: string | null | undefined): string => (code || '').replace('WC-', '')
