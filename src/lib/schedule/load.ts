import type { BoardWorkCenter } from '../../api/schedule'
import { type Axis, dayGroups } from './axis'
import { heatBand } from './colors'
import { activeLines, linesOfWC, shortWc, type BoardIndex, type SchedOp } from './model'
import { bkkDay, bkkMin, dShort, eachDay, isWorkDay } from './time'

// Capacity maths (port of prod-scheduler.html SH4 / ivBuckets / dayLoad /
// oeeOf / renderHeat / renderLoad): an op's work minutes are spread over the
// days it touches in proportion to its in-shift minutes, since ops run overnight.

/** Productive shift windows = calendar blocks minus the day overheads (08:00 +30 min, 22:00 −15 min), as the scheduler uses. */
export const SH4 = [
  { k: 'M', label: 'เช้า', s: 510, e: 720, ot: false },
  { k: 'A', label: 'บ่าย', s: 780, e: 1050, ot: false },
  { k: 'O', label: 'โอที', s: 1080, e: 1305, ot: true },
] as const

/** 705 productive min / line / day (3 shifts − overheads, matches the scheduler). */
export const WORK_MIN = SH4.reduce((s, x) => s + x.e - x.s, 0)

/** In-shift minutes of an interval, keyed "YYYY-MM-DD|M|A|O". */
export type Buckets = Readonly<Record<string, number>>

// Memoized by "s|e": the heatmap and the load card ask for the same ops on
// every render. The result depends on the holiday set, so the memo is dropped
// whenever a different holiday set (by content) comes in.
const IVB = new Map<string, Buckets>()
let ivbHolidays: ReadonlySet<string> | null = null
let ivbSig = ''

function syncHolidays(holidays: ReadonlySet<string>): void {
  if (holidays === ivbHolidays) return
  const sig = [...holidays].sort().join(',')
  if (sig !== ivbSig) {
    IVB.clear()
    ivbSig = sig
  }
  ivbHolidays = holidays
}

/** Minutes of [s, e) inside the productive shifts of each working day. */
export function ivBuckets(s: number, e: number, holidays: ReadonlySet<string>): Buckets {
  syncHolidays(holidays)
  const key = s + '|' + e
  const hit = IVB.get(key)
  if (hit) return hit
  const res: Record<string, number> = {}
  const a = bkkDay(s)
  const b = bkkDay(e)
  const am = bkkMin(s)
  const bm = bkkMin(e)
  for (const day of eachDay(a, b)) {
    if (!isWorkDay(day, holidays)) continue
    const ds = day === a ? am : 0
    const de = day === b ? bm : 1440
    for (const sh of SH4) {
      const ov = Math.max(0, Math.min(de, sh.e) - Math.max(ds, sh.s))
      if (ov > 0) res[day + '|' + sh.k] = (res[day + '|' + sh.k] ?? 0) + ov
    }
  }
  IVB.set(key, res)
  return res
}

/** Drop the ivBuckets memo (tests). */
export function clearIvBuckets(): void {
  IVB.clear()
  ivbHolidays = null
  ivbSig = ''
}

type LoadOp = Pick<SchedOp, 's' | 'e' | 'dur'>

/** The op's work minutes that fall on `day`, split by its in-shift minutes; all on its start day when it has none. */
export function dayLoad(o: LoadOp, day: string, holidays: ReadonlySet<string>): number {
  const bm = ivBuckets(o.s, o.e, holidays)
  let T = 0
  for (const k in bm) T += bm[k]
  if (!T) return bkkDay(o.s) === day ? o.dur : 0
  let onDay = 0
  for (const sh of SH4) onDay += bm[day + '|' + sh.k] ?? 0
  return (o.dur * onDay) / T
}

/** dayLoad of every op, summed per work center and day: wcId → day → minutes. */
export function wcDayLoad(ops: readonly SchedOp[], holidays: ReadonlySet<string>): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>()
  for (const o of ops) {
    if (!o.wc) continue
    let m = out.get(o.wc.id)
    if (!m) out.set(o.wc.id, (m = new Map()))
    const bm = ivBuckets(o.s, o.e, holidays)
    let T = 0
    for (const k in bm) T += bm[k]
    if (!T) {
      const d = bkkDay(o.s)
      m.set(d, (m.get(d) ?? 0) + o.dur)
      continue
    }
    for (const k in bm) {
      const d = k.slice(0, 10)
      m.set(d, (m.get(d) ?? 0) + (o.dur * bm[k]) / T)
    }
  }
  return out
}

/** OEE = A×P×Q (percent columns); when that is ~100 % (unset), fall back to oee_target, else 1. */
export function oeeOf(wc: Pick<BoardWorkCenter, 'availability' | 'performance' | 'quality' | 'oee_target'>): number {
  const a = Number(wc.availability) || 100
  const p = Number(wc.performance) || 100
  const q = Number(wc.quality) || 100
  const apq = (a / 100) * (p / 100) * (q / 100)
  if (apq < 0.999) return apq
  const t = Number(wc.oee_target)
  return t > 0 ? t / 100 : 1
}

