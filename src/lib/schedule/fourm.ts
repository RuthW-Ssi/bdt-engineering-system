import type { FourMFirstSeq, FourMStock, FourMTeamOperators, FourMWip, ScheduleFourM } from '../../api/schedule'
import { FAMILY_COLOR, HEAT_COLORS, LATE_COLOR, UI_COLOR, opColor } from './colors'
import { SH4, ivBuckets } from './load'
import { activeLines, shortWc, type BoardIndex, type SchedOp } from './model'
import { bkkDay, bkkMin, dShort, eachDay, isWorkDay, parseMs, winMs } from './time'

// 📊 4M + WIP analysis per shift (port of prod-scheduler.html render4M /
// fmMan4 / fmMachine4 / fmMaterial4 / fmMethod4 / fmWip4 and the chart*4
// helpers). The board's ops give the time side; GET /schedule/board/fourm adds
// operators, stock and the wip_balance view. Every card is a view model that
// the components draw as small CSS bar groups per working day (.sc4).

/** Fixed copy of the panel (same wording as the HTML page). */
export const FOURM_TEXT = {
  icon: '📊',
  heading: '4M + WIP analysis',
  sub: 'per shift เช้า/บ่าย/โอที · follows version',
  loading: 'กำลังโหลด 4M…',
  error: 'โหลด 4M ไม่สำเร็จ',
  retry: '↻ ลองใหม่',
  empty: 'ไม่มีตารางสำหรับ version นี้',
  noWeights: 'ยังไม่มีน้ำหนักชิ้นงาน (work_order_part.weight_kg) ใน WO ของ version นี้',
  wipMissing: 'apply migration 20261003000000 แล้วกด Reload',
  wipEmpty: 'ไม่มีข้อมูล WIP สำหรับ version นี้ (ต้องมี work_order_part + wip_storage_io)',
} as const

/** Bar area height and bar width of a .sc4 chart, px. */
export const FOURM_CHART = { barAreaPx: 62, barW: 9 } as const

/** Bar colours: day shifts, OT, over 100 %, kg bars. */
export const FOURM_COLOR = {
  shift: HEAT_COLORS[3],
  ot: UI_COLOR.accent2,
  over: LATE_COLOR.border,
  kg: FAMILY_COLOR.fit,
} as const

export type FmChipTone = '' | 'ok' | 'warn' | 'bad'

/** .fmchip backgrounds / text per tone. */
export const FOURM_CHIP_COLOR: Record<FmChipTone, { bg: string; fg: string }> = {
  '': { bg: '#f1f4f7', fg: UI_COLOR.muted },
  ok: { bg: '#e3f5ea', fg: UI_COLOR.green },
  warn: { bg: '#fff3ec', fg: UI_COLOR.accent },
  bad: { bg: '#fde7e7', fg: LATE_COLOR.ink },
}

// ── per-shift axis ────────────────────────────────────────────────────────────
export type Shift4 = (typeof SH4)[number]
export type ShiftKey = Shift4['k']

/** One productive shift of one working day. */
export interface Slot4 {
  day: string
  k: ShiftKey
  sh: Shift4
}

/** "YYYY-MM-DD|M|A|O" — the ivBuckets / bkOf key of a slot. */
export const slotKey = (a: Pick<Slot4, 'day' | 'k'>): string => a.day + '|' + a.k

/** Every productive shift of every working day from t0's day to t1's day. */
export function axis4(t0: number, t1: number, holidays: ReadonlySet<string>): Slot4[] {
  const out: Slot4[] = []
  for (const day of eachDay(bkkDay(t0), bkkDay(t1))) {
    if (!isWorkDay(day, holidays)) continue
    for (const sh of SH4) out.push({ day, k: sh.k, sh })
  }
  return out
}

