import type { BoardMo, BoardVersion, BoardWorkOrder } from '../../api/schedule'
import { LATE_COLOR, UI_COLOR, opColor, type OpFamily } from './colors'
import type { BoardIndex, SchedOp } from './model'
import { DAY, DAY_MONTH_FMT, LONG_FMT, fmt, fmtH, parseMs } from './time'

// KPI tiles, backlog, order list, detail panel, tooltip and footer of the
// Production Schedule page (port of prod-scheduler.html kpis / renderBacklog /
// orderList / detail / tip / foot). Everything is per MO, like the mockup.

/** Fixed copy of the page's empty states (same wording as the HTML page). */
export const SCHEDULE_TEXT = {
  noVersion: 'ยังไม่มี version ที่มีตาราง',
  ganttEmpty: 'ไม่มีตารางสำหรับ version นี้ — รัน scheduler แล้วกด Reload',
  heatEmpty: 'ไม่มีตาราง (prod_schedule ว่าง)',
  loadEmpty: 'ไม่มีตาราง',
  detailEmpty: 'คลิกแท่งงานเพื่อดูรายละเอียด',
} as const

// ── header ────────────────────────────────────────────────────────────────────
/** Topbar badge (scheduler source) and subtitle (version description). */
export function headerInfo(version: BoardVersion | null): { badge: string; sub: string } {
  return {
    badge: (version?.scheduler_source || 'LIVE').toUpperCase(),
    sub: 'finite-capacity · ' + (version?.description || 'live'),
  }
}

// ── backlog ───────────────────────────────────────────────────────────────────
const SCHEDULABLE = new Set(['NOT_STARTED', 'RELEASED'])
const ACTIVE = new Set(['IN_PROGRESS', 'PAUSED', 'ON_HOLD'])

/** Schedulable = what the scheduler loads (loader.py): NOT_STARTED/RELEASED, duration > 0, both plan dates. */
export function isSchedulable(w: BoardWorkOrder): boolean {
  return SCHEDULABLE.has(String(w.status)) && Number(w.expected_duration_min) > 0 && !!w.plan_start && !!w.plan_finish
}

/** Schedulable WOs that are not in this version (WO id order). */
export function backlogWOs(ix: BoardIndex, ops: readonly SchedOp[]): BoardWorkOrder[] {
  const sch = new Set(ops.map((o) => o.uid))
  return ix.board.work_orders.filter((w) => isSchedulable(w) && !sch.has(w.id)).sort((a, b) => a.id - b.id)
}

export interface RouteChip {
  woId: number
  label: string
  /** First letter of the op label ('?' when unknown). */
  letter: string
  family: OpFamily
}

export interface BacklogCard {
  moId: number
  mo: BoardMo | null
  moCode: string
  prefix: string | null
  opCount: number
  sumH: number
  sumHText: string
  due: string
  /** Due within 2 days (or past) → red chip. */
  urgent: boolean
  route: RouteChip[]
}

export interface BacklogView {
  cards: BacklogCard[]
  /** e.g. "3 รอจัด". */
  countLabel: string
  /** Shown instead of cards when there are none. */
  emptyText: string | null
  /** WOs the scheduler can't place / that are running outside the version — never silently hidden. */
  notes: string[]
}