// ── 🔥 Utilization heatmap ────────────────────────────────────────────────────
export interface HeatCell {
  day: string
  busy: number
  avail: number
  /** busy ÷ avail. */
  u: number
  color: string
  /** "73%" or '' when idle. */
  text: string
  /** Dark text on the light end of the ramp (u < .4). */
  lightBg: boolean
  title: string
}

export interface HeatRow {
  wc: BoardWorkCenter
  code: string
  oee: number
  oeeText: string
  cells: HeatCell[]
}

export interface HeatGrid {
  days: Array<{ day: string; label: string }>
  rows: HeatRow[]
  note: string
}

/** Full grid like the mockup: every active WC (Gantt order) × every working day on the axis. Null when there are no ops. */
export function heatGrid(ix: BoardIndex, ops: readonly SchedOp[], axis: Axis): HeatGrid | null {
  if (!ops.length) return null
  const days = dayGroups(axis).map((g) => g.day)
  const load = wcDayLoad(ops, ix.holidays)
  const wcIds = [...new Set(activeLines(ix).map((l) => l.workcenter_id))]
  const rows = wcIds.map((id): HeatRow => {
    const wc = ix.wcById.get(id)!
    const oee = oeeOf(wc)
    const ln = linesOfWC(ix, id) || 1
    const avail = ln * WORK_MIN * oee
    const perDay = load.get(id)
    return {
      wc,
      code: shortWc(wc.code),
      oee,
      oeeText: `${Math.round(oee * 100)}%`,
      cells: days.map((day) => {
        const busy = perDay?.get(day) ?? 0
        const u = avail ? busy / avail : 0
        return {
          day,
          busy,
          avail,
          u,
          color: heatBand(u),
          text: u > 0 ? `${Math.round(u * 100)}%` : '',
          lightBg: u < 0.4,
          title: `${wc.code} ${day}: ${Math.round(busy)}m ÷ ${Math.round(avail)}m`,
        }
      }),
    }
  })
  return {
    days: days.map((day) => ({ day, label: dShort(day) })),
    rows,
    note: `available = lines × ${WORK_MIN} min/day × OEE · OEE = A×P×Q (fallback oee_target)`,
  }
}

// ── ⚡ Bottleneck load card ────────────────────────────────────────────────────
export interface BottleneckDay {
  day: string
  label: string
  hours: number
  hoursText: string
  over: boolean
  /** Fill height in % of the bar area (scale tops out at 115 % of capacity). */
  fillPct: number
}

export interface Bottleneck {
  wc: BoardWorkCenter
  code: string
  lines: number
  oee: number
  capHours: number
  /** Dashed capacity line position, % from the bottom. */
  capBottomPct: number
  tag: string
  days: BottleneckDay[]
}

const LOAD_SCALE = 1.15

/**
 * The mockup's "Welding Load" for the bottleneck WC: highest work ÷ (lines × OEE),
 * not most minutes. Work hours per axis day vs capacity = lines × WORK_MIN × OEE.
 */
export function bottleneck(ix: BoardIndex, ops: readonly SchedOp[], axis: Axis): Bottleneck | null {
  const total = new Map<number, number>()
  for (const o of ops) if (o.wc) total.set(o.wc.id, (total.get(o.wc.id) ?? 0) + o.dur)
  const ratio = (id: number) => total.get(id)! / ((linesOfWC(ix, id) || 1) * oeeOf(ix.wcById.get(id)!))
  // ties → lowest WC id (stable sort over ascending ids)
  const id = [...total.keys()].sort((a, b) => a - b).sort((a, b) => ratio(b) - ratio(a))[0]
  const wc = id != null ? ix.wcById.get(id) : undefined
  if (!wc) return null
  const n = linesOfWC(ix, wc.id) || 1
  const oee = oeeOf(wc)
  const capHours = (n * WORK_MIN * oee) / 60
  const perDay = wcDayLoad(
    ops.filter((o) => o.wc?.id === wc.id),
    ix.holidays,
  ).get(wc.id)
  return {
    wc,
    code: shortWc(wc.code),
    lines: n,
    oee,
    capHours,
    capBottomPct: 100 / LOAD_SCALE,
    tag: `${shortWc(wc.code)} · capacity = ${n} × ${(WORK_MIN / 60).toFixed(1)}h × OEE ${Math.round(oee * 100)}%`,
    days: dayGroups(axis).map(({ day }) => {
      const hours = (perDay?.get(day) ?? 0) / 60
      return {
        day,
        label: dShort(day),
        hours,
        hoursText: `${hours.toFixed(1)}h`,
        over: hours > capHours,
        fillPct: Math.max(2, (Math.min(LOAD_SCALE, hours / capHours) / LOAD_SCALE) * 100),
      }
    }),
  }
}