/** Shift key of an instant by calendar block: before 12:00 → M, before 17:30 → A, else O. */
export function bkOf(ms: number): string {
  const m = bkkMin(ms)
  return bkkDay(ms) + '|' + (m < 720 ? 'M' : m < 1050 ? 'A' : 'O')
}

// ── chart view models ─────────────────────────────────────────────────────────
export interface FmSeg {
  label: string
  value: number
  color: string
  heightPx: number
}

export interface FmBar {
  /** slotKey of the bar. */
  key: string
  day: string
  /** เช้า / บ่าย / โอที. */
  shift: string
  ot: boolean
  /** What the bar measures: % (Man util, Machine, WIP), minutes (stacks) or kg. */
  value: number
  /** Busiest WC / fullest buffer of the shift ('' when not applicable). */
  peak: string
  heightPx: number
  /** Single-colour bar; null → draw `segs` (bottom → top). */
  fill: string | null
  segs: FmSeg[]
  title: string
}

export interface FmChartDay {
  day: string
  label: string
  bars: FmBar[]
}

export interface FmChip {
  text: string
  tone: FmChipTone
}

export interface FmLegendItem {
  label: string
  color: string
}

export type FourMKey = 'man' | 'machine' | 'material' | 'method' | 'wip'

export interface FourMCard {
  key: FourMKey
  title: string
  /** Small mono tag at the right of the heading. */
  tag: string
  chips: FmChip[]
  /** null → show `message` instead (.fmstub). */
  chart: FmChartDay[] | null
  message: string | null
  legend: FmLegendItem[]
  /** Right-aligned legend note ('' when none). */
  legendNote: string
}

const chip = (text: string, tone: FmChipTone = ''): FmChip => ({ text, tone })

/** Height in px of a bar at `frac` of the bar area: at least 1 px, at most the area. */
const barPx = (frac: number): number => Math.max(1, Math.min(FOURM_CHART.barAreaPx, frac * FOURM_CHART.barAreaPx))

function bar(a: Slot4, value: number, peak: string, heightPx: number, fill: string | null, segs: FmSeg[], title: string): FmBar {
  return { key: slotKey(a), day: a.day, shift: a.sh.label, ot: a.sh.ot, value, peak, heightPx, fill, segs, title }
}

const barTitle = (a: Slot4, text: string): string => `${dShort(a.day)} ${a.sh.label}: ${text}`

/** % bar: red over 100 %, OT colour on โอที (chartPct4). */
function pctBar(a: Slot4, pct: number, peak: string): FmBar {
  const fill = pct > 100 ? FOURM_COLOR.over : a.sh.ot ? FOURM_COLOR.ot : FOURM_COLOR.shift
  return bar(a, pct, peak, barPx(pct / 100), fill, [], barTitle(a, `${Math.round(pct)}%${peak ? ' · ' + peak : ''}`))
}

type Part = Omit<FmSeg, 'heightPx'>

/** Stacked minutes bar scaled to `max` (chartStack4); segments under half a px are dropped. */
function stackBar(a: Slot4, parts: readonly Part[], max: number): FmBar {
  const total = parts.reduce((s, p) => s + p.value, 0)
  const hT = barPx(total / max)
  const segs = parts.map((p) => ({ ...p, heightPx: total ? (p.value / total) * hT : 0 })).filter((s) => s.heightPx > 0.5)
  return bar(a, total, '', hT, null, segs, barTitle(a, `${Math.round(total)}m`))
}

/** Group bars by working day, keeping axis order (byDay4). */
export function byDay4(bars: readonly FmBar[]): FmChartDay[] {
  const m = new Map<string, FmChartDay>()
  for (const b of bars) {
    let d = m.get(b.day)
    if (!d) m.set(b.day, (d = { day: b.day, label: dShort(b.day), bars: [] }))
    d.bars.push(b)
  }
  return [...m.values()]
}

const SHIFT_LEGEND: FmLegendItem[] = [
  { label: 'เช้า/บ่าย', color: FOURM_COLOR.shift },
  { label: 'โอที', color: FOURM_COLOR.ot },
  { label: '>100%', color: FOURM_COLOR.over },
]