export function backlog(ix: BoardIndex, ops: readonly SchedOp[], now: number = Date.now()): BacklogView {
  const byMo = new Map<number, BoardWorkOrder[]>()
  for (const w of backlogWOs(ix, ops)) {
    const list = byMo.get(w.mo_id)
    if (list) list.push(w)
    else byMo.set(w.mo_id, [w])
  }
  const cards = [...byMo.entries()]
    .map(([moId, ws]): BacklogCard => {
      const mo = ix.moById.get(moId) ?? null
      ws.sort((a, b) => (a.sequence || 0) - (b.sequence || 0) || a.id - b.id)
      const sumH = ws.reduce((s, w) => s + (Number(w.expected_duration_min) || 0), 0) / 60
      const f = parseMs(mo?.plan_finish)
      return {
        moId,
        mo,
        moCode: mo?.mo_code || `MO ${moId}`,
        prefix: mo?.primary_mark_prefix_code || null,
        opCount: ws.length,
        sumH,
        sumHText: `Σ ${sumH.toFixed(1)}h`,
        due: f != null ? fmt(f, DAY_MONTH_FMT) : '—',
        urgent: f != null && f < now + 2 * DAY,
        route: ws.map((w) => ({
          woId: w.id,
          label: w.op_label || '',
          letter: (w.op_label || '?').slice(0, 1),
          family: opColor(w.op_label, ''),
        })),
      }
    })
    .sort((a, b) => (parseMs(a.mo?.plan_finish) ?? Infinity) - (parseMs(b.mo?.plan_finish) ?? Infinity) || a.moId - b.moId)

  const W = ix.board.work_orders
  const sch = new Set(ops.map((o) => o.uid))
  const noPlan = W.filter((w) => SCHEDULABLE.has(String(w.status)) && !isSchedulable(w)).length
  const act = W.filter((w) => ACTIVE.has(String(w.status)) && !sch.has(w.id)).length
  const notes: string[] = []
  if (noPlan) notes.push(`${noPlan} WO ขาด plan date / duration — จัดไม่ได้`)
  if (act) notes.push(`${act} WO กำลังผลิต / พัก / hold — ไม่อยู่ในตาราง`)
  return {
    cards,
    countLabel: `${cards.length} รอจัด`,
    emptyText: cards.length ? null : ops.length ? 'ทุกงานถูกจัดแล้ว ✓' : 'ไม่มี WO ที่พร้อมจัด',
    notes,
  }
}

// ── KPI tiles ─────────────────────────────────────────────────────────────────
export type KpiTone = 'accent' | 'bad' | 'good' | ''

export interface KpiTile {
  key: 'onTime' | 'late' | 'backlog' | 'finish'
  tone: KpiTone
  value: string
  label: string
}

/** Per order (o.late is already the order's lateness). '—' when there is nothing to measure. */
export function kpis(ix: BoardIndex, ops: readonly SchedOp[]): KpiTile[] {
  const ids = new Set(ops.filter((o) => o.mo).map((o) => o.mo!.id)).size
  const late = new Set(ops.filter((o) => o.late && o.mo).map((o) => o.mo!.id)).size
  const bl = new Set(backlogWOs(ix, ops).map((w) => w.mo_id)).size
  let maxEnd: number | null = null
  for (const o of ops) if (maxEnd == null || o.e > maxEnd) maxEnd = o.e
  return [
    { key: 'onTime', tone: ids ? 'accent' : '', value: ids ? `${Math.round(((ids - late) / ids) * 100)}%` : '—', label: 'ส่งทันกำหนด' },
    { key: 'late', tone: late ? 'bad' : 'good', value: String(late), label: 'งานสาย' },
    { key: 'backlog', tone: bl ? 'accent' : '', value: String(bl), label: 'Backlog (รอจัด)' },
    { key: 'finish', tone: '', value: maxEnd != null ? fmt(maxEnd, LONG_FMT) : '—', label: 'เสร็จทั้งหมด' },
  ]
}

// ── order list ────────────────────────────────────────────────────────────────
export interface OrderRow {
  mo: BoardMo
  /** Earliest op of the MO in this version; null → not scheduled (row drawn faded, ' ·รอจัด'). */
  firstOp: SchedOp | null
  late: boolean
  /** Not in the version but has an IN_PROGRESS WO. */
  running: boolean
  dotColor: string
  meta: string
}

/** MOs in this version or still open, by plan_finish. Click → select firstOp (expand its WC, scroll to it). */
export function orderList(ix: BoardIndex, ops: readonly SchedOp[]): OrderRow[] {
  const first = new Map<number, SchedOp>()
  for (const o of [...ops].sort((a, b) => a.s - b.s)) if (o.mo && !first.has(o.mo.id)) first.set(o.mo.id, o)
  const lateMo = new Set(ops.filter((o) => o.late && o.mo).map((o) => o.mo!.id))
  const W = ix.board.work_orders
  const open = new Set(W.filter((w) => w.status !== 'DONE' && w.status !== 'CANCELLED').map((w) => w.mo_id))
  const run = new Set(W.filter((w) => w.status === 'IN_PROGRESS').map((w) => w.mo_id))
  return ix.board.mos
    .filter((m) => first.has(m.id) || open.has(m.id))
    .sort((a, b) => (parseMs(a.plan_finish) ?? Infinity) - (parseMs(b.plan_finish) ?? Infinity) || a.id - b.id)
    .map((m): OrderRow => {
      const s = first.get(m.id) ?? null
      const f = parseMs(m.plan_finish)
      const late = lateMo.has(m.id)
      const running = run.has(m.id)
      return {
        mo: m,
        firstOp: s,
        late,
        running,
        dotColor: !s ? UI_COLOR.accent : late ? LATE_COLOR.border : UI_COLOR.neutralDot,
        meta: !s ? (running ? 'กำลังผลิต' : 'รอจัด') : late ? 'สาย' : f != null ? 'ส่ง ' + fmt(f, DAY_MONTH_FMT) : '',
      }
    })
}

// ── detail panel / tooltip ────────────────────────────────────────────────────
export interface DetailRow {
  label: string
  value: string
  mono?: boolean
}

export interface OpDetail {
  title: string
  subtitle: string
  late: boolean
  pill: string
  rows: DetailRow[]
}

/** Team line: "name · internal|external · N คน". */
export function teamText(o: SchedOp): string {
  if (!o.team) return '— (ยังไม่มีทีม)'
  return `${o.team.name || o.team.code} · ${o.team.team_type === 'external' ? 'external' : 'internal'} · ${o.headcount} คน`
}

export function opDetail(o: SchedOp): OpDetail {
  const kg = o.wo?.weight_kg
  const rows: DetailRow[] = [
    { label: 'Assembly marks', value: o.marks.length ? o.marks.join(', ') : '—' },
    { label: 'Operation', value: o.opLabel || '—' },
    { label: 'Team', value: teamText(o) },
  ]
  if (kg) rows.push({ label: 'น้ำหนักชิ้นงาน', value: `${Math.round(kg).toLocaleString('en-US')} kg` })
  rows.push(
    { label: 'Work Center', value: o.wc?.name || '' },
    { label: 'Line', value: o.line ? `L${o.line.line_no}` : '—' },
    { label: 'เริ่ม', value: fmt(o.s), mono: true },
    { label: 'เสร็จ', value: fmt(o.e), mono: true },
    { label: 'ระยะเวลา', value: `${o.dur} นาที` },
    { label: 'กำหนดส่ง MO', value: o.moDue != null ? fmt(o.moDue) : '—', mono: true },
    { label: 'WO plan finish', value: o.due != null ? fmt(o.due) : '—', mono: true },
    { label: 'WO / MO', value: `${o.wo?.wo_code || ''} · ${o.mo?.mo_code || ''}` },
  )
  return {
    title: o.mark,
    subtitle: (o.marks.length ? o.wo?.wo_code : o.mo?.mo_code) || '',
    late: o.late,
    pill: o.late ? 'สาย (LATE)' : 'ตรงเวลา',
    rows,
  }
}

/** Bar tooltip: bold mark · op, then WC · line · team, then time span; `late` adds the ⚠ line. */
export function opTooltip(o: SchedOp): { title: string; lines: string[]; late: boolean } {
  return {
    title: `${o.mark}${o.opLabel ? ' · ' + o.opLabel : ''}`,
    lines: [
      `${o.wc?.name || ''} · L${o.line?.line_no ?? '?'}${o.team ? ` · ${o.team.code} ×${o.headcount}` : ''}`,
      `${fmtH(o.s)}–${fmtH(o.e)} (${o.dur}m)`,
    ],
    late: o.late,
  }
}

// ── footer ────────────────────────────────────────────────────────────────────
/** Footer lines: hidden-op warning (if any), then version · op count · late assemblies (first 8 +N). */
export function footSummary(ops: readonly SchedOp[], hidden: number, version: BoardVersion | null): string[] {
  const late = [...new Set(ops.filter((o) => o.late).map((o) => o.mark))]
  const lateText = late.length ? late.slice(0, 8).join(', ') + (late.length > 8 ? ` +${late.length - 8}` : '') : 'ไม่มี'
  const out: string[] = []
  if (hidden) out.push(`⚠ ${hidden} op อยู่บน line ที่ปิดใช้ / ไม่มี line — ไม่แสดงบน Gantt`)
  out.push(`Version: ${version?.version_code ?? '—'} · operations: ${ops.length} · assembly สาย: ${lateText}`)
  out.push('read-only view · คลิก ▾ ที่ Work Center เพื่อย่อ/ขยาย · drag-drop edit = งานถัดไป')
  return out
}