function card(
  key: FourMKey,
  title: string,
  tag: string,
  chips: FmChip[],
  chart: FmChartDay[] | null,
  legend: FmLegendItem[] = [],
  legendNote = '',
  message: string | null = null,
): FourMCard {
  return { key, title, tag, chips, chart, message, legend, legendNote }
}

// ── Man ───────────────────────────────────────────────────────────────────────
const TEAM_TYPES = ['internal', 'external', 'none'] as const
type TeamType = (typeof TEAM_TYPES)[number]
const TEAM_TYPE_COLOR: Record<TeamType, string> = { internal: FOURM_COLOR.shift, external: FOURM_COLOR.ot, none: FOURM_COLOR.over }
const TEAM_TYPE_LABEL: Record<TeamType, string> = { internal: 'internal', external: 'external', none: 'ไม่มีทีม' }

/**
 * Labor follows the team model: each WO is worked by a team (internal | external)
 * with team_headcount people; demand (crew-min) = the WO's in-shift minutes × its
 * headcount. Internal crew known (> 0) → internal crew util % per shift, else
 * crew demand stacked by team type.
 */
export function manCard(ix: BoardIndex, ops: readonly SchedOp[], ax: readonly Slot4[], operatorsByTeam: readonly FourMTeamOperators[]): FourMCard {
  const dem = new Map<string, Record<TeamType, number>>()
  for (const o of ops) {
    const bm = ivBuckets(o.s, o.e, ix.holidays)
    const hc = o.headcount || 1
    const tt: TeamType = o.team ? (o.team.team_type === 'external' ? 'external' : 'internal') : 'none'
    for (const k in bm) {
      let d = dem.get(k)
      if (!d) dem.set(k, (d = { internal: 0, external: 0, none: 0 }))
      d[tt] += bm[k] * hc
    }
  }
  const teams = ix.board.teams.filter((t) => t.active !== false)
  const internal = teams.filter((t) => t.team_type !== 'external')
  const intIds = new Set(internal.map((t) => t.id))
  let intCrew = 0
  for (const r of operatorsByTeam) if (intIds.has(r.team_id)) intCrew += Number(r.active_operators) || 0
  const noTeam = ops.filter((o) => !o.team).length

  const chips = [
    chip(`${internal.length} internal teams`),
    chip(`${teams.length - internal.length} external teams`),
    intCrew > 0 ? chip(`${intCrew} internal operators`, 'ok') : chip('operators: 0', 'warn'),
  ]
  if (noTeam) chips.push(chip(`${noTeam} WO ไม่มีทีม`, 'warn'))

  if (intCrew > 0) {
    const bars = ax.map((a) => {
      const av = (a.sh.e - a.sh.s) * intCrew
      const busy = dem.get(slotKey(a))?.internal ?? 0
      return pctBar(a, av ? (busy / av) * 100 : 0, '')
    })
    let ext = 0
    for (const d of dem.values()) ext += d.external
    return card('man', 'Man', 'internal crew util %/shift', chips, byDay4(bars), SHIFT_LEGEND, `internal crew util % · external ${(ext / 60).toFixed(1)} crew-h`)
  }

  const parts = ax.map((a): Part[] => {
    const d = dem.get(slotKey(a))
    return TEAM_TYPES.filter((t) => d?.[t]).map((t) => ({ label: TEAM_TYPE_LABEL[t], value: d![t], color: TEAM_TYPE_COLOR[t] }))
  })
  const max = Math.max(1, ...parts.map((p) => p.reduce((s, x) => s + x.value, 0)))
  const bars = ax.map((a, i) => stackBar(a, parts[i], max))
  const legend = TEAM_TYPES.map((t) => ({ label: TEAM_TYPE_LABEL[t], color: TEAM_TYPE_COLOR[t] }))
  return card('man', 'Man', 'crew demand/shift', chips, byDay4(bars), legend, 'crew-minutes/shift')
}

// ── Machine ───────────────────────────────────────────────────────────────────
/** Bottleneck WC util % per shift: busy line-minutes ÷ (shift minutes × active lines of that WC). */
export function machineCard(ix: BoardIndex, ops: readonly SchedOp[], ax: readonly Slot4[]): FourMCard {
  const byb = new Map<string, Map<string, number>>()
  for (const o of ops) {
    const bm = ivBuckets(o.s, o.e, ix.holidays)
    const code = o.wc?.code || '?'
    for (const k in bm) {
      let m = byb.get(k)
      if (!m) byb.set(k, (m = new Map()))
      m.set(code, (m.get(code) ?? 0) + bm[k])
    }
  }
  const nL = new Map<string, number>()
  for (const l of activeLines(ix)) {
    const code = ix.wcById.get(l.workcenter_id)!.code
    nL.set(code, (nL.get(code) ?? 0) + 1)
  }
  let pb = { pct: 0, wc: '' }
  const bars = ax.map((a) => {
    let pk = { pct: 0, wc: '' }
    for (const [code, busy] of byb.get(slotKey(a)) ?? []) {
      const p = (busy / ((a.sh.e - a.sh.s) * (nL.get(code) || 1))) * 100
      if (p > pk.pct) pk = { pct: p, wc: code }
    }
    if (pk.pct > pb.pct) pb = pk
    return pctBar(a, pk.pct, pk.wc)
  })
  const chips = [chip(`${new Set(ops.map((o) => o.wc?.code)).size} WC`)]
  if (pb.pct) chips.push(chip(`bottleneck ${shortWc(pb.wc)} ${Math.round(pb.pct)}%`, pb.pct > 90 ? 'warn' : ''))
  return card('machine', 'Machine', 'bottleneck WC util %/shift', chips, byDay4(bars), SHIFT_LEGEND, 'busiest WC per shift · busy ÷ (shift × lines)')
}

// ── Material ──────────────────────────────────────────────────────────────────
/**
 * Material entering production: Σ weight_kg of each MO's FIRST operation,
 * bucketed by the shift it starts in (raw steel is drawn from stock when
 * cutting begins — later ops reprocess the same kg). "First" is across ALL the
 * MO's non-CANCELLED WOs, so once cutting is DONE (and no longer scheduled) the
 * MO's later ops draw nothing new. The board leaves such DONE WOs out, so
 * `firstSeqByMo` (4M payload, over all of them) is the source; the min with the
 * board's own WOs only matters for MOs it doesn't cover (or an older backend).
 */
export function materialCard(
  ix: BoardIndex,
  ops: readonly SchedOp[],
  ax: readonly Slot4[],
  stock: FourMStock,
  firstSeqByMo: readonly FourMFirstSeq[] = [],
): FourMCard {
  const firstSeq = new Map(firstSeqByMo.map((r) => [r.mo_id, r.first_seq]))
  for (const w of ix.board.work_orders) {
    if (w.status === 'CANCELLED') continue
    const f = firstSeq.get(w.mo_id)
    if (f == null || w.sequence < f) firstSeq.set(w.mo_id, w.sequence)
  }
  const byb = new Map<string, { kg: number; n: number }>()
  let total = 0
  for (const o of ops) {
    if (!o.wo || o.wo.sequence !== firstSeq.get(o.wo.mo_id)) continue
    const kg = Number(o.wo.weight_kg) || 0
    if (!kg) continue
    const k = bkOf(o.s)
    let b = byb.get(k)
    if (!b) byb.set(k, (b = { kg: 0, n: 0 }))
    b.kg += kg
    b.n++
    total += kg
  }
  const chips = [
    chip(`${stock.materials.toLocaleString('en-US')} materials`),
    chip(`${stock.with_stock} with stock`, stock.with_stock ? '' : 'warn'),
    stock.short ? chip(`${stock.short} short`, 'bad') : chip('0 short', 'ok'),
    chip(`${(total / 1000).toFixed(1)} t in schedule`),
  ]
  const title = 'Material'
  const tag = 'kg entering production/shift'
  if (!ops.some((o) => Number(o.wo?.weight_kg) > 0)) return card('material', title, tag, chips, null, [], '', FOURM_TEXT.noWeights)

  const max = Math.max(1, ...ax.map((a) => byb.get(slotKey(a))?.kg ?? 0))
  const bars = ax.map((a) => {
    const { kg, n } = byb.get(slotKey(a)) ?? { kg: 0, n: 0 }
    return bar(a, kg, '', barPx(kg / max), a.sh.ot ? FOURM_COLOR.ot : FOURM_COLOR.kg, [], barTitle(a, `${Math.round(kg).toLocaleString('en-US')}kg · ${n}p`))
  })
  const legend = [
    { label: 'เช้า/บ่าย', color: FOURM_COLOR.kg },
    { label: 'โอที', color: FOURM_COLOR.ot },
  ]
  return card('material', title, tag, chips, byDay4(bars), legend, 'kg entering production/shift (first op of each MO)')
}

// ── Method ────────────────────────────────────────────────────────────────────
const TOP_OPS = 6

/** Op-type mix per shift: in-shift minutes stacked by op label — the top 6 overall, the rest folded into '?'. */
export function methodCard(ix: BoardIndex, ops: readonly SchedOp[], ax: readonly Slot4[]): FourMCard {
  const byb = new Map<string, Map<string, number>>()
  const tot = new Map<string, number>()
  for (const o of ops) {
    const label = o.opLabel || '?'
    const bm = ivBuckets(o.s, o.e, ix.holidays)
    for (const k in bm) {
      let m = byb.get(k)
      if (!m) byb.set(k, (m = new Map()))
      m.set(label, (m.get(label) ?? 0) + bm[k])
      tot.set(label, (tot.get(label) ?? 0) + bm[k])
    }
  }
  const top = [...tot.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_OPS)
    .map(([label]) => label)
  const colorOf = (label: string) => FAMILY_COLOR[opColor(label, '')]
  const parts = ax.map((a): Part[] => {
    const m = byb.get(slotKey(a))
    if (!m) return []
    const segs = top.filter((p) => m.get(p)).map((p) => ({ label: p, value: m.get(p)!, color: colorOf(p) }))
    let other = 0
    for (const [p, v] of m) if (!top.includes(p)) other += v
    if (other) segs.push({ label: '?', value: other, color: colorOf('?') })
    return segs
  })
  const max = Math.max(1, ...parts.map((p) => p.reduce((s, x) => s + x.value, 0)))
  const bars = ax.map((a, i) => stackBar(a, parts[i], max))
  const cov = ops.filter((o) => o.opLabel).length
  const chips = [
    chip(`${tot.size} op-types`),
    chip(`coverage ${ops.length ? Math.round((cov / ops.length) * 100) : 0}%`, cov === ops.length ? 'ok' : 'warn'),
  ]
  const legend = top.map((p) => ({ label: p, color: colorOf(p) }))
  return card('method', 'Method', 'op-type mix/shift', chips, byDay4(bars), legend, 'op-type min/shift')
}

// ── WIP / Storage ─────────────────────────────────────────────────────────────
const shortStg = (code: string): string => code.replace('STG-', '')

/**
 * Worst-buffer occupancy % per shift from the version's wip_balance rows.
 * Occupancy is a level, not an event: each buffer's last balance carries into
 * later shifts, and a shift shows the highest level any buffer held in it.
 */
export function wipCard(ax: readonly Slot4[], wip: FourMWip): FourMCard {
  const title = 'WIP / Storage'
  const tag = 'occupancy/shift'
  if (wip.status === 'view_missing') return card('wip', title, tag, [chip('ยังไม่มี view wip_balance', 'bad')], null, [], '', FOURM_TEXT.wipMissing)
  if (!wip.rows.length) return card('wip', title, tag, [chip('0 rows for this version', 'warn')], null, [], '', FOURM_TEXT.wipEmpty)

  const peak = new Map<string, number>()
  for (const r of wip.rows) {
    const p = Number(r.area_pct) || 0
    const cur = peak.get(r.storage_code)
    if (cur == null || p > cur) peak.set(r.storage_code, p)
  }
  const ev = wip.rows
    .flatMap((r) => {
      const ms = parseMs(r.t)
      return ms == null ? [] : [{ ms, st: r.storage_code, p: Number(r.area_pct) || 0 }]
    })
    .sort((a, b) => a.ms - b.ms)
  const level = new Map<string, number>()
  let i = 0
  const worst = ax.map((a) => {
    const end = winMs(a.day, a.sh.e)
    let pct = 0
    let bf = ''
    const up = (st: string, p: number) => {
      if (p > pct) {
        pct = p
        bf = st
      }
    }
    for (const [st, p] of level) up(st, p)
    for (; i < ev.length && ev[i].ms < end; i++) {
      level.set(ev[i].st, ev[i].p)
      up(ev[i].st, ev[i].p)
    }
    return { a, pct, bf }
  })
  const maxPct = Math.max(120, ...worst.map((w) => w.pct))
  const bars = worst.map(({ a, pct, bf }) =>
    bar(a, pct, bf, barPx(pct / maxPct), pct > 100 ? FOURM_COLOR.over : FOURM_COLOR.ot, [], barTitle(a, `${Math.round(pct)}% (${shortStg(bf)})`)),
  )
  const overflow = [...peak.entries()].filter(([, p]) => p > 100).map(([st]) => shortStg(st))
  const chips = [
    chip(`${peak.size} buffers`),
    overflow.length ? chip(`${overflow.length} overflow: ${overflow.join(', ')}`, 'bad') : chip('no overflow', 'ok'),
  ]
  const legend = [
    { label: '≤100%', color: FOURM_COLOR.ot },
    { label: 'overflow', color: FOURM_COLOR.over },
  ]
  return card('wip', title, tag, chips, byDay4(bars), legend, `worst-buffer area% · 0–${Math.round(maxPct)}%`)
}

// ── panel ─────────────────────────────────────────────────────────────────────
export type FourMView =
  | { state: 'loading'; text: string }
  | { state: 'empty'; text: string }
  | { state: 'ready'; cards: FourMCard[] }

/**
 * The five cards (Man · Machine · Material · Method · WIP) over the working
 * days of the version's scheduled span. 'loading' until 4M data of the board's
 * version is in (data of another version — e.g. while switching — counts as
 * not loaded); 'empty' when the version has no ops.
 */
export function fourMView(ix: BoardIndex, ops: readonly SchedOp[], fourm: ScheduleFourM | null | undefined): FourMView {
  if (!fourm || fourm.version_id !== ix.board.version_id) return { state: 'loading', text: FOURM_TEXT.loading }
  if (!ops.length) return { state: 'empty', text: FOURM_TEXT.empty }
  let t0 = Infinity
  let t1 = -Infinity
  for (const o of ops) {
    if (o.s < t0) t0 = o.s
    if (o.e > t1) t1 = o.e
  }
  const ax = axis4(t0, t1, ix.holidays)
  return {
    state: 'ready',
    cards: [
      manCard(ix, ops, ax, fourm.operators_by_team),
      machineCard(ix, ops, ax),
      materialCard(ix, ops, ax, fourm.stock, fourm.first_seq_by_mo),
      methodCard(ix, ops, ax),
      wipCard(ax, fourm.wip),
    ],
  }
}
